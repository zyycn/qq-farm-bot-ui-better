import { Module } from '@nestjs/common'
import { QrController } from './qr.controller'

@Module({
  controllers: [QrController]
})
export class QrModule {}
