import { Global, Module } from '@nestjs/common'
import { StoreService } from './store.service'

@Global()
@Module({
  providers: [StoreService],
  exports: [StoreService]
})
export class StoreModule {}
