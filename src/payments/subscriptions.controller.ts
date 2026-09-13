import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Equals, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BETA_TERMS_VERSION,
  SubscriptionsService,
} from './subscriptions.service';
import { UsageLimitService } from './usage-limit.service';
import type { UsageKind } from './schemas/usage-counter.schema';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

class SubscribeDto {
  @IsString()
  @Equals(BETA_TERMS_VERSION)
  termsVersion: string;
}

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly usageLimits: UsageLimitService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Current SaaS subscription status' })
  status(@Request() req: AuthenticatedRequest) {
    return this.subscriptions.getStatus(req.user._id.toString());
  }

  @Get('allowance/:kind')
  @ApiOperation({ summary: 'Free lifetime attempt allowance' })
  allowance(
    @Request() req: AuthenticatedRequest,
    @Param('kind') kind: UsageKind,
  ) {
    if (kind !== 'listing' && kind !== 'bid') {
      throw new BadRequestException('Unknown allowance kind.');
    }
    return this.usageLimits.getAllowance(req.user._id.toString(), kind);
  }

  @Post('refresh')
  refresh(@Request() req: AuthenticatedRequest) {
    return this.subscriptions.getStatus(req.user._id.toString(), true);
  }

  @Post('paypal')
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SubscribeDto,
  ) {
    return this.subscriptions.create(req.user._id.toString(), dto.termsVersion);
  }

  @Post('mock-checkout')
  mockCheckout(@Request() req: AuthenticatedRequest) {
    return this.subscriptions.mockCheckout(req.user._id.toString());
  }

  @Post('cancel')
  cancel(@Request() req: AuthenticatedRequest) {
    return this.subscriptions.cancel(req.user._id.toString());
  }
}
