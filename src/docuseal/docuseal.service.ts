import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface DocuSealSubmitter {
  role: string;
  email: string;
  name: string;
  external_id: string;
  values?: Record<string, string | number>;
}

export interface DocuSealSubmission {
  id: number;
  // This DocuSeal instance's API does not echo back `role`, `embed_src`,
  // or `external_id` on submission create — only `id`, `slug`, and `email`.
  // Order is preserved from the request, so callers must match submitters
  // positionally (the order they were sent in) rather than by role.
  submitters: Array<{
    id: number;
    slug: string;
    email: string;
  }>;
}

export interface DocuSealWebhookEvent {
  event_type: string;
  timestamp: string;
  data: {
    id: number;
    submission_id: number;
    external_id: string;
    email: string;
    role: string;
    status: string;
    completed_at?: string;
    documents?: Array<{ url: string }>;
    audit_log_url?: string;
    submission?: {
      audit_log_url?: string;
      documents?: Array<{ url: string }>;
    };
  };
}

@Injectable()
export class DocuSealService {
  private readonly logger = new Logger(DocuSealService.name);
  private readonly client: AxiosInstance;
  private readonly baseURL: string;
  private readonly templateId: string;
  readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.getOrThrow<string>('DOCUSEAL_API_URL');
    const apiKey = this.configService.getOrThrow<string>('DOCUSEAL_API_KEY');
    this.baseURL = baseURL.replace(/\/+$/, '');

    this.templateId = this.configService.getOrThrow<string>(
      'DOCUSEAL_CONTRACT_TEMPLATE_ID',
    );
    this.webhookSecret = this.configService.getOrThrow<string>(
      'DOCUSEAL_WEBHOOK_SECRET',
    );

    this.client = axios.create({
      baseURL,
      headers: {
        'X-Auth-Token': apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async createSubmission(
    submitters: DocuSealSubmitter[],
  ): Promise<DocuSealSubmission> {
    // This server's API requires submitters nested under `submission`, not
    // as a flat top-level array — a flat `submitters` array is silently
    // accepted and returns an empty result instead of erroring.
    const payload = {
      template_id: Number(this.templateId),
      send_email: false,
      submission: [{ submitters }],
    };

    this.logger.log(
      `Creating DocuSeal submission for template ${this.templateId}`,
    );

    const { data } = await this.client.post<any>('/api/submissions', payload);

    this.logger.log(`DocuSeal raw response: ${JSON.stringify(data)}`);

    // Response is a flat array of submitter objects, in the same order
    // they were sent: [{ id, submission_id, slug, email, ... }, ...]
    const submitterArray: any[] = Array.isArray(data) ? data : [data];

    if (!submitterArray.length || !submitterArray[0]?.submission_id) {
      throw new Error(
        `DocuSeal returned unexpected response. Response=${JSON.stringify(data)}`,
      );
    }

    const submission: DocuSealSubmission = {
      id: submitterArray[0].submission_id,
      submitters: submitterArray.map((s) => ({
        id: s.id,
        slug: s.slug,
        email: s.email,
      })),
    };

    this.logger.log(
      `DocuSeal submission created: ${submission.id} with ${submission.submitters.length} submitters`,
    );
    return submission;
  }

  async getSubmission(submissionId: string): Promise<any> {
    const { data } = await this.client.get<any>(
      `/api/submissions/${submissionId}`,
    );
    return data;
  }

  /** Builds the hosted signing page URL for a submitter's slug. */
  buildSignUrl(slug: string): string {
    return `${this.baseURL}/s/${slug}`;
  }
}
