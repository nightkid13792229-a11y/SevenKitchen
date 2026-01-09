/**
 * Users Controller
 * Handles user profile related endpoints
 */

import {
  Controller,
  Get,
  Put,
  Body,
  UsePipes,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { UserResponseDto, UpdateUserDto } from '../dto/users/user-response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Users')
@Controller('api/v1/users')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseGuards(AuthGuard)
@ApiSecurity('wechat-auth')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '成功获取用户信息',
    type: ApiResponseDto,
  })
  async getCurrentUser(@CurrentUser() user: RequestUser) {
    const userData = await this.prisma.user.findUnique({
      where: { id: user.customerId },
      include: {
        _count: {
          select: {
            dogs: true,
            orders: true,
            addresses: true,
            diySheets: true,
          },
        },
      },
    });

    if (!userData) {
      return new ApiResponseDto(404, '用户不存在', null);
    }

    const response: UserResponseDto = {
      id: userData.id,
      phone: userData.phone ?? undefined,
      nickname: userData.nickname ?? undefined,
      role: userData.role,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      dogCount: userData._count.dogs,
      orderCount: userData._count.orders,
      addressCount: userData._count.addresses,
      diySheetCount: userData._count.diySheets,
      favoriteRecipeCount: 0, // TODO: 实现收藏功能后添加统计
    };

    return new ApiResponseDto(0, '成功', response);
  }

  @Put('me')
  @ApiOperation({ summary: '更新当前用户信息' })
  @ApiResponse({
    status: 200,
    description: '成功更新用户信息',
    type: ApiResponseDto,
  })
  async updateUser(
    @CurrentUser() requestUser: RequestUser,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    // 验证手机号格式（如果提供）
    if (updateUserDto.phone) {
      const phoneRegex = /^1[3-9]\d{9}$/;
      if (!phoneRegex.test(updateUserDto.phone)) {
        return new ApiResponseDto(400, '手机号格式不正确', null);
      }
    }

    // 验证昵称长度（如果提供）
    if (updateUserDto.nickname !== undefined) {
      if (updateUserDto.nickname.length < 1 || updateUserDto.nickname.length > 20) {
        return new ApiResponseDto(400, '昵称长度必须在1-20个字符之间', null);
      }
    }

    // 更新用户信息
    const updatedUser = await this.prisma.user.update({
      where: { id: requestUser.customerId },
      data: {
        ...(updateUserDto.phone !== undefined && { phone: updateUserDto.phone }),
        ...(updateUserDto.nickname !== undefined && { nickname: updateUserDto.nickname }),
      },
      include: {
        _count: {
          select: {
            dogs: true,
            orders: true,
            addresses: true,
            diySheets: true,
          },
        },
      },
    });

    const response: UserResponseDto = {
      id: updatedUser.id,
      phone: updatedUser.phone ?? undefined,
      nickname: updatedUser.nickname ?? undefined,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      dogCount: updatedUser._count.dogs,
      orderCount: updatedUser._count.orders,
      addressCount: updatedUser._count.addresses,
      diySheetCount: updatedUser._count.diySheets,
      favoriteRecipeCount: 0, // TODO: 实现收藏功能后添加统计
    };

    return new ApiResponseDto(0, '更新成功', response);
  }
}
