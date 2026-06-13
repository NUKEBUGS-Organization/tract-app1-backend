import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@ApiTags('Contracts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('/listing/:listingId')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  createContract(
    @Param('listingId')
    listingId: string,

    @Body()
    dto: CreateContractDto,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.contractsService.createContract(listingId, req.user._id, dto);
  }

  @Get('/:id')
  getContract(
    @Param('id')
    id: string,
  ) {
    return this.contractsService.getContract(id);
  }

  @Post('/:id/sign/seller')
  signSeller(
    @Param('id')
    id: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.contractsService.signAsSeller(id, req.user._id);
  }

  @Post('/:id/sign/buyer')
  signBuyer(
    @Param('id')
    id: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.contractsService.signAsBuyer(id, req.user._id);
  }

  @Post('/:id/cancel')
  cancel(
    @Param('id')
    id: string,
  ) {
    return this.contractsService.cancelContract(id);
  }

  @Get('/listing/:listingId')
  @UseGuards(RolesGuard)
  @Roles(Role.SELLER)
  async getContractsByListing(
    @Param('listingId')
    listingId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.contractsService.getContractsByListing(listingId, req.user._id);
  }
}
