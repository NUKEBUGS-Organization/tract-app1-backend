import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DealDocument = Deal & Document;

@Schema({
  timestamps: true,
})
export class Deal {
  @Prop({ type: Types.ObjectId, ref: 'Contract', required: true })
  contract_id: Types.ObjectId;

  @Prop()
  status: string;

  @Prop()
  marketing_proof_url?: string;

  @Prop()
  market_launch_proof_url?: string;

  @Prop()
  marketing_deadline?: Date;

  @Prop()
  market_launch_deadline?: Date;

  @Prop()
  kill_switch_triggered_at?: Date;

  @Prop()
  proceed_to_closing_at?: Date;

  @Prop({
    type: Boolean,
    default: false,
  })
  chat_unlocked: boolean;

  @Prop()
  closed_at?: Date;
}

export const DealSchema = SchemaFactory.createForClass(Deal);
