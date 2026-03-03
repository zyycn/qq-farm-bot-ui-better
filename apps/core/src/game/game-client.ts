import type { ProtoService } from './proto.service'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { Logger } from '@nestjs/common'
import WebSocket from 'ws'
import { CLIENT_VERSION, GAME_SERVER_URL, HEARTBEAT_INTERVAL_MS } from './constants'
import { Scheduler } from './scheduler'
import { syncServerTime, toLong, toNum } from './utils'

export interface UserState {
  gid: number
  name: string
  level: number
  gold: number
  exp: number
  coupon: number
}

export interface WsErrorState {
  code: number
  at: number
  message: string
}

type MessageCallback = (err: Error | null, body?: Buffer, meta?: any) => void

export class GameClient extends EventEmitter {
  private readonly logger: Logger
  private ws: WebSocket | null = null
  private clientSeq = 1
  private serverSeq = 0
  private pendingCallbacks = new Map<number, MessageCallback>()
  private wsErrorState: WsErrorState = { code: 0, at: 0, message: '' }
  readonly scheduler: Scheduler
  readonly userState: UserState = { gid: 0, name: '', level: 0, gold: 0, exp: 0, coupon: 0 }

  private savedCode: string | null = null
  private platform = 'qq'
  private lastHeartbeatResponse = Date.now()
  private heartbeatMissCount = 0
  private _connected = false
  private _destroyed = false

  constructor(
    private readonly accountId: string,
    private readonly proto: ProtoService
  ) {
    super()
    this.logger = new Logger(`GameClient:${accountId}`)
    this.scheduler = new Scheduler(`gc-${accountId}`)
  }

  get connected(): boolean { return this._connected }
  get destroyed(): boolean { return this._destroyed }

  /** Proto 类型定义，供 Farm/Friend/Task 等 Worker 编解码协议使用 */
  get protoTypes() { return this.proto.types }

  getWsErrorState(): WsErrorState { return { ...this.wsErrorState } }

  // ========== Message encoding/sending ==========

  private encodeMsg(serviceName: string, methodName: string, bodyBytes: Buffer): Buffer {
    const t = this.proto.types
    const msg = t.GateMessage.create({
      meta: {
        service_name: serviceName,
        method_name: methodName,
        message_type: 1,
        client_seq: toLong(this.clientSeq),
        server_seq: toLong(this.serverSeq)
      },
      body: bodyBytes || Buffer.alloc(0)
    })
    const encoded = t.GateMessage.encode(msg).finish()
    this.clientSeq++
    return Buffer.from(encoded)
  }

  sendMsg(serviceName: string, methodName: string, bodyBytes: Buffer, callback?: MessageCallback): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return false
    const seq = this.clientSeq
    const encoded = this.encodeMsg(serviceName, methodName, bodyBytes)
    if (callback)
      this.pendingCallbacks.set(seq, callback)
    this.ws.send(encoded)
    return true
  }

  sendMsgAsync(serviceName: string, methodName: string, bodyBytes: Buffer, timeout = 10000): Promise<{ body: Buffer, meta: any }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`连接未打开: ${methodName}`))
        return
      }
      const seq = this.clientSeq
      const timeoutKey = `request_timeout_${seq}`
      this.scheduler.setTimeoutTask(timeoutKey, timeout, () => {
        this.pendingCallbacks.delete(seq)
        reject(new Error(`请求超时: ${methodName} (seq=${seq}, pending=${this.pendingCallbacks.size})`))
      })
      const sent = this.sendMsg(serviceName, methodName, bodyBytes, (err, body, meta) => {
        this.scheduler.clear(timeoutKey)
        if (err)
          reject(err)
        else resolve({ body: body!, meta })
      })
      if (!sent) {
        this.scheduler.clear(timeoutKey)
        reject(new Error(`发送失败: ${methodName}`))
      }
    })
  }

  // ========== Message handling ==========

  private handleMessage(data: Buffer) {
    try {
      const t = this.proto.types
      const msg: any = t.GateMessage.decode(data)
      const meta = msg.meta
      if (!meta)
        return

      if (meta.server_seq) {
        const seq = toNum(meta.server_seq)
        if (seq > this.serverSeq)
          this.serverSeq = seq
      }

      if (meta.message_type === 3) {
        this.handleNotify(msg)
        return
      }

      if (meta.message_type === 2) {
        const errorCode = toNum(meta.error_code)
        const clientSeqVal = toNum(meta.client_seq)
        const cb = this.pendingCallbacks.get(clientSeqVal)
        if (cb) {
          this.pendingCallbacks.delete(clientSeqVal)
          if (errorCode !== 0)
            cb(new Error(`${meta.service_name}.${meta.method_name} 错误: code=${errorCode} ${meta.error_message || ''}`))
          else
            cb(null, Buffer.from(msg.body), meta)
          return
        }
        if (errorCode !== 0)
          this.logger.warn(`${meta.service_name}.${meta.method_name} code=${errorCode} ${meta.error_message || ''}`)
      }
    } catch (err: any) {
      this.logger.warn(`消息解码失败: ${err?.message}`)
    }
  }

  private handleNotify(msg: any) {
    if (!msg.body || msg.body.length === 0)
      return
    try {
      const t = this.proto.types
      const event: any = t.EventMessage.decode(msg.body)
      const type = event.message_type || ''
      const eventBody = event.body

      if (type.includes('Kickout')) {
        try {
          const notify: any = t.KickoutNotify.decode(eventBody)
          const reason = notify.reason_message || '未知'
          this.logger.warn(`被踢下线: ${reason}`)
          this.emit('kickout', { type, reason })
        } catch { this.emit('kickout', { type, reason: '未知' }) }
        return
      }

      if (type.includes('LandsNotify')) {
        try {
          const notify: any = t.LandsNotify.decode(eventBody)
          const hostGid = toNum(notify.host_gid)
          const lands = notify.lands || []
          if (lands.length > 0 && (hostGid === this.userState.gid || hostGid === 0))
            this.emit('landsChanged', lands)
        } catch {}
        return
      }

      if (type.includes('ItemNotify')) {
        try {
          const notify: any = t.ItemNotify.decode(eventBody)
          const items = notify.items || []
          for (const itemChg of items) {
            const item = itemChg.item
            if (!item)
              continue
            const id = toNum(item.id)
            const count = toNum(item.count)
            const delta = toNum(itemChg.delta)

            if (id === 1101) {
              if (count > 0)
                this.userState.exp = count
              else if (delta !== 0)
                this.userState.exp = Math.max(0, (this.userState.exp || 0) + delta)
              this.emit('expChanged', this.userState.level, this.userState.exp)
            } else if (id === 1 || id === 1001) {
              if (count > 0)
                this.userState.gold = count
              else if (delta !== 0)
                this.userState.gold = Math.max(0, (this.userState.gold || 0) + delta)
              this.emit('goldChanged', this.userState.gold)
            } else if (id === 1002) {
              if (count > 0)
                this.userState.coupon = count
              else if (delta !== 0)
                this.userState.coupon = Math.max(0, (this.userState.coupon || 0) + delta)
            }
          }
        } catch {}
        return
      }

      if (type.includes('BasicNotify')) {
        try {
          const notify: any = t.BasicNotify.decode(eventBody)
          if (notify.basic) {
            const oldLevel = this.userState.level
            if (Object.prototype.hasOwnProperty.call(notify.basic, 'level')) {
              const next = toNum(notify.basic.level)
              if (Number.isFinite(next) && next > 0)
                this.userState.level = next
            }
            if (Object.prototype.hasOwnProperty.call(notify.basic, 'gold')) {
              const next = toNum(notify.basic.gold)
              if (Number.isFinite(next) && next >= 0) {
                this.userState.gold = next
                this.emit('goldChanged', this.userState.gold)
              }
            }
            if (Object.prototype.hasOwnProperty.call(notify.basic, 'exp')) {
              const exp = toNum(notify.basic.exp)
              if (Number.isFinite(exp) && exp >= 0) {
                this.userState.exp = exp
                this.emit('expChanged', this.userState.level, exp)
              }
            }
            if (this.userState.level !== oldLevel)
              this.emit('levelUp', oldLevel, this.userState.level)
          }
        } catch {}
        return
      }

      if (type.includes('FriendApplicationReceivedNotify')) {
        try {
          const notify: any = t.FriendApplicationReceivedNotify.decode(eventBody)
          if (notify.applications?.length)
            this.emit('friendApplicationReceived', notify.applications)
        } catch {}
        return
      }

      if (type.includes('FriendAddedNotify')) {
        try {
          const notify: any = t.FriendAddedNotify.decode(eventBody)
          if (notify.friends?.length) {
            const names = notify.friends.map((f: any) => f.name || f.remark || `GID:${toNum(f.gid)}`).join(', ')
            this.logger.log(`新好友: ${names}`)
          }
        } catch {}
        return
      }

      if (type.includes('GoodsUnlockNotify')) {
        try {
          const notify: any = t.GoodsUnlockNotify.decode(eventBody)
          if (notify.goods_list?.length)
            this.emit('goodsUnlockNotify', notify.goods_list)
        } catch {}
        return
      }

      if (type.includes('TaskInfoNotify')) {
        try {
          const notify: any = t.TaskInfoNotify.decode(eventBody)
          if (notify.task_info)
            this.emit('taskInfoNotify', notify.task_info)
        } catch {}
      }
    } catch (e: any) {
      this.logger.warn(`推送解码失败: ${e?.message}`)
    }
  }

  // ========== Login ==========

  private sendLogin(): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = this.proto.types
      const body = Buffer.from(t.LoginRequest.encode(t.LoginRequest.create({
        sharer_id: toLong(0),
        sharer_open_id: '',
        device_info: {
          client_version: CLIENT_VERSION,
          sys_software: 'iOS 26.2.1',
          network: 'wifi',
          memory: '7672',
          device_id: 'iPhone X<iPhone18,3>'
        },
        share_cfg_id: toLong(0),
        scene_id: '1256',
        report_data: {
          callback: '',
          cd_extend_info: '',
          click_id: '',
          clue_token: '',
          minigame_channel: 'other',
          minigame_platid: 2,
          req_id: '',
          trackid: ''
        }
      })).finish())

      this.sendMsg('gamepb.userpb.UserService', 'Login', body, (err, bodyBytes) => {
        if (err) {
          this.logger.warn(`登录失败: ${err.message}`)
          if (err.message.includes('code='))
            this.emit('loginFailed', err)
          reject(err)
          return
        }
        try {
          const reply: any = t.LoginReply.decode(bodyBytes!)
          if (reply.basic) {
            this.wsErrorState = { code: 0, at: 0, message: '' }
            this.userState.gid = toNum(reply.basic.gid)
            this.userState.name = reply.basic.name || '未知'
            this.userState.level = toNum(reply.basic.level)
            this.userState.gold = toNum(reply.basic.gold)
            this.userState.exp = toNum(reply.basic.exp)
            if (reply.time_now_millis)
              syncServerTime(toNum(reply.time_now_millis))
            this._connected = true
            this.logger.log(`登录成功: ${this.userState.name} (Lv${this.userState.level})`)
            this.startHeartbeat()
            this.emit('login', this.userState)
            resolve()
          } else {
            reject(new Error('登录响应无 basic 字段'))
          }
        } catch (e: any) {
          reject(new Error(`登录解码失败: ${e?.message}`))
        }
      })
    })
  }

  // ========== Heartbeat ==========

  private startHeartbeat() {
    this.scheduler.clear('heartbeat_interval')
    this.lastHeartbeatResponse = Date.now()
    this.heartbeatMissCount = 0
    const t = this.proto.types

    this.scheduler.setIntervalTask('heartbeat_interval', HEARTBEAT_INTERVAL_MS, () => {
      if (!this.userState.gid)
        return
      const timeSince = Date.now() - this.lastHeartbeatResponse
      if (timeSince > 60000) {
        this.heartbeatMissCount++
        this.logger.warn(`连接可能已断开 (${Math.round(timeSince / 1000)}s 无响应)`)
        if (this.heartbeatMissCount >= 2) {
          this.pendingCallbacks.forEach((cb) => {
            try {
              cb(new Error('连接超时，已清理'))
            } catch {}
          })
          this.pendingCallbacks.clear()
        }
      }

      const body = Buffer.from(t.HeartbeatRequest.encode(t.HeartbeatRequest.create({
        gid: toLong(this.userState.gid),
        client_version: CLIENT_VERSION
      })).finish())

      this.sendMsg('gamepb.userpb.UserService', 'Heartbeat', body, (err, replyBody) => {
        if (err || !replyBody)
          return
        this.lastHeartbeatResponse = Date.now()
        this.heartbeatMissCount = 0
        try {
          const reply: any = t.HeartbeatReply.decode(replyBody)
          if (reply.server_time)
            syncServerTime(toNum(reply.server_time))
        } catch {}
      })
    })
  }

  // ========== Connect ==========

  connect(code: string, platform = 'qq'): Promise<void> {
    if (this._destroyed)
      return Promise.reject(new Error('GameClient已销毁'))
    this.savedCode = code
    this.platform = platform
    const url = `${GAME_SERVER_URL}?platform=${platform}&os=iOS&ver=${CLIENT_VERSION}&code=${code}&openID=`

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090a13)',
          'Origin': 'https://gate-obt.nqf.qq.com'
        }
      })
      this.ws.binaryType = 'arraybuffer'

      this.ws.on('open', () => {
        this.sendLogin().then(resolve).catch(reject)
      })

      this.ws.on('message', (data: any) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        this.handleMessage(buf)
      })

      this.ws.on('close', (closeCode: number) => {
        this.logger.warn(`WS 连接关闭 (code=${closeCode})`)
        this._connected = false
        this.cleanup()
        this.emit('close', closeCode)
        if (!this._destroyed && this.savedCode) {
          this.scheduler.setTimeoutTask('auto_reconnect', 5000, () => {
            this.logger.log('尝试自动重连...')
            this.reconnect().catch(() => {})
          })
        }
      })

      this.ws.on('error', (err: any) => {
        const message = err?.message || ''
        this.logger.warn(`WS 错误: ${message}`)
        const match = message.match(/Unexpected server response:\s*(\d+)/i)
        if (match) {
          const errCode = Number.parseInt(match[1], 10) || 0
          if (errCode) {
            this.wsErrorState = { code: errCode, at: Date.now(), message }
            this.emit('ws_error', { code: errCode, message })
          }
        }
      })
    })
  }

  private cleanup() {
    this.scheduler.clearAll()
    this.pendingCallbacks.clear()
  }

  async reconnect(newCode?: string): Promise<void> {
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }
    this.userState.gid = 0
    this._connected = false
    this.clientSeq = 1
    this.serverSeq = 0
    await this.connect(newCode || this.savedCode!, this.platform)
  }

  isConnected(): boolean {
    return this._connected && !!this.ws && this.ws.readyState === 1
  }

  destroy() {
    this._destroyed = true
    this._connected = false
    this.cleanup()
    if (this.ws) {
      this.ws.removeAllListeners()
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }
    this.removeAllListeners()
  }
}
