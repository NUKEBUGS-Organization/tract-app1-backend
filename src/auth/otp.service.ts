import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { Otp, OtpDocument } from './schemas/otp.schema';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(@InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>) {}

  generate(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async storeEmailOtp(
    email: string,
    purpose: string,
    code: string,
    ttlSeconds: number = OTP_TTL_MS / 1000,
  ): Promise<void> {
    const normalised = email.toLowerCase().trim();
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.otpModel.findOneAndUpdate(
      { email: normalised, purpose },
      {
        email: normalised,
        purpose,
        codeHash,
        attempts: 0,
        expiresAt,
      },
      { upsert: true, new: true },
    );

    this.logger.log(`Email OTP stored for ${normalised} (${purpose})`);
  }

  async verifyEmailOtp(
    email: string,
    purpose: string,
    code: string,
  ): Promise<boolean> {
    const normalised = email.toLowerCase().trim();
    const doc = await this.otpModel.findOne({ email: normalised, purpose });
    if (!doc) return false;

    if (doc.expiresAt.getTime() <= Date.now()) {
      await this.otpModel.deleteOne({ _id: doc._id });
      return false;
    }

    if (doc.attempts >= OTP_MAX_ATTEMPTS) {
      return false;
    }

    const match = await bcrypt.compare(code, doc.codeHash);
    if (!match) {
      await this.otpModel.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
      return false;
    }

    await this.otpModel.deleteOne({ _id: doc._id });
    return true;
  }

  /**
   * Pre-check before verify: allow only if an OTP exists, is not expired,
   * and attempts are under the cap. Does not increment (verifyEmailOtp does
   * that on wrong codes) so callers keep the same signature/order.
   */
  async checkAndIncrementAttempts(
    email: string,
    purpose: string,
  ): Promise<boolean> {
    const normalised = email.toLowerCase().trim();
    const doc = await this.otpModel.findOne({ email: normalised, purpose });
    if (!doc) return false;
    if (doc.expiresAt.getTime() <= Date.now()) return false;
    return doc.attempts < OTP_MAX_ATTEMPTS;
  }

  async clearAttempts(email: string, purpose: string): Promise<void> {
    const normalised = email.toLowerCase().trim();
    // Success path already deletes the OTP doc; this is a no-op safety clear.
    await this.otpModel.deleteOne({ email: normalised, purpose });
  }
}
