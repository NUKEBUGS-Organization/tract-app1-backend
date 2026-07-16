import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ScoreEventType } from './score-event.schema';

export type ScoreRuleDocument = ScoreRule & Document;

// Who the rule can be applied against — mirrors §2/§4 (role-specific tables)
export enum ScoreRuleAppliesTo {
  WHOLESALER = 'wholesaler',
  REALTOR = 'realtor',
  BOTH = 'both',
}

// Configurable score deduction rules — TRACT App 1 Score Rules §5/§10:
// "create configurable score rules in backend so admin/product can adjust
// the score deduction without changing frontend code."
@Schema({ timestamps: true })
export class ScoreRule {
  @Prop({ type: String, enum: ScoreEventType, required: true, unique: true })
  event_type: ScoreEventType;

  @Prop({ type: String, enum: ScoreRuleAppliesTo, required: true })
  applies_to: ScoreRuleAppliesTo;

  @Prop({ required: true })
  delta: number;

  // true = exact penalty defined in the product doc (§2/§4);
  // false = recommended mapping for an undefined scenario (§5), pending product confirmation
  @Prop({ default: true })
  is_exact: boolean;

  @Prop({ default: true })
  active: boolean;

  @Prop({ type: String, default: null })
  description: string | null;
}

export const ScoreRuleSchema = SchemaFactory.createForClass(ScoreRule);
