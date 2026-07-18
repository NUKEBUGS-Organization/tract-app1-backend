import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bid, BidDocument, BidStatus } from '../bids/schemas/bid.schema';
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
import { ScoreService } from '../score/score.service';
import { ScoreEventType } from '../score/schemas/score-event.schema';
import { KillSwitchReason } from './dto/trigger-kill-switch.dto';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

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
    private readonly scoreService: ScoreService,
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

  // Every deal-ending transition (closed, cancelled, kill-switched to a
  // backup) must lock the chat room — sendMessage only checks
  // room.is_locked, so skipping this leaves messaging open indefinitely
  // even though the frontend shows the deal/chat as over.
  private async lockChatRoom(dealId: Types.ObjectId) {
    await this.chatRoomModel.findOneAndUpdate(
      { deal_id: dealId },
      { is_locked: true, is_active: false },
    );
  }

  // When a deal's bid falls through (cancelled, or kill-switched), the bid
  // itself must stop reading as SELECTED — otherwise the seller's
  // bid-comparison UI keeps hiding the "select as primary" action on every
  // other bid, since it keys off "is any bid currently selected". The
  // closest backup, if one exists, steps up to become the new primary so
  // the seller can create a contract with them without re-picking from
  // scratch; the listing reopens to LIVE either way since there's no
  // active contract left in progress at this point.
  private async demoteBidAndPromoteBackup(deal: DealDocument) {
    const contract = await this.contractModel.findById(deal.contract_id);
    if (!contract) return;

    const bid = await this.bidModel.findById(contract.bid_id);
    if (bid && bid.status === BidStatus.SELECTED) {
      bid.status = BidStatus.REJECTED;
      await bid.save();
    }

    const backup = await this.bidModel
      .findOne({
        property_id: deal.listing_id,
        status: BidStatus.BACKUP,
        deleted_at: null,
      })
      .sort({ backup_position: 1 });

    if (backup) {
      backup.status = BidStatus.SELECTED;
      backup.backup_position = null;
      await backup.save();
    }

    await this.listingModel.findByIdAndUpdate(deal.listing_id, {
      status: ListingStatus.LIVE,
    });
  }

  private static readonly TERMINAL_DEAL_STATUSES = [
    DealStatus.CANCELLED,
    DealStatus.CLOSED,
    DealStatus.BACKUP_ACTIVATED,
  ];

  // Guards proof uploads / proceed-to-closing against a deal that's already
  // over — without this, a cancelled/closed deal keeps accepting actions
  // that only make sense while it's actually in progress.
  private assertDealIsActionable(deal: DealDocument) {
    if (DealsService.TERMINAL_DEAL_STATUSES.includes(deal.status)) {
      throw new BadRequestException(
        `This deal is ${deal.status} and no longer accepts this action`,
      );
    }
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

    this.assertDealIsActionable(deal);

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

    this.assertDealIsActionable(deal);

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

    this.assertDealIsActionable(deal);

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

    if (DealsService.TERMINAL_DEAL_STATUSES.includes(deal.status)) {
      throw new ConflictException(`Deal is already ${deal.status}`);
    }

    // Wholesaler backs out of their own active deal before proceeding to
    // closing — treated as an inspection cancellation (§2, -20), applied
    // automatically since the buyer's own action is the trigger.
    if (
      isBuyer &&
      user?.role === Role.WHOLESALER &&
      deal.status === DealStatus.ACTIVE &&
      !deal.proceed_to_closing_at
    ) {
      try {
        await this.scoreService.applyPenalty(
          {
            user_id: userId,
            event_type: ScoreEventType.INSPECTION_CANCELLATION,
            deal_id: deal._id.toString(),
            note: 'Wholesaler cancelled the deal before proceeding to closing',
          },
          'system',
        );
      } catch (err) {
        this.logger.error(
          `Failed to apply inspection-cancellation penalty for deal ${dealId}: ${err.message}`,
          err.stack,
        );
      }
    }

    deal.status = DealStatus.CANCELLED;
    // Stop the Deal Tracker countdown — a cancelled deal has no live
    // deadline to count down to, regardless of what was pending.
    deal.marketing_deadline = null;
    deal.market_launch_deadline = null;
    deal.inspection_deadline = null;
    await deal.save();

    await this.lockChatRoom(deal._id);

    try {
      await this.demoteBidAndPromoteBackup(deal);
    } catch (err) {
      this.logger.error(
        `Failed to demote bid / promote backup for deal ${dealId}: ${err.message}`,
        err.stack,
      );
    }

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

    await this.lockChatRoom(deal._id);

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

  async triggerKillSwitch(
    dealId: string,
    reason: KillSwitchReason,
    triggeredBy: string,
    note?: string,
  ) {
    const deal = await this.dealModel.findById(dealId);

    if (!deal) {
      throw new NotFoundException();
    }

    deal.status = DealStatus.BACKUP_ACTIVATED;
    deal.kill_switch_triggered_at = new Date();
    await deal.save();

    await this.lockChatRoom(deal._id);

    try {
      await this.demoteBidAndPromoteBackup(deal);
    } catch (err) {
      this.logger.error(
        `Failed to demote bid / promote backup for deal ${dealId}: ${err.message}`,
        err.stack,
      );
    }

    // Apply the matching score penalty to the buyer partner — TRACT App 1
    // Score Rules §2/§5: missed marketing/market-launch proof or failure to
    // proceed to closing all result in the deal being pulled and a penalty.
    try {
      await this.scoreService.applyPenalty(
        {
          user_id: deal.buyer_id.toString(),
          event_type: reason,
          deal_id: deal._id.toString(),
          note,
        },
        triggeredBy,
      );
    } catch (err) {
      this.logger.error(
        `Failed to apply kill-switch score penalty for deal ${dealId}: ${err.message}`,
        err.stack,
      );
    }

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
    let inspectionDeadline: Date | undefined = undefined;

    if (buyer?.role === Role.WHOLESALER) {
      marketingDeadline = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72 hours

      const bid = await this.bidModel.findById(contract.bid_id).lean();
      if (bid) {
        inspectionDeadline = new Date(
          now.getTime() + bid.inspection_period * 24 * 60 * 60 * 1000,
        );
      }
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
      inspection_deadline: inspectionDeadline,
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
