import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PropertyLookupQueryDto {
  @ApiProperty({
    example: '123 Main St',
    description: 'Street address ',
  })
  @IsString()
  @IsNotEmpty()
  address1: string;

  @ApiProperty({
    example: 'Newark, NJ 07101',
    description: 'City, state, zip ',
  })
  @IsString()
  @IsNotEmpty()
  address2: string;
}
