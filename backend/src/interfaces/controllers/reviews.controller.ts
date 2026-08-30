/**
 * Reviews Controller
 * Handles recipe review CRUD and photo upload endpoints
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
  ApiConsumes,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ImageContentSafetyError } from '../../infrastructure/services/tencent-cos.service';
import { WechatService } from '../../infrastructure/wechat/wechat.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { CreateReviewDto } from '../dto/reviews/create-review.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { StaffGuard } from '../guards/role.guard';

@ApiTags('Reviews')
@Controller('api/v1')
export class ReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
    private readonly wechatService: WechatService,
  ) {}

  private async validateReviewContent(
    user: RequestUser,
    content: string,
  ): Promise<ApiResponseDto<null> | null> {
    const account = await this.prisma.user.findUnique({
      where: { id: user.customerId },
      select: { wechatOpenid: true },
    });

    if (!account?.wechatOpenid) {
      return ApiResponseDto.error(503, '内容安全验证暂不可用，请稍后重试');
    }

    try {
      const result = await this.wechatService.checkTextContent(
        content,
        account.wechatOpenid,
      );
      if (!result.safe) {
        return ApiResponseDto.error(
          400,
          '发布失败：内容含违规或不适宜信息，请修改后重试',
        );
      }
      return null;
    } catch (error) {
      console.error('评价内容安全验证失败:', error);
      return ApiResponseDto.error(503, '内容安全验证暂不可用，请稍后重试');
    }
  }

  private ensureAdmin(user: RequestUser): ApiResponseDto<null> | null {
    if (user.role !== 'ADMIN') {
      return ApiResponseDto.error(403, 'Only admin can manage reviews');
    }
    return null;
  }

  /**
   * 检查用户是否有权限评价某个食谱
   * 路径1: 成品购买 — 有 SHIPPED/COMPLETED 订单且包含该食谱
   * 路径2: DIY制作 — 有该食谱的 DIYSheet
   */
  private async checkReviewEligibility(
    userId: string,
    internalRecipeId: string,
    businessRecipeId?: string,
  ): Promise<{ eligible: boolean; source: 'PURCHASED' | 'DIY' | null }> {
    // 路径1: 查询已完成/已发货的订单中是否包含该食谱
    const orders = await this.prisma.order.findMany({
      where: {
        customerId: userId,
        status: { in: ['SHIPPED', 'COMPLETED'] },
      },
      include: { items: { select: { recipeSnapshot: true } } },
    });

    for (const order of orders) {
      for (const item of order.items) {
        const snapshot = item.recipeSnapshot as any;
        if (snapshot?.id === internalRecipeId) {
          return { eligible: true, source: 'PURCHASED' };
        }
      }
    }

    // 路径2: 查询是否有该食谱的 DIY 制作单
    // DIY Sheet 存储的 recipeId 可能是内部 UUID 或业务 recipeId，需要同时匹配
    const diySheetWhere: any[] = [
      { userId, recipeId: internalRecipeId },
    ];
    if (businessRecipeId && businessRecipeId !== internalRecipeId) {
      diySheetWhere.push({ userId, recipeId: businessRecipeId });
    }
    const diySheet = await this.prisma.dIYSheet.findFirst({
      where: { OR: diySheetWhere },
    });
    if (diySheet) {
      return { eligible: true, source: 'DIY' };
    }

    return { eligible: false, source: null };
  }

  /**
   * GET /api/v1/recipes/:recipeId/reviews/eligibility
   * 检查当前用户是否有权评价该食谱
   */
  @Get('recipes/:recipeId/reviews/eligibility')
  @UseGuards(AuthGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: '检查评价权限' })
  async checkEligibility(
    @CurrentUser() user: RequestUser,
    @Param('recipeId') recipeId: string,
  ) {
    try {
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [{ id: recipeId }, { recipeId: recipeId }],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(404, '食谱不存在', null);
      }

      const result = await this.checkReviewEligibility(user.customerId, recipe.id, recipe.recipeId);
      return new ApiResponseDto(0, '成功', result);
    } catch (error) {
      console.error('检查评价权限失败:', error);
      return new ApiResponseDto(500, '检查评价权限失败', null);
    }
  }

  /**
   * GET /api/v1/recipes/:recipeId/reviews
   * 获取评论列表（分页）+ 评分汇总
   */
  @Get('recipes/:recipeId/reviews')
  @ApiOperation({ summary: '获取食谱评论列表' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 10 })
  async getReviews(
    @Param('recipeId') recipeId: string,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '10',
  ) {
    try {
      // 查找食谱（支持内部UUID或业务recipeId）
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [{ id: recipeId }, { recipeId: recipeId }],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(404, '食谱不存在', null);
      }

      const internalRecipeId = recipe.id;
      const skip = (Number(page) - 1) * Number(pageSize);
      const take = Number(pageSize);

      const [reviews, total] = await Promise.all([
        this.prisma.recipeReview.findMany({
          where: { recipeId: internalRecipeId },
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        this.prisma.recipeReview.count({
          where: { recipeId: internalRecipeId },
        }),
      ]);

      // 评分汇总
      let avgRating = { ease: 0, value: 0, taste: 0 };
      if (total > 0) {
        const agg = await this.prisma.recipeReview.aggregate({
          where: { recipeId: internalRecipeId },
          _avg: {
            ratingEase: true,
            ratingValue: true,
            ratingTaste: true,
          },
        });
        avgRating = {
          ease: Math.round((agg._avg.ratingEase || 0) * 10) / 10,
          value: Math.round((agg._avg.ratingValue || 0) * 10) / 10,
          taste: Math.round((agg._avg.ratingTaste || 0) * 10) / 10,
        };
      }

      return new ApiResponseDto(0, '成功', {
        avgRating,
        totalCount: total,
        list: reviews,
        page: Number(page),
        pageSize: Number(pageSize),
        totalPages: Math.ceil(total / Number(pageSize)),
      });
    } catch (error) {
      console.error('获取评论列表失败:', error);
      return new ApiResponseDto(500, '获取评论列表失败', null);
    }
  }

  @Get('admin/reviews')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: 'Admin list recipe reviews' })
  async listAdminReviews(
    @CurrentUser() user: RequestUser,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Query('keyword') keyword?: string,
  ) {
    const forbidden = this.ensureAdmin(user);
    if (forbidden) return forbidden;

    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const skip = (parsedPage - 1) * parsedPageSize;
    const where: any = keyword?.trim()
      ? {
          OR: [
            { content: { contains: keyword.trim(), mode: 'insensitive' } },
            { recipe: { name: { contains: keyword.trim(), mode: 'insensitive' } } },
            { user: { nickname: { contains: keyword.trim(), mode: 'insensitive' } } },
          ],
        }
      : {};

    const [list, total] = await Promise.all([
      this.prisma.recipeReview.findMany({
        where,
        include: {
          recipe: { select: { id: true, name: true, recipeId: true } },
          user: { select: { id: true, nickname: true, phone: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parsedPageSize,
      }),
      this.prisma.recipeReview.count({ where }),
    ]);

    return ApiResponseDto.success({
      list,
      total,
      page: parsedPage,
      pageSize: parsedPageSize,
    });
  }

  @Post('admin/reviews')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: 'Admin create recipe review' })
  async createAdminReview(
    @CurrentUser() user: RequestUser,
    @Body()
    dto: CreateReviewDto & {
      recipeId: string;
      userId?: string;
    },
  ) {
    const forbidden = this.ensureAdmin(user);
    if (forbidden) return forbidden;

    const recipe = await this.prisma.recipe.findFirst({
      where: { OR: [{ id: dto.recipeId }, { recipeId: dto.recipeId }] },
      select: { id: true },
    });
    if (!recipe) {
      return ApiResponseDto.error(404, 'Recipe not found');
    }

    const securityError = await this.validateReviewContent(user, dto.content);
    if (securityError) return securityError;

    const review = await this.prisma.recipeReview.create({
      data: {
        userId: dto.userId || user.customerId,
        recipeId: recipe.id,
        ratingEase: dto.ratingEase,
        ratingValue: dto.ratingValue,
        ratingTaste: dto.ratingTaste,
        content: dto.content,
        photos: dto.photos || [],
        source: 'ADMIN',
      },
      include: {
        recipe: { select: { id: true, name: true, recipeId: true } },
        user: { select: { id: true, nickname: true, phone: true, avatarUrl: true } },
      },
    });

    return ApiResponseDto.success(review);
  }

  @Delete('admin/reviews/:reviewId')
  @UseGuards(AuthGuard, StaffGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: 'Admin delete any recipe review' })
  async deleteAdminReview(
    @CurrentUser() user: RequestUser,
    @Param('reviewId') reviewId: string,
  ) {
    const forbidden = this.ensureAdmin(user);
    if (forbidden) return forbidden;

    const review = await this.prisma.recipeReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      return ApiResponseDto.error(404, 'Review not found');
    }

    await this.prisma.recipeReview.delete({ where: { id: reviewId } });
    return ApiResponseDto.success(null);
  }

  /**
   * POST /api/v1/recipes/:recipeId/reviews
   * 发表评论
   */
  @Post('recipes/:recipeId/reviews')
  @UseGuards(AuthGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: '发表食谱评论' })
  async createReview(
    @CurrentUser() user: RequestUser,
    @Param('recipeId') recipeId: string,
    @Body() dto: CreateReviewDto,
  ) {
    try {
      // 查找食谱
      const recipe = await this.prisma.recipe.findFirst({
        where: {
          OR: [{ id: recipeId }, { recipeId: recipeId }],
        },
      });

      if (!recipe) {
        return new ApiResponseDto(404, '食谱不存在', null);
      }

      const securityError = await this.validateReviewContent(user, dto.content);
      if (securityError) return securityError;

      // 权限检查：只有购买或 DIY 制作过该食谱的用户才能评价
      const eligibility = await this.checkReviewEligibility(user.customerId, recipe.id, recipe.recipeId);
      if (!eligibility.eligible) {
        return new ApiResponseDto(403, '您需要购买或制作过该食谱才能评价', null);
      }

      const review = await this.prisma.recipeReview.create({
        data: {
          userId: user.customerId,
          recipeId: recipe.id,
          ratingEase: dto.ratingEase,
          ratingValue: dto.ratingValue,
          ratingTaste: dto.ratingTaste,
          content: dto.content,
          photos: dto.photos || [],
          source: eligibility.source!,
        },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatarUrl: true,
            },
          },
        },
      });

      return new ApiResponseDto(0, '评论成功', review);
    } catch (error) {
      console.error('发表评论失败:', error);
      return new ApiResponseDto(500, '发表评论失败', null);
    }
  }

  /**
   * DELETE /api/v1/reviews/:reviewId
   * 删除自己的评论
   */
  @Delete('reviews/:reviewId')
  @UseGuards(AuthGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: '删除自己的评论' })
  async deleteReview(
    @CurrentUser() user: RequestUser,
    @Param('reviewId') reviewId: string,
  ) {
    try {
      const review = await this.prisma.recipeReview.findUnique({
        where: { id: reviewId },
      });

      if (!review) {
        return new ApiResponseDto(404, '评论不存在', null);
      }

      if (review.userId !== user.customerId) {
        return new ApiResponseDto(403, '无权删除此评论', null);
      }

      // 删除评论图片（COS存储桶）
      const photos = review.photos as string[];
      if (Array.isArray(photos)) {
        for (const url of photos) {
          if (typeof url === 'string' && url.trim()) {
            await this.cosService.deleteImageByUrl(url).catch((err) => {
              console.error('[Reviews] 删除评论图片失败:', url, err);
            });
          }
        }
      }

      await this.prisma.recipeReview.delete({
        where: { id: reviewId },
      });

      return new ApiResponseDto(0, '删除成功', null);
    } catch (error) {
      console.error('删除评论失败:', error);
      return new ApiResponseDto(500, '删除评论失败', null);
    }
  }

  /**
   * POST /api/v1/reviews/upload-photos
   * 上传评论图片（最多6张）
   */
  @Post('reviews/upload-photos')
  @UseGuards(AuthGuard)
  @ApiSecurity('wechat-auth')
  @ApiOperation({ summary: '上传评论图片（最多6张）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 6))
  async uploadPhotos(
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的照片');
    }

    if (files.length > 6) {
      throw new BadRequestException('最多只能上传6张照片');
    }

    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
    for (const file of files) {
      if (file.size > maxSize) {
        throw new BadRequestException('每张照片大小不能超过10MB');
      }
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException('只支持 JPG、PNG、GIF 格式的照片');
      }
    }

    try {
      const uploadPromises = files.map((file) =>
        this.cosService.uploadReviewedImage(file),
      );

      const results = await Promise.all(uploadPromises);

      return ApiResponseDto.success({
        photos: results,
        count: results.length,
      });
    } catch (error) {
      console.error('[Reviews] Photo upload failed:', error);
      if (error instanceof ImageContentSafetyError) {
        throw error;
      }
      throw new BadRequestException('照片上传失败，请重试');
    }
  }
}
