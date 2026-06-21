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
  submitters: Array<{
    id: number;
    role: string;
    email: string;
    external_id: string;
    embed_src: string;
    status: string;
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
  private readonly templateId: string;
  readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const baseURL = this.configService.getOrThrow<string>('DOCUSEAL_API_URL');
    const apiKey = this.configService.getOrThrow<string>('DOCUSEAL_API_KEY');

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
    const payload = {
      template_id: Number(this.templateId),
      send_email: false,
      submitters,
    };

    this.logger.log(
      `Creating DocuSeal submission for template ${this.templateId}`,
    );

    const { data } = await this.client.post<DocuSealSubmission[]>(
      '/api/submissions',
      payload,
    );

    // DocuSeal returns an array; the first element is the submission
    const submission = Array.isArray(data) ? data[0] : (data as any);

    this.logger.log(`DocuSeal submission created: ${submission.id}`);
    return submission;
  }

  async getSubmission(submissionId: string): Promise<DocuSealSubmission> {
    const { data } = await this.client.get<DocuSealSubmission>(
      `/api/submissions/${submissionId}`,
    );
    return data;
  }

  async getSubmitterEmbedSrc(submitterId: string): Promise<string> {
    const { data } = await this.client.get<{ embed_src: string }>(
      `/api/submitters/${submitterId}`,
    );
    return data.embed_src;
  }
}
