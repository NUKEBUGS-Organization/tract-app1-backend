import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import {
  Verification,
  VerificationDocument,
  VerificationStatus,
  VerificationType,
} from './schemas/verification.schema';

import { User, UserDocument, Role } from '../users/schemas/user.schema';

import { CloudinaryService } from '../common/services/cloudinary.service';

import { SubmitRealtorVerificationDto } from './dto/submit-realtor-verification.dto';

@Injectable()
export class VerificationsService {
  constructor(
    @InjectModel(Verification.name)
    private readonly verificationModel: Model<VerificationDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async submitRealtorVerification(
    userId: string,
    dto: SubmitRealtorVerificationDto,
  ) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.REALTOR) {
      throw new ForbiddenException(
        'Only realtors can submit this verification',
      );
    }

    return this.verificationModel.findOneAndUpdate(
      { user_id: user._id },
      {
        user_id: user._id,
        type: VerificationType.REALTOR,
        status: VerificationStatus.PENDING,
        state_license_number: dto.state_license_number,
        brokerage_name: dto.brokerage_name,
        managing_broker: dto.managing_broker,
        office_address: dto.office_address,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  async submitWholesalerVerification(
    userId: string,
    file: Express.Multer.File,
  ) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== Role.WHOLESALER) {
      throw new ForbiddenException(
        'Only wholesalers can submit this verification',
      );
    }

    if (!file) {
      throw new BadRequestException('Proof of activity document is required');
    }

    const existing = await this.verificationModel.findOne({
      user_id: user._id,
    });

    if (existing?.document_public_id) {
      await this.cloudinaryService.deleteFile(
        existing.document_public_id,
        'raw',
      );
    }

    const folder = `tractapp/verifications/wholesaler/${userId}`;

    const uploadResult = await this.cloudinaryService.uploadFile(
      file.buffer,
      folder,
      file.originalname,
      file.mimetype,
    );

    return this.verificationModel.findOneAndUpdate(
      { user_id: user._id },
      {
        user_id: user._id,
        type: VerificationType.WHOLESALER,
        status: VerificationStatus.PENDING,
        document_url: uploadResult.secure_url,
        document_public_id: uploadResult.public_id,
        document_file_name: file.originalname,
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
        submitted_at: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();
  }

  async getMyVerification(userId: string) {
    const verification = await this.verificationModel.findOne({
      user_id: new Types.ObjectId(userId),
    }).lean();

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    return verification;
  }

  // Bid-gating check used by BidsService — throws if the bidder isn't
  // allowed to bid yet.
  async assertCanBid(userId: string, role: Role): Promise<void> {
    if (role === Role.REALTOR) {
      const verification = await this.verificationModel.findOne({
        user_id: new Types.ObjectId(userId),
        type: VerificationType.REALTOR,
      });

      if (
        !verification ||
        verification.status !== VerificationStatus.APPROVED
      ) {
        throw new ForbiddenException(
          'Your realtor verification must be approved by admin before you can bid',
        );
      }

      return;
    }

    if (role === Role.WHOLESALER) {
      const verification = await this.verificationModel.findOne({
        user_id: new Types.ObjectId(userId),
        type: VerificationType.WHOLESALER,
      });

      if (!verification || !verification.document_url || verification.status !== VerificationStatus.APPROVED) {
        throw new ForbiddenException(
          'You must submit a proof of activity document before you can bid',
        );
      }

      return;
    }
  }
}
