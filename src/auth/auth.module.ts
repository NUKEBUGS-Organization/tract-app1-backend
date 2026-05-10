import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';


import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';

import { User, UserSchema } from '../users/schemas/user.schema';

import { SessionsModule } from '../sessions/sessions.module';
import { MailModule } from '../mail/mail.module';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({}),

    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),

    SessionsModule, 
    MailModule,      
    SmsModule,      
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy
  ],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
