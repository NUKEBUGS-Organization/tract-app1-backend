import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** GET /notifications — paginated in-app feed */
  @Get()
  @ApiOperation({
    summary: 'Get all notifications',
    description:
      'Returns a paginated list of in-app notifications for the authenticated user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
    example: 20,
  })
  @ApiOkResponse({
    description: 'Notifications retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: '#/components/schemas/Notification' },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        totalPages: { type: 'number' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  getAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.getUserNotifications(
      req.user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** GET /notifications/unread-count */
  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description:
      'Returns the number of unread notifications for the authenticated user',
  })
  @ApiOkResponse({
    description: 'Unread count retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', example: 5 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  unreadCount(@Request() req) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  /** PATCH /notifications/:id/read */
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a notification as read',
    description:
      'Marks a specific notification as read for the authenticated user',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiOkResponse({
    description: 'Notification marked as read successfully',
    schema: {
      $ref: '#/components/schemas/Notification',
    },
  })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  markRead(@Param('id') id: string, @Request() req) {
    return this.notificationsService.markAsRead(id, req.user.sub);
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all notifications as read for the authenticated user',
  })
  @ApiOkResponse({
    description: 'All notifications marked as read',
    schema: {
      type: 'object',
      properties: {
        modifiedCount: { type: 'number', example: 10 },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  markAllRead(@Request() req) {
    return this.notificationsService.markAllAsRead(req.user.sub);
  }

  /** DELETE /notifications/:id */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a notification',
    description:
      'Soft deletes a specific notification for the authenticated user',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Notification ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiOkResponse({
    description: 'Notification deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Notification deleted successfully',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  @ApiUnauthorizedResponse({ description: 'User is not authenticated' })
  delete(@Param('id') id: string, @Request() req) {
    return this.notificationsService.deleteNotification(id, req.user.sub);
  }
}
