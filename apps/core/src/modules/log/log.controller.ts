import { Controller, Get, Headers, Query } from '@nestjs/common'
import { AccountManagerService } from '../../game/account-manager.service'

@Controller('logs')
export class LogController {
  constructor(private manager: AccountManagerService) {}

  @Get()
  getLogs(
    @Query('accountId') queryAccountId: string,
    @Query('limit') limit: string,
    @Query('keyword') keyword: string,
    @Query('module') module: string,
    @Query('event') event: string,
    @Query('isWarn') isWarn: string,
    @Headers('x-account-id') headerAccountId: string
  ) {
    const rawAccountId = (queryAccountId || '').trim()
    let id: string
    if (!rawAccountId) {
      id = this.manager.resolveAccountId(headerAccountId || '')
    } else if (rawAccountId === 'all') {
      id = ''
    } else {
      id = this.manager.resolveAccountId(rawAccountId)
    }

    let isWarnFilter: boolean | undefined
    if (isWarn === 'true' || isWarn === 'warn')
      isWarnFilter = true
    else if (isWarn === 'false' || isWarn === 'info')
      isWarnFilter = false

    return this.manager.getLogs(id, {
      limit: Math.max(1, Number(limit) || 100),
      keyword: (keyword || '').trim(),
      module: (module || '').trim() || undefined,
      event: (event || '').trim() || undefined,
      isWarn: isWarnFilter
    })
  }
}
