import type { StoreService } from '../../store/store.service'
import type { GameClient } from '../game-client'
import type { GameConfigService } from '../game-config.service'
import type { FarmWorker } from './farm.worker'
import type { StatsTracker } from './stats.worker'
import type { WarehouseWorker } from './warehouse.worker'
import { Buffer } from 'node:buffer'
import { Logger } from '@nestjs/common'
import { OP_TYPE_NAMES, PlantPhase } from '../constants'
import { Scheduler } from '../scheduler'
import { getServerTimeSec, sleep, toLong, toNum, toTimeSec } from '../utils'

export class FriendWorker {
  private logger: Logger
  private isChecking = false
  private loopRunning = false
  private externalScheduler = false
  private lastResetDate = ''
  private operationLimits = new Map<number, { dayTimes: number, dayTimesLimit: number, dayExpTimes: number, dayExpTimesLimit: number }>()
  private canGetHelpExp = true
  private helpAutoDisabledByLimit = false
  private scheduler: Scheduler
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: GameClient,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private stats: StatsTracker,
    private farm: FarmWorker,
    private warehouse: WarehouseWorker
  ) {
    this.logger = new Logger(`Friend:${accountId}`)
    this.scheduler = new Scheduler(`friend-${accountId}`)
    this.farm.onOperationLimitsUpdate = (limits: any) => this.updateOperationLimits(limits)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '信息', meta: { module: 'friend', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '警告', meta: { module: 'friend', ...(event && { event }) }, isWarn: true })
  }

  private get t() { return this.client.protoTypes }

  // ========== Operation Limits ==========

  updateOperationLimits(limits: any[]) {
    if (!limits?.length)
      return
    this.checkDailyReset()
    for (const limit of limits) {
      const id = toNum(limit.id)
      if (id > 0) {
        this.operationLimits.set(id, {
          dayTimes: toNum(limit.day_times),
          dayTimesLimit: toNum(limit.day_times_lt),
          dayExpTimes: toNum(limit.day_exp_times),
          dayExpTimesLimit: toNum(limit.day_ex_times_lt)
        })
      }
    }
  }

  private checkDailyReset() {
    const nowSec = getServerTimeSec()
    const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
    const bjOffset = 8 * 3600 * 1000
    const bjDate = new Date(nowMs + bjOffset)
    const today = `${bjDate.getUTCFullYear()}-${String(bjDate.getUTCMonth() + 1).padStart(2, '0')}-${String(bjDate.getUTCDate()).padStart(2, '0')}`
    if (this.lastResetDate !== today) {
      if (this.lastResetDate !== '')
        this.log('跨日重置，清空操作限制缓存', 'friend_cycle')
      this.operationLimits.clear()
      this.canGetHelpExp = true
      if (this.helpAutoDisabledByLimit) {
        this.helpAutoDisabledByLimit = false
        this.log('新的一天已开始，自动恢复帮忙操作功能', 'friend_cycle')
      }
      this.lastResetDate = today
    }
  }

  private canGetExp(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return false
    if (limit.dayExpTimesLimit <= 0)
      return true
    return limit.dayExpTimes < limit.dayExpTimesLimit
  }

  private canGetExpByCandidates(opIds: number[]): boolean {
    return opIds.some(id => this.canGetExp(toNum(id)))
  }

  private canOperate(opId: number): boolean {
    const limit = this.operationLimits.get(opId)
    if (!limit)
      return true
    if (limit.dayTimesLimit <= 0)
      return true
    return limit.dayTimes < limit.dayTimesLimit
  }

  private getRemainingTimes(opId: number): number {
    const limit = this.operationLimits.get(opId)
    if (!limit || limit.dayTimesLimit <= 0)
      return 999
    return Math.max(0, limit.dayTimesLimit - limit.dayTimes)
  }

  getOperationLimits(): Record<number, any> {
    const result: Record<number, any> = {}
    for (const id of [10001, 10002, 10003, 10004, 10005, 10006, 10007, 10008]) {
      const limit = this.operationLimits.get(id)
      if (limit) {
        result[id] = { name: OP_TYPE_NAMES[id] || `#${id}`, ...limit, remaining: this.getRemainingTimes(id) }
      }
    }
    return result
  }

  // ========== API ==========

  async getAllFriends(): Promise<any> {
    const body = Buffer.from(this.t.GetAllFriendsRequest.encode(this.t.GetAllFriendsRequest.create({})).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.friendpb.FriendService', 'GetAll', body)
    return this.t.GetAllFriendsReply.decode(rb)
  }

  async getApplications(): Promise<any> {
    const body = Buffer.from(this.t.GetApplicationsRequest.encode(this.t.GetApplicationsRequest.create({})).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.friendpb.FriendService', 'GetApplications', body)
    return this.t.GetApplicationsReply.decode(rb)
  }

  async acceptFriends(gids: number[]): Promise<any> {
    const body = Buffer.from(this.t.AcceptFriendsRequest.encode(this.t.AcceptFriendsRequest.create({ friend_gids: gids.map(g => toLong(g)) })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.friendpb.FriendService', 'AcceptFriends', body)
    return this.t.AcceptFriendsReply.decode(rb)
  }

  async enterFriendFarm(friendGid: number): Promise<any> {
    const body = Buffer.from(this.t.VisitEnterRequest.encode(this.t.VisitEnterRequest.create({ host_gid: toLong(friendGid), reason: 2 })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.visitpb.VisitService', 'Enter', body)
    return this.t.VisitEnterReply.decode(rb)
  }

  async leaveFriendFarm(friendGid: number) {
    const body = Buffer.from(this.t.VisitLeaveRequest.encode(this.t.VisitLeaveRequest.create({ host_gid: toLong(friendGid) })).finish())
    try {
      await this.client.sendMsgAsync('gamepb.visitpb.VisitService', 'Leave', body)
    } catch {}
  }

  private async helpAction(friendGid: number, landIds: any[], RequestType: any, ReplyType: any, method: string, stopWhenExpLimit = false) {
    const beforeExp = toNum(this.client.userState?.exp)
    const body = Buffer.from(RequestType.encode(RequestType.create({ land_ids: landIds, host_gid: toLong(friendGid) })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.plantpb.PlantService', method, body)
    const reply: any = ReplyType.decode(rb)
    this.updateOperationLimits(reply.operation_limits)
    if (stopWhenExpLimit) {
      await sleep(200)
      const afterExp = toNum(this.client.userState?.exp)
      if (afterExp <= beforeExp)
        this.autoDisableHelpByExpLimit()
    }
    return reply
  }

  async helpWater(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, this.t.WaterLandRequest, this.t.WaterLandReply, 'WaterLand', stopWhenExpLimit)
  }

  async helpWeed(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, this.t.WeedOutRequest, this.t.WeedOutReply, 'WeedOut', stopWhenExpLimit)
  }

  async helpInsecticide(gid: number, landIds: any[], stopWhenExpLimit = false) {
    return this.helpAction(gid, landIds, this.t.InsecticideRequest, this.t.InsecticideReply, 'Insecticide', stopWhenExpLimit)
  }

  async stealHarvest(friendGid: number, landIds: any[]): Promise<any> {
    const body = Buffer.from(this.t.HarvestRequest.encode(this.t.HarvestRequest.create({ land_ids: landIds, host_gid: toLong(friendGid), is_all: true })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.plantpb.PlantService', 'Harvest', body)
    const reply: any = this.t.HarvestReply.decode(rb)
    this.updateOperationLimits(reply.operation_limits)
    return reply
  }

  private async putPlantItems(friendGid: number, landIds: number[], RequestType: any, ReplyType: any, method: string): Promise<number> {
    let ok = 0
    for (const landId of landIds) {
      try {
        const body = Buffer.from(RequestType.encode(RequestType.create({ land_ids: [toLong(landId)], host_gid: toLong(friendGid) })).finish())
        const { body: rb } = await this.client.sendMsgAsync('gamepb.plantpb.PlantService', method, body)
        const reply: any = ReplyType.decode(rb)
        this.updateOperationLimits(reply.operation_limits)
        ok++
      } catch {}
      await sleep(100)
    }
    return ok
  }

  private async putPlantItemsDetailed(friendGid: number, landIds: number[], RequestType: any, ReplyType: any, method: string) {
    let ok = 0
    const failed: { landId: number, reason: string }[] = []
    for (const landId of landIds) {
      try {
        const body = Buffer.from(RequestType.encode(RequestType.create({ land_ids: [toLong(landId)], host_gid: toLong(friendGid) })).finish())
        const { body: rb } = await this.client.sendMsgAsync('gamepb.plantpb.PlantService', method, body)
        const reply: any = ReplyType.decode(rb)
        this.updateOperationLimits(reply.operation_limits)
        ok++
      } catch (e: any) { failed.push({ landId, reason: e?.message || '未知错误' }) }
      await sleep(100)
    }
    return { ok, failed }
  }

  async putInsects(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, this.t.PutInsectsRequest, this.t.PutInsectsReply, 'PutInsects') }
  async putWeeds(gid: number, landIds: number[]) { return this.putPlantItems(gid, landIds, this.t.PutWeedsRequest, this.t.PutWeedsReply, 'PutWeeds') }
  async putInsectsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, this.t.PutInsectsRequest, this.t.PutInsectsReply, 'PutInsects') }
  async putWeedsDetailed(gid: number, landIds: number[]) { return this.putPlantItemsDetailed(gid, landIds, this.t.PutWeedsRequest, this.t.PutWeedsReply, 'PutWeeds') }

  async checkCanOperateRemote(friendGid: number, operationId: number) {
    if (!this.t.CheckCanOperateRequest || !this.t.CheckCanOperateReply)
      return { canOperate: true, canStealNum: 0 }
    try {
      const body = Buffer.from(this.t.CheckCanOperateRequest.encode(this.t.CheckCanOperateRequest.create({ host_gid: toLong(friendGid), operation_id: toLong(operationId) })).finish())
      const { body: rb } = await this.client.sendMsgAsync('gamepb.plantpb.PlantService', 'CheckCanOperate', body)
      const reply: any = this.t.CheckCanOperateReply.decode(rb)
      return { canOperate: !!reply.can_operate, canStealNum: toNum(reply.can_steal_num) }
    } catch { return { canOperate: true, canStealNum: 0 } }
  }

  private autoDisableHelpByExpLimit() {
    if (!this.canGetHelpExp)
      return
    this.canGetHelpExp = false
    this.helpAutoDisabledByLimit = true
    this.log('今日帮助经验已达上限，自动停止帮忙', 'friend_cycle')
  }

  // ========== Land Analysis ==========

  analyzeFriendLands(lands: any[], myGid: number) {
    const result: Record<string, number[]> & { stealableInfo: any[] } = {
      stealable: [],
      stealableInfo: [],
      needWater: [],
      needWeed: [],
      needBug: [],
      canPutWeed: [],
      canPutBug: []
    }
    for (const land of lands) {
      const id = toNum(land.id)
      const plant = land.plant
      if (!plant?.phases?.length)
        continue
      const phase = this.farm.getCurrentPhase(plant.phases)
      if (!phase)
        continue
      const phaseVal = phase.phase
      if (phaseVal === PlantPhase.MATURE) {
        if (plant.stealable) {
          result.stealable.push(id)
          result.stealableInfo.push({ landId: id, plantId: toNum(plant.id), name: this.gameConfig.getPlantName(toNum(plant.id)) || plant.name || '未知' })
        }
        continue
      }
      if (phaseVal === PlantPhase.DEAD)
        continue
      if (toNum(plant.dry_num) > 0)
        result.needWater.push(id)
      if (plant.weed_owners?.length > 0)
        result.needWeed.push(id)
      if (plant.insect_owners?.length > 0)
        result.needBug.push(id)
      const weedOwners = plant.weed_owners || []
      const insectOwners = plant.insect_owners || []
      if (weedOwners.length < 2 && !weedOwners.some((gid: any) => toNum(gid) === myGid))
        result.canPutWeed.push(id)
      if (insectOwners.length < 2 && !insectOwners.some((gid: any) => toNum(gid) === myGid))
        result.canPutBug.push(id)
    }
    return result
  }

  // ========== Quiet Hours ==========

  private inFriendQuietHours(): boolean {
    const cfg = this.store.getFriendQuietHours(this.accountId)
    if (!cfg?.enabled)
      return false
    const parseTime = (s: string) => {
      const m = String(s || '').match(/^(\d{1,2}):(\d{1,2})$/)
      if (!m)
        return null
      const h = Number.parseInt(m[1], 10)
      const min = Number.parseInt(m[2], 10)
      return (h >= 0 && h <= 23 && min >= 0 && min <= 59) ? h * 60 + min : null
    }
    const start = parseTime(cfg.start)
    const end = parseTime(cfg.end)
    if (start === null || end === null)
      return false
    const cur = new Date().getHours() * 60 + new Date().getMinutes()
    if (start === end)
      return true
    return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end)
  }

  // ========== Public API ==========

  async getFriendsList() {
    try {
      const reply = await this.getAllFriends()
      const friends = reply.game_friends || []
      const myGid = this.client.userState.gid
      return friends
        .filter((f: any) => toNum(f.gid) !== myGid && f.name !== '小小农夫' && f.remark !== '小小农夫')
        .map((f: any) => ({
          gid: toNum(f.gid),
          name: f.remark || f.name || `GID:${toNum(f.gid)}`,
          avatarUrl: String(f.avatar_url || '').trim(),
          plant: f.plant ? { stealNum: toNum(f.plant.steal_plant_num), dryNum: toNum(f.plant.dry_num), weedNum: toNum(f.plant.weed_num), insectNum: toNum(f.plant.insect_num) } : null
        }))
        .sort((a: any, b: any) => {
          const r = String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
          return r !== 0 ? r : (a.gid - b.gid)
        })
    } catch { return [] }
  }

  async getFriendLandsDetail(friendGid: number) {
    try {
      const enterReply = await this.enterFriendFarm(friendGid)
      const lands = enterReply.lands || []
      const analyzed = this.analyzeFriendLands(lands, this.client.userState.gid)
      await this.leaveFriendFarm(friendGid)
      const nowSec = getServerTimeSec()
      const landsList = lands.map((land: any) => {
        const id = toNum(land.id)
        if (!land.unlocked)
          return { id, unlocked: false, status: 'locked', plantName: '', phaseName: '未解锁', level: toNum(land.level) }
        const plant = land.plant
        if (!plant?.phases?.length)
          return { id, unlocked: true, status: 'empty', plantName: '', phaseName: '空地', level: toNum(land.level) }
        const phase = this.farm.getCurrentPhase(plant.phases)
        if (!phase)
          return { id, unlocked: true, status: 'empty', plantName: '', phaseName: '', level: toNum(land.level) }
        const plantId = toNum(plant.id)
        const plantCfg = this.gameConfig.getPlantById(plantId)
        const seedId = toNum(plantCfg?.seed_id)
        const maturePhase = plant.phases.find((p: any) => toNum(p?.phase) === PlantPhase.MATURE)
        const matureBegin = maturePhase ? toTimeSec(maturePhase.begin_time) : 0
        let status = 'growing'
        if (phase.phase === PlantPhase.MATURE)
          status = plant.stealable ? 'stealable' : 'harvested'
        else if (phase.phase === PlantPhase.DEAD)
          status = 'dead'
        return {
          id,
          unlocked: true,
          status,
          plantName: this.gameConfig.getPlantName(plantId),
          seedId,
          seedImage: seedId > 0 ? this.gameConfig.getSeedImageBySeedId(seedId) : '',
          phaseName: ['未知', '种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死'][phase.phase as number] || '',
          level: toNum(land.level),
          matureInSec: matureBegin > nowSec ? matureBegin - nowSec : 0,
          needWater: toNum(plant.dry_num) > 0,
          needWeed: plant.weed_owners?.length > 0,
          needBug: plant.insect_owners?.length > 0
        }
      })
      return { lands: landsList, summary: analyzed }
    } catch { return { lands: [], summary: {} } }
  }

  // ========== Batch Helpers ==========

  private async runBatchWithFallback(ids: number[], batchFn: (ids: number[]) => Promise<any>, singleFn: (ids: number[]) => Promise<any>): Promise<number> {
    const target = ids.filter(Boolean)
    if (!target.length)
      return 0
    try {
      await batchFn(target)
      return target.length
    } catch {
      let ok = 0
      for (const landId of target) {
        try {
          await singleFn([landId])
          ok++
        } catch {}
        await sleep(100)
      }
      return ok
    }
  }

  // ========== Manual Operation ==========

  async doFriendOperation(friendGid: number, opType: string) {
    const gid = toNum(friendGid)
    if (!gid)
      return { ok: false, message: '无效好友ID', opType }

    let enterReply: any
    try {
      enterReply = await this.enterFriendFarm(gid)
    } catch (e: any) {
      return { ok: false, message: `进入好友农场失败: ${e?.message}`, opType }
    }

    try {
      const lands = enterReply.lands || []
      const status = this.analyzeFriendLands(lands, this.client.userState.gid)
      let count = 0

      if (opType === 'steal') {
        if (!status.stealable.length)
          return { ok: true, opType, count: 0, message: '没有可偷取土地' }
        const pre = await this.checkCanOperateRemote(gid, 10008)
        if (!pre.canOperate)
          return { ok: true, opType, count: 0, message: '今日偷菜次数已用完' }
        const target = status.stealable.slice(0, pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length)
        count = await this.runBatchWithFallback(target, ids => this.stealHarvest(gid, ids), ids => this.stealHarvest(gid, ids))
        if (count > 0) {
          this.stats.recordOperation('steal', count)
          try {
            await this.warehouse.sellAllFruits()
          } catch {}
        }
        return { ok: true, opType, count, message: `偷取完成 ${count} 块` }
      }

      if (opType === 'water') {
        if (!status.needWater.length)
          return { ok: true, opType, count: 0, message: '没有可浇水土地' }
        const pre = await this.checkCanOperateRemote(gid, 10007)
        if (!pre.canOperate)
          return { ok: true, opType, count: 0, message: '今日浇水次数已用完' }
        count = await this.runBatchWithFallback(status.needWater, ids => this.helpWater(gid, ids), ids => this.helpWater(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWater', count)
        return { ok: true, opType, count, message: `浇水完成 ${count} 块` }
      }

      if (opType === 'weed') {
        if (!status.needWeed.length)
          return { ok: true, opType, count: 0, message: '没有可除草土地' }
        const pre = await this.checkCanOperateRemote(gid, 10005)
        if (!pre.canOperate)
          return { ok: true, opType, count: 0, message: '今日除草次数已用完' }
        count = await this.runBatchWithFallback(status.needWeed, ids => this.helpWeed(gid, ids), ids => this.helpWeed(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpWeed', count)
        return { ok: true, opType, count, message: `除草完成 ${count} 块` }
      }

      if (opType === 'bug') {
        if (!status.needBug.length)
          return { ok: true, opType, count: 0, message: '没有可除虫土地' }
        const pre = await this.checkCanOperateRemote(gid, 10006)
        if (!pre.canOperate)
          return { ok: true, opType, count: 0, message: '今日除虫次数已用完' }
        count = await this.runBatchWithFallback(status.needBug, ids => this.helpInsecticide(gid, ids), ids => this.helpInsecticide(gid, ids))
        if (count > 0)
          this.stats.recordOperation('helpBug', count)
        return { ok: true, opType, count, message: `除虫完成 ${count} 块` }
      }

      if (opType === 'bad') {
        let bugCount = 0
        let weedCount = 0
        if (!status.canPutBug.length && !status.canPutWeed.length)
          return { ok: true, opType, count: 0, bugCount: 0, weedCount: 0, message: '没有可捣乱土地' }
        const failDetails: string[] = []
        if (status.canPutBug.length) {
          const r = await this.putInsectsDetailed(gid, status.canPutBug)
          bugCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放虫#${f.landId}:${f.reason}`))
          if (bugCount > 0)
            this.stats.recordOperation('bug', bugCount)
        }
        if (status.canPutWeed.length) {
          const r = await this.putWeedsDetailed(gid, status.canPutWeed)
          weedCount = r.ok
          failDetails.push(...(r.failed || []).map(f => `放草#${f.landId}:${f.reason}`))
          if (weedCount > 0)
            this.stats.recordOperation('weed', weedCount)
        }
        count = bugCount + weedCount
        if (count <= 0)
          return { ok: true, opType, count: 0, bugCount, weedCount, message: failDetails.slice(0, 2).join(' | ') || '捣乱失败或今日次数已用完' }
        return { ok: true, opType, count, bugCount, weedCount, message: `捣乱完成 虫${bugCount}/草${weedCount}` }
      }

      return { ok: false, opType, count: 0, message: '未知操作类型' }
    } catch (e: any) {
      return { ok: false, opType, count: 0, message: e?.message || '操作失败' }
    } finally {
      try {
        await this.leaveFriendFarm(gid)
      } catch {}
    }
  }

  // ========== Auto Visit ==========

  private async visitFriend(friend: { gid: number, name: string }, totalActions: Record<string, number>) {
    const { gid, name } = friend
    let enterReply: any
    try {
      enterReply = await this.enterFriendFarm(gid)
    } catch (e: any) {
      this.warn(`进入 ${name} 农场失败: ${e?.message}`, 'visit_friend')
      return
    }

    const lands = enterReply.lands || []
    if (!lands.length) {
      await this.leaveFriendFarm(gid)
      return
    }

    const myGid = this.client.userState.gid
    const status = this.analyzeFriendLands(lands, myGid)

    const stealBlacklist = new Set(this.store.getStealCropBlacklist(this.accountId))
    if (stealBlacklist.size > 0) {
      status.stealableInfo = status.stealableInfo.filter((info: any) => {
        const plant = this.gameConfig.getPlantById(info.plantId)
        if (!plant?.seed_id)
          return true
        return !stealBlacklist.has(plant.seed_id)
      })
      status.stealable = status.stealableInfo.map((x: any) => x.landId)
    }

    const actions: string[] = []
    const helpEnabled = this.store.isAutomationOn('friend_help', this.accountId)
    const stopWhenExpLimit = this.store.isAutomationOn('friend_help_exp_limit', this.accountId)
    if (!stopWhenExpLimit)
      this.canGetHelpExp = true

    if (helpEnabled && !(stopWhenExpLimit && !this.canGetHelpExp)) {
      const helpOps = [
        { id: 10005, expIds: [10005, 10003], list: status.needWeed, fn: (g: number, ids: any[], s: boolean) => this.helpWeed(g, ids, s), key: 'weed', name: '草', record: 'helpWeed' },
        { id: 10006, expIds: [10006, 10002], list: status.needBug, fn: (g: number, ids: any[], s: boolean) => this.helpInsecticide(g, ids, s), key: 'bug', name: '虫', record: 'helpBug' },
        { id: 10007, expIds: [10007, 10001], list: status.needWater, fn: (g: number, ids: any[], s: boolean) => this.helpWater(g, ids, s), key: 'water', name: '水', record: 'helpWater' }
      ]
      for (const op of helpOps) {
        const allowByExp = !stopWhenExpLimit || (this.canGetExpByCandidates(op.expIds) && this.canGetHelpExp)
        if (op.list.length > 0 && allowByExp) {
          const pre = await this.checkCanOperateRemote(gid, op.id)
          if (pre.canOperate) {
            const count = await this.runBatchWithFallback(op.list, ids => op.fn(gid, ids, stopWhenExpLimit), ids => op.fn(gid, ids, stopWhenExpLimit))
            if (count > 0) {
              actions.push(`${op.name}${count}`)
              totalActions[op.key] += count
              this.stats.recordOperation(op.record, count)
            }
          }
        }
      }
    }

    if (this.store.isAutomationOn('friend_steal', this.accountId) && status.stealable.length > 0) {
      const pre = await this.checkCanOperateRemote(gid, 10008)
      if (pre.canOperate) {
        const maxNum = pre.canStealNum > 0 ? pre.canStealNum : status.stealable.length
        const target = status.stealable.slice(0, maxNum)
        let ok = 0
        const stolenPlants: string[] = []
        try {
          await this.stealHarvest(gid, target)
          ok = target.length
          target.forEach((id: number) => {
            const info = status.stealableInfo.find((x: any) => x.landId === id)
            if (info)
              stolenPlants.push(info.name)
          })
        } catch {
          for (const landId of target) {
            try {
              await this.stealHarvest(gid, [landId])
              ok++
              const info = status.stealableInfo.find((x: any) => x.landId === landId)
              if (info)
                stolenPlants.push(info.name)
            } catch {}
            await sleep(100)
          }
        }
        if (ok > 0) {
          const plantNames = [...new Set(stolenPlants)].join('/')
          actions.push(`偷${ok}${plantNames ? `(${plantNames})` : ''}`)
          totalActions.steal += ok
          this.stats.recordOperation('steal', ok)
        }
      }
    }

    if (this.store.isAutomationOn('friend_bad', this.accountId)) {
      if (status.canPutBug.length > 0 && this.canOperate(10004)) {
        const remaining = this.getRemainingTimes(10004)
        const ok = await this.putInsects(gid, status.canPutBug.slice(0, remaining))
        if (ok > 0) {
          actions.push(`放虫${ok}`)
          totalActions.putBug += ok
        }
      }
      if (status.canPutWeed.length > 0 && this.canOperate(10003)) {
        const remaining = this.getRemainingTimes(10003)
        const ok = await this.putWeeds(gid, status.canPutWeed.slice(0, remaining))
        if (ok > 0) {
          actions.push(`放草${ok}`)
          totalActions.putWeed += ok
        }
      }
    }

    if (actions.length > 0)
      this.log(`${name}: ${actions.join('/')}`, 'visit_friend')
    await this.leaveFriendFarm(gid)
  }

  // ========== Friend Loop ==========

  async checkFriends(): Promise<boolean> {
    if (!this.store.isAutomationOn('friend', this.accountId))
      return false
    const helpOn = this.store.isAutomationOn('friend_help', this.accountId)
    const stealOn = this.store.isAutomationOn('friend_steal', this.accountId)
    const badOn = this.store.isAutomationOn('friend_bad', this.accountId)
    if (this.isChecking || !this.client.userState.gid || !(helpOn || stealOn || badOn))
      return false
    if (this.inFriendQuietHours())
      return false

    this.isChecking = true
    this.checkDailyReset()

    try {
      const reply = await this.getAllFriends()
      const friends = reply.game_friends || []
      if (!friends.length) {
        this.log('没有好友', 'friend_cycle')
        return false
      }

      const myGid = this.client.userState.gid
      const blacklist = new Set(this.store.getFriendBlacklist(this.accountId))
      const canPutBugOrWeed = this.canOperate(10004) || this.canOperate(10003)
      const priority: any[] = []
      const others: any[] = []
      const visited = new Set<number>()

      for (const f of friends) {
        const gid = toNum(f.gid)
        if (gid === myGid || visited.has(gid) || blacklist.has(gid))
          continue
        const name = f.remark || f.name || `GID:${gid}`
        const p = f.plant
        const stealNum = p ? toNum(p.steal_plant_num) : 0
        const dryNum = p ? toNum(p.dry_num) : 0
        const weedNum = p ? toNum(p.weed_num) : 0
        const insectNum = p ? toNum(p.insect_num) : 0
        const hasAction = stealNum > 0 || dryNum > 0 || weedNum > 0 || insectNum > 0
        if (hasAction) {
          priority.push({ gid, name, isPriority: true, stealNum, dryNum, weedNum, insectNum })
          visited.add(gid)
        } else if ((badOn && canPutBugOrWeed) || helpOn || stealOn) {
          others.push({ gid, name, isPriority: false })
          visited.add(gid)
        }
      }

      priority.sort((a, b) => {
        if (b.stealNum !== a.stealNum)
          return b.stealNum - a.stealNum
        return (b.dryNum + b.weedNum + b.insectNum) - (a.dryNum + a.weedNum + a.insectNum)
      })
      const toVisit = [...priority, ...others]
      if (!toVisit.length)
        return false

      const totalActions: Record<string, number> = { steal: 0, water: 0, weed: 0, bug: 0, putBug: 0, putWeed: 0 }
      for (const friend of toVisit) {
        if (!friend.isPriority && !helpOn && !stealOn && !this.canOperate(10004) && !this.canOperate(10003))
          break
        try {
          await this.visitFriend(friend, totalActions)
        } catch {}
        await sleep(200)
      }

      if (totalActions.steal > 0) {
        try {
          await this.warehouse.sellAllFruits()
        } catch {}
      }

      const summary: string[] = []
      if (totalActions.steal > 0)
        summary.push(`偷${totalActions.steal}`)
      if (totalActions.weed > 0)
        summary.push(`除草${totalActions.weed}`)
      if (totalActions.bug > 0)
        summary.push(`除虫${totalActions.bug}`)
      if (totalActions.water > 0)
        summary.push(`浇水${totalActions.water}`)
      if (totalActions.putBug > 0)
        summary.push(`放虫${totalActions.putBug}`)
      if (totalActions.putWeed > 0)
        summary.push(`放草${totalActions.putWeed}`)

      if (summary.length > 0)
        this.log(`巡查 ${toVisit.length} 人 → ${summary.join('/')}`, 'friend_cycle')
      return summary.length > 0
    } catch (e: any) {
      this.warn(`巡查异常: ${e?.message}`, 'friend_cycle')
      return false
    } finally {
      this.isChecking = false
    }
  }

  startFriendLoop(options: { externalScheduler?: boolean } = {}) {
    if (this.loopRunning)
      return
    this.externalScheduler = !!options.externalScheduler
    this.loopRunning = true
    this.client.on('friendApplicationReceived', this.onFriendApplicationReceived)
    if (!this.externalScheduler)
      this.scheduler.setTimeoutTask('friend_check_loop', 5000, () => this.friendCheckLoop())
    this.scheduler.setTimeoutTask('friend_check_bootstrap_applications', 3000, () => this.checkAndAcceptApplications())
  }

  stopFriendLoop() {
    this.loopRunning = false
    this.externalScheduler = false
    this.client.removeListener('friendApplicationReceived', this.onFriendApplicationReceived)
    this.scheduler.clearAll()
  }

  refreshFriendLoop(delayMs = 200) {
    if (!this.loopRunning || this.externalScheduler)
      return
    this.scheduler.setTimeoutTask('friend_check_loop', Math.max(0, delayMs), () => this.friendCheckLoop())
  }

  private async friendCheckLoop() {
    if (this.externalScheduler || !this.loopRunning)
      return
    await this.checkFriends()
    if (this.loopRunning)
      this.scheduler.setTimeoutTask('friend_check_loop', 10_000, () => this.friendCheckLoop())
  }

  // ========== Friend Applications ==========

  private onFriendApplicationReceived = (applications: any[]) => {
    const names = applications.map((a: any) => a.name || `GID:${toNum(a.gid)}`).join(', ')
    this.log(`收到 ${applications.length} 个好友申请: ${names}`, 'friend_cycle')
    const gids = applications.map((a: any) => toNum(a.gid))
    this.acceptFriendsWithRetry(gids)
  }

  async checkAndAcceptApplications() {
    try {
      const reply = await this.getApplications()
      const apps = reply.applications || []
      if (!apps.length)
        return
      const names = apps.map((a: any) => a.name || `GID:${toNum(a.gid)}`).join(', ')
      this.log(`发现 ${apps.length} 个待处理申请: ${names}`, 'friend_cycle')
      await this.acceptFriendsWithRetry(apps.map((a: any) => toNum(a.gid)))
    } catch {}
  }

  private async acceptFriendsWithRetry(gids: number[]) {
    if (!gids.length)
      return
    try {
      const reply = await this.acceptFriends(gids)
      const friends = reply.friends || []
      if (friends.length > 0) {
        const names = friends.map((f: any) => f.name || f.remark || `GID:${toNum(f.gid)}`).join(', ')
        this.log(`已同意 ${friends.length} 人: ${names}`, 'friend_cycle')
      }
    } catch (e: any) { this.warn(`同意失败: ${e?.message}`, 'friend_cycle') }
  }

  destroy() {
    this.stopFriendLoop()
  }
}
