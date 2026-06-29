import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  // Listing
  LISTING_APPROVED = 'listing_approved',
  LISTING_LIVE = 'listing_live',
  LISTING_NEEDS_INFO = 'listing_needs_info',
  LISTING_BID_RECEIVED = 'listing_bid_received',
  LISTING_BID_CAP_REACHED = 'listing_bid_cap_reached',

  // Bid / Offer
  BID_SELECTED = 'bid_selected',
  BID_REJECTED = 'bid_rejected',
  BID_BACKUP = 'bid_backup',

  // Contract
  CONTRACT_READY = 'contract_ready',
  CONTRACT_SIGNED = 'contract_signed', // one party signed
  CONTRACT_EXECUTED = 'contract_executed', // both parties signed

  // Deal milestones
  DEAL_ACTIVE = 'deal_active',
  DEAL_UNDER_REVIEW = 'deal_under_review',
  DEAL_PROCEEDING = 'deal_proceeding_to_closing',
  DEAL_CLOSED = 'deal_closed',
  DEAL_CANCELLED = 'deal_cancelled',
  DEAL_BACKUP_ACTIVATED = 'deal_backup_activated',
  DEAL_FEE_PROCESSING = 'deal_fee_processing',

  // Chat
  CHAT_NEW_MESSAGE = 'chat_new_message',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  recipient_id: Types.ObjectId;

  @Prop({ type: String, enum: NotificationType, required: true })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  /** Contextual link the frontend can navigate to (e.g. /listings/:id) */
  @Prop({ type : String, default: null })
  action_url: string | null;

  /** Loose bag of extra data the frontend might need */
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Prop({ type: Boolean, default: false })
  is_read: boolean;

  @Prop({ type: Date, default: null })
  read_at: Date | null;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Soft-delete middleware
NotificationSchema.pre('find', function (this: any) {
  this.where({ deleted_at: null });
});

NotificationSchema.pre('findOne', function (this: any) {
  this.where({ deleted_at: null });
});
