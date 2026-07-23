import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  UserDocument,
  APP1_ALLOWED_ROLES,
  Role,
  KycStatus,
} from '../users/schemas/user.schema';
import { Session, SessionDocument } from '../sessions/schemas/session.schema';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { OtpService } from './otp.service';
import { RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private jwtService: JwtService,
    private mailService: MailService,
    private smsService: SmsService,
    private otpService: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      const email = dto.email.toLowerCase().trim();
      const exists = await this.userModel.findOne({
        $or: [{ email }, { phone: dto.phone }],
      });
      if (exists) {
        throw new BadRequestException('Email or phone already registered');
      }

      if (!APP1_ALLOWED_ROLES.includes(dto.role)) {
        throw new BadRequestException('Role is not allowed on App 1');
      }

      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

      await this.userModel.create({
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        stateCode: dto.stateCode.toUpperCase().trim(),
        dob: new Date(dto.dob),
        kycStatus: KycStatus.PENDING,
      });

      await this.sendOtp(email, 'login');

      return {
        message:
          'Registered successfully. An OTP has been sent to your email and phone to verify your account.',
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Registration failed. Please try again.',
      );
    }
  }

  async sendOtp(email: string, purpose: 'login' | 'forgot_password') {
    try {
      const normalized = email.toLowerCase().trim();
      const user = await this.userModel.findOne({ email: normalized });

      if (!user && purpose === 'forgot_password') {
        return { message: 'If that email exists, an OTP was sent.' };
      }
      if (!user) throw new BadRequestException('User not found');
      if (user.isBanned) {
        throw new ForbiddenException(
          'Account is banned: ' + (user.banReason ?? ''),
        );
      }

      const otp = this.otpService.generate();
      await this.otpService.storeEmailOtp(normalized, purpose, otp);

      await Promise.all([
        this.mailService.sendOtp(user.email, otp, purpose),
        // this.smsService.sendOtp(user.phone, otp, purpose),
      ]);

      return { message: 'OTP sent to your email and phone.' };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to send OTP. Please try again. ${error}`,
      );
    }
  }

  async login(email: string, password: string) {
    try {
      const normalized = email.toLowerCase().trim();
      const user = await this.userModel
        .findOne({ email: normalized })
        .select('+passwordHash');

      if (!user) throw new UnauthorizedException('Invalid credentials');
      if (user.isBanned) {
        throw new ForbiddenException(
          'Account is banned: ' + (user.banReason ?? ''),
        );
      }
      if (!APP1_ALLOWED_ROLES.includes(user.role as Role)) {
        throw new ForbiddenException('This account cannot access App 1');
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      await this.sendOtp(normalized, 'login');

      return { message: '2FA OTP sent. Please verify to complete login.' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Login failed. Please try again. ${error}`,
      );
    }
  }

  async verifyOtp(email: string, otp: string, purpose: string) {
    try {
      const normalized = email.toLowerCase().trim();
      const user = await this.userModel.findOne({ email: normalized });
      if (!user) {
        throw new BadRequestException('Invalid request');
      }

      const allowed = await this.otpService.checkAndIncrementAttempts(
        normalized,
        purpose,
      );
      if (!allowed) {
        throw new BadRequestException('Too many OTP attempts. Try again later.');
      }

      const valid = await this.otpService.verifyEmailOtp(
        normalized,
        purpose,
        otp,
      );
      if (!valid) throw new BadRequestException('Invalid OTP');

      await this.otpService.clearAttempts(normalized, purpose);
      await this.userModel.findByIdAndUpdate(user._id, {
        lastActiveAt: new Date(),
      });

      if (purpose === 'login') {
        return this.createSession(user);
      }

      const resetToken = this.jwtService.sign(
        { sub: user._id, purpose: 'reset' },
        { secret: process.env.JWT_SECRET, expiresIn: '10m' },
      );
      return { resetToken };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'OTP verification failed. Please try again.',
      );
    }
  }

  async refreshTokens(refreshToken: string) {
    let payload: any;

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    try {
      const session = await this.sessionModel.findOne({
        sessionId: payload.sessionId,
        isBlacklisted: false,
      });
      if (!session) throw new UnauthorizedException('Session revoked');

      const hashMatch = await bcrypt.compare(
        refreshToken,
        session.refreshTokenHash,
      );
      if (!hashMatch) throw new UnauthorizedException('Invalid refresh token');

      const user = await this.userModel.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      if (!APP1_ALLOWED_ROLES.includes(user.role as Role)) {
        throw new ForbiddenException('This account cannot access App 1');
      }

      await this.sessionModel.findByIdAndUpdate(session._id, {
        isBlacklisted: true,
      });

      return this.createSession(user);
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Token refresh failed. Please log in again.',
      );
    }
  }

  async logout(sessionId: string) {
    try {
      await this.sessionModel.updateOne(
        { sessionId: sessionId },
        { isBlacklisted: true },
      );
      return { message: 'Logged out successfully' };
    } catch {
      throw new InternalServerErrorException(
        'Logout failed. Please try again.',
      );
    }
  }

  async resetPassword(resetToken: string, newPassword: string) {
    let payload: any;

    try {
      payload = this.jwtService.verify(resetToken, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Reset token expired');
    }

    if (payload.purpose !== 'reset') {
      throw new UnauthorizedException('Invalid reset token');
    }

    try {
      const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await this.userModel.findByIdAndUpdate(payload.sub, {
        passwordHash: hashed,
        currentSessionId: null,
      });

      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { isBlacklisted: true },
      );

      return { message: 'Password reset successful. Please login again.' };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Password reset failed. Please try again.',
      );
    }
  }

  async initiateKyc(userId: string) {
    try {
      const clientId = process.env.JUMIO_API_KEY;
      const clientSecret = process.env.JUMIO_API_SECRET;

      if (!clientId || !clientSecret) {
        throw new InternalServerErrorException(
          'KYC configuration credentials missing',
        );
      }

      const apiPublicUrl = process.env.API_PUBLIC_URL?.trim().replace(/\/$/, '');
      if (!apiPublicUrl) {
        throw new InternalServerErrorException(
          'API_PUBLIC_URL is required for Jumio KYC callback',
        );
      }

      const authString = Buffer.from(`${clientId}:${clientSecret}`).toString(
        'base64',
      );

      const jumioResponse = await fetch(
        'https://auth.sandbox.amer-1.jumio.ai/oauth2/token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${authString}`,
          },
          body: 'grant_type=client_credentials',
        },
      );

      if (!jumioResponse.ok) {
        throw new InternalServerErrorException(
          `Jumio Auth failed: ${jumioResponse.statusText}`,
        );
      }

      const data = await jumioResponse.json();

      if (!data.access_token) {
        throw new InternalServerErrorException('No Access Token found');
      }

      await this.userModel.findByIdAndUpdate(userId, {
        kycStatus: KycStatus.IN_PROGRESS,
      });

      const sessionResponse = await fetch(
        'https://account.sandbox.amer-1.jumio.ai/api/v1/accounts',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.access_token}`,
          },
          body: JSON.stringify({
            customerInternalReference: userId,
            callbackUrl: apiPublicUrl,
            workflowDefinition: {
              key: 10547,
            },
          }),
        },
      );

      if (!sessionResponse.ok) {
        const errBody = await sessionResponse.json().catch(() => ({}));
        throw new InternalServerErrorException(
          `Jumio Session failed: ${sessionResponse.statusText}. ${JSON.stringify(errBody)}`,
        );
      }

      const sessionData = await sessionResponse.json();
      const reactSdkToken = sessionData?.sdk?.token;

      if (!reactSdkToken) {
        throw new InternalServerErrorException(
          'SDK token missing from Jumio response',
        );
      }

      return { kycAccessToken: reactSdkToken };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to initiate KYC session: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async handleKycWebhook(payload: any) {
    try {
      const userId = payload?.account?.customerInternalReference;
      const workflowStatus = payload?.workflow?.status;

      if (!userId) {
        throw new BadRequestException(
          'Missing customerId in KYC webhook payload',
        );
      }

      const kycStatus =
        workflowStatus === 'PASSED' ? KycStatus.APPROVED : KycStatus.REJECTED;

      await this.userModel.findByIdAndUpdate(userId, {
        kycStatus,
        kycVerifiedAt: kycStatus === KycStatus.APPROVED ? new Date() : null,
        kycProvider: 'jumio',
      });

      return { received: true };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to process KYC webhook.');
    }
  }

  private async createSession(user: UserDocument) {
    try {
      await this.sessionModel.updateMany(
        { userId: user._id, isBlacklisted: false },
        { isBlacklisted: true },
      );

      const sessionId = uuidv4();
      const payload = {
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        sessionId,
      };

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(payload, {
          secret: process.env.JWT_SECRET,
          expiresIn: '15m',
        }),
        this.jwtService.signAsync(payload, {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: '7d',
        }),
      ]);

      const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);

      await this.sessionModel.create({
        userId: user._id,
        sessionId,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await this.userModel.findByIdAndUpdate(user._id, {
        currentSessionId: sessionId,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          phone: user.phone,
          role: user.role,
          fullName: user.fullName,
          stateCode: user.stateCode,
          kycStatus: user.kycStatus ?? KycStatus.PENDING,
          bankVerified: user.bankVerified ?? false,
          reliabilityScore: user.reliabilityScore,
          professionalScore: user.professionalScore,
          isBanned: user.isBanned,
        },
      };
    } catch {
      throw new InternalServerErrorException(
        'Session creation failed. Please try again.',
      );
    }
  }
}
