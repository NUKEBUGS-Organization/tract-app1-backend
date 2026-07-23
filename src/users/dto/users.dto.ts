import {
  IsOptional,
  IsString,
  IsDateString,
  IsNotEmpty,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  stateCode?: string;

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
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
