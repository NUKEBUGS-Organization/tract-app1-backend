import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectConnection, InjectModel } from '@nestjs/mongoose';

import { Connection, Model, Types } from 'mongoose';

import { Bid, BidDocument, BidStatus } from './schemas/bid.schema';

import {
  Listing,
  ListingDocument,
  ListingStatus,
} from '../listings/schemas/listing.schema';

import { User, UserDocument, Role } from '../users/schemas/user.schema';

import { CreateBidDto } from './dto/create-bid.dto';

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
  ) {}

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

    let netToSeller = dto.bid_price;

    if (bidder.role === Role.REALTOR && listing.realtor_commission) {
      netToSeller =
        dto.bid_price - dto.bid_price * (listing.realtor_commission / 100);
    }

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      const bid = await this.bidModel.create(
        [
          {
            property_id: listing._id,
            bidder_id: bidder._id,
            bid_price: dto.bid_price,
            inspection_period: dto.inspection_period,
            due_diligence_period: dto.due_diligence_period,
            net_to_seller: netToSeller,
            submitted_at: new Date(),
          },
        ],
        { session },
      );

      listing.bid_count += 1;

      if (listing.bid_count >= 10) {
        listing.status = ListingStatus.PAUSED;
      }

      await listing.save({
        session,
      });

      await session.commitTransaction();

      return bid[0].toObject(); 
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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
        select: 'full_name role reliability_score professional_score',
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
        'full_name email role reliability_score professional_score',
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

        await bid.save({
          session,
        });

        listing.status = ListingStatus.UNDER_CONTRACT;

        await listing.save({
          session,
        });
      }

      if (selection === 2) {
        bid.status = BidStatus.BACKUP;

        bid.backup_position = 1;

        await bid.save({
          session,
        });
      }

      if (selection === 3) {
        bid.status = BidStatus.BACKUP;

        bid.backup_position = 2;

        await bid.save({
          session,
        });
      }

      await session.commitTransaction();

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
