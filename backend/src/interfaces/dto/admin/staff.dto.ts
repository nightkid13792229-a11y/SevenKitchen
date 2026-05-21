import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ description: '姓名', example: '张三' })
  @IsString()
  @IsNotEmpty()
  nickname!: string;

  @ApiProperty({
    description: '部门',
    enum: ['KITCHEN', 'PURCHASING', 'SHIPPING'],
    example: 'KITCHEN',
  })
  @IsEnum(['KITCHEN', 'PURCHASING', 'SHIPPING'])
  department!: 'KITCHEN' | 'PURCHASING' | 'SHIPPING';
}

export class UpdateStaffDto {
  @ApiProperty({ description: '姓名', required: false })
  @IsString()
  @IsOptional()
  nickname?: string;

  @ApiProperty({
    description: '状态',
    enum: ['ACTIVE', 'INACTIVE', 'BANNED'],
    required: false,
  })
  @IsEnum(['ACTIVE', 'INACTIVE', 'BANNED'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE' | 'BANNED';

  @ApiProperty({
    description: '角色',
    enum: ['CUSTOMER', 'STAFF', 'ADMIN'],
    required: false,
  })
  @IsEnum(['CUSTOMER', 'STAFF', 'ADMIN'])
  @IsOptional()
  role?: 'CUSTOMER' | 'STAFF' | 'ADMIN';
}

export class StaffResponseDto {
  @ApiProperty({ description: '用户ID' })
  id!: string;

  @ApiProperty({ description: '手机号' })
  phone!: string;

  @ApiProperty({ description: '姓名' })
  nickname!: string;

  @ApiProperty({ description: '角色', enum: ['CUSTOMER', 'STAFF', 'ADMIN'] })
  role!: string;

  @ApiProperty({ description: '状态', enum: ['ACTIVE', 'INACTIVE', 'BANNED'] })
  status!: string;

  @ApiProperty({ description: '最后登录时间', required: false })
  lastLoginAt?: Date | null;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;
}
