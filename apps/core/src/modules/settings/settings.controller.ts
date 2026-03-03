import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'
import { StoreService } from '../../store/store.service'

@Controller('settings')
export class SettingsController {
  constructor(
    private manager: AccountManagerService,
    private store: StoreService
  ) {}

  @Get()
  getSettings(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    return {
      intervals: this.store.getIntervals(id),
      strategy: this.store.getPlantingStrategy(id),
      preferredSeed: this.store.getPreferredSeed(id),
      friendQuietHours: this.store.getFriendQuietHours(id),
      stealCropBlacklist: this.store.getStealCropBlacklist(id),
      automation: this.store.getAutomation(id),
      ui: this.store.getUI(),
      offlineReminder: this.store.getOfflineReminder()
    }
  }

  @Post('save')
  async saveSettings(@AccountId() accountId: string, @Body() body: any) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    const result = this.store.applyConfigSnapshot(body, id)
    this.manager.broadcastConfig(id)
    return result
  }

  @Post('theme')
  async saveTheme(@Body('theme') theme: string) {
    return this.store.setUITheme(theme)
  }

  @Post('offline-reminder')
  saveOfflineReminder(@Body() body: any) {
    return this.store.setOfflineReminder(body)
  }
}

@Controller('automation')
export class AutomationController {
  constructor(
    private manager: AccountManagerService,
    private store: StoreService
  ) {}

  @Post()
  async setAutomation(@AccountId() accountId: string, @Body() body: Record<string, any>) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    let lastData: any = null
    for (const [k, v] of Object.entries(body)) {
      lastData = this.store.setAutomation(k, v, id)
    }
    this.manager.broadcastConfig(id)
    return lastData || {}
  }
}
