import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ProceedToClosingDto {
  @ApiProperty({
    required: false,
  })
  @IsOptional()
  @IsString()
  note?: string;
}
