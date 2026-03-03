import type { DrizzleDB } from '../database/drizzle.provider'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { sql } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../database/drizzle.provider'
import * as schema from '../database/schema'

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000

@Injectable()
export class GameLogService {
  private readonly logger = new Logger(GameLogService.name)
  private globalLogs: any[] = []
  private perAccountLogs = new Map<string, any[]>()
  private accountLogs: any[] = []

  private onLogCallback: ((entry: any) => void) | null = null
  private onAccountLogCallback: ((entry: any) => void) | null = null

  constructor(@Inject(DRIZZLE_TOKEN) private db: DrizzleDB) {}

  setCallbacks(callbacks: { onLog?: (entry: any) => void, onAccountLog?: (entry: any) => void }) {
    if (callbacks.onLog)
      this.onLogCallback = callbacks.onLog
    if (callbacks.onAccountLog)
      this.onAccountLogCallback = callbacks.onAccountLog
  }

  /** 写入一条农场/运行日志（内存 + 持久化 + 实时回调） */
  appendLog(accountId: string, accountName: string, entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) {
    const logEntry = {
      ...entry,
      accountId,
      accountName,
      ts: Date.now(),
      _searchText: `${entry?.msg || ''} ${entry?.tag || ''} ${JSON.stringify(entry?.meta || {})}`.toLowerCase()
    }

    let list = this.perAccountLogs.get(accountId)
    if (!list) {
      list = []
      this.perAccountLogs.set(accountId, list)
    }
    list.push(logEntry)
    if (list.length > 1000)
      list.shift()

    this.globalLogs.push(logEntry)
    if (this.globalLogs.length > 1000)
      this.globalLogs.shift()

    this.persistLog(logEntry)
    this.onLogCallback?.(logEntry)
  }

  getLogs(
    accountId: string,
    options?: { keyword?: string, limit?: number, module?: string, event?: string, isWarn?: boolean }
  ) {
    const limit = options?.limit || 100
    const keyword = (options?.keyword || '').toLowerCase().trim()
    const moduleFilter = options?.module?.trim()
    const eventFilter = options?.event?.trim()
    const isWarnFilter = options?.isWarn

    let result = accountId ? (this.perAccountLogs.get(accountId) || []) : this.globalLogs

    if (keyword)
      result = result.filter(l => l._searchText?.includes(keyword))
    if (moduleFilter)
      result = result.filter(l => l.meta?.module === moduleFilter)
    if (eventFilter)
      result = result.filter(l => l.meta?.event === eventFilter)
    if (typeof isWarnFilter === 'boolean')
      result = result.filter(l => Boolean(l.isWarn) === isWarnFilter)

    return result.slice(-limit)
  }

  addAccountLog(action: string, msg: string, accountId: string, accountName: string, extra?: any) {
    const entry = { action, msg, accountId, accountName, ts: Date.now(), ...extra }
    this.accountLogs.push(entry)
    if (this.accountLogs.length > 500)
      this.accountLogs.shift()
    this.db.insert(schema.accountLogs).values({
      accountId,
      accountName,
      action,
      msg,
      reason: extra?.reason || '',
      ts: Date.now(),
      extra: entry
    }).catch(() => {})
    this.onAccountLogCallback?.(entry)
  }

  getAccountLogs(limit = 50) {
    return this.accountLogs.slice(-limit)
  }

  private async persistLog(entry: any) {
    try {
      await this.db.insert(schema.logs).values({
        accountId: entry?.accountId || '',
        accountName: entry?.accountName || '',
        tag: entry?.tag || '',
        module: entry?.meta?.module || '',
        event: entry?.meta?.event || '',
        msg: entry?.msg || '',
        isWarn: !!entry?.isWarn,
        ts: entry?.ts || Date.now(),
        meta: entry?.meta || {}
      })
    } catch {}
  }

  /** 每日凌晨 4 点清理 30 天前的农场日志与账号操作日志 */
  @Cron('0 0 4 * * *')
  cleanupOldLogs() {
    try {
      const logsResult = this.db.run(sql`
        DELETE FROM logs WHERE id IN (
          SELECT l.id FROM logs l
          INNER JOIN (SELECT account_id, MAX(ts) AS last_ts FROM logs GROUP BY account_id) g
          ON l.account_id = g.account_id
          WHERE l.ts < g.last_ts - ${RETENTION_MS}
        )
      `) as { changes?: number }

      const accountLogsResult = this.db.run(sql`
        DELETE FROM account_logs WHERE id IN (
          SELECT l.id FROM account_logs l
          INNER JOIN (SELECT account_id, MAX(ts) AS last_ts FROM account_logs GROUP BY account_id) g
          ON l.account_id = g.account_id
          WHERE l.ts < g.last_ts - ${RETENTION_MS}
        )
      `) as { changes?: number }

      const logsDeleted = logsResult?.changes ?? 0
      const accountLogsDeleted = accountLogsResult?.changes ?? 0
      if (logsDeleted > 0 || accountLogsDeleted > 0) {
        this.logger.log(`日志清理完成: 农场日志删除 ${logsDeleted} 条, 账号操作日志删除 ${accountLogsDeleted} 条`)
      }
    } catch (e: any) {
      this.logger.warn(`日志清理失败: ${e?.message}`)
    }
  }
}
