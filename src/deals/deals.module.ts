import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Deal, DealSchema } from './schemas/deal.schema';

import { Contract, ContractSchema } from '../contracts/schemas/contract.schema';

import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

import { User, UserSchema } from '../users/schemas/user.schema';

import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';

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
    ]),
  ],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService, MongooseModule],
})
export class DealsModule {}
