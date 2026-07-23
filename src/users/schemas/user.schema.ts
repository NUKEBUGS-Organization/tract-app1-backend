import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Query } from 'mongoose';

export type UserDocument = User & Document;

export enum Role {
  SELLER = 'seller',
  WHOLESALER = 'wholesaler',
  REALTOR = 'realtor',
  ADMIN = 'admin',
  // Kept so shared `users` docs from App 2 are never rejected by Mongoose
  BUYER = 'buyer',
  TITLE_REP = 'title_rep',
}

export const APP1_ALLOWED_ROLES: Role[] = [
  Role.SELLER,
  Role.WHOLESALER,
  Role.REALTOR,
  Role.ADMIN,
];

export const APP1_REGISTER_ROLES: Role[] = [
  Role.SELLER,
  Role.WHOLESALER,
  Role.REALTOR,
];

/** Canonical KYC statuses shared with App 2. */
export enum KycStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Score-driven access restriction — shared with App 2. */
export enum RestrictionStatus {
  NORMAL = 'normal',
  DELAYED_ACCESS = 'delayed_access',
  BANNED = 'banned',
  REINSTATEMENT_REQUIRED = 'reinstatement_required',
}

@Schema({
  timestamps: true,
  collection: 'users', // shared with App 2
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, unique: true })
  phone: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: Object.values(Role), required: true })
  role: Role;

  @Prop({ required: true, uppercase: true, trim: true })
  stateCode: string;

  @Prop({ required: true })
  dob: Date;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({
    type: String,
    enum: Object.values(KycStatus),
    default: KycStatus.PENDING,
  })
  kycStatus: KycStatus;

  @Prop({ type: Date, default: null })
  kycVerifiedAt: Date | null;

  @Prop({ type: String, default: null })
  kycProvider: string | null;

  @Prop({ default: false })
  bankVerified: boolean;

  @Prop({ type: Date, default: null })
  bankVerifiedAt: Date | null;

  @Prop({ type: String, default: null })
  bankProvider: string | null;

  @Prop({ default: 100, min: 0, max: 100 })
  reliabilityScore: number;

  @Prop({ default: 100, min: 0, max: 100 })
  professionalScore: number;

  @Prop({
    type: String,
    enum: Object.values(RestrictionStatus),
    default: RestrictionStatus.NORMAL,
  })
  restrictionStatus: RestrictionStatus;

  @Prop({ type: Date, default: null })
  scoreRestrictedUntil: Date | null;

  @Prop({ default: false })
  isBanned: boolean;

  @Prop({ type: String, default: null })
  banReason: string | null;

  @Prop({ type: Date, default: null })
  banExpiresAt: Date | null;

  @Prop({ type: Date, default: null })
  lastActiveAt: Date | null;

  @Prop({ type: String, default: null })
  currentSessionId: string | null;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  // Realtor credentials (shared)
  @Prop({ default: '' })
  licenseNumber: string;

  @Prop({ default: '' })
  brokerageName: string;

  @Prop({ default: '' })
  managingBroker: string;

  @Prop({ default: '' })
  officeAddress: string;

  @Prop({ default: 0, min: 0, max: 100 })
  commissionPct: number;

  @Prop({
    type: String,
    default: null,
    enum: ['buyers_agent', 'transaction_coordinator', null],
  })
  defaultAgencyRole: string | null;

  @Prop({
    type: String,
    default: null,
    enum: ['seller', 'buyer', null],
  })
  defaultFeePaidBy: string | null;

  @Prop({ type: String, default: null })
  proofOfActivityUrl: string | null;

  @Prop({ type: Date, default: null })
  proofOfActivityUploadedAt: Date | null;

  @Prop({ default: '' })
  linkedInUrl: string;

  // App 1 specific
  @Prop({ default: false })
  app1_inRestrictedState: boolean;

  @Prop({ default: 0 })
  app1_activeDealsCount: number;

  @Prop({ default: 0 })
  app1_totalDealsClosed: number;

  @Prop({ type: Date, default: null })
  app1_lastContractSecuredAt: Date | null;

  @Prop({ default: 1 })
  app1_maxActiveDeals: number;

  @Prop({ default: false })
  app1_reactivationFeePending: boolean;

  @Prop({ default: false })
  app1_platformFeePaid: boolean;

  @Prop({ default: 0 })
  app1_totalPlatformFeesPaid: number;

  @Prop({ type: String, default: null })
  app1_linkedUserId: string | null;

  // App 2 fields kept so shared docs are never stripped/rejected
  @Prop({ default: false })
  app2_isVettedBuyer: boolean;

  @Prop({ type: Date, default: null })
  app2_vettedAt: Date | null;

  @Prop({ default: 0 })
  app2_activeDealsCount: number;

  @Prop({ default: 0 })
  app2_totalDealsClosed: number;

  @Prop({ type: Date, default: null })
  app2_lastContractSecuredAt: Date | null;

  @Prop({ default: false })
  app2_reactivationFeePending: boolean;

  @Prop({ default: false })
  app2_platformFeePaid: boolean;

  @Prop({ default: 0 })
  app2_totalPlatformFeesPaid: number;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.pre(/^find/, function (this: Query<any, any>) {
  this.where({ deletedAt: null });
});
