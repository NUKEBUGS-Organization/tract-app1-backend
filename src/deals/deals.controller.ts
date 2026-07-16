import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { DealsService } from './deals.service';

import { UploadMarketingProofDto } from './dto/upload-marketing-proof.dto';
import { UploadMarketLaunchProofDto } from './dto/upload-market-launch-proof.dto';
import { TriggerKillSwitchDto } from './dto/trigger-kill-switch.dto';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Deals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Get('my-deals')
  @ApiOperation({
    summary: 'Get current user deals',
  })
  async myDeals(@Request() req: AuthenticatedRequest) {
    return this.dealsService.getMyDeals(req.user._id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get deal details',
  })
  @ApiParam({
    name: 'id',
    description: 'Deal ID',
  })
  async getDeal(
    @Param('id')
    dealId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.getDeal(dealId, req.user._id);
  }

  @Post(':id/marketing-proof')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER)
  @ApiOperation({
    summary: 'Upload wholesaler marketing proof',
  })
  async uploadMarketingProof(
    @Param('id')
    dealId: string,

    @Body()
    dto: UploadMarketingProofDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.uploadMarketingProof(dealId, req.user._id, dto);
  }

  @Post(':id/market-launch-proof')
  @UseGuards(RolesGuard)
  @Roles(Role.REALTOR)
  @ApiOperation({
    summary: 'Upload realtor market launch proof',
  })
  async uploadMarketLaunchProof(
    @Param('id')
    dealId: string,

    @Body()
    dto: UploadMarketLaunchProofDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.uploadMarketLaunchProof(dealId, req.user._id, dto);
  }

  @Post(':id/proceed-to-closing')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER, Role.REALTOR)
  @ApiOperation({
    summary: 'Proceed deal to closing',
  })
  async proceedToClosing(
    @Param('id')
    dealId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.proceedToClosing(dealId, req.user._id);
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel deal',
  })
  async cancelDeal(
    @Param('id')
    dealId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.cancelDeal(dealId, req.user._id);
  }

  @Post(':id/close')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Mark deal as closed',
  })
  async closeDeal(
    @Param('id')
    dealId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.closeDeal(dealId, req.user._id);
  }

  @Post(':id/kill-switch')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Trigger the seller kill switch for a missed deadline: cancels the deal, activates the backup partner, and applies the matching score penalty',
  })
  async triggerKillSwitch(
    @Param('id')
    dealId: string,

    @Body()
    dto: TriggerKillSwitchDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.dealsService.triggerKillSwitch(
      dealId,
      dto.reason,
      req.user._id,
      dto.note,
    );
  }
}
