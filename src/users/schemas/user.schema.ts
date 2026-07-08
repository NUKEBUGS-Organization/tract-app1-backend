import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Query } from 'mongoose';

export type UserDocument = User & Document;

export enum Role {
  SELLER = 'seller',
  WHOLESALER = 'wholesaler',
  REALTOR = 'realtor',
  ADMIN = 'admin',
}

export enum KycStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

// Score-driven access restriction — see TRACT App 1 Score Rules §3
export enum RestrictionStatus {
  NORMAL = 'normal',
  DELAYED_ACCESS = 'delayed_access',
  BANNED = 'banned',
  REINSTATEMENT_REQUIRED = 'reinstatement_required',
}

@Schema({ timestamps: true }) // auto adds createdAt, updatedAt
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, unique: true })
  phone: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop({ type: String, enum: Role, required: true })
  role: Role;

  @Prop({ required: true })
  state_code: string;

  @Prop({ required: true })
  dob: Date;

  @Prop({ required: true })
  full_name: string;

  @Prop({ type: String, enum: KycStatus, default: KycStatus.PENDING })
  kyc_status: KycStatus;

  @Prop({ default: false })
  bank_verified: boolean;

  @Prop({ default: 100 })
  reliability_score: number;

  @Prop({ default: 100 })
  professional_score: number;

  @Prop({ default: 0 })
  deal_count: number;

  @Prop({
    type: String,
    enum: RestrictionStatus,
    default: RestrictionStatus.NORMAL,
  })
  restriction_status: RestrictionStatus;

  // Set when restriction_status is DELAYED_ACCESS (score < 50 → 48h delayed access)
  @Prop({ type: Date, default: null })
  restricted_until: Date | null;

  @Prop({ default: false })
  is_banned: boolean;

  @Prop({ default: null })
  ban_reason: string;

  @Prop({ default: null })
  last_active_at: Date;

  // OTP fields (2FA)
  @Prop({ default: null })
  otp_code: string; // bcrypt hashed

  @Prop({ default: null })
  otp_expires_at: Date;

  @Prop({ default: null })
  otp_purpose: string; // 'login' | 'forgot_password'

  // Single-session enforcement
  @Prop({ default: null })
  current_session_id: string;

  // Soft delete
  @Prop({ default: null })
  deleted_at: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Soft-delete filter — never return deleted users by default
UserSchema.pre(/^find/, function (this: Query<any, any>) {
  this.where({ deleted_at: null });
});
