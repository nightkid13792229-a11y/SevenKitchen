/**
 * Users Controller
 * Handles user profile related endpoints
 */

import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UsePipes,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { UserResponseDto, UpdateUserDto } from '../dto/users/user-response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Users')
@Controller('api/v1/users')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseGuards(AuthGuard)
@ApiSecurity('wechat-auth')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
  ) {}

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
            favoriteRecipes: true,
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
      phoneBound: !!userData.phone,
      nickname: userData.nickname ?? undefined,
      avatarUrl: userData.avatarUrl ?? undefined,
      role: userData.role,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      dogCount: userData._count.dogs,
      orderCount: userData._count.orders,
      addressCount: userData._count.addresses,
      diySheetCount: userData._count.diySheets,
      favoriteRecipeCount: userData._count.favoriteRecipes,
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
      if (
        updateUserDto.nickname.length < 1 ||
        updateUserDto.nickname.length > 20
      ) {
        return new ApiResponseDto(400, '昵称长度必须在1-20个字符之间', null);
      }
    }

    // 更新用户信息
    const updatedUser = await this.prisma.user.update({
      where: { id: requestUser.customerId },
      data: {
        ...(updateUserDto.phone !== undefined && {
          phone: updateUserDto.phone,
        }),
        ...(updateUserDto.nickname !== undefined && {
          nickname: updateUserDto.nickname,
        }),
        ...(updateUserDto.avatarUrl !== undefined && {
          avatarUrl: updateUserDto.avatarUrl || null,
        }),
      },
      include: {
        _count: {
          select: {
            dogs: true,
            orders: true,
            addresses: true,
            diySheets: true,
            favoriteRecipes: true,
          },
        },
      },
    });

    const response: UserResponseDto = {
      id: updatedUser.id,
      phone: updatedUser.phone ?? undefined,
      phoneBound: !!updatedUser.phone,
      nickname: updatedUser.nickname ?? undefined,
      avatarUrl: updatedUser.avatarUrl ?? undefined,
      role: updatedUser.role,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
      dogCount: updatedUser._count.dogs,
      orderCount: updatedUser._count.orders,
      addressCount: updatedUser._count.addresses,
      diySheetCount: updatedUser._count.diySheets,
      favoriteRecipeCount: updatedUser._count.favoriteRecipes,
    };

    return new ApiResponseDto(0, '更新成功', response);
  }

  @Post('me/avatar')
  @ApiOperation({ summary: '上传用户头像' })
  @ApiResponse({
    status: 200,
    description: '成功上传头像',
    type: ApiResponseDto,
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() requestUser: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return new ApiResponseDto(400, '请选择头像文件', null);
    }

    try {
      // 获取当前用户信息，查看是否有旧头像
      const currentUser = await this.prisma.user.findUnique({
        where: { id: requestUser.customerId },
        select: { avatarUrl: true },
      });

      // 如果存在旧头像，先删除
      if (currentUser?.avatarUrl) {
        console.log(
          `[UsersController] Deleting old avatar: ${currentUser.avatarUrl}`,
        );
        try {
          await this.cosService.deleteImageByUrl(currentUser.avatarUrl);
        } catch (deleteError) {
          console.error(
            '[UsersController] Failed to delete old avatar:',
            deleteError,
          );
          // 继续上传新头像，不阻断流程
        }
      }

      // 上传新头像到腾讯云 COS
      const uploadResult = await this.cosService.uploadImage(
        file.buffer,
        file.originalname,
        `avatars/${requestUser.customerId}`,
      );

      // 更新用户头像
      const updatedUser = await this.prisma.user.update({
        where: { id: requestUser.customerId },
        data: { avatarUrl: uploadResult.url },
      });

      return new ApiResponseDto(0, '上传成功', { url: uploadResult.url });
    } catch (error: any) {
      console.error('上传头像失败:', error);
      return new ApiResponseDto(500, error.message || '上传失败', null);
    }
  }
}
