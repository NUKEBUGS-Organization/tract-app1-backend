import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ScoreEventType } from '../../score/schemas/score-event.schema';

// Deadline-related exact penalties (§2, §5) that also cancel the deal and
// activate the backup partner when the kill switch is triggered.
export const KILL_SWITCH_REASONS = [
  ScoreEventType.MARKETING_PROOF_MISSED,
  ScoreEventType.MARKET_LAUNCH_MISSED,
  ScoreEventType.FAILURE_TO_PROCEED_TO_CLOSING,
] as const;

export type KillSwitchReason = (typeof KILL_SWITCH_REASONS)[number];

export class TriggerKillSwitchDto {
  @ApiProperty({ enum: KILL_SWITCH_REASONS })
  @IsIn(KILL_SWITCH_REASONS)
  reason: KillSwitchReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;
}
