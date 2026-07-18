import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ScoreEvent,
  ScoreEventDocument,
  ScoreEventType,
  ScoreType,
} from './schemas/score-event.schema';
import {
  ScoreRule,
  ScoreRuleAppliesTo,
  ScoreRuleDocument,
} from './schemas/score-rule.schema';
import {
  User,
  UserDocument,
  Role,
  RestrictionStatus,
} from '../users/schemas/user.schema';
import { DEFAULT_SCORE_RULES } from './score-rules.seed';
import { ApplyPenaltyDto } from './dto/apply-penalty.dto';
import { ResetScoreDto } from './dto/reset-score.dto';
import { UpdateScoreRuleDto } from './dto/update-score-rule.dto';
import { GetScoreEventsDto } from './dto/get-score-events.dto';
import { NotificationsService } from '../notifications/notifications.service';

// TRACT App 1 Score Rules §3 — wholesaler thresholds, applied to both score types
const DELAYED_ACCESS_THRESHOLD = 50;
const REINSTATEMENT_THRESHOLD = 30;
const DELAYED_ACCESS_HOURS = 48;

@Injectable()
export class ScoreService implements OnModuleInit {
  private readonly logger = new Logger(ScoreService.name);

  constructor(
    @InjectModel(ScoreEvent.name)
    private readonly scoreEventModel: Model<ScoreEventDocument>,

    @InjectModel(ScoreRule.name)
    private readonly scoreRuleModel: Model<ScoreRuleDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    for (const rule of DEFAULT_SCORE_RULES) {
      await this.scoreRuleModel.updateOne(
        { event_type: rule.event_type },
        { $setOnInsert: rule },
        { upsert: true },
      );
    }
    this.logger.log('Score rules seeded');
  }

  // ─── Role → score field mapping ────────────────────────────────────────────

  private scoreFieldFor(
    role: Role,
  ): 'reliability_score' | 'professional_score' {
    if (role === Role.WHOLESALER) return 'reliability_score';
    if (role === Role.REALTOR) return 'professional_score';
    throw new BadRequestException(
      'Score events only apply to wholesaler or realtor partners',
    );
  }

  private scoreTypeFor(role: Role): ScoreType {
    return role === Role.WHOLESALER
      ? ScoreType.RELIABILITY
      : ScoreType.PROFESSIONAL;
  }

  private assertRuleMatchesRole(rule: ScoreRuleDocument, role: Role) {
    if (rule.applies_to === ScoreRuleAppliesTo.BOTH) return;
    if (
      (rule.applies_to === ScoreRuleAppliesTo.WHOLESALER &&
        role !== Role.WHOLESALER) ||
      (rule.applies_to === ScoreRuleAppliesTo.REALTOR && role !== Role.REALTOR)
    ) {
      throw new BadRequestException(
        `Event type ${rule.event_type} does not apply to role ${role}`,
      );
    }
  }

  // TRACT App 1 Score Rules §3 — recomputed after every score change
  private computeRestriction(
    score: number,
    isBanned: boolean,
  ): { status: RestrictionStatus; restrictedUntil: Date | null } {
    if (isBanned) {
      return { status: RestrictionStatus.BANNED, restrictedUntil: null };
    }
    if (score < REINSTATEMENT_THRESHOLD) {
      return {
        status: RestrictionStatus.REINSTATEMENT_REQUIRED,
        restrictedUntil: null,
      };
    }
    if (score < DELAYED_ACCESS_THRESHOLD) {
      return {
        status: RestrictionStatus.DELAYED_ACCESS,
        restrictedUntil: new Date(
          Date.now() + DELAYED_ACCESS_HOURS * 60 * 60 * 1000,
        ),
      };
    }
    return { status: RestrictionStatus.NORMAL, restrictedUntil: null };
  }

  // Gate for bidding/transacting — re-derives the restriction from the
  // user's live score rather than trusting the cached restriction_status
  // field, so it's correct even if the score was changed by a path that
  // bypassed applyPenalty/resetScore (e.g. a direct admin edit) and never
  // recomputed that field. TRACT App 1 Score Rules §3.
  async assertNotRestricted(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) return;

    if (user.is_banned) {
      throw new ForbiddenException('Account is banned');
    }

    if (user.role !== Role.WHOLESALER && user.role !== Role.REALTOR) {
      return;
    }

    const score = user[this.scoreFieldFor(user.role)];

    if (score < REINSTATEMENT_THRESHOLD) {
      throw new ForbiddenException(
        `Your ${user.role === Role.WHOLESALER ? 'reliability' : 'professional'} score (${score}) has dropped below ${REINSTATEMENT_THRESHOLD}. Contact support for reinstatement before bidding again.`,
      );
    }

    if (
      score < DELAYED_ACCESS_THRESHOLD &&
      user.restricted_until &&
      user.restricted_until > new Date()
    ) {
      throw new ForbiddenException(
        `Your account has delayed access due to a low score. You can bid again after ${user.restricted_until.toISOString()}.`,
      );
    }
  }

  // ─── Core operations ────────────────────────────────────────────────────────

  async applyPenalty(dto: ApplyPenaltyDto, createdBy: string) {
    const user = await this.userModel.findById(dto.user_id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rule = await this.scoreRuleModel.findOne({
      event_type: dto.event_type,
    });
    if (!rule || !rule.active) {
      throw new BadRequestException(
        `Score event type "${dto.event_type}" is not configured or is inactive`,
      );
    }

    this.assertRuleMatchesRole(rule, user.role);

    const delta =
      dto.event_type === ScoreEventType.MANUAL_ADJUSTMENT
        ? dto.delta
        : rule.delta;

    if (delta === undefined || delta === null) {
      throw new BadRequestException(
        'A delta is required for manual adjustments',
      );
    }

    const scoreField = this.scoreFieldFor(user.role);
    const scoreType = this.scoreTypeFor(user.role);

    const scoreBefore = user[scoreField];
    const scoreAfter = Math.max(0, Math.min(100, scoreBefore + delta));

    user[scoreField] = scoreAfter;

    const { status, restrictedUntil } = this.computeRestriction(
      scoreAfter,
      user.is_banned,
    );
    const restrictionChanged = user.restriction_status !== status;
    user.restriction_status = status;
    user.restricted_until = restrictedUntil;

    await user.save();

    const event = await this.scoreEventModel.create({
      user_id: user._id,
      deal_id: dto.deal_id ? new Types.ObjectId(dto.deal_id) : null,
      score_type: scoreType,
      event_type: dto.event_type,
      delta,
      score_before: scoreBefore,
      score_after: scoreAfter,
      note: dto.note ?? rule.description ?? null,
      created_by: createdBy,
    });

    if (delta !== 0) {
      this.notificationsService
        .notifyScorePenalty({
          user_id: user._id.toString(),
          score_type: scoreType,
          event_type: dto.event_type,
          delta,
          score_after: scoreAfter,
          note: dto.note,
        })
        .catch(() => null);
    }

    if (restrictionChanged && status !== RestrictionStatus.NORMAL) {
      this.notificationsService
        .notifyScoreRestriction({
          user_id: user._id.toString(),
          restriction_status: status,
          score: scoreAfter,
        })
        .catch(() => null);
    }

    return { user, event };
  }

  async resetScore(userId: string, dto: ResetScoreDto, createdBy: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const scoreField = this.scoreFieldFor(user.role);
    const scoreType = this.scoreTypeFor(user.role);
    const scoreBefore = user[scoreField];
    const scoreAfter = 100;

    user[scoreField] = scoreAfter;

    const { status, restrictedUntil } = this.computeRestriction(
      scoreAfter,
      user.is_banned,
    );
    user.restriction_status = status;
    user.restricted_until = restrictedUntil;

    await user.save();

    const event = await this.scoreEventModel.create({
      user_id: user._id,
      deal_id: null,
      score_type: scoreType,
      event_type: ScoreEventType.SCORE_RESET,
      delta: scoreAfter - scoreBefore,
      score_before: scoreBefore,
      score_after: scoreAfter,
      note: dto.note ?? 'Score reset by admin',
      created_by: createdBy,
    });

    return { user, event };
  }

  // Used by automated checks (cron) to avoid re-penalizing the same
  // deal/event pair on every run — each incident should only score once.
  async hasPenaltyBeenApplied(
    dealId: string,
    eventType: ScoreEventType,
  ): Promise<boolean> {
    const existing = await this.scoreEventModel.exists({
      deal_id: new Types.ObjectId(dealId),
      event_type: eventType,
    });
    return !!existing;
  }

  async getUserScore(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select(
        'full_name role reliability_score professional_score restriction_status restricted_until is_banned ban_reason',
      );
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [history, lastPenalty] = await Promise.all([
      this.scoreEventModel
        .find({ user_id: user._id })
        .sort({ createdAt: -1 })
        .limit(20),
      this.scoreEventModel
        .findOne({ user_id: user._id, delta: { $ne: 0 } })
        .sort({ createdAt: -1 }),
    ]);

    return {
      user,
      last_penalty: lastPenalty
        ? {
            event_type: lastPenalty.event_type,
            delta: lastPenalty.delta,
            note: lastPenalty.note,
            created_at: (lastPenalty as unknown as { createdAt: Date })
              .createdAt,
          }
        : null,
      history,
    };
  }

  async getScoreEvents(query: GetScoreEventsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {};
    if (query.user_id) filter.user_id = new Types.ObjectId(query.user_id);
    if (query.deal_id) filter.deal_id = new Types.ObjectId(query.deal_id);
    if (query.event_type) filter.event_type = query.event_type;

    const [data, total] = await Promise.all([
      this.scoreEventModel
        .find(filter)
        .populate('user_id', 'full_name email role')
        .populate('deal_id')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.scoreEventModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Score rule management (§10 — configurable without code changes) ──────

  async listScoreRules() {
    return this.scoreRuleModel.find().sort({ event_type: 1 });
  }

  async updateScoreRule(eventType: ScoreEventType, dto: UpdateScoreRuleDto) {
    const rule = await this.scoreRuleModel.findOne({ event_type: eventType });
    if (!rule) {
      throw new NotFoundException('Score rule not found');
    }

    if (dto.delta !== undefined) rule.delta = dto.delta;
    if (dto.active !== undefined) rule.active = dto.active;
    if (dto.description !== undefined) rule.description = dto.description;

    await rule.save();
    return rule;
  }
}
