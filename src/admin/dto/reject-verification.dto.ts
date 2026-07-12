import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RejectVerificationDto {
  @ApiProperty({
    example: 'State license number could not be verified',
  })
  @IsString()
  reason: string;
}
