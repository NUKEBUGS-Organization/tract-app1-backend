import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Deal, DealSchema } from './schemas/deal.schema';

import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';

import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatRoom, ChatRoomSchema } from 'src/chat/schemas/chat-room.schema';

import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { ChatModule } from '../chat/chat.module';

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
    ]),
    forwardRef(() => ChatModule)
  ],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService, MongooseModule],
})
export class DealsModule {}
