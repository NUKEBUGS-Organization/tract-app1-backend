import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateContractDto {
  @IsString()
  bid_id: string;

  @IsOptional()
  @IsString()
  buyer_address?: string;

  @IsOptional()
  @IsString()
  property_block?: string;

  @IsOptional()
  @IsString()
  property_lot?: string;

  @IsOptional()
  @IsNumber()
  emd_amount?: number;

  @IsOptional()
  @IsNumber()
  closing_days?: number;
}
