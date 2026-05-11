import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  ResetPasswordDto,
} from './dto/auth.dto';

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
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp, dto.purpose);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email/password + triggers 2FA OTP' })
  @ApiResponse({ status: 200, description: '2FA OTP sent to email and phone' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'New tokens issued' })
  @ApiResponse({ status: 401, description: 'Refresh token expired or invalid' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refresh_token);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke current session token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(@Request() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.sessionId);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using reset token from verify-otp' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 401, description: 'Reset token expired' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.reset_token, dto.new_password);
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
  @ApiOperation({
    summary: 'Jumio callback to update user verification status',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  kycWebhook(@Body() payload: any) {
    return this.authService.handleKycWebhook(payload);
  }
}
