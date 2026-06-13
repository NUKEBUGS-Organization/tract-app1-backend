import {
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
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

import { Role } from '../users/schemas/user.schema';

import { ChatService } from './chat.service';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  @ApiOperation({
    summary: 'Get my chat rooms',
  })
  async myRooms(
    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.chatService.getMyRooms(req.user._id);
  }

  @Get('rooms/:id')
  @ApiOperation({
    summary: 'Get room details',
  })
  async room(
    @Param('id')
    roomId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.chatService.getRoom(roomId, req.user._id);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({
    summary: 'Get room messages',
  })
  async roomMessages(
    @Param('id')
    roomId: string,

    @Request()
    req: AuthenticatedRequest,
  ) {
    return this.chatService.getRoomMessages(roomId, req.user._id);
  }

  @Post('rooms/:id/read')
@ApiOperation({
  summary: 'Mark room as read',
})
async markRoomRead(
  @Param('id')
  roomId: string,

  @Request()
  req: AuthenticatedRequest,
) {
  return this.chatService.markRoomAsRead(
    roomId,
    req.user._id,
  );
}

  @Get('admin/flagged')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Get flagged messages',
  })
  async flaggedMessages() {
    return this.chatService.getFlaggedMessages();
  }
}
