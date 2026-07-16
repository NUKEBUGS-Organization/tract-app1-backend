import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Bid, BidSchema } from './schemas/bid.schema';

import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

import { User, UserSchema } from '../users/schemas/user.schema';

import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { VerificationsModule } from '../verifications/verifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Bid.name,
        schema: BidSchema,
      },
      {
        name: Listing.name,
        schema: ListingSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    NotificationsModule,
    VerificationsModule,
  ],
  controllers: [BidsController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
