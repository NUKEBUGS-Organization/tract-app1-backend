import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectConnection, InjectModel } from '@nestjs/mongoose';

import { Connection, Model, Types } from 'mongoose';

import {
  Bid,
  BidDocument,
  BidStatus,
  PaymentSource,
} from './schemas/bid.schema';

import {
  Listing,
  ListingDocument,
  ListingStatus,
} from '../listings/schemas/listing.schema';

import { User, UserDocument, Role } from '../users/schemas/user.schema';

import { CreateBidDto } from './dto/create-bid.dto';

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BidsService {
  constructor(
    @InjectModel(Bid.name)
    private readonly bidModel: Model<BidDocument>,

    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectConnection()
    private readonly connection: Connection,

    private readonly notificationsService: NotificationsService,
  ) {}

  private buildRoleFields(role: Role, dto: CreateBidDto) {
    if (role === Role.REALTOR) {
      if (
        dto.commission_percentage === undefined ||
        dto.closing_timeline_days === undefined ||
        dto.agency_role === undefined ||
        dto.payment_source === undefined
      ) {
        throw new BadRequestException(
          'commission_percentage, closing_timeline_days, agency_role and payment_source are required for realtor bids',
        );
      }

      return {
        commission_percentage: dto.commission_percentage,
        closing_timeline_days: dto.closing_timeline_days,
        agency_role: dto.agency_role,
        payment_source: dto.payment_source,
      };
    }

    if (role === Role.WHOLESALER) {
      if (
        dto.inspection_period === undefined ||
        dto.due_diligence_period === undefined
      ) {
        throw new BadRequestException(
          'inspection_period and due_diligence_period are required for wholesaler bids',
        );
      }

      return {
        inspection_period: dto.inspection_period,
        due_diligence_period: dto.due_diligence_period,
        loi_url: dto.loi_url,
        proof_of_funds_url: dto.proof_of_funds_url,
      };
    }

    throw new BadRequestException('Role is not permitted to submit bids');
  }

  async createBid(listingId: string, bidderId: string, dto: CreateBidDto) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.LIVE) {
      throw new BadRequestException('Listing is not accepting bids');
    }

    if (listing.seller_id.toString() === bidderId) {
      throw new BadRequestException('Seller cannot bid on own listing');
    }

    const bidder = await this.userModel.findById(bidderId);

    if (!bidder) {
      throw new NotFoundException('User not found');
    }

    if (bidder.is_banned) {
      throw new ForbiddenException('Account is banned');
    }

    if (listing.bid_count >= 10) {
      throw new BadRequestException('Maximum bid limit reached');
    }

    const existingBid = await this.bidModel.findOne({
      property_id: listing._id,
      bidder_id: bidder._id,
      deleted_at: null,
    });

    if (existingBid) {
      throw new BadRequestException(
        'You have already submitted a bid for this listing',
      );
    }

    // TEMPORARY
    // Later replace with decrypt()
    if (listing.hidden_reserve) {
      const reserve = Number(listing.hidden_reserve);

      if (!Number.isNaN(reserve) && dto.bid_price < reserve) {
        throw new BadRequestException('Bid price is below reserve price');
      }
    }

    const roleFields = this.buildRoleFields(bidder.role, dto);

    let netToSeller = dto.bid_price;

    if (
      bidder.role === Role.REALTOR &&
      dto.payment_source === PaymentSource.SELLER_PAYS &&
      dto.commission_percentage
    ) {
      netToSeller =
        dto.bid_price - dto.bid_price * (dto.commission_percentage / 100);
    }

    const session = await this.connection.startSession();

    let createdBid: Bid;
    let newBidCount: number;

    try {
      session.startTransaction();

      const bid = await this.bidModel.create(
        [
          {
            property_id: listing._id,
            bidder_id: bidder._id,
            bid_price: dto.bid_price,
            ...roleFields,
            net_to_seller: netToSeller,
            submitted_at: new Date(),
          },
        ],
        { session },
      );

      listing.bid_count += 1;
      newBidCount = listing.bid_count;

      if (listing.bid_count >= 10) {
        listing.status = ListingStatus.PAUSED;
      }

      await listing.save({ session });

      await session.commitTransaction();

      createdBid = bid[0].toObject();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // ── Post-commit notifications (non-blocking) ──────────────────────────
    const seller = await this.userModel.findById(listing.seller_id).lean();
    if (seller) {
      if (newBidCount >= 10) {
        // Cap reached — send special notification instead of standard bid-received
        this.notificationsService
          .notifyBidCapReached({
            seller_id: seller._id.toString(),
            seller_email: seller.email,
            seller_name: seller.full_name,
            listing_id: listingId,
            address: listing.address,
          })
          .catch(() => null);
      } else {
        // Normal offer received
        this.notificationsService
          .notifyBidReceived({
            seller_id: seller._id.toString(),
            seller_email: seller.email,
            seller_name: seller.full_name,
            listing_id: listingId,
            address: listing.address,
            bid_id: (createdBid as any)._id.toString(),
            bid_price: dto.bid_price,
            bidder_name: bidder.full_name,
            bid_count: newBidCount,
          })
          .catch(() => null);
      }
    }

    return createdBid;
  }

  async getListingBids(listingId: string, sellerId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.seller_id.toString() !== sellerId) {
      throw new ForbiddenException('Access denied');
    }

    return this.bidModel
      .find({
        property_id: listing._id,
        deleted_at: null,
      })
      .populate({
        path: 'bidder_id',
        select:
          'full_name role reliability_score professional_score deal_count',
      })
      .sort({
        net_to_seller: -1,
      });
  }

  async getBidById(bidId: string) {
    const bid = await this.bidModel
      .findById(bidId)
      .populate(
        'bidder_id',
        'full_name email role reliability_score professional_score deal_count',
      )
      .populate('property_id');

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    return bid;
  }

  async selectBid(
    listingId: string,
    bidId: string,
    selection: 1 | 2 | 3,
    sellerId: string,
  ) {
    const session = await this.connection.startSession();

    let selectedBid: BidDocument | null = null;

    try {
      session.startTransaction();

      const listing = await this.listingModel.findById(listingId);

      if (!listing) {
        throw new NotFoundException('Listing not found');
      }

      if (listing.seller_id.toString() !== sellerId) {
        throw new ForbiddenException('Access denied');
      }

      const bid = await this.bidModel.findById(bidId);

      if (!bid) {
        throw new NotFoundException('Bid not found');
      }

      if (bid.property_id.toString() !== listingId) {
        throw new BadRequestException('Bid does not belong to listing');
      }

      if (selection === 1) {
        bid.status = BidStatus.SELECTED;
        await bid.save({ session });
        listing.status = ListingStatus.UNDER_CONTRACT;
        await listing.save({ session });
        selectedBid = bid;
      }

      if (selection === 2) {
        bid.status = BidStatus.BACKUP;
        bid.backup_position = 1;
        await bid.save({ session });
      }

      if (selection === 3) {
        bid.status = BidStatus.BACKUP;
        bid.backup_position = 2;
        await bid.save({ session });
      }

      await session.commitTransaction();

      // ── Post-commit: notify selected buyer ──────────────────────────────
      if (selection === 1 && selectedBid) {
        const [buyer, seller, listingDoc] = await Promise.all([
          this.userModel.findById(selectedBid.bidder_id).lean(),
          this.userModel.findById(listing.seller_id).lean(),
          this.listingModel.findById(listingId).lean(),
        ]);

        if (buyer && seller && listingDoc) {
          this.notificationsService
            .notifyBidSelected({
              buyer_id: buyer._id.toString(),
              buyer_email: buyer.email,
              buyer_name: buyer.full_name,
              seller_name: seller.full_name,
              listing_id: listingId,
              bid_id: bidId,
              address: listingDoc.address,
              bid_price: selectedBid.bid_price,
            })
            .catch(() => null);
        }
      }

      return {
        success: true,
        bid,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async rejectBid(listingId: string, bidId: string, sellerId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.seller_id.toString() !== sellerId) {
      throw new ForbiddenException();
    }

    const bid = await this.bidModel.findById(bidId);

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    bid.status = BidStatus.REJECTED;
    await bid.save();

    // ── Notify buyer their bid was rejected ─────────────────────────────
    const buyer = await this.userModel.findById(bid.bidder_id).lean();
    if (buyer) {
      this.notificationsService
        .notifyBidRejected({
          buyer_id: buyer._id.toString(),
          buyer_email: buyer.email,
          buyer_name: buyer.full_name,
          listing_id: listingId,
          bid_id: bidId,
          address: listing.address,
          bid_price: bid.bid_price,
        })
        .catch(() => null);
    }

    return bid;
  }

  async myBids(userId: string) {
    return this.bidModel
      .find({
        bidder_id: new Types.ObjectId(userId),
        deleted_at: null,
      })
      .populate({
        path: 'property_id',
        select: 'address state_code market_price status property_type',
      })
      .sort({
        createdAt: -1,
      });
  }

  async deleteBid(bidId: string, userId: string) {
    const bid = await this.bidModel.findById(bidId);

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.bidder_id.toString() !== userId) {
      throw new ForbiddenException();
    }

    bid.deleted_at = new Date();
    bid.status = BidStatus.DELETED;
    await bid.save();

    return {
      success: true,
    };
  }
}
