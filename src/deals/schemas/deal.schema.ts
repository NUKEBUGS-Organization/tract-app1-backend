import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Query, Types } from 'mongoose';

export type DealDocument = Deal & Document;

export enum DealStatus {
  ACTIVE = 'active',
  UNDER_REVIEW = 'under_review',
  PROCEEDING_TO_CLOSING = 'proceeding_to_closing',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  BACKUP_ACTIVATED = 'backup_activated',
}

@Schema({
  timestamps: true,
})
export class Deal {
  @Prop({
    type: Types.ObjectId,
    ref: 'Contract',
    required: true,
    unique: true,
  })
  contract_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'Listing',
    required: true,
  })
  listing_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  seller_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  buyer_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: DealStatus,
    default: DealStatus.ACTIVE,
  })
  status: DealStatus;

  @Prop({
    default: null,
  })
  marketing_proof_url: string;

  @Prop({
    default: null,
  })
  market_launch_proof_url: string;

  @Prop({
    default: null,
  })
  marketing_deadline: Date;

  @Prop({
    default: null,
  })
  market_launch_deadline: Date;

  @Prop({
    default: null,
  })
  kill_switch_triggered_at: Date;

  @Prop({
    default: null,
  })
  proceed_to_closing_at: Date;

  @Prop({
    default: true,
  })
  chat_unlocked: boolean;

  @Prop({
    default: null,
  })
  closed_at: Date;

  @Prop({
    default: null,
  })
  deleted_at: Date;
}

export const DealSchema = SchemaFactory.createForClass(Deal);

DealSchema.pre(/^find/, function (this: Query<any, any>) {
  this.where({
    deleted_at: null,
  });
});
