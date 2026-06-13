import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PropertyType, PropertyCondition } from '../schemas/listing.schema';

class ConditionReportDto {
  @ApiPropertyOptional({ enum: PropertyCondition })
  @IsOptional()
  @IsEnum(PropertyCondition)
  roof?: PropertyCondition;

  @ApiPropertyOptional({ enum: PropertyCondition })
  @IsOptional()
  @IsEnum(PropertyCondition)
  hvac?: PropertyCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wetlands?: boolean;

  @ApiPropertyOptional({ enum: PropertyCondition })
  @IsOptional()
  @IsEnum(PropertyCondition)
  overall?: PropertyCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateListingDto {
  @ApiProperty({ enum: PropertyType })
  @IsEnum(PropertyType)
  property_type: PropertyType;

  @ApiProperty({ example: '123 Main St, Newark' })
  @IsString()
  address: string;

  @ApiProperty({ example: '07101' })
  @IsString()
  zip_code: string;

  @ApiProperty({ example: 'NJ' })
  @IsString()
  state_code: string;

  @ApiProperty({ example: 1995 })
  @IsNumber()
  @Min(1800)
  @Max(new Date().getFullYear())
  year_built: number;

  @ApiProperty({ example: 'Residential' })
  @IsString()
  zoning: string;

  @ApiProperty({ example: 250000 })
  @IsNumber()
  @Min(1)
  market_price: number;

  @ApiPropertyOptional({
    example: 200000,
    description: 'Hidden floor price — auto-blocks lowball bids',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  hidden_reserve?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  has_liens?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lien_disclosure?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_preforeclosure?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  mortgage_amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_vacant?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_off_market?: boolean;

  @ApiPropertyOptional({ type: ConditionReportDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ConditionReportDto)
  condition_report?: ConditionReportDto;

  @ApiPropertyOptional({ example: 'Need to relocate' })
  @IsOptional()
  @IsString()
  motivation?: string;

  @ApiPropertyOptional({ example: '30 days' })
  @IsOptional()
  @IsString()
  sell_timeline?: string;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  realtor_commission?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  proof_of_funds_required?: boolean;

  @ApiPropertyOptional({ example: 4, description: 'Required for multi-family' })
  @IsOptional()
  @IsNumber()
  unit_count?: number;
}
