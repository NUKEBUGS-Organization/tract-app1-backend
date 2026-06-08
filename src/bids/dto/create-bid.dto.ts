import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

import { DueDiligencePeriod, InspectionPeriod } from '../schemas/bid.schema';

export class CreateBidDto {
  @IsNumber()
  @IsPositive()
  bid_price: number;

  @IsEnum(InspectionPeriod)
  inspection_period: InspectionPeriod;

  @IsEnum(DueDiligencePeriod)
  due_diligence_period: DueDiligencePeriod;

  @IsOptional()
  @IsString()
  loi_url?: string;

  @IsOptional()
  @IsString()
  proof_of_funds_url?: string;
}
