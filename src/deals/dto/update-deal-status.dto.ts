import { IsEnum } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { DealStatus } from '../schemas/deal.schema';

export class UpdateDealStatusDto {
  @ApiProperty({
    enum: DealStatus,
  })
  @IsEnum(DealStatus)
  status: DealStatus;
}
