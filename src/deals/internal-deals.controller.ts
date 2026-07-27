import { Controller, Get, Param, UseGuards } from '@nestjs/common';
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
}
