import {
  IsOptional,
  IsString,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  state_code?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;
}

export class BanUserDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
