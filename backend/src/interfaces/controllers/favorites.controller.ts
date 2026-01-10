/**
 * Favorites Controller
 * Handles recipe favorite/unfavorite endpoints
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';

@ApiTags('Favorites')
@Controller('api/v1/favorites')
@UseGuards(AuthGuard)
@ApiSecurity('wechat-auth')
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':recipeId')
  @ApiOperation({ summary: '收藏食谱' })
  @ApiResponse({
    status: 200,
    description: '成功收藏',
    type: ApiResponseDto,
  })
  async addFavorite(
    @CurrentUser() user: RequestUser,
    @Param('recipeId') recipeId: string,
  ) {
    try {
      // 检查食谱是否存在（支持内部UUID或业务recipeId）
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [
            { id: recipeId },
            { recipeId: recipeId },
          ],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(404, '食谱不存在', null);
      }

      // 使用内部UUID作为recipeId
      const internalRecipeId = recipe.id;

      // 检查是否已收藏
      const existing = await this.prisma.favoriteRecipe.findUnique({
        where: {
          userId_recipeId: {
            userId: user.customerId,
            recipeId: internalRecipeId,
          },
        },
      });

      if (existing) {
        return new ApiResponseDto(400, '已收藏该食谱', null);
      }

      // 创建收藏记录
      await this.prisma.favoriteRecipe.create({
        data: {
          userId: user.customerId,
          recipeId: internalRecipeId,
        },
      });

      // 更新食谱的收藏计数
      await this.prisma.recipe.update({
        where: { id: internalRecipeId },
        data: {
          favoriteCount: {
            increment: 1,
          },
        },
      });

      return new ApiResponseDto(0, '收藏成功', null);
    } catch (error) {
      console.error('收藏食谱失败:', error);
      return new ApiResponseDto(500, '收藏失败', null);
    }
  }

  @Delete(':recipeId')
  @ApiOperation({ summary: '取消收藏食谱' })
  @ApiResponse({
    status: 200,
    description: '成功取消收藏',
    type: ApiResponseDto,
  })
  async removeFavorite(
    @CurrentUser() user: RequestUser,
    @Param('recipeId') recipeId: string,
  ) {
    try {
      // 查找食谱（支持内部UUID或业务recipeId）
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [
            { id: recipeId },
            { recipeId: recipeId },
          ],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(404, '食谱不存在', null);
      }

      // 使用内部UUID
      const internalRecipeId = recipe.id;

      // 检查收藏记录是否存在
      const favorite = await this.prisma.favoriteRecipe.findUnique({
        where: {
          userId_recipeId: {
            userId: user.customerId,
            recipeId: internalRecipeId,
          },
        },
      });

      if (!favorite) {
        return new ApiResponseDto(404, '未收藏该食谱', null);
      }

      // 删除收藏记录
      await this.prisma.favoriteRecipe.delete({
        where: {
          userId_recipeId: {
            userId: user.customerId,
            recipeId: internalRecipeId,
          },
        },
      });

      // 更新食谱的收藏计数
      await this.prisma.recipe.update({
        where: { id: internalRecipeId },
        data: {
          favoriteCount: {
            decrement: 1,
          },
        },
      });

      return new ApiResponseDto(0, '取消收藏成功', null);
    } catch (error) {
      console.error('取消收藏失败:', error);
      return new ApiResponseDto(500, '取消收藏失败', null);
    }
  }

  @Get('check/:recipeId')
  @ApiOperation({ summary: '检查是否收藏食谱' })
  @ApiResponse({
    status: 200,
    description: '成功检查收藏状态',
    type: ApiResponseDto,
  })
  async checkFavorite(
    @CurrentUser() user: RequestUser,
    @Param('recipeId') recipeId: string,
  ) {
    try {
      // 查找食谱（支持内部UUID或业务recipeId）
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [
            { id: recipeId },
            { recipeId: recipeId },
          ],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(0, '成功', {
          isFavorite: false,
        });
      }

      // 使用内部UUID检查收藏状态
      const favorite = await this.prisma.favoriteRecipe.findUnique({
        where: {
          userId_recipeId: {
            userId: user.customerId,
            recipeId: recipe.id,
          },
        },
      });

      return new ApiResponseDto(0, '成功', {
        isFavorite: !!favorite,
      });
    } catch (error) {
      console.error('检查收藏状态失败:', error);
      return new ApiResponseDto(500, '检查失败', null);
    }
  }

  @Get()
  @ApiOperation({ summary: '获取收藏列表' })
  @ApiResponse({
    status: 200,
    description: '成功获取收藏列表',
    type: ApiResponseDto,
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 20 })
  async getFavorites(
    @CurrentUser() user: RequestUser,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    try {
      const skip = (Number(page) - 1) * Number(pageSize);
      const take = Number(pageSize);

      // 查询收藏记录
      const [favorites, total] = await Promise.all([
        this.prisma.favoriteRecipe.findMany({
          where: {
            userId: user.customerId,
          },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take,
        }),
        this.prisma.favoriteRecipe.count({
          where: {
            userId: user.customerId,
          },
        }),
      ]);

      // 获取食谱详细信息
      const recipeIds = favorites.map((f) => f.recipeId);
      const recipes = await this.prisma.recipe.findMany({
        where: {
          id: {
            in: recipeIds,
          },
        },
        select: {
          id: true,
          recipeId: true,
          version: true,
          name: true,
          coverImageUrl: true,
          description: true,
          energyDensityKcalPerKg: true,
          applicableLifeStages: true,
          targetHealthTags: true,
        },
      });

      // 组合数据，按收藏时间排序
      const favoriteList = favorites.map((favorite) => {
        const recipe = recipes.find((r) => r.id === favorite.recipeId);
        return {
          id: favorite.id,
          recipeId: favorite.recipeId,
          recipe: recipe || null,
          createdAt: favorite.createdAt,
        };
      });

      return new ApiResponseDto(0, '成功', {
        list: favoriteList,
        total,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize)),
      });
    } catch (error) {
      console.error('获取收藏列表失败:', error);
      return new ApiResponseDto(500, '获取失败', null);
    }
  }
}
