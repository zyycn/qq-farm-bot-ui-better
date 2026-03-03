import Long from 'long'

export function toLong(val: number): Long {
  return Long.fromNumber(val)
}

export function toNum(val: any): number {
  if (Long.isLong(val))
    return val.toNumber()
  return Number(val) || 0
}

let serverTimeMs = 0
let localTimeAtSync = 0

export function getServerTimeSec(): number {
  if (!serverTimeMs)
    return Math.floor(Date.now() / 1000)
  const elapsed = Date.now() - localTimeAtSync
  return Math.floor((serverTimeMs + elapsed) / 1000)
}

export function syncServerTime(ms: number): void {
  serverTimeMs = ms
  localTimeAtSync = Date.now()
}

export function toTimeSec(val: any): number {
  const n = toNum(val)
  if (n <= 0)
    return 0
  return n > 1e12 ? Math.floor(n / 1000) : n
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatLocalDateTime24(date = new Date()): string {
  const d = date instanceof Date ? date : new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function nowTimeStr(): string {
  const d = new Date()
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

export function getDateKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function getServerDateKey(): string {
  const nowSec = getServerTimeSec()
  const nowMs = nowSec > 0 ? nowSec * 1000 : Date.now()
  const bjOffset = 8 * 3600 * 1000
  const bjDate = new Date(nowMs + bjOffset)
  return `${bjDate.getUTCFullYear()}-${pad2(bjDate.getUTCMonth() + 1)}-${pad2(bjDate.getUTCDate())}`
}

export function normalizeTimeString(v: string | undefined | null, fallback: string): string {
  const s = String(v || '').trim()
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m)
    return fallback
  const hh = Math.max(0, Math.min(23, Number.parseInt(m[1], 10)))
  const mm = Math.max(0, Math.min(59, Number.parseInt(m[2], 10)))
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function randomIntervalMs(minMs: number, maxMs: number): number {
  const minSec = Math.max(1, Math.floor(Math.max(1000, Number(minMs) || 1000) / 1000))
  const maxSec = Math.max(minSec, Math.floor(Math.max(1000, Number(maxMs) || minSec * 1000) / 1000))
  if (maxSec === minSec)
    return minSec * 1000
  const sec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1))
  return sec * 1000
}

// Cookie/Hash utilities (from qrutils.js)
export class CookieUtils {
  static parse(cookieStr: string): Record<string, string> {
    if (!cookieStr)
      return {}
    return cookieStr.split(';').reduce((acc: Record<string, string>, curr) => {
      const [key, value] = curr.split('=')
      if (key)
        acc[key.trim()] = value ? value.trim() : ''
      return acc
    }, {})
  }

  static getValue(cookies: string | string[] | null, key: string): string | null {
    if (!cookies)
      return null
    const str = Array.isArray(cookies) ? cookies.join('; ') : cookies
    const match = str.match(new RegExp(`(^|;\\s*)${key}=([^;]*)`))
    return match ? match[2] : null
  }

  static getUin(cookies: string | string[]): string | null {
    const uin = this.getValue(cookies, 'wxuin') || this.getValue(cookies, 'uin') || this.getValue(cookies, 'ptui_loginuin')
    if (!uin)
      return null
    return uin.replace(/^o0*/, '')
  }
}

export class HashUtils {
  static hash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++)
      hash += (hash << 5) + str.charCodeAt(i)
    return 2147483647 & hash
  }

  static getGTk(pskey: string): number {
    let gtk = 5381
    for (let i = 0; i < pskey.length; i++)
      gtk += (gtk << 5) + pskey.charCodeAt(i)
    return gtk & 0x7FFFFFFF
  }
}

const SENSITIVE_KEY_RE = /code|token|password|passwd|auth|ticket|cookie|session/i

export function redactString(input: string): string {
  let text = String(input || '')
  text = text.replace(/([?&](?:code|token|ticket|password)=)[^&\s]+/gi, '$1[REDACTED]')
  text = text.replace(/(Bearer\s+)[\w.-]+/gi, '$1[REDACTED]')
  return text
}

export function sanitizeMeta(value: any, depth = 0): any {
  if (depth > 4)
    return '[Truncated]'
  if (value === null || value === undefined)
    return value
  if (typeof value === 'string')
    return redactString(value)
  if (typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(v => sanitizeMeta(v, depth + 1))

  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY_RE.test(String(k)) ? '[REDACTED]' : sanitizeMeta(v, depth + 1)
  }
  return out
}

const MODULE_TAG_MAP: Record<string, string> = {
  farm: '农场',
  friend: '好友',
  warehouse: '仓库',
  task: '任务',
  system: '系统'
}

const TAG_MODULE_MAP: Record<string, string> = {
  农场: 'farm',
  商店: 'warehouse',
  购买: 'warehouse',
  仓库: 'warehouse',
  好友: 'friend',
  任务: 'task',
  活跃: 'task',
  系统: 'system',
  错误: 'system',
  WS: 'system',
  心跳: 'system',
  推送: 'system'
}

export function resolveModuleTag(moduleName: string): string {
  return MODULE_TAG_MAP[String(moduleName || '').trim()] || '系统'
}

export function inferModuleFromTag(tag: string): string {
  return TAG_MODULE_MAP[String(tag || '').trim()] || 'system'
}
