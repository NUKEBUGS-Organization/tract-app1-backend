import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../auth/guards/internal.guard';
import { DealsService } from './deals.service';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/deals')
export class InternalDealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get('closed-by-user/:userId')
  getClosedDealsByUser(@Param('userId') userId: string) {
    return this.dealsService.getClosedDealsByUserInternal(userId);
  }

  /** Signed/active App1 partner deals eligible for App2 Property Source. */
  @Get('listable-by-user/:userId')
  getListableDealsByUser(@Param('userId') userId: string) {
    return this.dealsService.getListableDealsByUserInternal(userId);
  }

  /** App2 listing created — satisfy marketing / market-launch proof + clear deadline. */
  @Post(':id/mark-marketing-complete')
  markMarketingComplete(
    @Param('id') id: string,
    @Body() body?: { proofUrl?: string },
  ) {
    return this.dealsService.markMarketingCompleteInternal(
      id,
      body?.proofUrl,
    );
  }
}
