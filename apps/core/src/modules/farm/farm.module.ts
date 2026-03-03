import { Module } from '@nestjs/common'
import { BagController, DailyGiftsController, FarmController, LandsController, SeedsController } from './farm.controller'

@Module({
  controllers: [FarmController, LandsController, SeedsController, BagController, DailyGiftsController]
})
export class FarmModule {}
