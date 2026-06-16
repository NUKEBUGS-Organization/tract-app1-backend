import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';
import { Role } from '../users/schemas/user.schema';
import { User, UserDocument, KycStatus } from '../users/schemas/user.schema';

import {
  Listing,
  ListingDocument,
  ListingStatus,
} from '../listings/schemas/listing.schema';

import { Bid, BidDocument } from '../bids/schemas/bid.schema';

import {
  Contract,
  ContractDocument,
} from '../contracts/schemas/contract.schema';

import { Deal, DealDocument, DealStatus } from '../deals/schemas/deal.schema';

import { ChatRoom, ChatRoomDocument } from '../chat/schemas/chat-room.schema';

import {
  ChatMessage,
  ChatMessageDocument,
} from '../chat/schemas/chat-message.schema';
import { PaginationDto } from './dto/pagination.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,

    @InjectModel(Bid.name)
    private readonly bidModel: Model<BidDocument>,

    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,

    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,

    @InjectModel(ChatRoom.name)
    private readonly roomModel: Model<ChatRoomDocument>,

    @InjectModel(ChatMessage.name)
    private readonly messageModel: Model<ChatMessageDocument>,
  ) {}

  // ================= DASHBOARD =================

  async dashboard() {
    const [users, listings, deals, contracts, pendingKyc, flaggedMessages] =
      await Promise.all([
        this.userModel.countDocuments(),
        this.listingModel.countDocuments(),
        this.dealModel.countDocuments(),
        this.contractModel.countDocuments(),
        this.userModel.countDocuments({
          kyc_status: KycStatus.PENDING,
        }),
        this.messageModel.countDocuments({
          flagged: true,
        }),
      ]);

    return {
      users,
      listings,
      deals,
      contracts,
      pendingKyc,
      flaggedMessages,
    };
  }

  async getUsers(role?: Role, pagination?: PaginationDto) {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
  
    const filter: any = {};
  
    if (role) {
      filter.role = role;
    }
  
    const [data, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select(
          '-password_hash -otp_code -otp_expires_at -otp_purpose -current_session_id -deleted_at',
        )
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
  
      this.userModel.countDocuments(filter),
    ]);
  
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUser(id: string) {
    const user = await this.userModel.findById(id).select('-password_hash');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async banUser(userId: string, reason: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.is_banned = true;
    user.ban_reason = reason;

    await user.save();

    return {
      message: 'User banned successfully',
    };
  }

  async unbanUser(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.is_banned = false;
    user.ban_reason = '';

    await user.save();

    return {
      message: 'User unbanned successfully',
    };
  }

  async pendingKyc() {
    return this.userModel.find({
      kyc_status: KycStatus.PENDING,
    });
  }

  async approveKyc(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.kyc_status = KycStatus.VERIFIED;

    await user.save();

    return {
      message: 'KYC approved successfully',
    };
  }

  async rejectKyc(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.kyc_status = KycStatus.REJECTED;

    await user.save();

    return {
      message: 'KYC rejected successfully',
    };
  }

  async pendingListings(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const filter = {
      status: ListingStatus.SUBMITTED,
    };

    const [data, total] = await Promise.all([
      this.listingModel
        .find(filter)
        .populate('seller_id', 'full_name email phone')
        .sort({
          createdAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      this.listingModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getListings(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.listingModel
        .find()
        .populate('seller_id', 'full_name email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({
          createdAt: -1,
        }),

      this.listingModel.countDocuments(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getListing(id: string) {
    const listing = await this.listingModel.findById(id);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing;
  }

  async approveListing(listingId: string, adminId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    listing.status = ListingStatus.LIVE;

    listing.live_at = new Date();

    listing.reviewed_by = adminId as any;

    listing.reviewed_at = new Date();

    listing.rejection_reason = '';

    await listing.save();

    return {
      message: 'Listing approved successfully',
    };
  }

  async rejectListing(listingId: string, reason: string, adminId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    listing.status = ListingStatus.REJECTED;

    listing.rejection_reason = reason;

    listing.reviewed_by = adminId as any;

    listing.reviewed_at = new Date();

    await listing.save();

    return {
      message: 'Listing rejected successfully',
    };
  }

  async deleteListing(listingId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    listing.deleted_at = new Date();

    await listing.save();

    return {
      message: 'Listing deleted successfully',
    };
  }

  async getBids(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.bidModel
        .find()
        .populate('bidder_id', 'full_name email')
        .populate('property_id')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({
          createdAt: -1,
        }),

      this.bidModel.countDocuments(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBid(id: string) {
    const bid = await this.bidModel
      .findById(id)
      .populate('bidder_id', 'full_name email');

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    return bid;
  }

  async getContracts(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.contractModel
        .find()
        .populate('property_id')
        .populate('seller_id', 'full_name')
        .populate('buyer_id', 'full_name')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({
          createdAt: -1,
        }),

      this.contractModel.countDocuments(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getContract(id: string) {
    const contract = await this.contractModel.findById(id);

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  async getDeals(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.dealModel
        .find()
        .populate('listing_id')
        .populate('seller_id', 'full_name')
        .populate('buyer_id', 'full_name')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({
          createdAt: -1,
        }),

      this.dealModel.countDocuments(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDeal(id: string) {
    const deal = await this.dealModel.findById(id);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return deal;
  }

  async closeDeal(id: string) {
    const deal = await this.dealModel.findById(id);

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    deal.status = DealStatus.CLOSED;

    await deal.save();

    return {
      message: 'Deal closed successfully',
    };
  }

  async flaggedMessages(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const filter = {
      flagged: true,
    };

    const [data, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .populate('sender_id', 'full_name email')
        .populate('room_id')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),

      this.messageModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async chatRooms(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const [data, total] = await Promise.all([
      this.roomModel
        .find()
        .populate('seller_id', 'full_name email')
        .populate('buyer_id', 'full_name email')
        .populate('deal_id')
        .sort({
          updatedAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      this.roomModel.countDocuments(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async roomMessages(roomId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 50;

    const filter = {
      room_id: new Types.ObjectId(roomId),
      deleted_at : null
    };

    const [data, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .populate('sender_id', 'full_name email')
        .sort({
          createdAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      this.messageModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
