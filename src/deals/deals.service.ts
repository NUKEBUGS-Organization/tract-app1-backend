import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bid, BidDocument } from '../bids/schemas/bid.schema';
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
import { ChatService } from '../chat/chat.service';
import { User, UserDocument, Role } from '../users/schemas/user.schema';
import { UploadMarketingProofDto } from './dto/upload-marketing-proof.dto';
import { UploadMarketLaunchProofDto } from './dto/upload-market-launch-proof.dto';
import { ChatRoom, ChatRoomDocument } from '../chat/schemas/chat-room.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

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

    @InjectModel(ChatRoom.name)
    private readonly chatRoomModel: Model<ChatRoomDocument>,

    @InjectModel(Bid.name)
    private readonly bidModel: Model<BidDocument>,

    private readonly chatService: ChatService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Helper method to get deal participants
  private async getDealParticipants(deal: DealDocument) {
    const [seller, buyer, listing] = await Promise.all([
      this.userModel.findById(deal.seller_id).lean(),
      this.userModel.findById(deal.buyer_id).lean(),
      this.listingModel.findById(deal.listing_id).lean(),
    ]);
    return { seller, buyer, listing };
  }

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

    // Notify: Marketing proof uploaded
    const { seller, listing } = await this.getDealParticipants(deal);
    if (seller && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_ACTIVE,
          title: 'Marketing proof uploaded',
          body: `The buyer has uploaded marketing proof for ${listing.address}. The deal is progressing.`,
          send_email: true,
        })
        .catch(() => null);
    }

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

    // Notify: Market launch proof uploaded
    const { seller, listing } = await this.getDealParticipants(deal);
    if (seller && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_ACTIVE,
          title: 'Market launch proof uploaded',
          body: `The realtor has uploaded market launch proof for ${listing.address}.`,
          send_email: true,
        })
        .catch(() => null);
    }

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

    // 🔔 Notify: Deal proceeding to closing
    const { seller, buyer, listing } = await this.getDealParticipants(deal);
    if (seller && buyer && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_PROCEEDING,
          title: 'Deal proceeding to closing',
          body: `Great news — the deal for ${listing.address} is proceeding to closing. Final steps are underway.`,
          send_email: true,
        })
        .catch(() => null);
    }

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

    // 🔔 Notify: Deal cancelled
    const { seller, buyer, listing } = await this.getDealParticipants(deal);
    if (seller && buyer && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_CANCELLED,
          title: 'Deal has been cancelled',
          body: `The deal for ${listing.address} has been cancelled. If you have backup offers, they may now be activated.`,
          send_email: true,
        })
        .catch(() => null);
    }

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

    // Lock associated chat room
    await this.chatRoomModel.findOneAndUpdate(
      {
        deal_id: deal._id,
      },
      {
        is_locked: true,
        is_active: false,
      },
    );

    // 🔔 Notify: Deal closed
    const {
      seller: sellerUser,
      buyer,
      listing,
    } = await this.getDealParticipants(deal);
    if (sellerUser && buyer && listing) {
      // Get final price from contract → bid
      let finalPrice = 0;

      const contract = await this.contractModel
        .findById(deal.contract_id)
        .lean();

      if (contract) {
        // Fetch the bid to get bid_price
        const bid = await this.bidModel.findById(contract.bid_id).lean();

        finalPrice = bid?.bid_price || 0;
      }

      this.notificationsService
        .notifyDealClosed({
          seller_id: sellerUser._id.toString(),
          seller_email: sellerUser.email,
          seller_name: sellerUser.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          final_price: finalPrice,
        })
        .catch(() => null);
    }

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

    // 🔔 Notify: Backup activated
    const { seller, buyer, listing } = await this.getDealParticipants(deal);
    if (seller && buyer && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_BACKUP_ACTIVATED,
          title: 'Backup offer activated',
          body: `A backup offer has been activated for ${listing.address}. The original deal has been replaced.`,
          send_email: true,
        })
        .catch(() => null);
    }

    return deal;
  }

  // Add this method if you need to move deal to under_review status
  async moveToUnderReview(dealId: string, userId: string) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Authorization check
    const user = await this.userModel.findById(userId);
    if (user?.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can move deal to review');
    }

    deal.status = DealStatus.UNDER_REVIEW;
    await deal.save();

    // 🔔 Notify: Deal under review
    const { seller, buyer, listing } = await this.getDealParticipants(deal);
    if (seller && buyer && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_UNDER_REVIEW,
          title: 'Deal is under review',
          body: `The deal for ${listing.address} is now under review. Both parties are evaluating the terms.`,
          send_email: true,
        })
        .catch(() => null);
    }

    return {
      message: 'Deal moved to review',
      deal,
    };
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
    let marketingDeadline: Date | undefined = undefined;
    let marketLaunchDeadline: Date | undefined = undefined;

    if (buyer?.role === Role.WHOLESALER) {
      marketingDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours
    }

    if (buyer?.role === Role.REALTOR) {
      marketLaunchDeadline = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    }

    const deal = await this.dealModel.create({
      contract_id: contract._id,
      listing_id: contract.property_id,
      seller_id: contract.seller_id,
      buyer_id: contract.buyer_id,
      marketing_deadline: marketingDeadline,
      market_launch_deadline: marketLaunchDeadline,
      chat_unlocked: true,
      status: DealStatus.ACTIVE,
    });

    await this.chatService.createRoomForDeal(deal._id.toString());

    // 🔔 Notify: New deal created
    const {
      seller,
      buyer: buyerUser,
      listing,
    } = await this.getDealParticipants(deal);
    if (seller && buyerUser && listing) {
      this.notificationsService
        .notifyDealMilestone({
          seller_id: seller._id.toString(),
          seller_email: seller.email,
          seller_name: seller.full_name,
          buyer_id: buyerUser._id.toString(),
          buyer_email: buyerUser.email,
          buyer_name: buyerUser.full_name,
          deal_id: deal._id.toString(),
          listing_id: deal.listing_id.toString(),
          address: listing.address,
          type: NotificationType.DEAL_ACTIVE,
          title: 'Deal is now active',
          body: `A new deal has been created for ${listing.address}. The contract has been executed and the deal is now active.`,
          send_email: true,
        })
        .catch(() => null);
    }

    return deal;
  }
}
