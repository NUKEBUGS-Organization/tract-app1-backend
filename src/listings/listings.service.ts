import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  Listing,
  ListingDocument,
  ListingStatus,
} from './schemas/listing.schema';
import { Bid, BidDocument, BidStatus } from '../bids/schemas/bid.schema';
import {
  DocumentVault,
  DocumentDoc,
  DocumentType,
} from '../documents/schemas/document.schema';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';
import { ListingQueryDto } from './dto/listing-query.dto';
import { CloudinaryService } from '../common/services/cloudinary.service';

const MAX_BIDS = 10;

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly IV_LENGTH = 16;

  constructor(
    @InjectModel(Listing.name) private listingModel: Model<ListingDocument>,
    @InjectModel(Bid.name) private bidModel: Model<BidDocument>,
    @InjectModel(DocumentVault.name) private documentModel: Model<DocumentDoc>,
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ─── POST /listings ────────────────────────────────────────────────────────
  async createListing(sellerId: string, dto: CreateListingDto) {
    try {
      const data: any = { ...dto, seller_id: new Types.ObjectId(sellerId) };

      const listing = await this.listingModel.create(data);

      this.logger.log(`Listing created: ${listing._id} by seller ${sellerId}`);

      return listing.toObject();
    } catch (error) {
      this.logger.error(`createListing failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to create listing.');
    }
  }

  // ─── GET /listings/:id ─────────────────────────────────────────────────────
  async getListingById(listingId: string, requesterId: string) {
    try {
      const listing = await this.listingModel.findById(listingId).lean();

      if (!listing) throw new NotFoundException('Listing not found');

      // Hide reserve price from non-owners
      const isOwner = listing.seller_id.toString() === requesterId;
      if (!isOwner) {
        delete (listing as any).hidden_reserve;
      }

      return listing;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`getListingById failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch listing.');
    }
  }

  // ─── PATCH /listings/:id ───────────────────────────────────────────────────
  async updateListing(
    listingId: string,
    sellerId: string,
    dto: UpdateListingDto,
  ) {
    try {
      const listing = await this.listingModel.findById(listingId);
      if (!listing) throw new NotFoundException('Listing not found');

      // Only owner can update
      if (listing.seller_id.toString() !== sellerId) {
        throw new ForbiddenException('You do not own this listing');
      }

      // Cannot update after submitted/live
      if (
        [
          // ListingStatus.LIVE,
          ListingStatus.SUBMITTED,
          ListingStatus.UNDER_CONTRACT,
          ListingStatus.CLOSED,
        ].includes(listing.status)
      ) {
        throw new BadRequestException(
          `Cannot update listing in "${listing.status}" status`,
        );
      }

      const updateData: any = { ...dto };

      // Re-encrypt hidden_reserve if updated
      if (dto.hidden_reserve) {
        updateData.hidden_reserve = this.encrypt(dto.hidden_reserve.toString());
      }

      const updated = await this.listingModel
        .findByIdAndUpdate(listingId, { $set: updateData }, { new: true })
        .lean();

      return updated;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;

      this.logger.error(`updateListing failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to update listing.');
    }
  }

  // ─── POST /listings/:id/submit ─────────────────────────────────────────────
  // Submits listing for auto-live — triggers 1-hr job queue
  async submitListing(listingId: string, sellerId: string) {
    try {
      const listing = await this.listingModel.findById(listingId);
      if (!listing) throw new NotFoundException('Listing not found');

      if (listing.seller_id.toString() !== sellerId) {
        throw new ForbiddenException('You do not own this listing');
      }

      if (listing.status !== ListingStatus.DRAFT) {
        throw new BadRequestException(
          `Listing is already "${listing.status}". Only drafts can be submitted.`,
        );
      }

      // Check required documents before allowing submit
      const docs = await this.documentModel.find({ listing_id: listing._id });
      const docTypes = docs.map((d) => d.document_type);

      const requiredDocs = ['survey', 'tax_bill'];
      const missing = requiredDocs.filter((d) => !docTypes.includes(d as any));

      if (missing.length > 0) {
        throw new BadRequestException(
          `Missing required documents: ${missing.join(', ')}. Upload them before submitting.`,
        );
      }

      // Schedule auto-live job (1 hour from now)
      const liveAt = new Date(Date.now() + 60 * 60 * 1000);
      const jobId = `job_${listing._id}_${Date.now()}`;

      await this.listingModel.findByIdAndUpdate(listingId, {
        status: ListingStatus.SUBMITTED,
        // auto_live_job_id: jobId,
        // live_at: liveAt,
      });

      return {
        message: 'Listing submitted. It will go live in 1 hour.',
        // live_at: liveAt,
        // job_id: jobId,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;

      this.logger.error(`submitListing failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to submit listing.');
    }
  }

  // ─── POST /listings/:id/documents ──────────────────────────────────────────
  async uploadDocuments(
    listingId: string,
    sellerId: string,
    files: Express.Multer.File[],
    documentTypes: string[],
  ): Promise<{
    message: string;
    listing_id: string;
    documents: Array<{
      document_id: any;
      document_type: string;
      file_name: string;
      url: string;
      status: string;
    }>;
    errors?: Array<{
      file_name: string;
      document_type: string;
      status: string;
      error: string;
    }>;
  }> {
    try {
      const listing = await this.listingModel.findById(listingId);
      if (!listing) throw new NotFoundException('Listing not found');

      if (listing.seller_id.toString() !== sellerId) {
        throw new ForbiddenException('You do not own this listing');
      }

      if (documentTypes.length && documentTypes.length !== files.length) {
        throw new BadRequestException(
          'Number of document types must match number of files, or leave empty',
        );
      }

      const uploadedDocuments: Array<{
        document_id: any;
        document_type: string;
        file_name: string;
        url: string;
        status: string;
      }> = [];

      const errors: Array<{
        file_name: string;
        document_type: string;
        status: string;
        error: string;
      }> = [];

      const propertyPictureUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const documentType = (documentTypes[i] || 'other') as DocumentType;

        try {
          const folder = `tractapp/listings/${listingId}/${documentType}`;
          const isImage = documentType === DocumentType.PROPERTY_PICTURE;

          // Upload to Cloudinary — images get optimization, other files go as raw
          const cloudinaryResult = isImage
            ? await this.cloudinaryService.uploadImage(file.buffer, folder)
            : await this.cloudinaryService.uploadFile(
                file.buffer,
                folder,
                file.originalname,
                file.mimetype,
              );

          const publicUrl = cloudinaryResult.secure_url;
          const cloudinaryPublicId = cloudinaryResult.public_id;

          // Save document record — reuse s3_key to store Cloudinary public_id
          const doc = await this.documentModel.create({
            listing_id: new Types.ObjectId(listingId),
            uploaded_by: new Types.ObjectId(sellerId),
            document_type: documentType,
            file_name: file.originalname,
            s3_key: cloudinaryPublicId,
            mime_type: file.mimetype,
            file_size: file.size,
          });

          if (isImage) {
            propertyPictureUrls.push(publicUrl);
          }

          uploadedDocuments.push({
            document_id: (doc as any)._id,
            document_type: documentType,
            file_name: file.originalname,
            url: publicUrl,
            status: 'success',
          });

          this.logger.log(
            `Cloudinary upload: ${documentType} for listing ${listingId} -> ${publicUrl}`,
          );
        } catch (fileError: any) {
          errors.push({
            file_name: file.originalname,
            document_type: documentType,
            status: 'failed',
            error: fileError?.message || 'Failed to upload file',
          });
          this.logger.error(
            `Failed to upload ${file.originalname}: ${fileError?.message}`,
          );
        }
      }

      // Push property picture URLs into the listing
      if (propertyPictureUrls.length > 0) {
        await this.listingModel.findByIdAndUpdate(
          listingId,
          { $push: { picture_urls: { $each: propertyPictureUrls } } },
          { new: true },
        );

        this.logger.log(
          `Added ${propertyPictureUrls.length} property pictures to listing ${listingId}`,
        );
      }

      const response: any = {
        message: `Uploaded ${uploadedDocuments.length} of ${files.length} documents successfully`,
        listing_id: listingId,
        documents: uploadedDocuments,
      };

      if (errors.length > 0) {
        response.errors = errors;
      }

      return response;
    } catch (error: any) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;

      this.logger.error(
        `uploadDocuments failed: ${error?.message}`,
        error?.stack,
      );
      throw new InternalServerErrorException('Failed to upload documents.');
    }
  }

  // ─── GET /listings/:id/documents ───────────────────────────────────────────
  async getDocuments(listingId: string, requesterId: string) {
    try {
      const listing = await this.listingModel.findById(listingId);
      if (!listing) throw new NotFoundException('Listing not found');

      const isOwner = listing.seller_id.toString() === requesterId;

      // Non-owners can only see documents if listing is live+
      if (
        !isOwner &&
        ![
          ListingStatus.LIVE,
          ListingStatus.UNDER_CONTRACT,
          ListingStatus.CLOSED,
        ].includes(listing.status)
      ) {
        throw new ForbiddenException('Documents not accessible at this stage');
      }

      const docs = await this.documentModel
        .find({ listing_id: new Types.ObjectId(listingId) })
        .lean();

      const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');

      const docsWithUrls = docs.map((doc) => {
        // Reconstruct Cloudinary URL from stored public_id
        // Images use /image/upload/, raw files use /raw/upload/
        const isImage = doc.document_type === DocumentType.PROPERTY_PICTURE;
        const resourceType = isImage ? 'image' : 'raw';
        const url = `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${doc.s3_key}`;

        return {
          _id: doc._id,
          document_type: doc.document_type,
          file_name: doc.file_name,
          file_size: doc.file_size,
          mime_type: doc.mime_type,
          url,
          uploaded_at: (doc as any).createdAt || (doc as any).created_at,
        };
      });

      return {
        documents: docsWithUrls,
        total: docsWithUrls.length,
        listing_id: listingId,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        throw error;

      this.logger.error(`getDocuments failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch documents.');
    }
  }

  // ─── GET /listings ─────────────────────────────────────────────────────────
  // Paginated property stream with filters
  async getListings(query: ListingQueryDto) {
    try {
      const {
        page = 1,
        limit = 10,
        state_code,
        property_type,
        min_price,
        max_price,
      } = query;

      const filter: any = {
        status: ListingStatus.LIVE, // only live listings in public stream
        deleted_at: null,
      };

      if (state_code) filter.state_code = state_code.toUpperCase();
      if (property_type) filter.property_type = property_type;
      if (min_price || max_price) {
        filter.market_price = {};
        if (min_price) filter.market_price.$gte = min_price;
        if (max_price) filter.market_price.$lte = max_price;
      }

      const skip = (page - 1) * limit;

      const [listings, total] = await Promise.all([
        this.listingModel
          .find(filter)
          .select('-hidden_reserve') // never expose reserve in public stream
          .sort({ live_at: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.listingModel.countDocuments(filter),
      ]);

      return {
        data: listings,
        pagination: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit),
          has_next: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error(`getListings failed: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to fetch listings.');
    }
  }

  // ─── DELETE /listings/:id ──────────────────────────────────────────────────
  // Seller withdraws listing — only allowed before any bids placed
  async withdrawListing(listingId: string, sellerId: string) {
    try {
      const listing = await this.listingModel.findById(listingId);
      if (!listing) throw new NotFoundException('Listing not found');

      if (listing.seller_id.toString() !== sellerId) {
        throw new ForbiddenException('You do not own this listing');
      }

      // Cannot withdraw if bids exist
      const activeBids = await this.bidModel.countDocuments({
        property_id: new Types.ObjectId(listingId),
        status: {
          $in: [BidStatus.ACTIVE, BidStatus.SELECTED, BidStatus.BACKUP],
        },
      });

      if (activeBids > 0) {
        throw new BadRequestException(
          'Cannot withdraw listing after bids have been placed.',
        );
      }

      // Cannot withdraw if under contract or closed
      if (
        [ListingStatus.UNDER_CONTRACT, ListingStatus.CLOSED].includes(
          listing.status,
        )
      ) {
        throw new BadRequestException(
          `Cannot withdraw listing in "${listing.status}" status.`,
        );
      }

      await this.listingModel.findByIdAndUpdate(listingId, {
        status: ListingStatus.WITHDRAWN,
        deleted_at: new Date(),
      });

      this.logger.log(`Listing ${listingId} withdrawn by seller ${sellerId}`);

      return { message: 'Listing withdrawn successfully.' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      )
        throw error;

      this.logger.error(
        `withdrawListing failed: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to withdraw listing.');
    }
  }

  // ─── SELLER DASHBOARD ─────────────────────────────────────────────────────
  // Get all listings + bids summary for logged in seller
  async getSellerDashboard(sellerId: string) {
    try {
      const listings = await this.listingModel
        .find({ seller_id: new Types.ObjectId(sellerId) })
        .sort({ createdAt: -1 })
        .lean();

      // For each listing attach bid summary
      const listingsWithBids = await Promise.all(
        listings.map(async (listing) => {
          const bids = await this.bidModel
            .find({ property_id: listing._id })
            .populate('bidder_id', 'full_name role reliability_score')
            .select('-deleted_at')
            .sort({ bid_price: -1 })
            .lean();

          return {
            ...listing,
            bids_summary: {
              total: bids.length,
              remaining_slots: Math.max(0, MAX_BIDS - bids.length),
              active_bids: bids.filter((b) => b.status === BidStatus.ACTIVE)
                .length,
            },
            bids,
          };
        }),
      );

      return {
        listings: listingsWithBids,
        summary: {
          total_listings: listings.length,
          draft: listings.filter((l) => l.status === ListingStatus.DRAFT)
            .length,
          live: listings.filter((l) => l.status === ListingStatus.LIVE).length,
          under_contract: listings.filter(
            (l) => l.status === ListingStatus.UNDER_CONTRACT,
          ).length,
          closed: listings.filter((l) => l.status === ListingStatus.CLOSED)
            .length,
        },
      };
    } catch (error) {
      this.logger.error(
        `getSellerDashboard failed: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to fetch dashboard.');
    }
  }

  // ─── PRIVATE: Encrypt ─────────────────────────────────────────────────────
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      this.ENCRYPTION_KEY,
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  decryptReserve(text: string): number {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.ENCRYPTION_KEY,
      iv,
    );
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return parseFloat(decrypted.toString());
  }
}