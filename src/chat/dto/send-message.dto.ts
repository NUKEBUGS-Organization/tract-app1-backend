import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example: 'Hello, when would you like to close?',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
}
