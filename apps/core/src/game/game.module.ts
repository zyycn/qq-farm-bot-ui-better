import { Global, Module } from '@nestjs/common'
import { AccountManagerService } from './account-manager.service'
import { GameClientFactory } from './game-client.factory'
import { GameConfigService } from './game-config.service'
import { GameLogService } from './game-log.service'
import { GamePushService } from './game-push.service'
import { ProtoService } from './proto.service'
import { QRLoginService } from './services/qrlogin.worker'

@Global()
@Module({
  providers: [ProtoService, GameConfigService, GameClientFactory, GameLogService, GamePushService, AccountManagerService, QRLoginService],
  exports: [GameConfigService, AccountManagerService, QRLoginService]
})
export class GameModule {}
