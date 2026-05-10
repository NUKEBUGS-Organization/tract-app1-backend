import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  uri: process.env.MONGODB_URI,
  name: process.env.MONGODB_DB_NAME,
}));
