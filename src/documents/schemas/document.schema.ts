import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DocumentDoc = Document & DocumentVault;

export enum DocumentType {
  SURVEY = 'survey',
  TAX_BILL = 'tax_bill',
  PROPERTY_PICTURE = 'property_picture',
  LOI = 'loi',
  PROOF_OF_FUNDS = 'proof_of_funds',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class DocumentVault {
  @Prop({ type: Types.ObjectId, ref: 'Listing', required: true })
  listing_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploaded_by: Types.ObjectId;

  @Prop({ type: String, enum: DocumentType, required: true })
  document_type: DocumentType;

  @Prop({ required: true })
  file_name: string;

  @Prop({ required: true })
  s3_key: string; // S3 object key — never expose raw

  @Prop({ required: true })
  mime_type: string;

  @Prop({ required: true })
  file_size: number; // bytes

  @Prop({ default: null })
  deleted_at: Date;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentVault);
