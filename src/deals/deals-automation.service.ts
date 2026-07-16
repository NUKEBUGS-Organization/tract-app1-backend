import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Deal, DealDocument, DealStatus } from './schemas/deal.schema';
import { Role, UserDocument } from '../users/schemas/user.schema';
import { DealsService } from './deals.service';
import { ScoreService } from '../score/score.service';
import { ScoreEventType } from '../score/schemas/score-event.schema';
import { KillSwitchReason } from './dto/trigger-kill-switch.dto';

// Inactivity thresholds are assumed defaults — the product doc describes
// "reminders ignored" / "expected service window" without exact numbers
// (§2 Ghosting, §4 Slow Response). Tune here pending product confirmation.
const GHOSTING_INACTIVITY_HOURS = 72;
const SLOW_RESPONSE_INACTIVITY_HOURS = 48;

// Safety valve so a single cron tick can't try to process an unbounded
// backlog; remaining deals get picked up on the next run.
const BATCH_LIMIT = 200;

const OPEN_DEAL_STATUSES = [
  DealStatus.ACTIVE,
  DealStatus.UNDER_REVIEW,
  DealStatus.PROCEEDING_TO_CLOSING,
];

// Automatic detection for the score events that have a deterministic,
// system-observable signal (a stored deadline, or elapsed inactivity).
// Deal Fallout Negligence is intentionally excluded — the product doc
// explicitly calls for admin review before that penalty is applied.
@Injectable()
export class DealsAutomationService {
  private readonly logger = new Logger(DealsAutomationService.name);

  constructor(
    @InjectModel(Deal.name) private readonly dealModel: Model<DealDocument>,
    private readonly dealsService: DealsService,
    private readonly scoreService: ScoreService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkMarketingProofDeadlines() {
    const deals = await this.dealModel
      .find({
        status: { $in: OPEN_DEAL_STATUSES },
        marketing_deadline: { $ne: null, $lte: new Date() },
        marketing_proof_url: null,
      })
      .limit(BATCH_LIMIT);

    for (const deal of deals) {
      await this.fireKillSwitch(
        deal._id.toString(),
        ScoreEventType.MARKETING_PROOF_MISSED,
        '72-hour marketing proof deadline passed with no upload',
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkMarketLaunchDeadlines() {
    const deals = await this.dealModel
      .find({
        status: { $in: OPEN_DEAL_STATUSES },
        market_launch_deadline: { $ne: null, $lte: new Date() },
        market_launch_proof_url: null,
      })
      .limit(BATCH_LIMIT);

    for (const deal of deals) {
      await this.fireKillSwitch(
        deal._id.toString(),
        ScoreEventType.MARKET_LAUNCH_MISSED,
        '7-day market launch proof deadline passed with no upload',
      );
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkInspectionDeadlines() {
    const deals = await this.dealModel
      .find({
        status: { $in: OPEN_DEAL_STATUSES },
        inspection_deadline: { $ne: null, $lte: new Date() },
        proceed_to_closing_at: null,
      })
      .limit(BATCH_LIMIT);

    for (const deal of deals) {
      await this.fireKillSwitch(
        deal._id.toString(),
        ScoreEventType.FAILURE_TO_PROCEED_TO_CLOSING,
        'Inspection timer expired without confirming Proceed to Closing',
      );
    }
  }

  private async fireKillSwitch(
    dealId: string,
    reason: KillSwitchReason,
    note: string,
  ) {
    try {
      await this.dealsService.triggerKillSwitch(dealId, reason, 'system', note);
      this.logger.log(
        `Kill switch (${reason}) auto-triggered for deal ${dealId}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to auto-trigger kill switch (${reason}) for deal ${dealId}: ${err.message}`,
        err.stack,
      );
    }
  }

  // Ghosting (wholesaler) / Slow Response (realtor) — both keyed off the
  // buyer's last authenticated activity (see JwtStrategy) rather than a
  // stored deadline, so each incident is scored at most once per deal.
  @Cron(CronExpression.EVERY_HOUR)
  async checkInactivity() {
    const deals = await this.dealModel
      .find({ status: { $in: OPEN_DEAL_STATUSES } })
      .populate('buyer_id', 'role last_active_at')
      .limit(BATCH_LIMIT);

    const now = Date.now();

    for (const deal of deals) {
      const buyer = deal.buyer_id as unknown as UserDocument;
      if (!buyer) continue;

      let eventType: ScoreEventType | null = null;
      let thresholdHours: number | null = null;

      if (buyer.role === Role.WHOLESALER) {
        eventType = ScoreEventType.GHOSTING;
        thresholdHours = GHOSTING_INACTIVITY_HOURS;
      } else if (buyer.role === Role.REALTOR) {
        eventType = ScoreEventType.SLOW_RESPONSE;
        thresholdHours = SLOW_RESPONSE_INACTIVITY_HOURS;
      }

      if (!eventType || thresholdHours === null) continue;

      const lastActiveMs = buyer.last_active_at
        ? new Date(buyer.last_active_at).getTime()
        : 0; // never active — treat as maximally inactive
      const inactiveHours = (now - lastActiveMs) / (60 * 60 * 1000);

      if (inactiveHours < thresholdHours) continue;

      const dealId = (deal._id as { toString(): string }).toString();
      const alreadyPenalized = await this.scoreService.hasPenaltyBeenApplied(
        dealId,
        eventType,
      );
      if (alreadyPenalized) continue;

      try {
        await this.scoreService.applyPenalty(
          {
            user_id: buyer._id.toString(),
            event_type: eventType,
            deal_id: dealId,
            note: `No activity for ${Math.floor(inactiveHours)}h on an active deal`,
          },
          'system',
        );
        this.logger.log(
          `${eventType} auto-applied to ${buyer._id.toString()} for deal ${dealId}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to auto-apply ${eventType} for deal ${dealId}: ${err.message}`,
          err.stack,
        );
      }
    }
  }
}
