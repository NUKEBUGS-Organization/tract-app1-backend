import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

@Injectable()
export class MailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendOtp(email: string, otp: string, purpose: 'login' | 'forgot_password'): Promise<void> {
    const isLogin = purpose === 'login';

    const html = this.renderTemplate(isLogin ? 'otp-login' : 'otp-reset-password', {
      otp,
      expiryMinutes: 10,
      year: new Date().getFullYear(),
    });

    try {
      const { error } = await this.resend.emails.send({
        from: process.env.MAIL_FROM ?? 'no-reply@yourdomain.com',
        to: email,
        subject: isLogin ? 'Your Login Verification Code' : 'Password Reset Request',
        html,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error) {
      throw new InternalServerErrorException(
        isLogin ? 'Failed to send login OTP email' : 'Failed to send password reset OTP email',
      );
    }
  }

  private renderTemplate(templateName: string, context: Record<string, unknown>): string {
    const templatePath = path.join(process.cwd(), 'src', 'mail', 'templates', `${templateName}.hbs`);
    const source = fs.readFileSync(templatePath, 'utf8');
    const compiled = Handlebars.compile(source);
    return compiled(context);
  }
}