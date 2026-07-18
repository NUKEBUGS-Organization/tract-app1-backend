import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BidDocument = Bid & Document;

export enum BidStatus {
  ACTIVE = 'active',
  SELECTED = 'selected',
  BACKUP = 'backup',
  REJECTED = 'rejected',
  DELETED = 'deleted',
}

export enum InspectionPeriod {
  THREE = 3,
  SEVEN = 7,
  TEN = 10,
}

export enum DueDiligencePeriod {
  FIVE = 5,
  TEN = 10,
  FIFTEEN = 15,
}

export enum ClosingTimelineDays {
  THIRTY = 30,
  FORTY_FIVE = 45,
  SIXTY = 60,
}

export enum AgencyRole {
  LISTING_AGENT = 'Listing Agent',
  TRANSACTION_COORDINATOR = 'Transaction Coordinator',
}

export enum PaymentSource {
  SELLER_PAYS = 'Seller Pays Commission',
  BUYER_PAYS = 'Buyer Pays Commission',
}

@Schema({ timestamps: true })
export class Bid {
  @Prop({ type: Types.ObjectId, ref: 'Listing', required: true })
  property_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bidder_id: Types.ObjectId;

  @Prop({ required: true })
  bid_price: number;

  // Wholesaler-only
  @Prop({ type: Number, enum: InspectionPeriod, default: null })
  inspection_period: InspectionPeriod;

  // Wholesaler-only
  @Prop({ type: Number, enum: DueDiligencePeriod, default: null })
  due_diligence_period: DueDiligencePeriod;

  // Realtor-only, 2-6%
  @Prop({ type: Number, default: null })
  commission_percentage: number;

  // Realtor-only
  @Prop({ type: Number, enum: ClosingTimelineDays, default: null })
  closing_timeline_days: ClosingTimelineDays;

  // Realtor-only
  @Prop({ type: String, enum: AgencyRole, default: null })
  agency_role: AgencyRole;

  // Realtor-only
  @Prop({ type: String, enum: PaymentSource, default: null })
  payment_source: PaymentSource;

  @Prop({ type: String, enum: BidStatus, default: BidStatus.ACTIVE })
  status: BidStatus;

  @Prop({ type: Number, default: null })
  backup_position: number | null; // 1, 2, or null

  @Prop({ default: null })
  net_to_seller: number; // computed: bid_price - commission (if realtor)

  // Wholesaler-only, optional LOI document URL
  @Prop({ default: null })
  loi_url: string;

  // Wholesaler-only
  @Prop({ default: null })
  proof_of_funds_url: string;

  @Prop({ default: Date.now })
  submitted_at: Date;

  // LOI active for 10 days
  @Prop({ default: null })
  loi_expires_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const BidSchema = SchemaFactory.createForClass(Bid);
