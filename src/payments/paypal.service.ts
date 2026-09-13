import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Slim PayPal client for billing subscriptions only.
 * Webhooks stay on App2 — this service creates/cancels/GETs subscriptions.
 */
@Injectable()
export class PaypalService {
  private readonly logger = new Logger(PaypalService.name);
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  private subscriptionMode(): string {
    return this.config.get<string>('SUBSCRIPTION_MODE') ?? 'mock';
  }

  private apiBase(): string {
    const mode = this.config.get<string>('paypal.mode') ?? 'sandbox';
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private assertPayPalEnabled(): void {
    if (this.subscriptionMode() === 'mock') {
      throw new ForbiddenException(
        'PayPal is disabled while subscription mode is mock. Use mock checkout.',
      );
    }
  }

  private assertConfigured(): void {
    const clientId = this.config.get<string>('paypal.clientId') ?? '';
    const clientSecret = this.config.get<string>('paypal.clientSecret') ?? '';
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'PayPal is not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.',
      );
    }
  }

  async subscriptionRequest<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    requestId?: string,
  ): Promise<T> {
    this.assertPayPalEnabled();
    const token = await this.getAccessToken();
    const res = await fetch(`${this.apiBase()}${path}`, {
      signal: AbortSignal.timeout(15_000),
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        typeof data === 'object' &&
        data &&
        'message' in data &&
        typeof (data as { message: unknown }).message === 'string'
          ? (data as { message: string }).message
          : text.slice(0, 300);
      this.logger.error(`PayPal ${method} ${path} → ${res.status}: ${msg}`);
      throw new BadRequestException(msg || `PayPal error ${res.status}`);
    }
    return data as T;
  }

  private async getAccessToken(): Promise<string> {
    this.assertPayPalEnabled();
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 30_000) {
      return this.accessToken;
    }
    this.assertConfigured();
    const clientId = this.config.get<string>('paypal.clientId') ?? '';
    const clientSecret = this.config.get<string>('paypal.clientSecret') ?? '';
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${this.apiBase()}/v1/oauth2/token`, {
      signal: AbortSignal.timeout(15_000),
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`PayPal token error: ${res.status} ${text}`);
      throw new ServiceUnavailableException(
        'Could not authenticate with PayPal.',
      );
    }
    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = Date.now() + (data.expires_in ?? 300) * 1000;
    return this.accessToken;
  }
}
