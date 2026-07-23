import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET?.trim();
  const refreshSecret = process.env.JWT_REFRESH_SECRET?.trim();

  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  if (!refreshSecret) {
    throw new Error('JWT_REFRESH_SECRET is required');
  }

  return {
    secret,
    refreshSecret,
    accessExpiry: '15m',
    refreshExpiry: '7d',
  };
});
