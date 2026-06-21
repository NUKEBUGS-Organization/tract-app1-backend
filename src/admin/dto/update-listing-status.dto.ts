import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

import { ListingStatus } from '../../listings/schemas/listing.schema';

export class UpdateListingStatusDto {
  @ApiProperty({
    enum: ListingStatus,
  })
  @IsEnum(ListingStatus)
  status: ListingStatus;

  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}