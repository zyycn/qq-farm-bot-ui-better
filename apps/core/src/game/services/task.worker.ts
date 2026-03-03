import type { StoreService } from '../../store/store.service'
import type { GameClient } from '../game-client'
import type { GameConfigService } from '../game-config.service'
import type { StatsTracker } from './stats.worker'
import type { WarehouseWorker } from './warehouse.worker'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import { Scheduler } from '../scheduler'
import { getServerTimeSec, sleep, toLong, toNum } from '../utils'

export class TaskWorker {
  private logger: Logger
  private checking = false
  private taskClaimDoneDateKey = ''
  private taskClaimLastAt = 0
  private scheduler: Scheduler
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: GameClient,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private stats: StatsTracker,
    private warehouse: WarehouseWorker
  ) {
    this.logger = new Logger(`Task:${accountId}`)
    this.scheduler = new Scheduler(`task-${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '信息', meta: { module: 'task', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '警告', meta: { module: 'task', ...(event && { event }) }, isWarn: true })
  }

  private get t() { return this.client.protoTypes }

  // ========== Helpers ==========

  private getDateKey(): string {
    const nowSec = getServerTimeSec()
    const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
    const bjOffset = 8 * 3600 * 1000
    const bjDate = new Date(nowMs + bjOffset)
    return `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bjDate.getUTCDate()).padStart(2, '0')}`
  }

  private getRewardSummary(items: any[]): string {
    return items.map((item: any) => {
      const id = toNum(item.id)
      const count = toNum(item.count)
      if (id === 1 || id === 1001)
        return `金币${count}`
      if (id === 2 || id === 1101)
        return `经验${count}`
      if (id === 1002)
        return `点券${count}`
      const info = this.gameConfig.getItemById(id)
      return `${info?.name || `物品#${id}`}x${count}`
    }).join('/')
  }

  // ========== API ==========

  async getTaskInfo(): Promise<any> {
    const body = Buffer.from(this.t.TaskInfoRequest.encode(this.t.TaskInfoRequest.create({})).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.taskpb.TaskService', 'TaskInfo', body)
    return this.t.TaskInfoReply.decode(rb)
  }

  async claimTaskReward(taskId: number, doShared = false): Promise<any> {
    const body = Buffer.from(this.t.ClaimTaskRewardRequest.encode(this.t.ClaimTaskRewardRequest.create({ id: toLong(taskId), do_shared: doShared })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.taskpb.TaskService', 'ClaimTaskReward', body)
    return this.t.ClaimTaskRewardReply.decode(rb)
  }

  async claimDailyReward(type: number, pointIds: number[]): Promise<any> {
    if (!this.t.ClaimDailyRewardRequest || !this.t.ClaimDailyRewardReply)
      return { items: [] }
    const body = Buffer.from(this.t.ClaimDailyRewardRequest.encode(this.t.ClaimDailyRewardRequest.create({ type: Number(type) || 0, point_ids: pointIds.map(id => toLong(id)) })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.taskpb.TaskService', 'ClaimDailyReward', body)
    return this.t.ClaimDailyRewardReply.decode(rb)
  }

  async claimAllIllustratedRewards(): Promise<any> {
    if (!this.t.ClaimAllRewardsV2Request || !this.t.ClaimAllRewardsV2Reply)
      return { items: [], bonus_items: [] }
    const body = Buffer.from(this.t.ClaimAllRewardsV2Request.encode(this.t.ClaimAllRewardsV2Request.create({ only_claimable: true })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.illustratedpb.IllustratedService', 'ClaimAllRewardsV2', body)
    return this.t.ClaimAllRewardsV2Reply.decode(rb)
  }

  // ========== Task Analysis ==========

  private formatTask(t: any, category = 'main') {
    return {
      id: toNum(t.id),
      desc: t.desc || `任务#${toNum(t.id)}`,
      category,
      progress: toNum(t.progress),
      totalProgress: toNum(t.total_progress),
      isClaimed: t.is_claimed,
      isUnlocked: t.is_unlocked,
      shareMultiple: toNum(t.share_multiple),
      rewards: (t.rewards || []).map((r: any) => ({ id: toNum(r.id), count: toNum(r.count) })),
      canClaim: t.is_unlocked && !t.is_claimed && toNum(t.progress) >= toNum(t.total_progress) && toNum(t.total_progress) > 0
    }
  }

  private analyzeTaskList(tasks: any[], category = 'main') {
    return tasks.map(t => this.formatTask(t, category)).filter(t => t.canClaim)
  }

  private buildDailyTasks(taskInfo: any) {
    const ti = taskInfo && typeof taskInfo === 'object' ? taskInfo : {}
    const dailyList = Array.isArray(ti.daily_tasks) ? ti.daily_tasks : []
    if (dailyList.length > 0)
      return dailyList
    return [...(ti.tasks || []), ...(ti.growth_tasks || [])].filter((t: any) => toNum(t?.task_type) === 2)
  }

  // ========== Claim Logic ==========

  private async doClaim(task: any): Promise<boolean> {
    try {
      const useShare = task.shareMultiple > 1
      const reply = await this.claimTaskReward(task.id, useShare)
      const items = reply.items || []
      const categoryName = task.category === 'daily' ? '每日任务' : (task.category === 'growth' ? '成长任务' : '任务')
      this.log(`领取(${categoryName}): ${task.desc}${useShare ? ` (${task.shareMultiple}倍)` : ''} → ${items.length > 0 ? this.getRewardSummary(items) : '无'}`, 'task_claim')
      this.taskClaimDoneDateKey = this.getDateKey()
      this.taskClaimLastAt = Date.now()
      this.stats.recordOperation('taskClaim', 1)
      await sleep(300)
      return true
    } catch { return false }
  }

  private async checkAndClaimActives(actives: any[]) {
    let claimed = 0
    for (const active of actives) {
      const activeType = toNum(active.type)
      const claimable = (active.rewards || []).filter((r: any) => toNum(r.status) === 2)
      if (!claimable.length)
        continue
      const pointIds = claimable.map((r: any) => toNum(r.point_id)).filter((n: number) => n > 0)
      if (!pointIds.length)
        continue
      const typeName = activeType === 1 ? '日活跃' : (activeType === 2 ? '周活跃' : `活跃${activeType}`)
      try {
        this.log(`${typeName} 发现 ${pointIds.length} 个可领取奖励`, 'task_scan')
        const reply = await this.claimDailyReward(activeType, pointIds)
        const items = reply.items || []
        if (items.length > 0)
          this.log(`${typeName} 领取: ${this.getRewardSummary(items)}`, 'task_claim')
        claimed += pointIds.length
        await sleep(300)
      } catch (e: any) { this.warn(`${typeName} 领取失败: ${e?.message}`, 'task_claim') }
    }
    return claimed
  }

  private async checkAndClaimIllustratedRewards(): Promise<boolean> {
    try {
      const beforeTicket = await this.getTicketBalance()
      await this.claimAllIllustratedRewards()
      const afterTicket = await this.getTicketBalance()
      const gain = Math.max(0, afterTicket - beforeTicket)
      if (gain < 200)
        return false
      this.log(`图鉴领取成功: 点券${gain}`, 'illustrated_rewards')
      this.taskClaimDoneDateKey = this.getDateKey()
      this.taskClaimLastAt = Date.now()
      this.stats.recordOperation('taskClaim', 1)
      return true
    } catch { return false }
  }

  private async getTicketBalance(): Promise<number> {
    try {
      const rep = await this.warehouse.getBag()
      const items = this.warehouse.getBagItems(rep)
      for (const it of (items || [])) {
        if (toNum(it?.id) === 1002)
          return Math.max(0, toNum(it?.count))
      }
      return 0
    } catch { return 0 }
  }

  // ========== Main Check ==========

  async checkAndClaimTasks() {
    if (this.checking || !this.store.isAutomationOn('task', this.accountId))
      return
    this.checking = true
    try {
      const reply = await this.getTaskInfo()
      if (!reply.task_info)
        return

      const taskInfo = reply.task_info
      const dailyAll = this.buildDailyTasks(taskInfo)
      const claimable = [
        ...this.analyzeTaskList(dailyAll, 'daily'),
        ...this.analyzeTaskList(taskInfo.growth_tasks || [], 'growth'),
        ...this.analyzeTaskList(taskInfo.tasks || [], 'main')
      ]

      if (claimable.length > 0) {
        this.log(`发现 ${claimable.length} 个可领取任务`, 'task_scan')
        for (const task of claimable) await this.doClaim(task)
      }
      await this.checkAndClaimActives(taskInfo.actives || [])
      await this.checkAndClaimIllustratedRewards()
    } catch (e: any) {
      this.warn(`检查任务失败: ${e?.message}`, 'task_scan')
    } finally {
      this.checking = false
    }
  }

  // ========== Event Handling ==========

  private onTaskInfoNotify = (taskInfo: any) => {
    if (!taskInfo || !this.store.isAutomationOn('task', this.accountId))
      return
    const claimable = [
      ...this.analyzeTaskList(taskInfo.daily_tasks || [], 'daily'),
      ...this.analyzeTaskList(taskInfo.growth_tasks || [], 'growth'),
      ...this.analyzeTaskList(taskInfo.tasks || [], 'main')
    ]
    const actives = taskInfo.actives || []
    if (!claimable.length && !actives.length)
      return
    if (claimable.length)
      this.log(`有 ${claimable.length} 个任务可领取，准备自动领取...`, 'task_claim')
    this.scheduler.setTimeoutTask('task_claim_debounce', 1000, async () => {
      if (claimable.length) {
        for (const task of claimable) await this.doClaim(task)
      }
      await this.checkAndClaimActives(actives)
      await this.checkAndClaimIllustratedRewards()
    })
  }

  // ========== Lifecycle ==========

  init() {
    this.cleanup()
    this.client.on('taskInfoNotify', this.onTaskInfoNotify)
    this.scheduler.setTimeoutTask('task_init_bootstrap', 4000, () => this.checkAndClaimTasks())
  }

  cleanup() {
    this.client.removeListener('taskInfoNotify', this.onTaskInfoNotify)
    this.scheduler.clearAll()
    this.checking = false
  }

  // ========== State for UI ==========

  getTaskClaimDailyState() {
    return { key: 'task_claim', doneToday: this.taskClaimDoneDateKey === this.getDateKey(), lastClaimAt: this.taskClaimLastAt }
  }

  async getTaskDailyStateLikeApp() {
    try {
      const reply = await this.getTaskInfo()
      const ti = reply?.task_info || {}
      const dailyAll = this.buildDailyTasks(ti)
      const completedDaily = dailyAll.filter((t: any) => {
        const p = toNum(t?.progress)
        const tp = toNum(t?.total_progress)
        return tp > 0 && p >= tp
      })
      const completedCount = Math.min(3, completedDaily.length)
      const pendingDaily = dailyAll.filter((t: any) => !!(t?.is_unlocked) && !(t?.is_claimed) && toNum(t?.total_progress) > 0)
      const dailyClaimable = this.analyzeTaskList(dailyAll, 'daily')
      return { key: 'task_claim', doneToday: completedCount >= 3, lastClaimAt: this.taskClaimLastAt, claimableCount: dailyClaimable.length, pendingCount: pendingDaily.length, completedCount, totalCount: 3 }
    } catch { return { key: 'task_claim', doneToday: false, lastClaimAt: this.taskClaimLastAt, claimableCount: 0, pendingCount: 0, completedCount: 0, totalCount: 3 } }
  }

  async getGrowthTaskStateLikeApp() {
    try {
      const reply = await this.getTaskInfo()
      const ti = reply?.task_info || {}
      const growthList = Array.isArray(ti.growth_tasks) ? ti.growth_tasks : []
      const tasks = growthList.map((t: any) => {
        const progress = Math.max(0, toNum(t?.progress))
        const totalProgress = Math.max(0, toNum(t?.total_progress))
        return { id: toNum(t?.id), desc: t?.desc || `成长任务#${toNum(t?.id)}`, progress, totalProgress, isClaimed: !!t?.is_claimed, isUnlocked: !!t?.is_unlocked, isCompleted: totalProgress > 0 && progress >= totalProgress }
      })
      const completedCount = tasks.filter((t: any) => t.isCompleted).length
      return { key: 'growth_task', doneToday: tasks.length > 0 && completedCount >= tasks.length, completedCount, totalCount: tasks.length, tasks }
    } catch { return { key: 'growth_task', doneToday: false, completedCount: 0, totalCount: 0, tasks: [] } }
  }

  destroy() {
    this.cleanup()
  }
}
