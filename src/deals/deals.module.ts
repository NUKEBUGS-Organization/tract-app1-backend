import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Deal, DealSchema } from './schemas/deal.schema';
import { Bid, BidSchema } from '../bids/schemas/bid.schema';

import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';

import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatRoom, ChatRoomSchema } from 'src/chat/schemas/chat-room.schema';

import { DealsService } from './deals.service';
import { DealsAutomationService } from './deals-automation.service';
import { DealsController } from './deals.controller';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ScoreModule } from '../score/score.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Deal.name,
        schema: DealSchema,
      },
      {
        name: Contract.name,
        schema: ContractSchema,
      },
      {
        name: Listing.name,
        schema: ListingSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
      { name: ChatRoom.name, schema: ChatRoomSchema },
      { name: Bid.name, schema: BidSchema },
    ]),
    NotificationsModule,
    ScoreModule,
    forwardRef(() => ChatModule),
  ],
  controllers: [DealsController],
  providers: [DealsService, DealsAutomationService],
  exports: [DealsService, MongooseModule],
})
export class DealsModule {}
