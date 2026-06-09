import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateContractDto {
  @IsMongoId()
  bid_id: string;

  @IsOptional()
  @IsString()
  pdf_url?: string;
}
