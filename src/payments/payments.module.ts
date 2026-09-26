import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import paypalConfig from '../config/paypal.config';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PaypalService } from './paypal.service';
import {
  Subscription,
  SubscriptionSchema,
} from './schemas/subscription.schema';
import {
  UsageCounter,
  UsageCounterSchema,
} from './schemas/usage-counter.schema';
import { Coupon, CouponSchema } from './schemas/coupon.schema';
import {
  CouponRedemption,
  CouponRedemptionSchema,
} from './schemas/coupon-redemption.schema';
import { CouponsService } from './coupons.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageLimitService } from './usage-limit.service';

@Module({
  imports: [
    ConfigModule.forFeature(paypalConfig),
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: UsageCounter.name, schema: UsageCounterSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: CouponRedemption.name, schema: CouponRedemptionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [PaypalService, SubscriptionsService, UsageLimitService, CouponsService],
  exports: [SubscriptionsService, UsageLimitService, CouponsService],
})
export class PaymentsModule {}
