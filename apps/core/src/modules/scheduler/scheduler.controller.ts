import { Controller, Get } from '@nestjs/common'
import { AccountId } from '../../common/decorators/account-id.decorator'
import { AccountManagerService } from '../../game/account-manager.service'

@Controller('scheduler')
export class SchedulerController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  getScheduler(@AccountId() accountId: string) {
    const id = this.manager.resolveAccountId(accountId)
    const runner = this.manager.getRunner(id)
    if (!runner)
      return { running: false }
    return runner.getStatus()
  }
}
