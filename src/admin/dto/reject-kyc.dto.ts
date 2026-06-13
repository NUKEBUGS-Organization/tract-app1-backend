import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RejectKycDto {
  @ApiProperty({
    example: 'Document is blurry',
  })
  @IsString()
  reason: string;
}
