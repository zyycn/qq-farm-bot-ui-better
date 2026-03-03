import { Logger } from '@nestjs/common'

function assertRequiredText(name: string, value: any): string {
  const text = String(value || '').trim()
  if (!text)
    throw new Error(`${name} 不能为空`)
  return text
}

export interface PushPayload {
  channel: string
  endpoint?: string
  token?: string
  title: string
  content: string
}

export interface PushResult {
  ok: boolean
  code: string
  msg: string
  raw: any
}

export class PushWorker {
  private logger = new Logger('Push')

  async sendMessage(payload: PushPayload): Promise<PushResult> {
    const channel = assertRequiredText('channel', payload.channel)
    const endpoint = String(payload.endpoint || '').trim()
    const rawToken = String(payload.token || '').trim()
    const token = channel === 'webhook' ? rawToken : assertRequiredText('token', rawToken)
    const title = assertRequiredText('title', payload.title)
    const content = assertRequiredText('content', payload.content)

    let pushoo: any
    try {
      pushoo = (await import('pushoo')).default
    } catch {
      return { ok: false, code: 'module_not_found', msg: 'pushoo 模块未安装', raw: null }
    }

    const options: any = {}
    if (channel === 'webhook') {
      const url = assertRequiredText('endpoint', endpoint)
      options.webhook = { url, method: 'POST' }
    }

    const request: any = { title, content }
    if (token)
      request.token = token
    if (channel === 'webhook')
      request.options = options

    const result = await pushoo(channel, request)
    const raw = result && typeof result === 'object' ? result : { data: result }
    const hasError = !!(raw?.error)
    const code = String(raw.code || raw.errcode || (hasError ? 'error' : 'ok'))
    const message = String(raw.msg || raw.message || (hasError ? (raw.error?.message || 'push failed') : 'ok'))
    const ok = !hasError && (code === 'ok' || code === '0' || code === '' || String(raw.status || '').toLowerCase() === 'success')

    return { ok, code, msg: message, raw }
  }
}
