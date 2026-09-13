import { registerAs } from '@nestjs/config';

export default registerAs('paypal', () => ({
  wholesalerPlanId: process.env.PAYPAL_WHOLESALER_PLAN_ID?.trim() ?? '',
  buyerPlanId: process.env.PAYPAL_BUYER_PLAN_ID?.trim() ?? '',
  clientId: process.env.PAYPAL_CLIENT_ID?.trim() ?? '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET?.trim() ?? '',
  mode: (process.env.PAYPAL_MODE?.trim() || 'sandbox') as 'sandbox' | 'live',
}));
