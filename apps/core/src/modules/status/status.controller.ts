import { BadRequestException, Controller, Get } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'

@Controller('status')
export class StatusController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  getStatus(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    if (!id)
      throw new BadRequestException('缺少 x-account-id')
    return this.manager.getStatus(id)
  }
}
