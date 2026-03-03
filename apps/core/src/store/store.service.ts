import type { DrizzleDB } from '../database/drizzle.provider'
import type { AccountConfigSnapshot, AutomationConfig, FertilizerMode, FriendQuietHoursConfig, IntervalsConfig, OfflineReminderConfig, PlantingStrategy } from '../game/constants'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { DRIZZLE_TOKEN } from '../database/drizzle.provider'
import * as schema from '../database/schema'
import {

  ALLOWED_AUTOMATION_KEYS,
  ALLOWED_FERTILIZER_MODES,
  ALLOWED_PLANTING_STRATEGIES,

  DEFAULT_ACCOUNT_CONFIG,
  DEFAULT_AUTOMATION,
  DEFAULT_FRIEND_QUIET_HOURS,
  DEFAULT_OFFLINE_REMINDER,

  PUSHOO_CHANNELS
} from '../game/constants'
import { normalizeTimeString } from '../game/utils'

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name)

  constructor(@Inject(DRIZZLE_TOKEN) private readonly db: DrizzleDB) {}

  // ========== Global Config Helpers ==========

  private getGlobalValue<T>(key: string, fallback: T): T {
    const row = this.db.select().from(schema.globalConfig).where(eq(schema.globalConfig.key, key)).get()
    return row?.value !== undefined && row?.value !== null ? (row.value as T) : fallback
  }

  private setGlobalValue(key: string, value: any): void {
    const existing = this.db.select().from(schema.globalConfig).where(eq(schema.globalConfig.key, key)).get()
    if (existing) {
      this.db.update(schema.globalConfig).set({ value }).where(eq(schema.globalConfig.key, key)).run()
    } else {
      this.db.insert(schema.globalConfig).values({ key, value }).run()
    }
  }

  // ========== Admin Password ==========

  getAdminPasswordHash(): string {
    return String(this.getGlobalValue('adminPasswordHash', '') || '')
  }

  setAdminPasswordHash(hash: string): string {
    const h = String(hash || '')
    this.setGlobalValue('adminPasswordHash', h)
    return h
  }

  // ========== UI ==========

  getUI(): { theme: string } {
    const saved = this.getGlobalValue<{ theme?: string }>('ui', { theme: 'dark' })
    const theme = String(saved?.theme || 'dark').trim()
    return { theme: theme || 'dark' }
  }

  setUITheme(theme: string): { theme: string } {
    const next = String(theme || 'dark').trim().slice(0, 64)
    this.setGlobalValue('ui', { theme: next })
    return { theme: next }
  }

  // ========== Offline Reminder ==========

  normalizeOfflineReminder(input?: Partial<OfflineReminderConfig>): OfflineReminderConfig {
    const src = (input && typeof input === 'object') ? input : {}
    let offlineDeleteSec = Number.parseInt(String(src.offlineDeleteSec), 10)
    if (!Number.isFinite(offlineDeleteSec) || offlineDeleteSec < 1)
      offlineDeleteSec = DEFAULT_OFFLINE_REMINDER.offlineDeleteSec

    const rawChannel = src.channel != null ? String(src.channel).trim().toLowerCase() : ''
    const endpoint = src.endpoint != null ? String(src.endpoint).trim() : DEFAULT_OFFLINE_REMINDER.endpoint
    const migratedChannel = rawChannel
      || (PUSHOO_CHANNELS.has(String(endpoint || '').trim().toLowerCase())
        ? String(endpoint || '').trim().toLowerCase()
        : DEFAULT_OFFLINE_REMINDER.channel)
    const channel = PUSHOO_CHANNELS.has(migratedChannel) ? migratedChannel : DEFAULT_OFFLINE_REMINDER.channel

    const rawMode = src.reloginUrlMode != null ? String(src.reloginUrlMode).trim().toLowerCase() : DEFAULT_OFFLINE_REMINDER.reloginUrlMode
    const reloginUrlMode = new Set(['none', 'qq_link', 'qr_link']).has(rawMode) ? rawMode : DEFAULT_OFFLINE_REMINDER.reloginUrlMode

    return {
      channel,
      reloginUrlMode,
      endpoint,
      token: src.token != null ? String(src.token).trim() : DEFAULT_OFFLINE_REMINDER.token,
      title: src.title != null ? String(src.title).trim() : DEFAULT_OFFLINE_REMINDER.title,
      msg: src.msg != null ? String(src.msg).trim() : DEFAULT_OFFLINE_REMINDER.msg,
      offlineDeleteSec
    }
  }

  getOfflineReminder(): OfflineReminderConfig {
    const saved = this.getGlobalValue<Partial<OfflineReminderConfig>>('offlineReminder', {})
    return this.normalizeOfflineReminder(saved)
  }

  setOfflineReminder(cfg: Partial<OfflineReminderConfig>): OfflineReminderConfig {
    const current = this.getOfflineReminder()
    const next = this.normalizeOfflineReminder({ ...current, ...cfg })
    this.setGlobalValue('offlineReminder', next)
    return next
  }

  // ========== Normalization Helpers ==========

  normalizeIntervals(intervals?: Partial<IntervalsConfig>): IntervalsConfig {
    const src = (intervals && typeof intervals === 'object') ? intervals : {} as Partial<IntervalsConfig>
    const toSec = (v: any, d: number) => Math.max(1, Number.parseInt(String(v), 10) || d)
    const farm = toSec(src.farm, 2)
    const friend = toSec(src.friend, 10)
    let farmMin = toSec(src.farmMin, farm)
    let farmMax = toSec(src.farmMax, farm)
    if (farmMin > farmMax)
      [farmMin, farmMax] = [farmMax, farmMin]
    let friendMin = toSec(src.friendMin, friend)
    let friendMax = toSec(src.friendMax, friend)
    if (friendMin > friendMax)
      [friendMin, friendMax] = [friendMax, friendMin]
    return { farm, friend, farmMin, farmMax, friendMin, friendMax }
  }

  cloneAccountConfig(base?: Partial<AccountConfigSnapshot>): AccountConfigSnapshot {
    const b = base || DEFAULT_ACCOUNT_CONFIG
    const srcAutomation = (b.automation && typeof b.automation === 'object') ? b.automation : {} as Partial<AutomationConfig>
    const automation = { ...DEFAULT_AUTOMATION }
    for (const key of Object.keys(automation) as (keyof AutomationConfig)[]) {
      if ((srcAutomation as any)[key] !== undefined)
        (automation as any)[key] = (srcAutomation as any)[key]
    }
    const rawBlacklist = Array.isArray(b.friendBlacklist) ? b.friendBlacklist : []
    const rawStealBlacklist = Array.isArray(b.stealCropBlacklist) ? b.stealCropBlacklist : []
    return {
      automation,
      plantingStrategy: ALLOWED_PLANTING_STRATEGIES.includes(String(b.plantingStrategy || '') as PlantingStrategy)
        ? (String(b.plantingStrategy) as PlantingStrategy)
        : DEFAULT_ACCOUNT_CONFIG.plantingStrategy,
      preferredSeedId: Math.max(0, Number.parseInt(String(b.preferredSeedId), 10) || 0),
      intervals: this.normalizeIntervals(b.intervals),
      friendQuietHours: { ...(b.friendQuietHours || DEFAULT_FRIEND_QUIET_HOURS) },
      friendBlacklist: rawBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0),
      stealCropBlacklist: rawStealBlacklist.map(Number).filter(n => Number.isFinite(n) && n >= 0)
    }
  }

  normalizeAccountConfig(input?: Partial<AccountConfigSnapshot>, fallback?: AccountConfigSnapshot): AccountConfigSnapshot {
    const src = (input && typeof input === 'object') ? input : {} as Partial<AccountConfigSnapshot>
    const cfg = this.cloneAccountConfig(fallback || DEFAULT_ACCOUNT_CONFIG)

    if (src.automation && typeof src.automation === 'object') {
      for (const [k, v] of Object.entries(src.automation)) {
        if (!ALLOWED_AUTOMATION_KEYS.has(k))
          continue
        if (k === 'fertilizer') {
          cfg.automation.fertilizer = ALLOWED_FERTILIZER_MODES.includes(v as FertilizerMode) ? (v as FertilizerMode) : cfg.automation.fertilizer
        } else {
          (cfg.automation as any)[k] = !!v
        }
      }
    }

    if (src.plantingStrategy && ALLOWED_PLANTING_STRATEGIES.includes(src.plantingStrategy))
      cfg.plantingStrategy = src.plantingStrategy

    if (src.preferredSeedId != null)
      cfg.preferredSeedId = Math.max(0, Number.parseInt(String(src.preferredSeedId), 10) || 0)

    if (src.intervals && typeof src.intervals === 'object') {
      for (const [type, sec] of Object.entries(src.intervals)) {
        if ((cfg.intervals as any)[type] === undefined) {
          continue
        }
        ;(cfg.intervals as any)[type] = Math.max(1, Number.parseInt(String(sec), 10) || (cfg.intervals as any)[type] || 1)
      }
      cfg.intervals = this.normalizeIntervals(cfg.intervals)
    }

    if (src.friendQuietHours && typeof src.friendQuietHours === 'object') {
      const old = cfg.friendQuietHours
      cfg.friendQuietHours = {
        enabled: src.friendQuietHours.enabled !== undefined ? !!src.friendQuietHours.enabled : old.enabled,
        start: normalizeTimeString(src.friendQuietHours.start, old.start || '23:00'),
        end: normalizeTimeString(src.friendQuietHours.end, old.end || '07:00')
      }
    }

    if (Array.isArray(src.friendBlacklist))
      cfg.friendBlacklist = src.friendBlacklist.map(Number).filter(n => Number.isFinite(n) && n > 0)

    if (Array.isArray(src.stealCropBlacklist))
      cfg.stealCropBlacklist = src.stealCropBlacklist.map(Number).filter(n => Number.isFinite(n) && n >= 0)

    return cfg
  }

  // ========== Account Config (DB-backed) ==========

  private getDefaultAccountConfig(): AccountConfigSnapshot {
    const saved = this.getGlobalValue<Partial<AccountConfigSnapshot>>('defaultAccountConfig', {})
    return this.normalizeAccountConfig(saved, DEFAULT_ACCOUNT_CONFIG)
  }

  private setDefaultAccountConfig(cfg: AccountConfigSnapshot): void {
    this.setGlobalValue('defaultAccountConfig', cfg)
  }

  getAccountConfig(accountId: string): AccountConfigSnapshot {
    const fallback = this.getDefaultAccountConfig()
    if (!accountId)
      return this.cloneAccountConfig(fallback)

    const row = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    if (!row)
      return this.normalizeAccountConfig({}, fallback)

    return this.normalizeAccountConfig({
      automation: row.automation as any,
      plantingStrategy: row.plantingStrategy as PlantingStrategy,
      preferredSeedId: row.preferredSeedId ?? 0,
      intervals: row.intervals as any,
      friendQuietHours: row.friendQuietHours as any,
      friendBlacklist: row.friendBlacklist as any,
      stealCropBlacklist: row.stealCropBlacklist as any
    }, fallback)
  }

  setAccountConfig(accountId: string, nextConfig: Partial<AccountConfigSnapshot>): AccountConfigSnapshot {
    if (!accountId) {
      const fallback = this.getDefaultAccountConfig()
      const updated = this.normalizeAccountConfig(nextConfig, fallback)
      this.setDefaultAccountConfig(updated)
      return this.cloneAccountConfig(updated)
    }

    const fallback = this.getDefaultAccountConfig()
    const current = this.getAccountConfig(accountId)
    const merged = this.normalizeAccountConfig({ ...current, ...nextConfig }, fallback)

    const existing = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    const data = {
      automation: merged.automation as any,
      plantingStrategy: merged.plantingStrategy,
      preferredSeedId: merged.preferredSeedId,
      intervals: merged.intervals as any,
      friendQuietHours: merged.friendQuietHours as any,
      friendBlacklist: merged.friendBlacklist as any,
      stealCropBlacklist: merged.stealCropBlacklist as any
    }

    if (existing) {
      this.db.update(schema.accountConfigs).set(data).where(eq(schema.accountConfigs.accountId, accountId)).run()
    } else {
      this.db.insert(schema.accountConfigs).values({ accountId, ...data }).run()
    }

    return this.cloneAccountConfig(merged)
  }

  removeAccountConfig(accountId: string): void {
    if (!accountId)
      return
    this.db.delete(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).run()
  }

  ensureAccountConfig(accountId: string): AccountConfigSnapshot | null {
    if (!accountId)
      return null
    const existing = this.db.select().from(schema.accountConfigs).where(eq(schema.accountConfigs.accountId, accountId)).get()
    if (existing) {
      return this.getAccountConfig(accountId)
    }
    const fallback = this.getDefaultAccountConfig()
    const cfg = this.normalizeAccountConfig(fallback, DEFAULT_ACCOUNT_CONFIG)
    cfg.automation.fertilizer = 'none'

    this.db.insert(schema.accountConfigs).values({
      accountId,
      automation: cfg.automation as any,
      plantingStrategy: cfg.plantingStrategy,
      preferredSeedId: cfg.preferredSeedId,
      intervals: cfg.intervals as any,
      friendQuietHours: cfg.friendQuietHours as any,
      friendBlacklist: cfg.friendBlacklist as any,
      stealCropBlacklist: cfg.stealCropBlacklist as any
    }).run()

    return this.cloneAccountConfig(cfg)
  }

  // ========== Convenience getters ==========

  getAutomation(accountId: string): AutomationConfig {
    return { ...this.getAccountConfig(accountId).automation }
  }

  setAutomation(key: string, value: any, accountId: string): AccountConfigSnapshot {
    return this.applyConfigSnapshot({ automation: { [key]: value } as any }, accountId)
  }

  isAutomationOn(key: string, accountId: string): boolean {
    return !!(this.getAccountConfig(accountId).automation as any)[key]
  }

  getPreferredSeed(accountId: string): number {
    return this.getAccountConfig(accountId).preferredSeedId
  }

  getPlantingStrategy(accountId: string): PlantingStrategy {
    return this.getAccountConfig(accountId).plantingStrategy
  }

  getIntervals(accountId: string): IntervalsConfig {
    return { ...this.getAccountConfig(accountId).intervals }
  }

  getFriendQuietHours(accountId: string): FriendQuietHoursConfig {
    return { ...this.getAccountConfig(accountId).friendQuietHours }
  }

  getFriendBlacklist(accountId: string): number[] {
    return [...(this.getAccountConfig(accountId).friendBlacklist || [])]
  }

  setFriendBlacklist(accountId: string, list: number[]): number[] {
    const cfg = this.getAccountConfig(accountId)
    cfg.friendBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n > 0) : []
    this.setAccountConfig(accountId, cfg)
    return [...cfg.friendBlacklist]
  }

  getStealCropBlacklist(accountId: string): number[] {
    return [...(this.getAccountConfig(accountId).stealCropBlacklist || [])]
  }

  setStealCropBlacklist(accountId: string, list: number[]): number[] {
    const cfg = this.getAccountConfig(accountId)
    cfg.stealCropBlacklist = Array.isArray(list) ? list.map(Number).filter(n => Number.isFinite(n) && n >= 0) : []
    this.setAccountConfig(accountId, cfg)
    return [...cfg.stealCropBlacklist]
  }

  getConfigSnapshot(accountId: string): AccountConfigSnapshot & { ui: { theme: string } } {
    const cfg = this.getAccountConfig(accountId)
    return {
      ...cfg,
      automation: { ...cfg.automation },
      intervals: { ...cfg.intervals },
      friendQuietHours: { ...cfg.friendQuietHours },
      friendBlacklist: [...(cfg.friendBlacklist || [])],
      stealCropBlacklist: [...(cfg.stealCropBlacklist || [])],
      ui: this.getUI()
    }
  }

  applyConfigSnapshot(snapshot: Partial<AccountConfigSnapshot> & { ui?: { theme?: string } }, accountId: string): AccountConfigSnapshot {
    const cfg = snapshot || {}

    if (cfg.ui && typeof cfg.ui === 'object') {
      const theme = String(cfg.ui.theme || '').trim()
      if (theme)
        this.setUITheme(theme)
    }

    return this.setAccountConfig(accountId, cfg)
  }

  // ========== Account CRUD (DB-backed) ==========

  getAccounts(): { accounts: any[], nextId: number } {
    const rows = this.db.select().from(schema.accounts).all()
    const maxId = rows.reduce((m, a) => Math.max(m, Number.parseInt(String(a.id), 10) || 0), 0)
    return { accounts: rows, nextId: maxId + 1 }
  }

  addOrUpdateAccount(acc: Record<string, any>): { accounts: any[], nextId: number } {
    // QQ 平台：如果未显式指定 id，但携带 uin，则先按 (uin + platform) 查重，命中则转为更新
    // 这里只用于定位账号，不自动修改备注，避免重复扫码覆盖用户手动设置的备注
    let dedupByUin = false
    if (!acc.id && acc.uin) {
      const uin = String(acc.uin).trim()
      const platform = String(acc.platform || 'qq').trim()
      if (uin && platform === 'qq') {
        const existingByUin = this.db.select().from(schema.accounts).where(and(eq(schema.accounts.uin, uin), eq(schema.accounts.platform, platform))).get()
        if (existingByUin) {
          acc.id = existingByUin.id
          dedupByUin = true
        }
      }
    }

    if (acc.id) {
      const existing = this.db.select().from(schema.accounts).where(eq(schema.accounts.id, String(acc.id))).get()
      if (existing) {
        this.db.update(schema.accounts).set({
          // 业务约定：重复扫码同一个 QQ 号（loginType=qr + uin 去重命中）时，不自动覆盖备注，只更新 code 等登录相关字段
          name: dedupByUin && acc.loginType === 'qr'
            ? existing.name
            : (acc.name !== undefined ? acc.name : existing.name),
          code: acc.code !== undefined ? acc.code : existing.code,
          platform: acc.platform !== undefined ? acc.platform : existing.platform,
          uin: acc.uin !== undefined ? String(acc.uin) : existing.uin,
          qq: acc.qq !== undefined ? String(acc.qq) : existing.qq,
          avatar: acc.avatar || acc.avatarUrl || existing.avatar,
          nick: acc.nick !== undefined ? acc.nick : existing.nick,
          updatedAt: Date.now()
        }).where(eq(schema.accounts.id, String(acc.id))).run()
        this.ensureAccountConfig(String(acc.id))
        return this.getAccounts()
      }
    }

    const { nextId } = this.getAccounts()
    const id = String(acc.id || nextId)
    this.db.insert(schema.accounts).values({
      id,
      name: acc.name || `账号${id}`,
      code: acc.code || '',
      platform: acc.platform || 'qq',
      uin: acc.uin ? String(acc.uin) : '',
      qq: acc.qq ? String(acc.qq) : (acc.uin ? String(acc.uin) : ''),
      avatar: acc.avatar || acc.avatarUrl || '',
      nick: acc.nick || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }).run()
    this.ensureAccountConfig(id)
    return this.getAccounts()
  }

  deleteAccount(id: string | number): { accounts: any[], nextId: number } {
    this.db.delete(schema.accounts).where(eq(schema.accounts.id, String(id))).run()
    this.removeAccountConfig(String(id))
    return this.getAccounts()
  }

  getAllAccounts(): any[] {
    return this.db.select().from(schema.accounts).all()
  }

  getAccountById(id: string | number): any | null {
    const sid = String(id ?? '').trim()
    if (!sid)
      return null
    return this.db.select().from(schema.accounts).where(eq(schema.accounts.id, sid)).get() || null
  }

  setAccountRunning(id: string, running: boolean): void {
    this.db.update(schema.accounts).set({ running }).where(eq(schema.accounts.id, id)).run()
  }

  updateAccountCode(id: string, code: string): void {
    this.db.update(schema.accounts).set({ code, updatedAt: Date.now() }).where(eq(schema.accounts.id, id)).run()
  }
}
