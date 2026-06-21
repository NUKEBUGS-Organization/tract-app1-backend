import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({
    example: 'Fraudulent activity detected',
  })
  @IsString()
  @MinLength(3)
  reason: string;
}
