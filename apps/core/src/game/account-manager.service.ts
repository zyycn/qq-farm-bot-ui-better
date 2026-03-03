import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { AccountRunnerCallbacks } from './account-runner'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { StoreService } from '../store/store.service'
import { AccountRunner } from './account-runner'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { ProtoService } from './proto.service'

interface RunningAccount {
  runner: AccountRunner
  name: string
  status: any
  disconnectedSince: number
  autoDeleteTriggered: boolean
  wsError: { code: number, message: string, at: number } | null
}

@Injectable()
export class AccountManagerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger('AccountManager')
  private runners = new Map<string, RunningAccount>()
  private onStatusSyncCallback: ((accountId: string, status: any) => void) | null = null

  constructor(
    private proto: ProtoService,
    private gameConfig: GameConfigService,
    private store: StoreService,
    private gameLog: GameLogService,
    private gamePush: GamePushService
  ) {}

  setRealtimeCallbacks(callbacks: {
    onStatusSync?: (accountId: string, status: any) => void
    onLog?: (entry: any) => void
    onAccountLog?: (entry: any) => void
  }) {
    if (callbacks.onStatusSync)
      this.onStatusSyncCallback = callbacks.onStatusSync
    this.gameLog.setCallbacks({
      onLog: callbacks.onLog ?? undefined,
      onAccountLog: callbacks.onAccountLog ?? undefined
    })
  }

  async onModuleInit() {
    await this.autoStartAccounts()
  }

  async onModuleDestroy() {
    for (const [id] of this.runners) {
      await this.stopAccount(id)
    }
  }

  private async autoStartAccounts() {
    const accounts = this.store.getAllAccounts()
    for (const acc of accounts) {
      if (acc.code)
        this.startAccount(acc.id)
    }
  }

  // ========== Account Lifecycle ==========

  startAccount(accountId: string): boolean {
    const id = String(accountId ?? '').trim()
    if (!id)
      return false

    const existing = this.runners.get(id)
    if (existing) {
      if (existing.runner.isActive())
        return false
      this.runners.delete(id)
    }

    const acc = this.store.getAccountById(id)
    if (!acc)
      return false
    if (!acc.code || String(acc.code).trim() === '')
      return false

    const callbacks: AccountRunnerCallbacks = {
      onStatusSync: (runnerId, status, name) => this.handleStatusSync(runnerId, status, name),
      onLog: (entry) => {
        const r = this.runners.get(id)
        this.gameLog.appendLog(id, r?.name ?? acc.name ?? '', entry)
      },
      onKicked: (aid, reason) => this.handleKicked(aid, reason),
      onWsError: (aid, code, message) => this.handleWsError(aid, code, message),
      onStopped: (aid) => {
        const r = this.runners.get(aid)
        if (r && !r.runner.isActive())
          this.runners.delete(aid)
      }
    }

    const runner = new AccountRunner(id, this.proto, this.gameConfig, this.store, callbacks)
    runner.name = acc.name || ''

    const record: RunningAccount = {
      runner,
      name: acc.name || '',
      status: null,
      disconnectedSince: 0,
      autoDeleteTriggered: false,
      wsError: null
    }
    this.runners.set(id, record)

    runner.start({ code: acc.code, platform: acc.platform || 'qq' }).catch((e) => {
      this.logger.error(`账号 ${acc.name} 启动失败: ${e?.message}`)
      this.runners.delete(id)
    })

    this.gameLog.addAccountLog('start', `启动账号: ${acc.name}`, id, acc.name || '')
    return true
  }

  async stopAccount(accountId: string): Promise<boolean> {
    const record = this.runners.get(accountId)
    if (!record)
      return false
    await record.runner.stop()
    this.runners.delete(accountId)
    this.gameLog.addAccountLog('stop', `停止账号: ${record.name}`, accountId, record.name)
    return true
  }

  async restartAccount(accountId: string): Promise<boolean> {
    await this.stopAccount(accountId)
    return this.startAccount(accountId)
  }

  isAccountRunning(accountId: string): boolean {
    return this.runners.has(accountId) && !!this.runners.get(accountId)?.runner.isActive()
  }

  // ========== Event Handlers ==========

  private handleStatusSync(accountId: string, status: any, name: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return

    record.status = { accountId, accountName: record.name, ...status }
    if (name && name !== '未知' && name !== '未登录' && record.name !== name) {
      const oldName = record.name
      record.name = name
      record.runner.name = name
      this.store.addOrUpdateAccount({ id: accountId, nick: name })
      this.logger.log(`已同步账号昵称: ${oldName || 'None'} -> ${name}`)
      this.gameLog.appendLog(accountId, record.name, {
        msg: `已同步账号昵称: ${oldName || 'None'} -> ${name}`,
        tag: '信息',
        meta: { module: 'system', event: 'nick_sync' }
      })
    }

    const connected = !!status?.connection?.connected
    if (connected) {
      record.disconnectedSince = 0
      record.autoDeleteTriggered = false
      record.wsError = null
    } else if (record.runner.isActive()) {
      const now = Date.now()
      if (!record.disconnectedSince)
        record.disconnectedSince = now
      const offlineMs = now - record.disconnectedSince
      const offlineReminder = this.store.getOfflineReminder()
      const autoDeleteMs = (offlineReminder?.offlineDeleteSec || 120) * 1000

      if (!record.autoDeleteTriggered && offlineMs >= autoDeleteMs) {
        record.autoDeleteTriggered = true
        const offlineMin = Math.floor(offlineMs / 60000)
        this.logger.warn(`账号 ${record.name} 持续离线 ${offlineMin} 分钟，自动删除`)
        this.gamePush.triggerOfflineReminder(accountId, record.name, 'offline_timeout', offlineMs)
        this.gameLog.addAccountLog(
          'offline_delete',
          `账号 ${record.name} 持续离线 ${offlineMin} 分钟，已自动删除`,
          accountId,
          record.name
        )
        this.stopAccount(accountId).catch(() => {})
        this.store.deleteAccount(accountId)
      }
    }

    this.onStatusSyncCallback?.(accountId, record.status)
  }

  private handleKicked(accountId: string, reason: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return
    this.logger.warn(`账号 ${record.name} 被踢下线: ${reason}`)
    this.gamePush.triggerOfflineReminder(accountId, record.name, `kickout:${reason}`, 0)
    this.gameLog.addAccountLog('kickout_stop', `账号 ${record.name} 被踢下线，已自动停止`, accountId, record.name)
    this.stopAccount(accountId).catch(() => {})
  }

  private handleWsError(accountId: string, code: number, message: string) {
    const record = this.runners.get(accountId)
    if (!record)
      return
    record.wsError = { code, message, at: Date.now() }
    if (code === 400) {
      this.gameLog.addAccountLog('ws_400', `账号 ${record.name} 登录失效，请更新 Code`, accountId, record.name)
    }
  }

  // ========== Public API ==========

  getAccounts() {
    const dbAccounts = this.store.getAllAccounts()
    const accounts = dbAccounts.map(acc => ({
      ...acc,
      running: this.isAccountRunning(acc.id),
      status: this.runners.get(acc.id)?.status || null,
      wsError: this.runners.get(acc.id)?.wsError || null
    }))
    return { accounts }
  }

  resolveAccountId(rawRef: string | number): string {
    const ref = String(rawRef ?? '').trim()
    if (!ref)
      return ''
    const accounts = this.store.getAllAccounts()
    const found = accounts.find(a => String(a?.id) === ref || String(a?.uin) === ref || String(a?.qq) === ref)
    return found ? String(found.id) : ref
  }

  setRuntimeAccountName(accountId: string, name: string) {
    const record = this.runners.get(accountId)
    if (record) {
      record.name = name
      record.runner.name = name
    }
  }

  getRunner(accountId: string): AccountRunner | null {
    return this.runners.get(accountId)?.runner || null
  }

  /** 获取运行中账号的 Runner，不存在则抛出 BadRequestException，供 Controller 直接调用 runner 方法 */
  getRunnerOrThrow(accountId: string): AccountRunner {
    const runner = this.getRunner(accountId)
    if (!runner)
      throw new BadRequestException('账号未运行')
    return runner
  }

  getStatus(accountId: string) {
    return this.runners.get(accountId)?.status || null
  }

  getLogs(
    accountId: string,
    options?: { keyword?: string, limit?: number, module?: string, event?: string, isWarn?: boolean }
  ) {
    return this.gameLog.getLogs(accountId, options)
  }

  getAccountLogs(limit = 50) {
    return this.gameLog.getAccountLogs(limit)
  }

  addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra?: any) {
    this.gameLog.addAccountLog(action, msg, accountId, accountName, extra)
  }

  broadcastConfig(accountId: string) {
    const runner = this.getRunner(accountId)
    if (!runner)
      return
    const snapshot = this.store.getConfigSnapshot(accountId)
    runner.applyConfig(snapshot)
  }
}
