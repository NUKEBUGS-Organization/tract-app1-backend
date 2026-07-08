import { ScoreEventType } from './schemas/score-event.schema';
import { ScoreRuleAppliesTo } from './schemas/score-rule.schema';

export const DEFAULT_SCORE_RULES: Array<{
  event_type: ScoreEventType;
  applies_to: ScoreRuleAppliesTo;
  delta: number;
  is_exact: boolean;
  description: string;
}> = [
  // ── Wholesaler / Private Partner — Reliability Score (§2, exact) ──────────
  {
    event_type: ScoreEventType.GHOSTING,
    applies_to: ScoreRuleAppliesTo.WHOLESALER,
    delta: -10,
    is_exact: true,
    description:
      'Partner stops responding after bidding or being selected; reminders ignored.',
  },
  {
    event_type: ScoreEventType.INSPECTION_CANCELLATION,
    applies_to: ScoreRuleAppliesTo.WHOLESALER,
    delta: -20,
    is_exact: true,
    description:
      'Partner cancels the inspection after it was scheduled or seller moved forward with the bid.',
  },
  {
    event_type: ScoreEventType.MISSED_DEADLINE,
    applies_to: ScoreRuleAppliesTo.WHOLESALER,
    delta: -15,
    is_exact: true,
    description:
      'Partner misses a required proof upload, milestone update, or deal-stage deadline.',
  },
  {
    event_type: ScoreEventType.FAILURE_TO_PROCEED_TO_CLOSING,
    applies_to: ScoreRuleAppliesTo.WHOLESALER,
    delta: -20,
    is_exact: true,
    description:
      'Partner does not confirm Proceed to Closing before the inspection timer expires.',
  },

  // ── Realtor / Licensed Partner — Professional Score (§4, exact) ───────────
  {
    event_type: ScoreEventType.SLOW_RESPONSE,
    applies_to: ScoreRuleAppliesTo.REALTOR,
    delta: -10,
    is_exact: true,
    description:
      'Realtor delays communication or does not respond within the expected service window.',
  },
  {
    event_type: ScoreEventType.MISSED_MILESTONE,
    applies_to: ScoreRuleAppliesTo.REALTOR,
    delta: -15,
    is_exact: true,
    description:
      'Realtor misses a required deal milestone (market launch proof, showing update, appraisal, etc.).',
  },
  {
    event_type: ScoreEventType.DEAL_FALLOUT_NEGLIGENCE,
    applies_to: ScoreRuleAppliesTo.REALTOR,
    delta: -20,
    is_exact: true,
    description:
      'Deal falls through because the realtor failed to perform an expected professional duty.',
  },

  // ── Recommended mappings for undefined scenarios (§5, confirm before relying on) ──
  {
    event_type: ScoreEventType.MARKETING_PROOF_MISSED,
    applies_to: ScoreRuleAppliesTo.WHOLESALER,
    delta: -15,
    is_exact: false,
    description:
      'Wholesaler did not upload 72-hour marketing proof. Mapped to Missed Deadline pending product confirmation.',
  },
  {
    event_type: ScoreEventType.MARKET_LAUNCH_MISSED,
    applies_to: ScoreRuleAppliesTo.REALTOR,
    delta: -15,
    is_exact: false,
    description:
      'Realtor did not upload 7-day market launch proof. Mapped to Missed Milestone pending product confirmation.',
  },
  {
    event_type: ScoreEventType.CHAT_FLAG,
    applies_to: ScoreRuleAppliesTo.BOTH,
    delta: 0,
    is_exact: false,
    description:
      'User shared phone/email/link in chat. Tracked for admin review; no score impact unless business decides otherwise.',
  },
  {
    event_type: ScoreEventType.EXTENSION_REQUESTED,
    applies_to: ScoreRuleAppliesTo.BOTH,
    delta: 0,
    is_exact: false,
    description:
      'Partner requested a deadline extension. Fee-based, not a score penalty unless abused or the deadline is ultimately missed.',
  },
  {
    event_type: ScoreEventType.INACTIVITY_RESTRICTION,
    applies_to: ScoreRuleAppliesTo.BOTH,
    delta: 0,
    is_exact: false,
    description:
      '30-45 day activity failure. Tracked separately from deal execution score unless product approves mixing them.',
  },

  // ── Admin utility events ───────────────────────────────────────────────────
  {
    event_type: ScoreEventType.MANUAL_ADJUSTMENT,
    applies_to: ScoreRuleAppliesTo.BOTH,
    delta: 0,
    is_exact: true,
    description:
      'Admin-applied ad-hoc adjustment; delta is provided explicitly per event, not looked up from this rule.',
  },
];
