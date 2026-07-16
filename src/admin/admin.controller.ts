import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { AdminService } from './admin.service';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { BanUserDto } from './dto/ban-user.dto';
import { RejectKycDto } from './dto/reject-kyc.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { RejectVerificationDto } from './dto/reject-verification.dto';

import {
  VerificationStatus,
  VerificationType,
} from '../verifications/schemas/verification.schema';

import { PaginationDto } from './dto/pagination.dto';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { UpdateListingStatusDto } from './dto/update-listing-status.dto';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // =====================================================
  // DASHBOARD
  // =====================================================

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard statistics',
  })
  async dashboard() {
    return this.adminService.dashboard();
  }

  // =====================================================
  // USERS
  // =====================================================

  @Get('users')
  @ApiOperation({
    summary: 'Get all users',
  })
  @ApiQuery({
    name: 'role',
    required: false,
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getUsers(
    @Query('role') role?: Role,
    @Query() pagination?: PaginationDto,
  ) {
    return this.adminService.getUsers(role, pagination);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get user details',
  })
  @ApiParam({
    name: 'id',
  })
  async getUser(
    @Param('id')
    userId: string,
  ) {
    return this.adminService.getUser(userId);
  }

  @Post('users/:id/ban')
  @ApiOperation({
    summary: 'Ban user',
  })
  async banUser(
    @Param('id')
    userId: string,

    @Body()
    dto: BanUserDto,
  ) {
    return this.adminService.banUser(userId, dto.reason);
  }

  @Post('users/:id/unban')
  @ApiOperation({
    summary: 'Unban user',
  })
  async unbanUser(
    @Param('id')
    userId: string,
  ) {
    return this.adminService.unbanUser(userId);
  }

  // =====================================================
  // KYC
  // =====================================================

  @Get('kyc/pending')
  @ApiOperation({
    summary: 'Get pending KYC users',
  })
  async pendingKyc() {
    return this.adminService.pendingKyc();
  }

  @Post('kyc/:id/approve')
  @ApiOperation({
    summary: 'Approve KYC',
  })
  async approveKyc(
    @Param('id')
    userId: string,
  ) {
    return this.adminService.approveKyc(userId);
  }

  @Post('kyc/:id/reject')
  @ApiOperation({
    summary: 'Reject KYC',
  })
  async rejectKyc(
    @Param('id')
    userId: string,

    @Body()
    dto: RejectKycDto,
  ) {
    return this.adminService.rejectKyc(userId);
  }

  // =====================================================
  // VERIFICATIONS
  // =====================================================

  @Get('verifications')
  @ApiOperation({
    summary: 'Get all realtor/wholesaler verifications',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: VerificationType,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: VerificationStatus,
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getVerifications(
    @Query() pagination: PaginationDto,
    @Query('type') type?: VerificationType,
    @Query('status') status?: VerificationStatus,
  ) {
    return this.adminService.getVerifications(pagination, type, status);
  }

  @Get('verifications/pending')
  @ApiOperation({
    summary: 'Get pending verifications awaiting review',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async pendingVerifications(@Query() pagination: PaginationDto) {
    return this.adminService.pendingVerifications(pagination);
  }

  @Get('verifications/:id')
  @ApiOperation({
    summary: 'Get verification details',
  })
  @ApiParam({
    name: 'id',
  })
  async getVerification(
    @Param('id')
    id: string,
  ) {
    return this.adminService.getVerification(id);
  }

  @Post('verifications/:id/approve')
  @ApiOperation({
    summary: 'Approve verification',
  })
  @ApiParam({
    name: 'id',
  })
  async approveVerification(
    @Param('id')
    id: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.adminService.approveVerification(id, req.user._id);
  }

  @Post('verifications/:id/reject')
  @ApiOperation({
    summary: 'Reject verification',
  })
  @ApiParam({
    name: 'id',
  })
  async rejectVerification(
    @Param('id')
    id: string,

    @Body()
    dto: RejectVerificationDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.adminService.rejectVerification(id, dto.reason, req.user._id);
  }

  // =====================================================
  // LISTINGS
  // =====================================================

  @Get('listings')
  @ApiOperation({
    summary: 'Get all listings',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getListings(@Query() pagination: PaginationDto) {
    return this.adminService.getListings(pagination);
  }

  @Get('listings/pending')
  @ApiOperation({
    summary: 'Get submitted listings awaiting approval',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async pendingListings(@Query() pagination: PaginationDto) {
    return this.adminService.pendingListings(pagination);
  }

  @Get('listings/:id')
  @ApiOperation({
    summary: 'Get listing details',
  })
  async getListing(
    @Param('id')
    listingId: string,
  ) {
    return this.adminService.getListing(listingId);
  }

  @Post('listings/:id/approve')
  @ApiOperation({
    summary: 'Approve listing',
  })
  async approveListing(
    @Param('id')
    listingId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.adminService.approveListing(listingId, req.user._id);
  }

  @Post('listings/:id/reject')
  @ApiOperation({
    summary: 'Reject listing',
  })
  async rejectListing(
    @Param('id')
    listingId: string,

    @Body()
    dto: RejectListingDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.adminService.rejectListing(listingId, dto.reason, req.user._id);
  }

  @Patch('listings/:id/status')
  @ApiOperation({
    summary: 'Update listing status',
  })
  async updateListingStatus(
    @Param('id')
    listingId: string,

    @Body()
    dto: UpdateListingStatusDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.adminService.updateListingStatus(listingId, dto, req.user._id);
  }

  @Delete('listings/:id')
  @ApiOperation({
    summary: 'Delete listing',
  })
  async deleteListing(
    @Param('id')
    listingId: string,
  ) {
    return this.adminService.deleteListing(listingId);
  }

  @Get('bids')
  @ApiOperation({
    summary: 'Get all bids',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getBids(@Query() pagination: PaginationDto) {
    return this.adminService.getBids(pagination);
  }

  @Get('bids/:id')
  @ApiOperation({
    summary: 'Get bid details',
  })
  async getBid(
    @Param('id')
    bidId: string,
  ) {
    return this.adminService.getBid(bidId);
  }

  @Get('contracts')
  @ApiOperation({
    summary: 'Get all contracts',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getContracts(@Query() pagination: PaginationDto) {
    return this.adminService.getContracts(pagination);
  }

  @Get('contracts/:id')
  @ApiOperation({
    summary: 'Get contract details',
  })
  async getContract(
    @Param('id')
    contractId: string,
  ) {
    return this.adminService.getContract(contractId);
  }

  @Get('deals')
  @ApiOperation({
    summary: 'Get all deals',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async getDeals(@Query() pagination: PaginationDto) {
    return this.adminService.getDeals(pagination);
  }

  @Get('deals/:id')
  @ApiOperation({
    summary: 'Get deal details',
  })
  async getDeal(
    @Param('id')
    dealId: string,
  ) {
    return this.adminService.getDeal(dealId);
  }

  @Post('deals/:id/close')
  @ApiOperation({
    summary: 'Force close deal',
  })
  async closeDeal(
    @Param('id')
    dealId: string,
  ) {
    return this.adminService.closeDeal(dealId);
  }

  @Get('chat/flagged')
  @ApiOperation({
    summary: 'Get flagged messages',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async flaggedMessages(@Query() pagination: PaginationDto) {
    return this.adminService.flaggedMessages(pagination);
  }

  @Get('chat/rooms')
  @ApiOperation({
    summary: 'Get all chat rooms',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async chatRooms(@Query() pagination: PaginationDto) {
    return this.adminService.chatRooms(pagination);
  }

  @Get('chat/rooms/:id/messages')
  @ApiOperation({
    summary: 'Get room messages',
  })
  @ApiQuery({
    name: 'page',
    required: false,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
  })
  async roomMessages(
    @Param('id')
    roomId: string,

    @Query()
    pagination: PaginationDto,
  ) {
    return this.adminService.roomMessages(roomId, pagination);
  }
}
