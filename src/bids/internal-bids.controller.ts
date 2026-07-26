import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalGuard } from '../auth/guards/internal.guard';
import { BidsService } from './bids.service';

@ApiExcludeController()
@UseGuards(InternalGuard)
@Controller('internal/bids')
export class InternalBidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Get('by-user/:userId')
  getBidsByUser(@Param('userId') userId: string) {
    return this.bidsService.getBidsByUserInternal(userId);
  }
}
