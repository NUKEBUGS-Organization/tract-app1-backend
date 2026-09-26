import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CouponRedemptionDocument = CouponRedemption & Document;

@Schema({ timestamps: true, collection: 'app2_coupon_redemptions' })
export class CouponRedemption {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Coupon' })
  couponId: Types.ObjectId;

  @Prop({ required: true, uppercase: true })
  code: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true })
  role: string;

  @Prop({ required: true })
  amountWaived: number;

  @Prop({ type: Date, required: true })
  freeUntil: Date;
}

export const CouponRedemptionSchema =
  SchemaFactory.createForClass(CouponRedemption);
CouponRedemptionSchema.index({ couponId: 1, userId: 1 }, { unique: true });
CouponRedemptionSchema.index({ userId: 1 });
