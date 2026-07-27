import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { fetchWithTimeout } from '../common/utils/fetch-with-timeout';
import type { App2ListingStatusDto } from './dto/app2-listing-status.dto';

type CacheEntry = {
  data: App2ListingStatusDto;
  expiresAt: number;
};

type App2Envelope = {
  success?: boolean;
  data?: App2ListingStatusDto;
};

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 3000;
const UNKNOWN: App2ListingStatusDto = { status: 'unknown' };

@Injectable()
export class App2ListingsService {
  private readonly logger = new Logger(App2ListingsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Fail-soft: never throws. Callers treat `unknown` as "check back later."
   */
  async getApp2ListingStatus(app1DealId: string): Promise<App2ListingStatusDto> {
    const id = (app1DealId ?? '').trim();
    if (!id) {
      return UNKNOWN;
    }

    const cached = this.cache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const baseUrl = (
      this.config.get<string>('APP2_INTERNAL_URL') ?? ''
    ).replace(/\/$/, '');
    const key = this.config.get<string>('INTERNAL_SERVICE_KEY') ?? '';

    if (!baseUrl || !key) {
      this.logger.warn(
        'APP2_INTERNAL_URL or INTERNAL_SERVICE_KEY not configured — returning unknown',
      );
      return UNKNOWN;
    }

    try {
      const url = `${baseUrl}/api/v1/internal/listings/by-app1-deal/${encodeURIComponent(id)}`;
      const response = await fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Internal-Key': key,
          },
        },
        FETCH_TIMEOUT_MS,
      );

      if (!response.ok) {
        this.logger.warn(
          `App2 listing status fetch failed for deal ${id}: HTTP ${response.status}`,
        );
        return UNKNOWN;
      }

      const body = (await response.json()) as
        | App2Envelope
        | App2ListingStatusDto;

      const data =
        body &&
        typeof body === 'object' &&
        'data' in body &&
        body.data &&
        typeof body.data === 'object' &&
        'status' in body.data
          ? body.data
          : body && typeof body === 'object' && 'status' in body
            ? (body as App2ListingStatusDto)
            : null;

      if (!data?.status) {
        this.logger.warn(
          `App2 listing status fetch returned unexpected payload for deal ${id}`,
        );
        return UNKNOWN;
      }

      this.cache.set(id, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `App2 listing status fetch error for deal ${id}: ${message}`,
      );
      return UNKNOWN;
    }
  }
}
