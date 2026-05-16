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
import { User, UserDocument } from '../users/schemas/user.schema';
import { Session, SessionDocument } from '../sessions/schemas/session.schema';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private jwtService: JwtService,
    private mailService: MailService,
    private smsService: SmsService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      const exists = await this.userModel.findOne({
        $or: [{ email: dto.email }, { phone: dto.phone }],
      });
      if (exists) {
        throw new BadRequestException('Email or phone already registered');
      }

      const password_hash = await bcrypt.hash(dto.password, 10);

      await this.userModel.create({ ...dto, password_hash });

      await this.sendOtp(dto.email, 'login');

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
      const user = await this.userModel.findOne({ email });

      // For security: don't reveal if email exists for forgot_password
      if (!user && purpose === 'forgot_password') {
        return { message: 'If that email exists, an OTP was sent.' };
      }
      if (!user) throw new BadRequestException('User not found');
      if (user.is_banned) {
        throw new ForbiddenException('Account is banned: ' + user.ban_reason);
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otp_code = await bcrypt.hash(otp, 10);

      await this.userModel.findByIdAndUpdate(user._id, {
        otp_code,
        otp_purpose: purpose,
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      });

      // Send to both phone AND email
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
        'Failed to send OTP. Please try again.',
      );
    }
  }

  // ─── LOGIN (step 1: validate password, step 2: trigger OTP) ──────────────
  async login(email: string, password: string) {
    try {
      const user = await this.userModel
        .findOne({ email })
        .select('+password_hash');

      if (!user) throw new UnauthorizedException('Invalid credentials');
      if (user.is_banned) {
        throw new ForbiddenException('Account is banned: ' + user.ban_reason);
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      // Trigger 2FA OTP
      await this.sendOtp(email, 'login');

      return { message: '2FA OTP sent. Please verify to complete login.' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Login failed. Please try again.',
      );
    }
  }

  async verifyOtp(email: string, otp: string, purpose: string) {
    try {
      const user = await this.userModel.findOne({ email });
      if (!user || !user.otp_code) {
        throw new BadRequestException('Invalid request');
      }

      if (user.otp_purpose !== purpose) {
        throw new BadRequestException('OTP purpose mismatch');
      }
      if (new Date() > user.otp_expires_at) {
        throw new BadRequestException('OTP has expired');
      }

      const valid = await bcrypt.compare(otp, user.otp_code);
      if (!valid) throw new BadRequestException('Invalid OTP');

      // Clear OTP
      await this.userModel.findByIdAndUpdate(user._id, {
        otp_code: null,
        otp_expires_at: null,
        otp_purpose: null,
        last_active_at: new Date(),
      });

      if (purpose === 'login') {
        return this.createSession(user);
      }

      // For forgot_password: return a short-lived reset token instead
      const resetToken = this.jwtService.sign(
        { sub: user._id, purpose: 'reset' },
        { secret: process.env.JWT_SECRET, expiresIn: '10m' },
      );
      return { reset_token: resetToken };
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
      // Find session by session_id in payload, check not blacklisted
      const session = await this.sessionModel.findOne({
        session_id: payload.sessionId,
        is_blacklisted: false,
      });
      if (!session) throw new UnauthorizedException('Session revoked');

      // Verify refresh token hash matches
      const hashMatch = await bcrypt.compare(
        refreshToken,
        session.refresh_token_hash,
      );
      if (!hashMatch) throw new UnauthorizedException('Invalid refresh token');

      const user = await this.userModel.findById(payload.sub);
      if (!user) throw new UnauthorizedException('User not found');

      // Rotate: blacklist old session, create new
      await this.sessionModel.findByIdAndUpdate(session._id, {
        is_blacklisted: true,
      });

      return this.createSession(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
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
        { session_id: sessionId },
        { is_blacklisted: true },
      );
      return { message: 'Logged out successfully' };
    } catch {
      throw new InternalServerErrorException(
        'Logout failed. Please try again.',
      );
    }
  }

  async resetPassword(reset_token: string, new_password: string) {
    let payload: any;

    try {
      payload = this.jwtService.verify(reset_token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Reset token expired');
    }

    if (payload.purpose !== 'reset') {
      throw new UnauthorizedException('Invalid reset token');
    }

    try {
      const hashed = await bcrypt.hash(new_password, 10);

      await this.userModel.findByIdAndUpdate(payload.sub, {
        password_hash: hashed,
        current_session_id: null,
      });

      // Blacklist all sessions — force re-login everywhere
      await this.sessionModel.updateMany(
        { userId: payload.sub },
        { is_blacklisted: true },
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

  // ─── KYC: Initiate Jumio Session ─────────────────────────────────────────
  async initiateKyc(userId: string) {
     try {
      const clientId = process.env.JUMIO_API_KEY;
      const clientSecret = process.env.JUMIO_API_SECRET;
  
      if (!clientId || !clientSecret) {
        throw new InternalServerErrorException('KYC configuration credentials missing');
      }
  
      // Node-safe Base64 encoding
      const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
      // 1. Fetch OAuth Token
      const jumioResponse = await fetch(
        'https://auth.sandbox.amer-1.jumio.ai/oauth2/token',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authString}`
          },
          body: 'grant_type=client_credentials'
        },
      );
  
      if (!jumioResponse.ok) {
        throw new InternalServerErrorException(
          `Jumio Auth failed: ${jumioResponse.statusText}`,
        );
      }
  
      const data = await jumioResponse.json();
  
      // FIXED: Use snake_case as returned by OAuth2 standards
      if (!data.access_token) {
        throw new InternalServerErrorException('No Access Token found');
      }
  
      // 2. Create Account Session
      const sessionResponse = await fetch(
        'https://account.sandbox.amer-1.jumio.ai/api/v1/accounts',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.access_token}` // FIXED: token variable case
          },
          body: JSON.stringify({
            customerInternalReference: userId,
            callbackUrl : "https://tract-app1-backend.onrender.com", // replace with render url
            workflowDefinition: { 
              key: 10547 
            }
          })
        },
      );
  
      // ADDED: Error validation for the account creation endpoint
      if (!sessionResponse.ok) {
        const errBody = await sessionResponse.json().catch(() => ({}));
        throw new InternalServerErrorException(
          `Jumio Session failed: ${sessionResponse.statusText}. ${JSON.stringify(errBody)}`,
        );
      }
  
      const sessionData = await sessionResponse.json();
      
      // ADDED: Optional chaining protection against unexpected schema modifications
      const reactSdkToken = sessionData?.sdk?.token; 
  
      if (!reactSdkToken) {
        throw new InternalServerErrorException('SDK token missing from Jumio response');
      }
  
      return { kyc_access_token: reactSdkToken };
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
        throw new BadRequestException('Missing customerId in KYC webhook payload');
      }

      let kyc_status: 'verified' | 'rejected' = 'rejected';
      if (workflowStatus === 'PASSED') {
        kyc_status = 'verified';
      }

      await this.userModel.findByIdAndUpdate(userId, { kyc_status });

      return { received: true };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to process KYC webhook.',
      );
    }
  }

  private async createSession(user: UserDocument) {
    try {
      // ✦ SINGLE-SESSION: blacklist all previous active sessions
      await this.sessionModel.updateMany(
        { userId: user._id, is_blacklisted: false },
        { is_blacklisted: true },
      );

      const session_id = uuidv4();
      const payload = {
        sub: user._id,
        email: user.email,
        role: user.role,
        sessionId: session_id,
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

      // Store hashed refresh token (never raw)
      const refresh_token_hash = await bcrypt.hash(refreshToken, 10);

      await this.sessionModel.create({
        userId: user._id,
        session_id,
        refresh_token_hash,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await this.userModel.findByIdAndUpdate(user._id, {
        current_session_id: session_id,
      });

      return { access_token: accessToken, refresh_token: refreshToken };
    } catch {
      throw new InternalServerErrorException(
        'Session creation failed. Please try again.',
      );
    }
  }
}