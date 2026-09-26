import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CouponDocument = Coupon & Document;

@Schema({ timestamps: true, collection: 'app2_coupons' })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ default: 'Beta access' })
  description: string;

  @Prop({ required: true, min: 1, max: 100, default: 100 })
  percentOff: number;

  @Prop({ type: Date, required: true })
  freeUntil: Date;

  @Prop({ type: [String], default: [] })
  allowedRoles: string[];

  @Prop({ type: Number, default: null })
  maxRedemptions: number | null;

  @Prop({ default: 0 })
  redemptionCount: number;

  @Prop({ default: true })
  active: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
