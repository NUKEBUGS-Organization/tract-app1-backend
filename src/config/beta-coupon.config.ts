import { registerAs } from '@nestjs/config';

export default registerAs('betaCoupon', () => ({
  code: process.env.BETA_COUPON_CODE?.trim() ?? '',
  freeUntil: process.env.BETA_COUPON_FREE_UNTIL?.trim() ?? '',
  description:
    process.env.BETA_COUPON_DESCRIPTION?.trim() ||
    'Beta access - no subscription fee',
  maxRedemptions: (() => {
    const raw = process.env.BETA_COUPON_MAX_REDEMPTIONS?.trim();
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  })(),
  allowedRoles: (process.env.BETA_COUPON_ROLES ?? '')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean),
}));
