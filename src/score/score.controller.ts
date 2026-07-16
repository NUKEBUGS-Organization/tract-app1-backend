import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ScoreService } from './score.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/schemas/user.schema';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

import { ApplyPenaltyDto } from './dto/apply-penalty.dto';
import { ResetScoreDto } from './dto/reset-score.dto';
import { UpdateScoreRuleDto } from './dto/update-score-rule.dto';
import { GetScoreEventsDto } from './dto/get-score-events.dto';
import { ScoreEventType } from './schemas/score-event.schema';

@ApiTags('Score')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class ScoreController {
  constructor(private readonly scoreService: ScoreService) {}

  // GET /users/:id/score — admin or the user themselves
  @Get('users/:id/score')
  @ApiOperation({
    summary: 'Get a user score, restriction status, and history',
  })
  async getUserScore(
    @Param('id') userId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    if ((req.user.role as Role) !== Role.ADMIN && req.user._id !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.scoreService.getUserScore(userId);
  }

  // POST /scores/penalty — admin applies a penalty (manual or system-confirmed)
  @Post('scores/penalty')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Apply a score penalty to a partner' })
  async applyPenalty(
    @Body() dto: ApplyPenaltyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scoreService.applyPenalty(dto, req.user._id);
  }

  // GET /admin/scores — admin listing of all score events
  @Get('admin/scores')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List score events (admin)' })
  async getScoreEvents(@Query() query: GetScoreEventsDto) {
    return this.scoreService.getScoreEvents(query);
  }

  // POST /admin/scores/:userId/reset — admin resets a user's score to 100
  @Post('admin/scores/:userId/reset')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reset a user score to 100' })
  async resetScore(
    @Param('userId') userId: string,
    @Body() dto: ResetScoreDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scoreService.resetScore(userId, dto, req.user._id);
  }

  // GET /admin/score-rules — configurable deduction rules (§10)
  @Get('admin/score-rules')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List configurable score rules' })
  async listScoreRules() {
    return this.scoreService.listScoreRules();
  }

  // PATCH /admin/score-rules/:eventType — adjust a deduction without a deploy
  @Patch('admin/score-rules/:eventType')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a score rule delta or active state' })
  async updateScoreRule(
    @Param('eventType') eventType: ScoreEventType,
    @Body() dto: UpdateScoreRuleDto,
  ) {
    return this.scoreService.updateScoreRule(eventType, dto);
  }
}
