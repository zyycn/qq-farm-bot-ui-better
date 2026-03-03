import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'
import { GameConfigService } from '../../game/game-config.service'

@Controller('farm')
export class FarmController {
  constructor(private manager: AccountManagerService) {}

  @Post('operate')
  async operate(@AccountId() accountId: string, @Body('opType') opType: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).doFarmOp(opType)
  }
}

@Controller('lands')
export class LandsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getLands(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getLands()
  }
}

@Controller('seeds')
export class SeedsController {
  constructor(
    private manager: AccountManagerService,
    private gameConfig: GameConfigService,
  ) {}

  @Get()
  async getSeeds(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    const runner = this.manager.getRunner(id)
    if (runner)
      return runner.getSeeds()
    // 账号未运行时，返回静态种子配置，避免依赖在线状态
    return this.gameConfig.getAllSeeds()
  }
}

@Controller('bag')
export class BagController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getBag(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getBag()
  }
}

@Controller('daily-gifts')
export class DailyGiftsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getDailyGifts(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id) throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getDailyGiftOverview()
  }
}
