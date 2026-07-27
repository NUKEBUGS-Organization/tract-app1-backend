import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { App2ListingsService } from './app2-listings.service';

@Module({
  imports: [ConfigModule],
  providers: [App2ListingsService],
  exports: [App2ListingsService],
})
export class App2ListingsModule {}
