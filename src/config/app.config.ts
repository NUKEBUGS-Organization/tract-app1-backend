import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT!, 10) || 3000,
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
}));