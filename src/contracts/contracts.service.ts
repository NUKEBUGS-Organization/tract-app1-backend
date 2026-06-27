import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

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
import { DocuSealService } from '../docuseal/docuseal.service';
import { PaginationDto } from 'src/admin/dto/pagination.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

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
    private readonly docuSealService: DocuSealService,
    private readonly notificationsService: NotificationsService,
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

    const existing = await this.contractModel.findOne({ bid_id: bid._id });
    if (existing) {
      return existing;
    }

    const [seller, buyer] = await Promise.all([
      this.userModel.findById(listing.seller_id),
      this.userModel.findById(bid.bidder_id),
    ]);

    if (!seller || !buyer) {
      throw new NotFoundException('Seller or Buyer not found');
    }

    // Generate draft PDF and upload to Cloudinary
    const emdAmount = dto.emd_amount ?? Math.min(1000, bid.bid_price);

    const pdfBuffer = await generateContractPdf({
      sellerName: seller.full_name,
      sellerAddress: `${listing.address}, ${listing.state_code} ${listing.zip_code}`,
      buyerName: `${buyer.full_name} and/or Assigns`,
      buyerAddress: dto.buyer_address ?? 'On File',
      propertyAddress: listing.address,
      propertyBlock: dto.property_block,
      propertyLot: dto.property_lot,
      purchasePrice: bid.bid_price,
      emdAmount,
      balanceAmount: bid.bid_price - emdAmount,
      closingDays: dto.closing_days ?? 120,
      effectiveDate: new Date(),
    });

    const uploadResult = await this.cloudinaryService.uploadFile(
      pdfBuffer,
      `contracts/${listing._id}`,
      `contract_${bid._id}.pdf`,
      'application/pdf',
    );

    // Create local contract record first so we have an _id for external_id
    const contract = await this.contractModel.create({
      property_id: listing._id,
      bid_id: bid._id,
      seller_id: listing.seller_id,
      buyer_id: bid.bidder_id,
      pdf_url: uploadResult.secure_url,
    });

    // Create DocuSeal submission
    try {
      const submission = await this.docuSealService.createSubmission([
        {
          role: 'Seller',
          email: seller.email,
          name: seller.full_name,
          external_id: `${contract._id}:seller`,
          values: {
            SellerName: seller.full_name,
            PropertyAddress: `${listing.address}, ${listing.state_code} ${listing.zip_code}`,
            PurchasePrice: bid.bid_price,
            EMDAmount: emdAmount,
            ClosingDays: dto.closing_days ?? 120,
          },
        },
        {
          role: 'Buyer',
          email: buyer.email,
          name: buyer.full_name,
          external_id: `${contract._id}:buyer`,
          values: {
            BuyerName: `${buyer.full_name} and/or Assigns`,
            PropertyAddress: `${listing.address}, ${listing.state_code} ${listing.zip_code}`,
            PurchasePrice: bid.bid_price,
            EMDAmount: emdAmount,
            ClosingDays: dto.closing_days ?? 120,
          },
        },
      ]);

      const sellerSubmitter = submission.submitters.find(
        (s) => s.role === 'Seller',
      );
      const buyerSubmitter = submission.submitters.find(
        (s) => s.role === 'Buyer',
      );

      contract.docuseal_submission_id = String(submission.id);
      if (sellerSubmitter) {
        contract.docuseal_seller_submitter_id = String(sellerSubmitter.id);
        contract.docuseal_seller_embed_src = sellerSubmitter.embed_src;
        contract.docuseal_seller_status = sellerSubmitter.status ?? 'pending';
      }
      if (buyerSubmitter) {
        contract.docuseal_buyer_submitter_id = String(buyerSubmitter.id);
        contract.docuseal_buyer_embed_src = buyerSubmitter.embed_src;
        contract.docuseal_buyer_status = buyerSubmitter.status ?? 'pending';
      }

      await contract.save();

      this.logger.log(
        `DocuSeal submission ${submission.id} linked to contract ${contract._id}`,
      );

      if (seller && buyer && listing) {
        this.notificationsService
          .notifyContractReady({
            seller_id: seller._id.toString(),
            seller_email: seller.email,
            seller_name: seller.full_name,
            buyer_id: buyer._id.toString(),
            buyer_email: buyer.email,
            buyer_name: buyer.full_name,
            contract_id: contract._id.toString(),
            listing_id: contract.property_id.toString(),
            address: listing.address,
          })
          .catch(() => null);
      }
    } catch (err) {
      // DocuSeal failure should not block contract creation — log and continue.
      // The sign-url endpoint will surface a clear error if signing is attempted
      // before the submission is created.
      this.logger.error(
        `Failed to create DocuSeal submission for contract ${contract._id}: ${err?.message}`,
        err?.stack,
      );
    }

    return contract;
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

  async myContracts(userId: string, pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;

    const filter = {
      $or: [
        {
          seller_id: new Types.ObjectId(userId),
        },
        {
          buyer_id: new Types.ObjectId(userId),
        },
      ],
    };

    const [data, total] = await Promise.all([
      this.contractModel
        .find(filter)
        .populate('property_id', 'address market_price')
        .populate('seller_id', 'full_name email')
        .populate('buyer_id', 'full_name email')
        .sort({
          createdAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit),

      this.contractModel.countDocuments(filter),
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

  /**
   * Returns the signer-specific DocuSeal embed URL for the requesting user.
   * Seller gets the seller signing URL; Buyer gets the buyer signing URL.
   */
  async getSignUrl(
    contractId: string,
    userId: string,
  ): Promise<{ embed_src: string }> {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    if (!contract.docuseal_submission_id) {
      throw new BadRequestException(
        'DocuSeal submission has not been created for this contract yet',
      );
    }

    const isSeller = contract.seller_id.toString() === userId;
    const isBuyer = contract.buyer_id.toString() === userId;

    if (!isSeller && !isBuyer) {
      throw new ForbiddenException('You are not a party to this contract');
    }

    if (contract.status === ContractStatus.CANCELLED) {
      throw new BadRequestException('This contract has been cancelled');
    }

    if (contract.status === ContractStatus.SIGNED) {
      throw new BadRequestException('This contract has already been signed');
    }

    const embedSrc = isSeller
      ? contract.docuseal_seller_embed_src
      : contract.docuseal_buyer_embed_src;

    if (!embedSrc) {
      throw new BadRequestException(
        'Signing URL not available yet. Please try again shortly.',
      );
    }

    return { embed_src: embedSrc };
  }

  /**
   * Returns the signed PDF URL. Only accessible by seller or buyer.
   */
  async getSignedPdf(
    contractId: string,
    userId: string,
  ): Promise<{ signed_pdf_url: string }> {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    const isSeller = contract.seller_id.toString() === userId;
    const isBuyer = contract.buyer_id.toString() === userId;

    if (!isSeller && !isBuyer) {
      throw new ForbiddenException('You are not a party to this contract');
    }

    if (contract.status !== ContractStatus.SIGNED || !contract.signed_pdf_url) {
      throw new BadRequestException(
        'Signed PDF is not available yet. Both parties must complete signing.',
      );
    }

    return { signed_pdf_url: contract.signed_pdf_url };
  }

  /**
   * Called by the DocuSeal webhook when a submitter completes signing.
   * Validates the secret, updates timestamps, and creates the deal when both
   * parties have signed.
   */
  async handleDocuSealWebhook(
    secret: string,
    event: any,
  ): Promise<{ ok: boolean }> {
    if (secret !== this.docuSealService.webhookSecret) {
      throw new ForbiddenException('Invalid webhook secret');
    }

    const eventType = event?.event_type;
    const data = event?.data || {};

    this.logger.log(
      `DocuSeal webhook processing: event_type=${eventType}, data=${JSON.stringify(data)}`,
    );

    const allowedEvents = ['submitter_completed', 'form.completed'];

    if (!allowedEvents.includes(eventType)) {
      this.logger.log(`Ignoring DocuSeal event: ${eventType}`);
      return { ok: true };
    }

    const externalId =
      data?.external_id ||
      data?.submitter?.external_id ||
      data?.form?.external_id ||
      '';

    const submissionId =
      data?.submission_id ||
      data?.submission?.id ||
      data?.submission?.submission_id ||
      '';

    const submitterId =
      data?.id || data?.submitter_id || data?.submitter?.id || '';

    let contractId = '';
    let role = '';

    if (externalId && externalId.includes(':')) {
      const parts = externalId.split(':');
      contractId = parts[0];
      role = parts[1];
    }

    let contract: ContractDocument | null = null;

    if (contractId) {
      contract = await this.contractModel.findById(contractId);
    }

    if (!contract && submissionId) {
      contract = await this.contractModel.findOne({
        docuseal_submission_id: String(submissionId),
      });
    }

    if (!contract && submitterId) {
      contract = await this.contractModel.findOne({
        $or: [
          { docuseal_seller_submitter_id: String(submitterId) },
          { docuseal_buyer_submitter_id: String(submitterId) },
        ],
      });
    }

    if (!contract) {
      this.logger.warn(
        `DocuSeal webhook: contract not found. external_id=${externalId}, submission_id=${submissionId}, submitter_id=${submitterId}`,
      );

      return { ok: true };
    }

    if (!role && submitterId) {
      if (
        String(contract.docuseal_seller_submitter_id) === String(submitterId)
      ) {
        role = 'seller';
      }

      if (
        String(contract.docuseal_buyer_submitter_id) === String(submitterId)
      ) {
        role = 'buyer';
      }
    }

    if (!role && data?.role) {
      role = String(data.role).toLowerCase();
    }

    if (role === 'seller' || role === 'Seller') {
      contract.seller_signed_at = contract.seller_signed_at ?? new Date();
      contract.docuseal_seller_status = 'completed';

      this.logger.log(`Seller signed contract ${contract._id}`);
    } else if (role === 'buyer' || role === 'Buyer') {
      contract.buyer_signed_at = contract.buyer_signed_at ?? new Date();
      contract.docuseal_buyer_status = 'completed';

      this.logger.log(`Buyer signed contract ${contract._id}`);
    } else {
      this.logger.warn(
        `DocuSeal webhook: could not identify signer role. contract=${contract._id}, external_id=${externalId}, submitter_id=${submitterId}, role=${role}`,
      );

      return { ok: true };
    }

    if (contract.seller_signed_at && contract.buyer_signed_at) {
      contract.status = ContractStatus.SIGNED;

      const signedUrl =
        data?.submission?.documents?.[0]?.url ??
        data?.documents?.[0]?.url ??
        contract.signed_pdf_url;

      if (signedUrl) {
        contract.signed_pdf_url = signedUrl;
        contract.pdf_url = signedUrl;
      }

      const auditUrl =
        data?.submission?.audit_log_url ??
        data?.audit_log_url ??
        contract.audit_log_url;

      if (auditUrl) {
        contract.audit_log_url = auditUrl;
      }

      await contract.save();

      this.logger.log(`Contract ${contract._id} fully signed — creating deal`);

      await this.dealsService.createDealFromContract(contract._id.toString());

      const [seller, buyer, listing] = await Promise.all([
        this.userModel.findById(contract.seller_id).lean(),
        this.userModel.findById(contract.buyer_id).lean(),
        this.listingModel.findById(contract.property_id).lean(),
      ]);

      if (seller && buyer && listing) {
        this.notificationsService
          .notifyContractExecuted({
            seller_id: seller._id.toString(),
            seller_email: seller.email,
            seller_name: seller.full_name,
            buyer_id: buyer._id.toString(),
            buyer_email: buyer.email,
            buyer_name: buyer.full_name,
            contract_id: contractId,
            listing_id: contract.property_id.toString(),
            address: listing.address,
          })
          .catch(() => null);
      }
    } else {
      await contract.save();
    }

    return { ok: true };
  }

  // ── Legacy / admin endpoints (kept for local testing; not used by production frontend) ──

  async signAsSeller(contractId: string, sellerId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) throw new NotFoundException();
    if (contract.seller_id.toString() !== sellerId)
      throw new ForbiddenException();

    contract.seller_signed_at = new Date();

    if (contract.seller_signed_at && contract.buyer_signed_at) {
      contract.status = ContractStatus.SIGNED;
    }

    await contract.save();
    return contract;
  }

  async signAsBuyer(contractId: string, buyerId: string) {
    const contract = await this.contractModel.findById(contractId);

    if (!contract) throw new NotFoundException();
    if (contract.buyer_id.toString() !== buyerId)
      throw new ForbiddenException();

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

    if (!contract) throw new NotFoundException();

    contract.status = ContractStatus.CANCELLED;

    await contract.save();
    return contract;
  }

  async getContractsByListing(listingId: string, userId: string) {
    const listing = await this.listingModel.findById(listingId);

    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.seller_id.toString() !== userId)
      throw new ForbiddenException('Access denied');

    return this.contractModel
      .find({ property_id: listing._id })
      .populate('buyer_id', 'full_name email phone')
      .populate('seller_id', 'full_name email phone')
      .populate({
        path: 'bid_id',
        select: 'bid_price inspection_period due_diligence_period status',
      })
      .sort({ createdAt: -1 });
  }
}
