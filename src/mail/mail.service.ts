import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private mailerService: MailerService) {}

  async sendOtp(email: string, otp: string, purpose: 'login' | 'forgot_password'): Promise<void> {
    const isLogin = purpose === 'login';

    try {
      await this.mailerService.sendMail({
        to: email,
        subject: isLogin ? 'Your Login Verification Code' : 'Password Reset Request',
        template: isLogin ? 'otp-login' : 'otp-reset-password',
        context: {
          otp,
          expiryMinutes: 10,
          year: new Date().getFullYear(),
        },
      });
    } catch (error) {
      throw new InternalServerErrorException(
        isLogin ? 'Failed to send login OTP email' : 'Failed to send password reset OTP email',
      );
    }
  }
}