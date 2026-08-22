import {
  ConflictException,
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
import { randomBytes } from 'crypto';
import {
  User,
  UserDocument,
  APP1_ALLOWED_ROLES,
  APP1_REGISTER_ROLES,
  AuthProvider,
  KycStatus,
} from '../users/schemas/user.schema';
import { Session, SessionDocument } from '../sessions/schemas/session.schema';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { OtpService } from './otp.service';
import { RegisterDto, LoginDto, GoogleCompleteDto } from './dto/auth.dto';
import type { GoogleProfilePayload } from './strategies/google.strategy';

const BCRYPT_ROUNDS = 12;
/** Concurrent refresh grace — sibling apps/tabs that race rotation get TOKEN_ROTATED. */
const REFRESH_ROTATION_GRACE_MS = 30_000;
/** google_signup JWT lifetime — user must finish the completion form within this window. */
const GOOGLE_SIGNUP_TOKEN_TTL = '10m';

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
        authProvider: AuthProvider.PASSWORD,
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

  async login(dto: LoginDto) {
    try {
      const normalized = dto.email.toLowerCase().trim();
      const user = await this.userModel
        .findOne({ email: normalized })
        .select('+passwordHash');

      if (!user) throw new UnauthorizedException('Invalid credentials');
      if (user.isBanned) {
        throw new ForbiddenException(
          'Account is banned: ' + (user.banReason ?? ''),
        );
      }
      if (!APP1_ALLOWED_ROLES.includes(user.role)) {
        throw new ForbiddenException('This account cannot access App 1');
      }

      const valid = await bcrypt.compare(dto.password, user.passwordHash);
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

  // ─── Google OAuth (redirect flow — mirrors App 2 exactly, shared schema) ──

  // Called from the /auth/google/callback route once Passport has verified
  // the OAuth code and handed back the Google profile. Returns either a
  // ready session (existing, complete account) or a short-lived signup
  // token the frontend carries to the "finish signing up" page.
  async handleGoogleAuth(profile: GoogleProfilePayload) {
    const email = profile.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash');

    if (user) {
      if (user.isBanned) {
        throw new ForbiddenException(
          'Account is banned: ' + (user.banReason ?? ''),
        );
      }
      if (!APP1_ALLOWED_ROLES.includes(user.role)) {
        throw new ForbiddenException('This account cannot access App 1');
      }

      // Shared schema requires phone — an account missing it isn't usable
      // yet, so route through the same completion flow as a brand-new user.
      if (!user.phone) {
        return {
          mode: 'signup' as const,
          signupToken: this.signGoogleSignupToken(profile),
        };
      }

      if (!user.googleId) {
        // Link via findByIdAndUpdate, never `.save()` on a doc fetched
        // without +passwordHash re-selected everywhere — a naked save()
        // here can trip the required passwordHash/phone validators.
        await this.userModel.findByIdAndUpdate(user._id, {
          googleId: profile.googleId,
        });
      }

      const session = await this.createSession(user);
      return { mode: 'login' as const, session };
    }

    return {
      mode: 'signup' as const,
      signupToken: this.signGoogleSignupToken(profile),
    };
  }

  private signGoogleSignupToken(profile: GoogleProfilePayload): string {
    return this.jwtService.sign(
      {
        purpose: 'google_signup',
        googleId: profile.googleId,
        email: profile.email,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl ?? null,
      },
      { secret: process.env.JWT_SECRET, expiresIn: GOOGLE_SIGNUP_TOKEN_TTL },
    );
  }

  // Finishes a Google sign-up: verifies the google_signup token from the
  // callback redirect, then creates (or completes) the user with the
  // phone/role/stateCode/dob the completion form collected. No OTP step —
  // the Google account itself is the verified auth factor.
  async completeGoogleSignup(dto: GoogleCompleteDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        'Signup session expired. Please sign in with Google again.',
      );
    }

    if (payload?.purpose !== 'google_signup') {
      throw new UnauthorizedException('Invalid signup token');
    }

    if (!APP1_REGISTER_ROLES.includes(dto.role)) {
      throw new BadRequestException(
        'Role must be one of: seller, wholesaler, realtor',
      );
    }

    const email = String(payload.email).toLowerCase().trim();
    const existing = await this.userModel
      .findOne({ email })
      .select('+passwordHash');

    let user: UserDocument | null;

    if (existing) {
      if (existing.phone) {
        throw new ConflictException(
          'An account already exists for this email — please sign in instead',
        );
      }

      user = await this.userModel.findByIdAndUpdate(
        existing._id,
        {
          phone: dto.phone,
          role: dto.role,
          stateCode: dto.stateCode.toUpperCase().trim(),
          dob: new Date(dto.dob),
          googleId: payload.googleId,
          authProvider: AuthProvider.GOOGLE,
        },
        { new: true },
      );
    } else {
      // passwordHash stays required on the shared schema — the user never
      // sees or uses this, they always authenticate via Google.
      const passwordHash = await bcrypt.hash(
        randomBytes(32).toString('hex'),
        BCRYPT_ROUNDS,
      );

      user = await this.userModel.create({
        fullName: payload.fullName,
        email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        stateCode: dto.stateCode.toUpperCase().trim(),
        dob: new Date(dto.dob),
        kycStatus: KycStatus.PENDING,
        authProvider: AuthProvider.GOOGLE,
        googleId: payload.googleId,
      });
    }

    if (!user) {
      throw new InternalServerErrorException(
        'Failed to complete Google sign-up. Please try again.',
      );
    }

    return this.createSession(user);
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
        throw new BadRequestException(
          'Too many OTP attempts. Try again later.',
        );
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
      });
      if (!session) throw new UnauthorizedException('Session revoked');

      const hashMatch = await bcrypt.compare(
        refreshToken,
        session.refreshTokenHash,
      );
      if (!hashMatch) throw new UnauthorizedException('Invalid refresh token');

      if (session.isBlacklisted) {
        const rotatedAt = session.blacklistedAt?.getTime?.()
          ? session.blacklistedAt.getTime()
          : 0;
        // Only concurrent rotation (has rotatedTo) is retryable — not explicit logout.
        if (
          session.rotatedTo &&
          rotatedAt &&
          Date.now() - rotatedAt < REFRESH_ROTATION_GRACE_MS
        ) {
          throw new UnauthorizedException({
            message:
              'Refresh token was rotated by a concurrent request. Retry shortly.',
            code: 'TOKEN_ROTATED',
          });
        }
        throw new UnauthorizedException('Session revoked');
      }

      const user = await this.userModel.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');
      if (!APP1_ALLOWED_ROLES.includes(user.role)) {
        throw new ForbiddenException('This account cannot access App 1');
      }

      return this.createSession(user, { rotatingFrom: session });
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
        {
          isBlacklisted: true,
          blacklistedAt: new Date(),
          rotatedTo: null,
        },
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
        {
          isBlacklisted: true,
          blacklistedAt: new Date(),
          rotatedTo: null,
        },
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

      const apiPublicUrl = process.env.API_PUBLIC_URL?.trim().replace(
        /\/$/,
        '',
      );
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

  private async createSession(
    user: UserDocument,
    options?: { rotatingFrom?: SessionDocument },
  ) {
    try {
      const rotatingFrom = options?.rotatingFrom;

      if (!rotatingFrom) {
        await this.sessionModel.updateMany(
          { userId: user._id, isBlacklisted: false },
          {
            isBlacklisted: true,
            blacklistedAt: new Date(),
            rotatedTo: null,
          },
        );
      }

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

      if (rotatingFrom) {
        const claimed = await this.sessionModel.findOneAndUpdate(
          { _id: rotatingFrom._id, isBlacklisted: false },
          {
            isBlacklisted: true,
            blacklistedAt: new Date(),
            rotatedTo: sessionId,
          },
          { new: true },
        );

        if (!claimed) {
          await this.sessionModel.deleteOne({ sessionId });
          throw new UnauthorizedException({
            message:
              'Refresh token was rotated by a concurrent request. Retry shortly.',
            code: 'TOKEN_ROTATED',
          });
        }
      }

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
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Session creation failed. Please try again.',
      );
    }
  }
}
