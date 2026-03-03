import { Module } from '@nestjs/common'
import { SchedulerController } from './scheduler.controller'

@Module({
  controllers: [SchedulerController]
})
export class SchedulerModule {}
