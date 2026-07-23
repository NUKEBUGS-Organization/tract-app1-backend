import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsString,
  IsDateString,
  IsMobilePhone,
  IsOptional,
  MinLength,
} from 'class-validator';
import { APP1_REGISTER_ROLES, Role } from '../../users/schemas/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  fullName: string;

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

  @ApiProperty({
    enum: APP1_REGISTER_ROLES,
    example: Role.SELLER,
    description: 'Public registration roles (admin must be seeded)',
  })
  @IsIn(APP1_REGISTER_ROLES, {
    message: 'Role must be one of: seller, wholesaler, realtor',
  })
  role: Role;

  @ApiProperty({ example: 'TX' })
  @IsString()
  stateCode: string;

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
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    required: false,
    description:
      'Optional body fallback for one transition release; prefer httpOnly refreshToken cookie',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  resetToken: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
