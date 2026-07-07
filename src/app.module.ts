import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import smsConfig from './config/sms.config';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        mailConfig,
        smsConfig
      ],
      envFilePath: '.env',
      cache: true
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 10,  
    }]),
    DatabaseModule,
    AuthModule,
    AdminModule,
    UsersModule,
    ListingsModule,
    BidsModule,
    ContractsModule,
    DealsModule,
    ChatModule,
    SessionsModule,
    MailModule,
    SmsModule,
    NotificationsModule
  ],
  controllers: [AppController],
  providers: [AppService, {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },],
})
export class AppModule {}
