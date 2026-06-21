import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Contract, ContractSchema } from './schemas/contract.schema';
import { Bid, BidSchema } from '../bids/schemas/bid.schema';
import { Listing, ListingSchema } from '../listings/schemas/listing.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { DealsModule } from '../deals/deals.module';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { DocuSealModule } from '../docuseal/docuseal.module';
import { DocuSealWebhookController } from '../webhooks/docuseal-webhook.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: Bid.name, schema: BidSchema },
      { name: Listing.name, schema: ListingSchema },
      { name: User.name, schema: UserSchema },
    ]),
    DealsModule,
    DocuSealModule,
  ],
  controllers: [ContractsController, DocuSealWebhookController],
  providers: [ContractsService, CloudinaryService],
  exports: [ContractsService],
})
export class ContractsModule {}
