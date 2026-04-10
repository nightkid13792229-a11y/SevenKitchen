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

type FavoriteRecipeRecord = {
  id: string;
  recipeId: string;
  version: number;
  status: string;
};

type FavoritePrismaClient = Pick<PrismaService, 'recipe' | 'favoriteRecipe'>;

@ApiTags('Favorites')
@Controller('api/v1/favorites')
@UseGuards(AuthGuard)
@ApiSecurity('wechat-auth')
export class FavoritesController {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveRecipeFamily(
    prisma: FavoritePrismaClient,
    recipeId: string,
  ): Promise<{
    businessRecipeId: string;
    versions: FavoriteRecipeRecord[];
    target: FavoriteRecipeRecord;
  } | null> {
    const exactRecipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      select: {
        id: true,
        recipeId: true,
        version: true,
        status: true,
      },
    });

    const businessRecipeId = exactRecipe?.recipeId ?? recipeId;
    const versions = await prisma.recipe.findMany({
      where: { recipeId: businessRecipeId },
      select: {
        id: true,
        recipeId: true,
        version: true,
        status: true,
      },
      orderBy: [{ version: 'desc' }],
    });

    if (versions.length === 0) {
      return null;
    }

    return {
      businessRecipeId,
      versions,
      target: versions.find((version) => version.status === 'PUBLIC') ?? versions[0],
    };
  }

  private async syncFavoriteCounts(
    prisma: FavoritePrismaClient,
    versions: FavoriteRecipeRecord[],
  ): Promise<void> {
    const versionIds = versions.map((version) => version.id);

    await prisma.recipe.updateMany({
      where: {
        id: {
          in: versionIds,
        },
      },
      data: {
        favoriteCount: 0,
      },
    });

    const counts = await prisma.favoriteRecipe.groupBy({
      by: ['recipeId'],
      where: {
        recipeId: {
          in: versionIds,
        },
      },
      _count: {
        recipeId: true,
      },
    });

    for (const row of counts) {
      await prisma.recipe.update({
        where: { id: row.recipeId },
        data: {
          favoriteCount: row._count.recipeId,
        },
      });
    }
  }

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
      return await this.prisma.$transaction(async (tx) => {
        const family = await this.resolveRecipeFamily(tx, recipeId);
        if (!family) {
          return new ApiResponseDto(404, '食谱不存在', null);
        }

        const existingFavorites = await tx.favoriteRecipe.findMany({
          where: {
            userId: user.customerId,
            recipeId: {
              in: family.versions.map((version) => version.id),
            },
          },
        });

        if (existingFavorites.length > 0) {
          return new ApiResponseDto(400, '已收藏该食谱', null);
        }

        await tx.favoriteRecipe.create({
          data: {
            userId: user.customerId,
            recipeId: family.target.id,
          },
        });

        await this.syncFavoriteCounts(tx, family.versions);

        return new ApiResponseDto(0, '收藏成功', null);
      });
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
      return await this.prisma.$transaction(async (tx) => {
        const family = await this.resolveRecipeFamily(tx, recipeId);
        if (!family) {
          return new ApiResponseDto(404, '食谱不存在', null);
        }

        const existingFavorites = await tx.favoriteRecipe.findMany({
          where: {
            userId: user.customerId,
            recipeId: {
              in: family.versions.map((version) => version.id),
            },
          },
        });

        if (existingFavorites.length === 0) {
          return new ApiResponseDto(404, '未收藏该食谱', null);
        }

        await tx.favoriteRecipe.deleteMany({
          where: {
            userId: user.customerId,
            recipeId: {
              in: family.versions.map((version) => version.id),
            },
          },
        });

        await this.syncFavoriteCounts(tx, family.versions);

        return new ApiResponseDto(0, '取消收藏成功', null);
      });
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
      const family = await this.resolveRecipeFamily(this.prisma, recipeId);
      if (!family) {
        return new ApiResponseDto(0, '成功', {
          isFavorite: false,
        });
      }

      const favorites = await this.prisma.favoriteRecipe.findMany({
        where: {
          userId: user.customerId,
          recipeId: {
            in: family.versions.map((version) => version.id),
          },
        },
      });

      return new ApiResponseDto(0, '成功', {
        isFavorite: favorites.length > 0,
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
