import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsMongoId, IsOptional, Min } from 'class-validator';
import { ScoreEventType } from '../schemas/score-event.schema';

export class GetScoreEventsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  user_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  deal_id?: string;

  @ApiPropertyOptional({ enum: ScoreEventType })
  @IsOptional()
  @IsEnum(ScoreEventType)
  event_type?: ScoreEventType;
}
