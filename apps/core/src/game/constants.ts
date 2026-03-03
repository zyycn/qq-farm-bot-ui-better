export const GAME_SERVER_URL = 'wss://gate-obt.nqf.qq.com/prod/ws'
export const CLIENT_VERSION = '1.6.0.14_20251224'
export const DEFAULT_OS = 'iOS'
export const HEARTBEAT_INTERVAL_MS = 25_000

export const DEFAULT_FARM_INTERVAL_MS = 2_000
export const DEFAULT_FRIEND_INTERVAL_MS = 10_000

export enum PlantPhase {
  UNKNOWN = 0,
  SEED = 1,
  GERMINATION = 2,
  SMALL_LEAVES = 3,
  LARGE_LEAVES = 4,
  BLOOMING = 5,
  MATURE = 6,
  DEAD = 7
}

export const PHASE_NAMES = ['未知', '种子', '发芽', '小叶', '大叶', '开花', '成熟', '枯死'] as const

export const ALLOWED_PLANTING_STRATEGIES = [
  'preferred',
  'level',
  'max_exp',
  'max_fert_exp',
  'max_profit',
  'max_fert_profit'
] as const
export type PlantingStrategy = typeof ALLOWED_PLANTING_STRATEGIES[number]

export const ALLOWED_FERTILIZER_MODES = ['both', 'normal', 'organic', 'none'] as const
export type FertilizerMode = typeof ALLOWED_FERTILIZER_MODES[number]

export const PUSHOO_CHANNELS = new Set([
  'webhook',
  'qmsg',
  'serverchan',
  'pushplus',
  'pushplushxtrip',
  'dingtalk',
  'wecom',
  'bark',
  'gocqhttp',
  'onebot',
  'atri',
  'pushdeer',
  'igot',
  'telegram',
  'feishu',
  'ifttt',
  'wecombot',
  'discord',
  'wxpusher'
])

export interface AutomationConfig {
  farm: boolean
  farm_push: boolean
  land_upgrade: boolean
  friend: boolean
  friend_help_exp_limit: boolean
  friend_steal: boolean
  friend_help: boolean
  friend_bad: boolean
  task: boolean
  email: boolean
  fertilizer_gift: boolean
  fertilizer_buy: boolean
  free_gifts: boolean
  share_reward: boolean
  vip_gift: boolean
  month_card: boolean
  open_server_gift: boolean
  sell: boolean
  fertilizer: FertilizerMode
}

export const DEFAULT_AUTOMATION: AutomationConfig = {
  farm: true,
  farm_push: true,
  land_upgrade: true,
  friend: true,
  friend_help_exp_limit: true,
  friend_steal: true,
  friend_help: true,
  friend_bad: false,
  task: true,
  email: true,
  fertilizer_gift: false,
  fertilizer_buy: false,
  free_gifts: true,
  share_reward: true,
  vip_gift: true,
  month_card: true,
  open_server_gift: true,
  sell: true,
  fertilizer: 'none'
}

export const ALLOWED_AUTOMATION_KEYS = new Set(Object.keys(DEFAULT_AUTOMATION))

export interface IntervalsConfig {
  farm: number
  friend: number
  farmMin: number
  farmMax: number
  friendMin: number
  friendMax: number
}

export const DEFAULT_INTERVALS: IntervalsConfig = {
  farm: 2,
  friend: 10,
  farmMin: 2,
  farmMax: 2,
  friendMin: 10,
  friendMax: 10
}

export interface FriendQuietHoursConfig {
  enabled: boolean
  start: string
  end: string
}

export const DEFAULT_FRIEND_QUIET_HOURS: FriendQuietHoursConfig = {
  enabled: false,
  start: '23:00',
  end: '07:00'
}

export interface OfflineReminderConfig {
  channel: string
  reloginUrlMode: string
  endpoint: string
  token: string
  title: string
  msg: string
  offlineDeleteSec: number
}

export const DEFAULT_OFFLINE_REMINDER: OfflineReminderConfig = {
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '账号下线提醒',
  msg: '账号下线',
  offlineDeleteSec: 120
}

export interface AccountConfigSnapshot {
  automation: AutomationConfig
  plantingStrategy: PlantingStrategy
  preferredSeedId: number
  intervals: IntervalsConfig
  friendQuietHours: FriendQuietHoursConfig
  friendBlacklist: number[]
  stealCropBlacklist: number[]
}

export const DEFAULT_ACCOUNT_CONFIG: AccountConfigSnapshot = {
  automation: { ...DEFAULT_AUTOMATION },
  plantingStrategy: 'preferred',
  preferredSeedId: 0,
  intervals: { ...DEFAULT_INTERVALS },
  friendQuietHours: { ...DEFAULT_FRIEND_QUIET_HOURS },
  friendBlacklist: [],
  stealCropBlacklist: []
}

export const OP_TYPE_NAMES: Record<number, string> = {
  10001: '收获',
  10002: '铲除',
  10003: '放草',
  10004: '放虫',
  10005: '除草',
  10006: '除虫',
  10007: '浇水',
  10008: '偷菜'
}
