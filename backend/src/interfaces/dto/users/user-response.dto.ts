import { UserRole } from '@prisma/client';

export class UserResponseDto {
  id!: string;
  phone?: string;
  nickname?: string;
  role!: UserRole;
  createdAt!: Date;
  updatedAt!: Date;

  // 统计信息
  dogCount!: number;
  orderCount!: number;
  addressCount!: number;
}

export class UpdateUserDto {
  nickname?: string;
  phone?: string;
}
