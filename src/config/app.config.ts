import { registerAs } from '@nestjs/config';
import { parseCorsOrigins } from '../common/utils/cors-origins';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT!, 10) || 3000,
  origins: parseCorsOrigins(process.env.ALLOWED_ORIGINS, 'ALLOWED_ORIGINS'),
}));
