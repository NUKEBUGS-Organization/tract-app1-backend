import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Contract,
  ContractDocument,
  ContractStatus,
} from './schemas/contract.schema';

import { Deal, DealDocument } from '../deals/schemas/deal.schema';
import { Bid, BidDocument, BidStatus } from '../bids/schemas/bid.schema';
import { Listing, ListingDocument } from '../listings/schemas/listing.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

import { CreateContractDto } from './dto/create-contract.dto';
import { DealsService } from 'src/deals/deals.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { generateContractPdf } from '../common/utils/pdf.generator';

@Injectable()
export class ContractsService {
  constructor(
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,

    @InjectModel(Deal.name)
    private readonly dealModel: Model<DealDocument>,

    @InjectModel(Bid.name)
    private readonly bidModel: Model<BidDocument>,

    @InjectModel(Listing.name)
    private readonly listingModel: Model<ListingDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly dealsService: DealsService,
    private readonly cloudinaryService: CloudinaryService,
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

    // Fetch seller and buyer details for the PDF
    const [seller, buyer] = await Promise.all([
      this.userModel.findById(listing.seller_id),
      this.userModel.findById(bid.bidder_id),
    ]);

    if (!seller || !buyer) {
      throw new NotFoundException('Seller or Buyer not found');
    }

    // Generate the contract PDF using the agreed-upon terms
    const pdfBuffer = await generateContractPdf({
      sellerName: seller.full_name,
      sellerAddress: `${listing.address}, ${listing.state_code} ${listing.zip_code}`,
      buyerName: `${buyer.full_name} and/or Assigns`,
      buyerAddress: dto.buyer_address ?? 'On File',
      propertyAddress: listing.address,
      propertyBlock: dto.property_block,
      propertyLot: dto.property_lot,
      purchasePrice: bid.bid_price,
      emdAmount: dto.emd_amount ?? Math.min(1000, bid.bid_price),
      balanceAmount:
        bid.bid_price - (dto.emd_amount ?? Math.min(1000, bid.bid_price)),
      closingDays: dto.closing_days ?? 120,
      effectiveDate: new Date(),
    });

    // Upload generated PDF to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadFile(
      pdfBuffer,
      `contracts/${listing._id}`,
      `contract_${bid._id}.pdf`,
      'application/pdf',
    );

    return this.contractModel.create({
      property_id: listing._id,
      bid_id: bid._id,
      seller_id: listing.seller_id,
      buyer_id: bid.bidder_id,
      pdf_url: uploadResult.secure_url,
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

    if (contract.status === ContractStatus.SIGNED) {
      await this.dealsService.createDealFromContract(contract._id.toString());
    }

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

  async getContractsByListing(listingId: string, userId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.seller_id.toString() !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return this.contractModel
      .find({
        property_id: listing._id,
      })
      .populate('buyer_id', 'full_name email phone')
      .populate('seller_id', 'full_name email phone')
      .populate({
        path: 'bid_id',
        select: 'bid_price inspection_period due_diligence_period status',
      })
      .sort({
        createdAt: -1,
      });
  }
}
