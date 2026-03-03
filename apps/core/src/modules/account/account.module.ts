import { Module } from '@nestjs/common'
import { AccountController, AccountLogsController, AccountRemarkController } from './account.controller'
import { AccountService } from './account.service'

@Module({
  controllers: [AccountController, AccountRemarkController, AccountLogsController],
  providers: [AccountService],
  exports: [AccountService]
})
export class AccountModule {}
