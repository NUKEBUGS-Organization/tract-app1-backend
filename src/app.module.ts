import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import smsConfig from './config/sms.config';
import paypalConfig from './config/paypal.config';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ListingsModule } from './listings/listings.module';
import { BidsModule } from './bids/bids.module';
import { SessionsModule } from './sessions/sessions.module';
import { MailModule } from './mail/mail.module';
import { SmsModule } from './sms/sms.module';
import { ContractsModule } from './contracts/contract.module';
import { DealsModule } from './deals/deals.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VerificationsModule } from './verifications/verifications.module';
import { ScoreModule } from './score/score.module';
import { PropertyDataModule } from './property-data/property-data.module';
import { PaymentsModule } from './payments/payments.module';
import { TicketsModule } from './tickets/tickets.module';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        mailConfig,
        smsConfig,
        paypalConfig,
      ],
      envFilePath: '.env',
      cache: true
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,
    }]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    UsersModule,
    ListingsModule,
    BidsModule,
    VerificationsModule,
    ContractsModule,
    DealsModule,
    ChatModule,
    SessionsModule,
    MailModule,
    SmsModule,
    NotificationsModule,
    ScoreModule,
    PropertyDataModule,
    PaymentsModule,
    TicketsModule,
  ],
  controllers: [AppController],
  providers: [AppService, {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },],
})
export class AppModule {}
