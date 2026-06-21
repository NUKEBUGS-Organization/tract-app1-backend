import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ListingDocument = Listing & Document;

export enum ListingStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  LIVE = 'live',
  REJECTED = 'rejected',
  PAUSED = 'paused',
  UNDER_CONTRACT = 'under_contract',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  WITHDRAWN = 'withdrawn',
}

export enum PropertyType {
  SFH = 'sfh',
  MULTI_FAMILY = 'multi_family',
  LAND = 'land',
}

export enum PropertyCondition {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  NEEDS_WORK = 'needs_work',
}

@Schema({ timestamps: true })
export class Listing {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  seller_id: Types.ObjectId;

  @Prop({ type: String, enum: ListingStatus, default: ListingStatus.DRAFT })
  status: ListingStatus;

  // ─── Property Details ────────────────────────────────────────────────────
  @Prop({ type: String, enum: PropertyType, required: true })
  property_type: PropertyType;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  zip_code: string;

  @Prop({ required: true })
  state_code: string;

  @Prop({ required: true })
  year_built: number;

  @Prop({ required: true })
  zoning: string;

  // ─── Pricing ─────────────────────────────────────────────────────────────
  @Prop({ required: true })
  market_price: number; // public — visible to partners

  @Prop({ default: null })
  hidden_reserve: string; // AES-256 encrypted — auto-blocks lowball offers

  @Prop({ default: null })
  suggested_price: number; // computed from nearby sold properties

  // ─── Disclosures ─────────────────────────────────────────────────────────
  @Prop({ default: false })
  has_liens: boolean;

  @Prop({ default: null })
  lien_disclosure: string;

  @Prop({ default: false })
  is_preforeclosure: boolean;

  @Prop({ default: null })
  mortgage_amount: number;

  @Prop({ default: false })
  is_vacant: boolean;

  @Prop({ default: false })
  is_off_market: boolean; // previously listed/expired

  // ─── Condition Report (JSONB) ─────────────────────────────────────────────
  @Prop({
    type: {
      roof: { type: String, enum: PropertyCondition },
      hvac: { type: String, enum: PropertyCondition },
      wetlands: { type: Boolean },
      overall: { type: String, enum: PropertyCondition },
      notes: { type: String },
    },
    default: {},
  })
  condition_report: {
    roof?: PropertyCondition;
    hvac?: PropertyCondition;
    wetlands?: boolean;
    overall?: PropertyCondition;
    notes?: string;
  };

  // ─── Seller Intent ────────────────────────────────────────────────────────
  @Prop({ default: null })
  motivation: string;

  @Prop({ default: null })
  sell_timeline: string; // e.g. "ASAP", "30 days", "flexible"

  @Prop({ default: null })
  realtor_commission: number; // % if realtor involved

  @Prop({ default: false })
  proof_of_funds_required: boolean;

  // ─── Multi-family specific ────────────────────────────────────────────────
  @Prop({ default: null })
  unit_count: number;

  // ─── Pictures ─────────────────────────────────────────────────────────────
  @Prop({ type: [String], default: [] })
  picture_urls: string[];

  // ─── Bid control ──────────────────────────────────────────────────────────
  @Prop({ default: 0 })
  bid_count: number; // max 10

  // ─── Auto-live job ────────────────────────────────────────────────────────
  @Prop({ default: null })
  auto_live_job_id: string; // job queue reference

  @Prop({ default: null })
  live_at: Date; // when listing went live

  @Prop({ default: null })
  rejection_reason: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  reviewed_by: Types.ObjectId;

  @Prop({ default: null })
  reviewed_at: Date;

  // ─── Soft delete ──────────────────────────────────────────────────────────
  @Prop({ default: null })
  deleted_at: Date;
}

export const ListingSchema = SchemaFactory.createForClass(Listing);

ListingSchema.pre('find', function (this: any) {
  this.where({ deleted_at: null });
});
ListingSchema.pre('findOne', function (this: any) {
  this.where({ deleted_at: null });
});
