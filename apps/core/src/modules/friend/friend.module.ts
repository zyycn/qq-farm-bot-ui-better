import { Module } from '@nestjs/common'
import { FriendBlacklistController, FriendController, FriendsController } from './friend.controller'

@Module({
  controllers: [FriendsController, FriendController, FriendBlacklistController]
})
export class FriendModule {}
