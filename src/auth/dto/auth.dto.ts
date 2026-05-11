import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsString,
  IsDateString,
  IsMobilePhone,
  MinLength,
} from 'class-validator';
import { Role } from '../../users/schemas/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  full_name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+12345678900' })
  @IsMobilePhone()
  phone: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: Role, example: Role.SELLER })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'TX' })
  @IsString()
  state_code: string;

  @ApiProperty({ example: '1990-01-15' })
  @IsDateString()
  dob: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123!' })
  @IsString()
  password: string;
}

export class SendOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ['login', 'forgot_password'], example: 'login' })
  @IsString()
  purpose: 'login' | 'forgot_password';
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  otp: string;

  @ApiProperty({ enum: ['login', 'forgot_password'], example: 'login' })
  @IsString()
  purpose: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  refresh_token: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  reset_token: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(8)
  new_password: string;
}
