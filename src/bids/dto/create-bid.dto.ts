import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  AgencyRole,
  ClosingTimelineDays,
  DueDiligencePeriod,
  InspectionPeriod,
  PaymentSource,
} from '../schemas/bid.schema';

export class CreateBidDto {
  @IsNumber()
  @IsPositive()
  bid_price: number;

  // Wholesaler-only (required if role === WHOLESALER, validated in service)
  @IsOptional()
  @IsEnum(InspectionPeriod)
  inspection_period?: InspectionPeriod;

  @IsOptional()
  @IsEnum(DueDiligencePeriod)
  due_diligence_period?: DueDiligencePeriod;

  @IsOptional()
  @IsString()
  loi_url?: string;

  @IsOptional()
  @IsString()
  proof_of_funds_url?: string;

  // Realtor-only (required if role === REALTOR, validated in service)
  @IsOptional()
  @IsNumber()
  @Min(2)
  @Max(6)
  commission_percentage?: number;

  @IsOptional()
  @IsEnum(ClosingTimelineDays)
  closing_timeline_days?: ClosingTimelineDays;

  @IsOptional()
  @IsEnum(AgencyRole)
  agency_role?: AgencyRole;

  @IsOptional()
  @IsEnum(PaymentSource)
  payment_source?: PaymentSource;
}
