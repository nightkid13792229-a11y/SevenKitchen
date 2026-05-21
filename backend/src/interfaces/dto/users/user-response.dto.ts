import { UserRole } from '@prisma/client';
import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class UserResponseDto {
  id!: string;
  phone?: string;
  phoneBound?: boolean;
  nickname?: string;
  avatarUrl?: string;
  role!: UserRole;
  createdAt!: Date;
  updatedAt!: Date;

  // 统计信息
  dogCount!: number;
  orderCount!: number;
  addressCount!: number;
  diySheetCount!: number;
  favoriteRecipeCount!: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 20, { message: '昵称长度必须在1-20个字符之间' })
  nickname?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
