import type { OnModuleInit } from '@nestjs/common'
import type {
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from '@nestjs/websockets'
import { AccountManagerService } from '../../game/account-manager.service'

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'x-account-id']
  }
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server

  constructor(
    private jwtService: JwtService,
    private manager: AccountManagerService
  ) {}

  onModuleInit() {
    this.manager.setRealtimeCallbacks({
      onStatusSync: (accountId, status) => {
        this.emitToAccount(accountId, 'status:update', { accountId, status })
      },
      onLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.server?.to(`account:${id}`)?.emit('log:new', entry)
        this.server?.to('account:all')?.emit('log:new', entry)
      },
      onAccountLog: (entry) => {
        const id = String(entry?.accountId || '').trim()
        if (id)
          this.server?.to(`account:${id}`)?.emit('account-log:new', entry)
        this.server?.to('account:all')?.emit('account-log:new', entry)
      }
    })
  }

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.replace('Bearer ', '')
        || ''

      if (!token) {
        socket.disconnect(true)
        return
      }

      this.jwtService.verify(token)
    } catch {
      socket.disconnect(true)
      return
    }

    const initialAccountRef = socket.handshake.auth?.accountId
      || socket.handshake.query?.accountId
      || ''
    this.applySubscription(socket, String(initialAccountRef))
    socket.emit('ready', { ok: true, ts: Date.now() })
  }

  handleDisconnect(_socket: Socket) {}

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: any
  ) {
    const body = payload && typeof payload === 'object' ? payload : {}
    this.applySubscription(socket, body.accountId || '')
  }

  private applySubscription(socket: Socket, accountRef: string) {
    const incoming = String(accountRef || '').trim()
    const resolved = incoming && incoming !== 'all'
      ? this.manager.resolveAccountId(incoming)
      : ''

    for (const room of socket.rooms) {
      if (room.startsWith('account:'))
        socket.leave(room)
    }

    if (resolved) {
      socket.join(`account:${resolved}`)
      ;(socket.data as any).accountId = resolved
    } else {
      socket.join('account:all')
      ;(socket.data as any).accountId = ''
    }

    socket.emit('subscribed', { accountId: (socket.data as any).accountId || 'all' })

    try {
      const targetId = (socket.data as any).accountId || ''
      if (targetId) {
        const currentStatus = this.manager.getStatus(targetId)
        socket.emit('status:update', { accountId: targetId, status: currentStatus })
      }

      const currentLogs = this.manager.getLogs(targetId, { limit: 100 })
      socket.emit('logs:snapshot', {
        accountId: targetId || 'all',
        logs: Array.isArray(currentLogs) ? currentLogs : []
      })

      const currentAccountLogs = this.manager.getAccountLogs(100)
      socket.emit('account-logs:snapshot', {
        logs: Array.isArray(currentAccountLogs) ? currentAccountLogs : []
      })
    } catch {}
  }

  private emitToAccount(accountId: string, event: string, data: any) {
    const id = String(accountId || '').trim()
    if (!id)
      return
    this.server?.to(`account:${id}`)?.emit(event, data)
    this.server?.to('account:all')?.emit(event, data)
  }
}
