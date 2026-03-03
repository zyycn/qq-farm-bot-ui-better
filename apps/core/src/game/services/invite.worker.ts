import type { GameClient } from '../game-client'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Logger } from '@nestjs/common'
import { resolveAssetsDir } from '../../config/paths'
import { sleep, toLong } from '../utils'

const INVITE_REQUEST_DELAY = 2000

interface ParsedInvite {
  uid: string | null
  openid: string | null
  shareSource: string | null
  docId: string | null
}

export class InviteWorker {
  private logger: Logger
  onLog: ((entry: { msg: string, tag?: string, meta?: Record<string, string>, isWarn?: boolean }) => void) | null = null

  constructor(
    private accountId: string,
    private client: GameClient,
    private platform: string
  ) {
    this.logger = new Logger(`Invite:${accountId}`)
  }

  private log(msg: string, event?: string) {
    this.logger.log(msg)
    this.onLog?.({ msg, tag: '信息', meta: { module: 'system', ...(event && { event }) }, isWarn: false })
  }

  private warn(msg: string, event?: string) {
    this.logger.warn(msg)
    this.onLog?.({ msg, tag: '警告', meta: { module: 'system', ...(event && { event }) }, isWarn: true })
  }

  private get t() { return this.client.protoTypes }

  private getShareFilePath(): string {
    return path.join(resolveAssetsDir(), 'share.txt')
  }

  private parseShareLink(link: string): ParsedInvite {
    const queryStr = link.startsWith('?') ? link.slice(1) : link
    const params = new URLSearchParams(queryStr)
    return { uid: params.get('uid'), openid: params.get('openid'), shareSource: params.get('share_source'), docId: params.get('doc_id') }
  }

  readShareFile(): ParsedInvite[] {
    try {
      const content = fs.readFileSync(this.getShareFilePath(), 'utf-8')
      const seenUids = new Set<string>()
      const invites: ParsedInvite[] = []
      for (const line of content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.includes('openid='))) {
        const parsed = this.parseShareLink(line)
        if (parsed.openid && parsed.uid && !seenUids.has(parsed.uid)) {
          seenUids.add(parsed.uid)
          invites.push(parsed)
        }
      }
      return invites
    } catch { return [] }
  }

  async sendReportArkClick(sharerId: string, sharerOpenId: string, shareSource: string | null) {
    const body = Buffer.from(this.t.ReportArkClickRequest.encode(this.t.ReportArkClickRequest.create({
      sharer_id: toLong(Number(sharerId)),
      sharer_open_id: sharerOpenId,
      share_cfg_id: toLong(Number(shareSource) || 0),
      scene_id: '1256'
    })).finish())
    const { body: rb } = await this.client.sendMsgAsync('gamepb.userpb.UserService', 'ReportArkClick', body)
    return this.t.ReportArkClickReply.decode(rb)
  }

  async processInviteCodes() {
    if (this.platform !== 'wx') {
      this.log('当前为 QQ 环境，跳过邀请码处理（仅微信支持）', 'invite_skip')
      return
    }
    const invites = this.readShareFile()
    if (!invites.length)
      return

    this.log(`读取到 ${invites.length} 个邀请码（已去重），开始逐个处理...`, 'invite_process')
    let successCount = 0
    let failCount = 0
    for (let i = 0; i < invites.length; i++) {
      const invite = invites[i]
      try {
        await this.sendReportArkClick(invite.uid!, invite.openid!, invite.shareSource)
        successCount++
        this.log(`[${i + 1}/${invites.length}] 已向 uid=${invite.uid} 发送好友申请`, 'invite_process')
      } catch (e: any) {
        failCount++
        this.warn(`[${i + 1}/${invites.length}] 向 uid=${invite.uid} 发送申请失败: ${e?.message}`, 'invite_process')
      }
      if (i < invites.length - 1)
        await sleep(INVITE_REQUEST_DELAY)
    }
    this.log(`处理完成: 成功 ${successCount}, 失败 ${failCount}`, 'invite_process')
    this.clearShareFile()
  }

  private clearShareFile() {
    try {
      fs.writeFileSync(this.getShareFilePath(), '', 'utf-8')
      this.log('已清空 share.txt', 'invite_process')
    } catch {}
  }
}
