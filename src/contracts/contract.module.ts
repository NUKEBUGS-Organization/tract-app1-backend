import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Contract, ContractSchema } from './schemas/contract.schema';

import { Bid, BidSchema } from '../bids/schemas/bid.schema';

import { Listing, ListingSchema } from '../listings/schemas/listing.schema';

import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { DealsModule } from '../deals/deals.module'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Contract.name,
        schema: ContractSchema,
      },
      {
        name: Bid.name,
        schema: BidSchema,
      },
      {
        name: Listing.name,
        schema: ListingSchema,
      },
    ]),
    DealsModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
