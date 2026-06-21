import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';

import { ApiExcludeController } from '@nestjs/swagger';
import { ContractsService } from '../contracts/contracts.service';

/**
 * Receives webhook events from DocuSeal.
 *
 * The secret token in the URL path acts as a first-line bearer credential.
 * Configure the DocuSeal webhook URL as:
 *   POST https://api.tractcorp.com/webhooks/docuseal/<DOCUSEAL_WEBHOOK_SECRET>
 */
@ApiExcludeController()
@Controller('webhooks/docuseal')
export class DocuSealWebhookController {
  private readonly logger = new Logger(DocuSealWebhookController.name);

  constructor(private readonly contractsService: ContractsService) {}

  @Post(':secret')
  @HttpCode(HttpStatus.OK)
  async handleEvent(@Param('secret') secret: string, @Body() body: any) {
    this.logger.log(
      `DocuSeal webhook received: event_type=${body?.event_type}, external_id=${body?.data?.external_id}`,
    );

    return this.contractsService.handleDocuSealWebhook(secret, body);
  }
}
