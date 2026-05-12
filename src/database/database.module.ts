import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

const onVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        ...(onVercel
          ? {
              lazyConnection: true,
              retryAttempts: 4,
              retryDelay: 1500,
              serverSelectionTimeoutMS: 12_000,
              maxPoolSize: 10,
            }
          : {}),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}