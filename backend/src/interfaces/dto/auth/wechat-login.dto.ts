import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class WechatUserInfo {
  @ApiProperty({ description: 'User nickname', required: false })
  @IsString()
  nickname?: string;

  @ApiProperty({ description: 'User avatar URL', required: false })
  @IsString()
  avatarUrl?: string;
}

export class WechatLoginRequestDto {
  @ApiProperty({ description: 'WeChat code from wx.login()' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'User info from WeChat', required: false })
  @IsOptional()
  @IsObject()
  userInfo?: WechatUserInfo;
}

export class WechatLoginResponseDto {
  @ApiProperty({ description: 'JWT token' })
  token!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({ description: 'User role', enum: ['CUSTOMER', 'STAFF', 'ADMIN'] })
  role!: string;

  @ApiProperty({ description: 'Is first time login' })
  isNewUser!: boolean;

  @ApiProperty({ description: 'User profile', required: false })
  user?: {
    id: string;
    nickname?: string;
    avatarUrl?: string;
    role: string;
  };
}
