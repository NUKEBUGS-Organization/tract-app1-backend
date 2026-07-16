import { Module } from '@nestjs/common';
import { PropertyDataService } from './property-data.service';
import { GooglePlacesService } from './google-places.service';
import { PropertyDataController } from './property-data.controller';

@Module({
  controllers: [PropertyDataController],
  providers: [PropertyDataService, GooglePlacesService],
  exports: [PropertyDataService],
})
export class PropertyDataModule {}
