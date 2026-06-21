import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RejectListingDto {
  @ApiProperty({
    example: 'Missing required disclosures',
  })
  @IsString()
  reason: string;
}
