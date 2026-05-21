import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class WechatUserInfo {
  @ApiProperty({ description: 'User nickname', required: false })
  @IsString()
  nickname?: string;

  @ApiProperty({ description: 'WeChat nickName (camelCase)', required: false })
  @IsString()
  @IsOptional()
  nickName?: string; // WeChat API returns nickName in camelCase

  @ApiProperty({ description: 'User avatar URL', required: false })
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ description: 'User gender', required: false })
  @IsOptional()
  gender?: number;

  @ApiProperty({ description: 'User city', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ description: 'User province', required: false })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiProperty({ description: 'User country', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ description: 'User language', required: false })
  @IsString()
  @IsOptional()
  language?: string;
}

export class WechatLoginRequestDto {
  @ApiProperty({ description: 'WeChat code from wx.login()' })
  @IsString()
  code!: string;

  @ApiProperty({
    description:
      'Mini Program AppID, used when multiple AppIDs share this backend',
    required: false,
  })
  @IsString()
  @IsOptional()
  appId?: string;

  @ApiProperty({ description: 'User info from WeChat', required: false })
  @IsOptional()
  @IsObject()
  userInfo?: WechatUserInfo;
}

export class BindWechatPhoneRequestDto {
  @ApiProperty({ description: 'Code from wx.getPhoneNumber' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Current Mini Program AppID', required: false })
  @IsString()
  @IsOptional()
  appId?: string;
}

export class ConfirmPhoneMergeRequestDto {
  @ApiProperty({
    description: 'Merge confirmation token returned by bind-phone',
  })
  @IsString()
  mergeToken!: string;
}

export class WechatLoginResponseDto {
  @ApiProperty({ description: 'JWT token' })
  token!: string;

  @ApiProperty({ description: 'User ID' })
  userId!: string;

  @ApiProperty({
    description: 'User role',
    enum: ['CUSTOMER', 'STAFF', 'ADMIN'],
  })
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
