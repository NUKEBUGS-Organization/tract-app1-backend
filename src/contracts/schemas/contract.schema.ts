import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ContractDocument = Contract & Document;

export enum ContractStatus {
  PENDING = 'pending',
  SIGNED = 'signed',
  CANCELLED = 'cancelled',
}

@Schema({
  timestamps: true,
})
export class Contract {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true })
  property_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Bid', required: true })
  bid_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  seller_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  buyer_id: Types.ObjectId;

  @Prop({
    type: String,
    enum: ContractStatus,
    default: ContractStatus.PENDING,
  })
  status: ContractStatus;

  @Prop()
  pdf_url: string;

  @Prop()
  seller_signed_at?: Date;

  @Prop()
  buyer_signed_at?: Date;

  @Prop()
  docusign_envelope_id?: string;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);
