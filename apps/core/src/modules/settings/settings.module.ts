import { Module } from '@nestjs/common'
import { AutomationController, SettingsController } from './settings.controller'

@Module({
  controllers: [SettingsController, AutomationController]
})
export class SettingsModule {}
