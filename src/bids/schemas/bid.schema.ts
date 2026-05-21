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

@Schema({ timestamps: true })
export class Bid {
  @Prop({ type: Types.ObjectId, ref: 'Listing', required: true })
  property_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  bidder_id: Types.ObjectId;

  @Prop({ required: true })
  bid_price: number;

  @Prop({ type: Number, enum: InspectionPeriod, required: true })
  inspection_period: InspectionPeriod;

  @Prop({ type: Number, enum: DueDiligencePeriod, required: true })
  due_diligence_period: DueDiligencePeriod;

  @Prop({ type: String, enum: BidStatus, default: BidStatus.ACTIVE })
  status: BidStatus;

  @Prop({ default: null })
  backup_position: number; // 1, 2, or null

  @Prop({ default: null })
  net_to_seller: number; // computed: bid_price - commission (if realtor)

  @Prop({ default: null })
  loi_url: string; // optional LOI document URL

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
