import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ScoreEventType } from '../schemas/score-event.schema';

export class ApplyPenaltyDto {
  @ApiProperty({ description: 'User receiving the penalty' })
  @IsMongoId()
  user_id: string;

  @ApiProperty({ enum: ScoreEventType })
  @IsEnum(ScoreEventType)
  event_type: ScoreEventType;

  @ApiPropertyOptional({ description: 'Deal this penalty relates to, if any' })
  @IsOptional()
  @IsMongoId()
  deal_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Explicit delta — required for manual_adjustment, ignored for all other event types (looked up from score rules).',
  })
  @IsOptional()
  @IsNumber()
  delta?: number;
}
