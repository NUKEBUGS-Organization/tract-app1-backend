import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { NotificationType } from '../notifications/schemas/notification.schema';

// ── Register Handlebars helpers ───────────────────────────────────────────────
Handlebars.registerHelper('formatNumber', (value: number) => {
  if (value == null) return '0';
  return Number(value).toLocaleString('en-US');
});
Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
Handlebars.registerHelper('gte', (a: number, b: number) => a >= b);
Handlebars.registerHelper('currentYear', () =>
  new Date().getFullYear().toString(),
);

// ── Template + subject maps ───────────────────────────────────────────────────
const NOTIFICATION_TEMPLATE_MAP: Partial<Record<NotificationType, string>> = {
  [NotificationType.LISTING_LIVE]: 'listing-live',
  [NotificationType.LISTING_NEEDS_INFO]: 'listing-needs-info',
  [NotificationType.LISTING_BID_RECEIVED]: 'bid-received',
  [NotificationType.LISTING_BID_CAP_REACHED]: 'bid-cap-reached',
  [NotificationType.BID_SELECTED]: 'bid-selected',
  [NotificationType.BID_REJECTED]: 'bid-rejected',
  [NotificationType.CONTRACT_READY]: 'contract-ready',
  [NotificationType.CONTRACT_EXECUTED]: 'contract-executed',
  [NotificationType.DEAL_CLOSED]: 'deal-closed',
  [NotificationType.DEAL_UNDER_REVIEW]: 'deal-milestone',
  [NotificationType.DEAL_PROCEEDING]: 'deal-milestone',
  [NotificationType.DEAL_CANCELLED]: 'deal-milestone',
  [NotificationType.CHAT_NEW_MESSAGE]: 'chat-message',
};

const NOTIFICATION_SUBJECT_MAP: Partial<Record<NotificationType, string>> = {
  [NotificationType.LISTING_LIVE]: 'Your listing is now live on TRACT',
  [NotificationType.LISTING_NEEDS_INFO]: 'Action required — your TRACT listing',
  [NotificationType.LISTING_BID_RECEIVED]:
    'New offer received on your property',
  [NotificationType.LISTING_BID_CAP_REACHED]:
    'Maximum offers reached — review now',
  [NotificationType.BID_SELECTED]: 'Your offer has been accepted!',
  [NotificationType.BID_REJECTED]: 'Update on your offer',
  [NotificationType.CONTRACT_READY]: 'Contract ready for your signature',
  [NotificationType.CONTRACT_EXECUTED]:
    'Contract fully executed — deal is active',
  [NotificationType.DEAL_CLOSED]: 'Deal closed — congratulations!',
  [NotificationType.DEAL_UNDER_REVIEW]: 'Deal update: Under Review',
  [NotificationType.DEAL_PROCEEDING]: 'Deal update: Proceeding to Closing',
  [NotificationType.DEAL_CANCELLED]: 'Deal update: Cancelled',
  [NotificationType.CHAT_NEW_MESSAGE]: 'You have a new message on TRACT',
};

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.registerPartials();
  }

  // ─── Auth emails ────────────────────────────────────────────────────────────

  async sendOtp(
    email: string,
    otp: string,
    purpose: 'login' | 'forgot_password',
  ): Promise<void> {
    const isLogin = purpose === 'login';

    const html = this.renderTemplate(
      isLogin ? 'otp-login' : 'otp-reset-password',
      { otp, expiryMinutes: 10, year: new Date().getFullYear() },
    );

    await this.send({
      to: email,
      subject: isLogin
        ? 'Your Login Verification Code'
        : 'Password Reset Request',
      html,
      errorMessage: isLogin
        ? 'Failed to send login OTP email'
        : 'Failed to send password reset OTP email',
    });
  }

  // ─── Notification emails ────────────────────────────────────────────────────

  async sendNotificationEmail(
    type: NotificationType,
    data: Record<string, any>,
  ): Promise<void> {
    const templateName = NOTIFICATION_TEMPLATE_MAP[type];
    const subject = NOTIFICATION_SUBJECT_MAP[type];

    if (!templateName || !subject) {
      this.logger.warn(
        `No email template registered for notification type: ${type}`,
      );
      return;
    }

    const html = this.renderTemplate(templateName, {
      ...data,
      appUrl: process.env.APP_URL ?? '',
      logoUrl: process.env.MAIL_LOGO_URL ?? '',
      currentYear: new Date().getFullYear(),
    });

    await this.send({
      to: data.to,
      subject,
      html,
      errorMessage: `Failed to send notification email [${type}]`,
    });

    this.logger.log(`Email [${type}] sent to ${data.to}`);
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private async send(params: {
    to: string;
    subject: string;
    html: string;
    errorMessage: string;
  }): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: process.env.MAIL_FROM ?? 'no-reply@yourdomain.com',
        to: params.to,
        subject: params.subject,
        html: params.html,
      });

      if (error) throw new Error(error.message);
    } catch (err) {
      this.logger.error(`${params.errorMessage}: ${err.message}`, err.stack);
      throw new InternalServerErrorException(params.errorMessage);
    }
  }

  private registerPartials(): void {
    const partialsDir = path.join(process.cwd(), 'src', 'mail', 'templates', 'layouts');
    if (!fs.existsSync(partialsDir)) return;
  
    fs.readdirSync(partialsDir).forEach((file) => {
      if (!file.endsWith('.hbs')) return;
      const name = `layouts/${path.basename(file, '.hbs')}`;
      const content = fs.readFileSync(path.join(partialsDir, file), 'utf8');
      Handlebars.registerPartial(name, content);
    });
  
    this.logger.log(`Registered ${fs.readdirSync(partialsDir).length} Handlebars partials`);
  }

  private renderTemplate(templateName: string, context: Record<string, unknown>): string {
    const templatesDir = path.join(process.cwd(), 'src', 'mail', 'templates');
  
    // 1. Render the body template first
    const bodyPath = path.join(templatesDir, `${templateName}.hbs`);
    const bodySource = fs.readFileSync(bodyPath, 'utf8');
    const bodyHtml = Handlebars.compile(bodySource)(context);
  
    // 2. Render the layout with body injected
    const layoutPath = path.join(templatesDir, 'layouts','main.hbs');
    const layoutSource = fs.readFileSync(layoutPath, 'utf8');
    return Handlebars.compile(layoutSource)({ ...context, body: bodyHtml });
  }
}
