import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { VerificationsController } from './verifications.controller';
import { VerificationsService } from './verifications.service';

import {
  Verification,
  VerificationSchema,
} from './schemas/verification.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

import { CloudinaryService } from '../common/services/cloudinary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Verification.name, schema: VerificationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [VerificationsController],
  providers: [VerificationsService, CloudinaryService],
  exports: [VerificationsService, MongooseModule],
})
export class VerificationsModule {}
