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
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageLimitService } from './usage-limit.service';

@Module({
  imports: [
    ConfigModule.forFeature(paypalConfig),
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: UsageCounter.name, schema: UsageCounterSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SubscriptionsController],
  providers: [PaypalService, SubscriptionsService, UsageLimitService],
  exports: [SubscriptionsService, UsageLimitService],
})
export class PaymentsModule {}
