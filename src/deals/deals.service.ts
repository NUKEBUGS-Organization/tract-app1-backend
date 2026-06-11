import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { Deal, DealDocument, DealStatus } from './schemas/deal.schema';

import {
  Contract,
  ContractDocument,
  ContractStatus,
} from '../contracts/schemas/contract.schema';

import {
  Listing,
  ListingDocument,
  ListingStatus,
} from '../listings/schemas/listing.schema';

import { User, UserDocument, Role } from '../users/schemas/user.schema';

import { UploadMarketingProofDto } from './dto/upload-marketing-proof.dto';
import { UploadMarketLaunchProofDto } from './dto/upload-market-launch-proof.dto';

@Injectable()
export class DealsService {
  constructor(
    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,

    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,

    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getDeal(dealId: string, userId: string) {
    const deal = await this.dealModel
      .findById(dealId)
      .populate('seller_id', 'full_name email')
      .populate('buyer_id', 'full_name email')
      .populate('listing_id')
      .populate('contract_id');

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (
      deal.seller_id['_id'].toString() !== userId &&
      deal.buyer_id['_id'].toString() !== userId
    ) {
      const user = await this.userModel.findById(userId);

      if (user?.role !== Role.ADMIN) {
        throw new ForbiddenException('Access denied');
      }
    }

    return deal;
  }

  async getMyDeals(userId: string) {
    return this.dealModel
      .find({
        $or: [
          {
            seller_id: new Types.ObjectId(userId),
          },
          {
            buyer_id: new Types.ObjectId(userId),
          },
        ],
      })
      .populate('listing_id', 'address market_price')
      .populate('contract_id')
      .sort({
        createdAt: -1,
      });
  }

  async uploadMarketingProof(
    dealId: string,
    userId: string,
    dto: UploadMarketingProofDto,
  ) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const buyer = await this.userModel.findById(deal.buyer_id);

    if (buyer?.role !== Role.WHOLESALER) {
      throw new BadRequestException(
        'Only wholesalers can upload marketing proof',
      );
    }

    if (deal.buyer_id.toString() !== userId) {
      throw new ForbiddenException();
    }

    deal.marketing_proof_url = dto.marketing_proof_url;

    await deal.save();

    return {
      message: 'Marketing proof uploaded successfully',
      deal,
    };
  }

  async uploadMarketLaunchProof(
    dealId: string,
    userId: string,
    dto: UploadMarketLaunchProofDto,
  ) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const buyer = await this.userModel.findById(deal.buyer_id);

    if (buyer?.role !== Role.REALTOR) {
      throw new BadRequestException(
        'Only realtors can upload market launch proof',
      );
    }

    if (deal.buyer_id.toString() !== userId) {
      throw new ForbiddenException();
    }

    deal.market_launch_proof_url = dto.market_launch_proof_url;

    await deal.save();

    return {
      message: 'Market launch proof uploaded successfully',
      deal,
    };
  }

  async proceedToClosing(dealId: string, userId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.buyer_id.toString() !== userId) {
      throw new ForbiddenException();
    }

    deal.proceed_to_closing_at = new Date();

    deal.status = DealStatus.PROCEEDING_TO_CLOSING;

    await deal.save();

    return {
      message: 'Deal moved to closing stage',
      deal,
    };
  }

  async cancelDeal(dealId: string, userId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const user = await this.userModel.findById(userId);

    const isSeller = deal.seller_id.toString() === userId;

    const isBuyer = deal.buyer_id.toString() === userId;

    const isAdmin = user?.role === Role.ADMIN;

    if (!isSeller && !isBuyer && !isAdmin) {
      throw new ForbiddenException();
    }

    deal.status = DealStatus.CANCELLED;

    await deal.save();

    return {
      message: 'Deal cancelled successfully',
      deal,
    };
  }

  async closeDeal(dealId: string, userId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const seller = deal.seller_id.toString() === userId;

    if (!seller) {
      throw new ForbiddenException('Only seller can close deal');
    }

    deal.status = DealStatus.CLOSED;

    deal.closed_at = new Date();

    await deal.save();

    await this.listingModel.findByIdAndUpdate(deal.listing_id, {
      status: ListingStatus.CLOSED,
    });

    return {
      message: 'Deal closed successfully',
      deal,
    };
  }

  async triggerKillSwitch(dealId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException();
    }

    deal.status = DealStatus.BACKUP_ACTIVATED;

    deal.kill_switch_triggered_at = new Date();

    await deal.save();

    return deal;
  }

  async createDealFromContract(contractId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    const existingDeal = await this.dealModel.findOne({
      contract_id: contract._id,
    });

    if (existingDeal) {
      return existingDeal;
    }

    const buyer = await this.userModel.findById(contract.buyer_id);

    const now = new Date();

    let marketingDeadline : Date;

    let marketLaunchDeadline : Date;

    if (buyer?.role === Role.WHOLESALER) {
      marketingDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
    }

    if (buyer?.role === Role.REALTOR) {
      marketLaunchDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    return this.dealModel.create({
      contract_id: contract._id,

      listing_id: contract.property_id,

      seller_id: contract.seller_id,

      buyer_id: contract.buyer_id,

      marketing_deadline: marketingDeadline,

      market_launch_deadline: marketLaunchDeadline,

      chat_unlocked: true,

      status: DealStatus.ACTIVE,
    });
  }
}
