import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import {
  Contract,
  ContractDocument,
  ContractStatus,
} from './schemas/contract.schema';

import { Bid, BidDocument, BidStatus } from '../bids/schemas/bid.schema';

import { Listing, ListingDocument } from '../listings/schemas/listing.schema';

import { CreateContractDto } from './dto/create-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,

    @InjectModel(Bid.name)
    private readonly bidModel: Model<BidDocument>,

    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,
  ) {}

  async createContract(
    listingId: string,
    sellerId: string,
    dto: CreateContractDto,
  ) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.seller_id.toString() !== sellerId) {
      throw new ForbiddenException();
    }

    const bid = await this.bidModel.findById(dto.bid_id);

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.status !== BidStatus.SELECTED) {
      throw new BadRequestException('Only selected bid can create contract');
    }

    const existing = await this.contractModel.findOne({
      bid_id: bid._id,
    });

    if (existing) {
      return existing;
    }

    return this.contractModel.create({
      property_id: listing._id,
      bid_id: bid._id,
      seller_id: listing.seller_id,
      buyer_id: bid.bidder_id,
      pdf_url: dto.pdf_url,
    });
  }

  async getContract(contractId: string) {
    const contract = await this.contractModel
      .findById(contractId)
      .populate('property_id')
      .populate('seller_id', 'full_name email')
      .populate('buyer_id', 'full_name email');

    if (!contract) {
      throw new NotFoundException();
    }

    return contract;
  }

  async signAsSeller(contractId: string, sellerId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException();
    }

    if (contract.seller_id.toString() !== sellerId) {
      throw new ForbiddenException();
    }

    contract.seller_signed_at = new Date();

    if (contract.seller_signed_at && contract.buyer_signed_at) {
      contract.status = ContractStatus.SIGNED;
    }

    await contract.save();

    return contract;
  }

  async signAsBuyer(contractId: string, buyerId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException();
    }

    if (contract.buyer_id.toString() !== buyerId) {
      throw new ForbiddenException();
    }

    contract.buyer_signed_at = new Date();

    if (contract.seller_signed_at && contract.buyer_signed_at) {
      contract.status = ContractStatus.SIGNED;
    }

    await contract.save();

    return contract;
  }

  async cancelContract(contractId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException();
    }

    contract.status = ContractStatus.CANCELLED;

    await contract.save();

    return contract;
  }
}
