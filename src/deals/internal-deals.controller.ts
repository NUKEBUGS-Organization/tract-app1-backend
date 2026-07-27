import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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

  @Get(':dealId/status')
  getDealStatus(@Param('dealId') dealId: string) {
    return this.dealsService.getDealStatusInternal(dealId);
  }

  @Post(':dealId/mark-closed')
  markClosedFromApp2(@Param('dealId') dealId: string) {
    return this.dealsService.markClosedFromApp2Internal(dealId);
  }
}
