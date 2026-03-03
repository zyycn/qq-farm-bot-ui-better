import { Injectable, Logger } from '@nestjs/common'
import { StoreService } from '../store/store.service'
import { PushWorker } from './services/push.worker'

@Injectable()
export class GamePushService {
  private readonly logger = new Logger(GamePushService.name)
  private readonly pushWorker = new PushWorker()

  constructor(private store: StoreService) {}

  /** 发送离线/下线提醒推送 */
  async triggerOfflineReminder(accountId: string, accountName: string, reason: string, offlineMs: number): Promise<void> {
    const config = this.store.getOfflineReminder()
    if (!config?.channel || !config?.token)
      return
    try {
      const title = config.title || '账号下线提醒'
      const content = `${config.msg || '账号下线'}\n账号: ${accountName}\n原因: ${reason}\n离线: ${Math.floor(offlineMs / 60000)} 分钟`
      await this.pushWorker.sendMessage({
        channel: config.channel,
        endpoint: config.endpoint,
        token: config.token,
        title,
        content
      })
    } catch (e: any) {
      this.logger.warn(`推送提醒失败: ${e?.message}`)
    }
  }
}
