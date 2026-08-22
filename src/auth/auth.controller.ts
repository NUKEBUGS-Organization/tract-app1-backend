import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request as ExpressRequest, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';
import { HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import type { GoogleProfilePayload } from './strategies/google.strategy';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  ResetPasswordDto,
  GoogleCompleteDto,
} from './dto/auth.dto';

interface GoogleAuthenticatedRequest extends ExpressRequest {
  user: GoogleProfilePayload;
}

/** SPA origin Google OAuth redirects land on. Reuses APP_URL (already the
 * canonical frontend origin, e.g. for Jumio/mail links) rather than adding
 * a second env var for the same concept. */
function frontendUrl(): string {
  return (process.env.APP_URL ?? '').trim().replace(/\/$/, '');
}

const isProd = process.env.NODE_ENV === 'production';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
  ...(isProd ? { domain: '.tractcorp.com' } : {}),
};

const CLEAR_REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  ...(isProd ? { domain: '.tractcorp.com' } : {}),
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register user with name, DOB, email, phone, role, and state',
  })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({
    status: 400,
    description: 'Email or phone already registered',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('send-otp')
  @ApiOperation({ summary: 'Trigger 2FA OTP to phone + email' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.email, dto.purpose);
  }

  @Post('verify-otp')
  @ApiOperation({
    summary: 'Validate OTP code; issue JWT access + refresh tokens',
  })
  @ApiResponse({ status: 200, description: 'OTP verified, tokens issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(
      dto.email,
      dto.otp,
      dto.purpose,
    );

    if (result && 'refreshToken' in result && result.refreshToken) {
      res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
      const { refreshToken: _refreshToken, ...body } = result;
      return body;
    }

    return result;
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email/password + triggers 2FA OTP' })
  @ApiResponse({ status: 200, description: '2FA OTP sent to email and phone' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({
    summary:
      'Refresh access token using httpOnly cookie (body refreshToken fallback for one release)',
  })
  @ApiResponse({ status: 200, description: 'New tokens issued' })
  @ApiResponse({ status: 401, description: 'Refresh token expired or invalid' })
  async refresh(
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: RefreshTokenDto,
  ) {
    const token =
      (req.cookies?.refreshToken as string | undefined) || dto.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Session expired. Please log in.');
    }

    const result = await this.authService.refreshTokens(token);
    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke current session token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logout(req.user.sessionId);
    res.clearCookie('refreshToken', CLEAR_REFRESH_COOKIE_OPTIONS);
    return result;
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using reset token from verify-otp' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 401, description: 'Reset token expired' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }

  // ─── Google OAuth (redirect flow) ────────────────────────────────────────
  // Mirrors App 2's implementation exactly since both share the `users`
  // collection: GET /google starts the redirect, GET /google/callback lands
  // an existing user in a session or bounces a new one to the frontend's
  // signup-completion page, POST /google/complete finishes that signup.

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  googleAuth() {
    // Passport intercepts this request and redirects to Google's consent
    // screen before this body ever runs.
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()
  async googleCallback(
    @Request() req: GoogleAuthenticatedRequest,
    @Res() res: Response,
  ) {
    const base = frontendUrl();

    try {
      const result = await this.authService.handleGoogleAuth(req.user);

      if (result.mode === 'login') {
        res.cookie(
          'refreshToken',
          result.session.refreshToken,
          REFRESH_COOKIE_OPTIONS,
        );
        res.redirect(`${base}/auth/google/callback?status=success`);
        return;
      }

      const params = new URLSearchParams({
        token: result.signupToken,
        email: req.user.email,
        fullName: req.user.fullName,
      });
      res.redirect(`${base}/register/google-complete?${params.toString()}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Google sign-in failed';
      res.redirect(`${base}/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('google/complete')
  @ApiOperation({
    summary:
      'Finish a Google sign-up with role/phone/dob/stateCode + the signup token from the callback redirect',
  })
  @ApiResponse({ status: 201, description: 'Account created, session issued' })
  @ApiResponse({ status: 409, description: 'Account already exists' })
  async completeGoogleSignup(
    @Body() dto: GoogleCompleteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completeGoogleSignup(dto);
    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    const { refreshToken: _refreshToken, ...body } = result;
    return body;
  }

  @Post('kyc/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Generate Jumio session URL for ID + face verification',
  })
  @ApiResponse({ status: 200, description: 'Jumio KYC session URL returned' })
  initiateKyc(@Request() req: AuthenticatedRequest) {
    return this.authService.initiateKyc(req.user._id);
  }

  @Post('kyc/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Jumio callback to update user verification status',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  kycWebhook(@Body() payload: any) {
    return this.authService.handleKycWebhook(payload);
  }
}
