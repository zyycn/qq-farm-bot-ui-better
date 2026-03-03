export const BAG_ERROR_COOLDOWN_MS = 15_000
export const BAG_HIDDEN_ITEM_IDS = new Set([1, 1001, 1002, 1101, 1011, 1012, 3001, 3002])
export const BAG_DASHBOARD_ITEM_IDS = new Set([1011, 1012, 3001, 3002])

export const LOGS_MAX_LENGTH = 1000
export const ACCOUNT_LOGS_MAX_LENGTH = 300
export const SOCKET_PATH = '/socket.io'

export const DEFAULT_FRIEND_QUIET_HOURS = {
  enabled: false,
  start: '23:00',
  end: '07:00',
} as const

export const DEFAULT_OFFLINE_REMINDER = {
  channel: 'webhook',
  reloginUrlMode: 'none',
  endpoint: '',
  token: '',
  title: '账号下线提醒',
  msg: '账号下线',
  offlineDeleteSec: 120,
} as const
