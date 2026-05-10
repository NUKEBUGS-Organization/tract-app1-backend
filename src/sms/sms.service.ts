import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class SmsService {
  private readonly client: twilio.Twilio;
  private readonly fromNumber: string;
  private readonly logger = new Logger(SmsService.name);

  constructor(private config: ConfigService) {
    const accountSid = this.config.get<string>('sms.accountSid');
    const authToken = this.config.get<string>('sms.authToken');
    const fromNumber = this.config.get<string>('sms.fromNumber');

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Missing Twilio config in .env');
    }

    this.client = twilio(accountSid, authToken);
    this.fromNumber = fromNumber;
  }

  async sendOtp(phone: string, otp: string, purpose: 'login' | 'forgot_password'): Promise<void> {
    const message =
      purpose === 'login'
        ? `Your TractApp login code is: ${otp}. Valid for 10 minutes. Do not share this code.`
        : `Your TractApp password reset code is: ${otp}. Valid for 10 minutes. If you did not request this, ignore this message.`;

    await this.send(phone, message);
  }

  private async send(to: string, body: string): Promise<void> {
    try {
      await this.client.messages.create({
        from: this.fromNumber,
        to,
        body,
      });
    } catch (error) {
      this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
      throw new InternalServerErrorException('Failed to send SMS');
    }
  }
}