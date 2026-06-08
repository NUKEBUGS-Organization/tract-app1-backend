import {
  Body,
  Controller,
  Delete,
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

import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { SelectBidDto } from './dto/select-bid.dto';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Bids')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  @Post('listings/:id/bids')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER, Role.REALTOR)
  @ApiOperation({
    summary: 'Submit a bid',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing ID',
  })
  @ApiResponse({
    status: 201,
    description: 'Bid submitted successfully',
  })
  async createBid(
    @Param('id') listingId: string,
    @Body() dto: CreateBidDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bidsService.createBid(listingId, req.user._id, dto);
  }

  @Get('listings/:id/bids')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Get all bids for a listing',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing ID',
  })
  async getListingBids(
    @Param('id') listingId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.bidsService.getListingBids(listingId, req.user._id);
  }

  @Get('bids/my-bids')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER, Role.REALTOR)
  @ApiOperation({
    summary: 'Get current user bids',
  })
  async myBids(@Request() req: AuthenticatedRequest) {
    return this.bidsService.myBids(req.user._id);
  }

  @Get('bids/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER, Role.WHOLESALER, Role.REALTOR)
  @ApiOperation({
    summary: 'Get bid details by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Bid ID',
  })
  async getBidById(@Param('id') bidId: string) {
    return this.bidsService.getBidById(bidId);
  }

  @Post('listings/:listingId/bids/:bidId/select')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Select bid (Primary / Backup)',
  })
  @ApiParam({
    name: 'listingId',
  })
  @ApiParam({
    name: 'bidId',
  })
  async selectBid(
    @Param('listingId')
    listingId: string,

    @Param('bidId')
    bidId: string,

    @Body()
    dto: SelectBidDto,

    @Request() req: AuthenticatedRequest,
  ) {
    return this.bidsService.selectBid(
      listingId,
      bidId,
      dto.selection,
      req.user._id,
    );
  }

  @Delete('listings/:listingId/bids/:bidId')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({
    summary: 'Reject bid',
  })
  async rejectBid(
    @Param('listingId')
    listingId: string,

    @Param('bidId')
    bidId: string,

    @Request() req: AuthenticatedRequest,
  ) {
    return this.bidsService.rejectBid(listingId, bidId, req.user._id);
  }

  @Delete('bids/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.WHOLESALER, Role.REALTOR)
  @ApiOperation({
    summary: 'Delete own bid',
  })
  async deleteBid(
    @Param('id')
    bidId: string,

    @Request() req: AuthenticatedRequest,
  ) {
    return this.bidsService.deleteBid(bidId, req.user._id);
  }
}
