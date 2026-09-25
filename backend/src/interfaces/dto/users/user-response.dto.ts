import { UserRole } from '@prisma/client';
import { IsString, IsOptional, Length, Matches } from 'class-validator';

export class UserResponseDto {
  id!: string;
  phone?: string;
  phoneBound?: boolean;
  legacyMigrationStatus?: string;
  legacyMigrationCompleted?: boolean;
  nickname?: string;
  avatarUrl?: string;
  role!: UserRole;
  createdAt!: Date;
  updatedAt!: Date;

  // 统计信息
  dogCount!: number;
  /** 鲜食订单数。账号迁移会拿它判断「有没有需要搬的数据」，语义不要动 */
  orderCount!: number;
  /** 补剂订单数。与鲜食分开计；「我的订单」展示时两者相加 */
  supplementOrderCount!: number;
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
