import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { Listing, ListingSchema } from './schemas/listing.schema';
import { Bid, BidSchema } from '../bids/schemas/bid.schema';
import {
  DocumentVault,
  DocumentSchema,
} from '../documents/schemas/document.schema';
import { CloudinaryService } from '../common/services/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Listing.name, schema: ListingSchema },
      { name: Bid.name, schema: BidSchema },
      { name: DocumentVault.name, schema: DocumentSchema },
    ]),
    MulterModule.register({ storage: memoryStorage() }), // store in memory, upload to Cloudinary
  ],
  controllers: [ListingsController],
  providers: [ListingsService, CloudinaryService],
  exports: [ListingsService, MongooseModule],
})
export class ListingsModule {}
