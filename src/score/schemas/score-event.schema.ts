import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ScoreEventDocument = ScoreEvent & Document;

// Machine-readable reasons — TRACT App 1 Score Rules §2, §4, §5
export enum ScoreEventType {
  // Wholesaler / Private Partner — Reliability Score (§2)
  GHOSTING = 'ghosting',
  INSPECTION_CANCELLATION = 'inspection_cancellation',
  MISSED_DEADLINE = 'missed_deadline',
  FAILURE_TO_PROCEED_TO_CLOSING = 'failure_to_proceed_to_closing',

  // Realtor / Licensed Partner — Professional Score (§4)
  SLOW_RESPONSE = 'slow_response',
  MISSED_MILESTONE = 'missed_milestone',
  DEAL_FALLOUT_NEGLIGENCE = 'deal_fallout_negligence',

  // Scenarios enforced but not exactly scored yet — kept configurable (§5)
  MARKETING_PROOF_MISSED = 'marketing_proof_missed',
  MARKET_LAUNCH_MISSED = 'market_launch_missed',
  CHAT_FLAG = 'chat_flag',
  EXTENSION_REQUESTED = 'extension_requested',
  INACTIVITY_RESTRICTION = 'inactivity_restriction',

  // Admin actions
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  SCORE_RESET = 'score_reset',
}

export enum ScoreType {
  RELIABILITY = 'reliability',
  PROFESSIONAL = 'professional',
}

@Schema({ timestamps: true })
export class ScoreEvent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Deal', default: null })
  deal_id: Types.ObjectId | null;

  @Prop({ type: String, enum: ScoreType, required: true })
  score_type: ScoreType;

  @Prop({ type: String, enum: ScoreEventType, required: true })
  event_type: ScoreEventType;

  @Prop({ required: true })
  delta: number;

  @Prop({ required: true })
  score_before: number;

  @Prop({ required: true })
  score_after: number;

  @Prop({ type: String, default: null })
  note: string | null;

  // 'system' for automatic events, otherwise the admin user id
  @Prop({ required: true })
  created_by: string;
}

export const ScoreEventSchema = SchemaFactory.createForClass(ScoreEvent);
