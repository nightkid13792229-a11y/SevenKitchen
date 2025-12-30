import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SendSmsRequestDto {
  @ApiProperty({ description: 'Phone number', example: '13800138000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;
}

export class SendSmsResponseDto {
  @ApiProperty({ description: 'Send success' })
  success!: boolean;

  @ApiProperty({ description: 'Expire in seconds', required: false })
  expireIn?: number;
}

export class PhoneLoginRequestDto {
  @ApiProperty({ description: 'Phone number', example: '13800138000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ description: 'SMS verification code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class PhoneLoginResponseDto {
  @ApiProperty({ description: 'JWT token' })
  token!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'User role', enum: ['CUSTOMER', 'STAFF', 'ADMIN'] })
  role!: string;

  @ApiProperty({ description: 'User profile' })
  user!: {
    id: string;
    phone: string;
    nickname?: string;
    role: string;
  };
}
