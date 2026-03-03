import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'
import { StoreService } from '../../store/store.service'

@Controller('friends')
export class FriendsController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  async getFriends(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getFriends()
  }
}

@Controller('friend')
export class FriendController {
  constructor(private manager: AccountManagerService) {}

  @Get(':gid/lands')
  async getFriendLands(@AccountId() accountId: string, @Param('gid') gid: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).getFriendLands(Number(gid))
  }

  @Post(':gid/op')
  async doFriendOp(
    @AccountId() accountId: string,
    @Param('gid') gid: string,
    @Body('opType') opType: string
  ) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    return this.manager.getRunnerOrThrow(id).doFriendOp(Number(gid), opType)
  }
}

@Controller('friend-blacklist')
export class FriendBlacklistController {
  constructor(
    private manager: AccountManagerService,
    private store: StoreService
  ) {}

  @Get()
  getBlacklist(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    return this.store.getFriendBlacklist(id)
  }

  @Post('toggle')
  toggleBlacklist(@AccountId() accountId: string, @Body('gid') gid: number) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    if (!gid)
      throw new BadRequestException('缺少 gid')

    const current = this.store.getFriendBlacklist(id)
    const next = current.includes(gid) ? current.filter(g => g !== gid) : [...current, gid]
    const saved = this.store.setFriendBlacklist(id, next)
    this.manager.broadcastConfig(id)
    return saved
  }
}
