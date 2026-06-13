import {
  IsOptional,
  IsString,
  IsDateString,
  IsNotEmpty,
  MinLength
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

export class ChangePasswordDto {
  @IsString()
  current_password: string;

  @IsString()
  @MinLength(8)
  new_password: string;
}
