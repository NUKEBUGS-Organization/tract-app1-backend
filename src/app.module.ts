import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { AppController } from './app.controller';
import { AppService } from './app.service';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import smsConfig from './config/sms.config';

import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SessionsModule } from './sessions/sessions.module';
import { MailModule } from './mail/mail.module';
import { SmsModule } from './sms/sms.module';

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
    DatabaseModule,
    AuthModule,
    UsersModule,
    SessionsModule,
    MailModule,
    SmsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
