import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/schemas/user.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketSourceApp } from './schemas/support-ticket.schema';
import { TicketsService } from './tickets.service';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Tickets')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a support ticket' })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.create(
      { _id: req.user._id, role: req.user.role as Role },
      dto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List tickets (mine, or all for admin)' })
  @ApiQuery({ name: 'sourceApp', required: false, enum: TicketSourceApp })
  list(
    @Request() req: AuthenticatedRequest,
    @Query('sourceApp') sourceApp?: TicketSourceApp,
  ) {
    return this.ticketsService.listForUser(
      { _id: req.user._id, role: req.user.role as Role },
      sourceApp,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket thread by id' })
  findOne(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.findOne(
      { _id: req.user._id, role: req.user.role as Role },
      id,
    );
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update ticket — status, assign, or reply' })
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(
      { _id: req.user._id, role: req.user.role as Role },
      id,
      dto,
    );
  }

  @Patch(':id/claim')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim ticket (admin only)' })
  claim(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.ticketsService.claim(
      { _id: req.user._id, role: req.user.role as Role },
      id,
    );
  }
}
