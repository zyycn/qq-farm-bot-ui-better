import { Injectable } from '@nestjs/common'
import { GameClient } from './game-client'
import { ProtoService } from './proto.service'

@Injectable()
export class GameClientFactory {
  constructor(private readonly proto: ProtoService) {}

  create(accountId: string): GameClient {
    return new GameClient(accountId, this.proto)
  }
}
