import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { PaginationDto } from 'src/admin/dto/pagination.dto';

@ApiTags('Contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('/listing/:listingId')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({ summary: 'Create a contract and DocuSeal submission' })
  createContract(
    @Param('listingId') listingId: string,
    @Body() dto: CreateContractDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contractsService.createContract(listingId, req.user._id, dto);
  }

  @Get('/listing/:listingId')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  @ApiOperation({ summary: 'Get all contracts for a listing (seller only)' })
  async getContractsByListing(
    @Param('listingId') listingId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.contractsService.getContractsByListing(listingId, req.user._id);
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get a single contract by ID' })
  getContract(@Param('id') id: string) {
    return this.contractsService.getContract(id);
  }

  @Get('my-contracts')
  @ApiOperation({
    summary: 'My contracts',
  })
  async myContracts(
    @Request() req: AuthenticatedRequest,
    @Query() pagination: PaginationDto,
  ) {
    return this.contractsService.myContracts(req.user._id, pagination);
  }

  /**
   * Returns the signer-specific DocuSeal embed URL for the current user.
   * Seller receives the seller URL; Buyer receives the buyer URL.
   * Frontend opens this URL in a new tab or embedded DocuSeal component.
   */
  @Get('/:id/sign-url')
  @ApiOperation({ summary: 'Get DocuSeal signing URL for the current user' })
  getSignUrl(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contractsService.getSignUrl(id, req.user._id);
  }

  /**
   * Returns the signed PDF URL once both parties have completed signing.
   * Only accessible by the seller or buyer on the contract.
   */
  @Get('/:id/signed-pdf')
  @ApiOperation({
    summary: 'Get signed PDF URL (available after both parties sign)',
  })
  getSignedPdf(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contractsService.getSignedPdf(id, req.user._id);
  }

  // ── Legacy endpoints — kept for admin / local testing only ───────────────────

  @Post('/:id/sign/seller')
  @ApiOperation({
    summary: '[LEGACY] Manually set seller_signed_at — for testing only',
    deprecated: true,
  })
  signSeller(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contractsService.signAsSeller(id, req.user._id);
  }

  @Post('/:id/sign/buyer')
  @ApiOperation({
    summary: '[LEGACY] Manually set buyer_signed_at — for testing only',
    deprecated: true,
  })
  signBuyer(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.contractsService.signAsBuyer(id, req.user._id);
  }

  @Post('/:id/cancel')
  @ApiOperation({ summary: 'Cancel a contract' })
  cancel(@Param('id') id: string) {
    return this.contractsService.cancelContract(id);
  }
}
