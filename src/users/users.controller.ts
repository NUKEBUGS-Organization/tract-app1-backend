import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from './schemas/user.schema';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { UpdateUserDto, ChangePasswordDto, BanUserDto } from './dto/users.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  // GET /api/v1/users/me
  @Get('me')
  getMe(@Request() req: AuthenticatedRequest) {
    return this.usersService.findById(req.user._id);
  }

  // DELETE /api/v1/users/me
  @Delete('me')
  deleteMe(@Request() req: AuthenticatedRequest) {
    return this.usersService.softDelete(req.user._id);
  }

  // PATCH /api/v1/users/me
  @Patch('me')
  updateMe(@Request() req: AuthenticatedRequest, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(req.user._id, dto);
  }

  // PATCH /api/v1/users/me/password
  @Patch('me/password')
  changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(req.user._id, dto);
  }

  // ─── Admin only ───────────────────────────────────────────────────────────

  // GET /api/v1/users/:id
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  // PATCH /api/v1/users/:id/ban
  @Patch(':id/ban')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  banUser(@Param('id') id: string, @Body() dto: BanUserDto) {
    return this.usersService.banUser(id, dto.reason);
  }

  // PATCH /api/v1/users/:id/unban
  @Patch(':id/unban')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  unbanUser(@Param('id') id: string) {
    return this.usersService.unbanUser(id);
  }
}
