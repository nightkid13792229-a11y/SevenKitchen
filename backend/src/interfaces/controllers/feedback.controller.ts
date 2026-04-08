/**
 * Feedback Controller
 * Handles user feedback submission and management
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
  UploadedFile,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard, CurrentUser } from '../auth';
import type { RequestUser } from '../auth';
import { CreateFeedbackDto } from '../dto/feedback/create-feedback.dto';
import { CreateFeedbackReplyDto } from '../dto/feedback/create-feedback-reply.dto';

@ApiTags('Feedback')
@Controller('api/v1/feedback')
@UseGuards(AuthGuard)
@ApiSecurity('wechat-auth')
export class FeedbackController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: TencentCosService,
  ) {}

  @Post('upload-image')
  @ApiOperation({ summary: '上传反馈图片' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: '图片上传成功',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'File URL' },
            key: { type: 'string', description: 'COS object key' },
          },
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请选择图片');
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('图片大小不能超过10MB');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 JPG、PNG、GIF、WEBP 格式');
    }

    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'feedback-images',
      );
      return ApiResponseDto.success(result);
    } catch (error) {
      console.error('[Feedback] Upload failed:', error);
      throw new BadRequestException('图片上传失败');
    }
  }

  @Delete('upload-image')
  @ApiOperation({ summary: '删除反馈图片（提交前移除）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'COS文件Key',
        },
      },
      required: ['key'],
    },
  })
  async deleteImage(@Body() dto: { key: string }) {
    if (!dto.key) {
      throw new BadRequestException('缺少文件Key');
    }

    try {
      await this.cosService.deleteImage(dto.key);
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error('[Feedback] Failed to delete image:', error);
      throw new BadRequestException('删除失败，请重试');
    }
  }

  @Post()
  @ApiOperation({ summary: '提交反馈' })
  @ApiResponse({ status: 201, description: '反馈提交成功', type: ApiResponseDto })
  async createFeedback(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateFeedbackDto,
  ) {
    if (!dto.type || !dto.content?.trim()) {
      return new ApiResponseDto(400, '反馈类型和内容不能为空', null);
    }

    try {
      const feedback = await this.prisma.feedback.create({
        data: {
          userId: user.customerId,
          type: dto.type,
          content: dto.content.trim(),
          imageUrls: dto.imageUrls || [],
          imageKeys: dto.imageKeys || [],
        },
        include: {
          user: {
            select: { nickname: true, avatarUrl: true },
          },
        },
      });

      return ApiResponseDto.success(feedback);
    } catch (error) {
      console.error('[Feedback] Create failed:', error);
      return new ApiResponseDto(500, '提交失败，请重试', null);
    }
  }

  @Get()
  @ApiOperation({ summary: '获取反馈列表' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  async getFeedbacks(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const size = Math.min(50, Math.max(1, parseInt(pageSize || '10', 10)));
    const skip = (pageNum - 1) * size;

    try {
      const [items, total] = await Promise.all([
        this.prisma.feedback.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take: size,
          include: {
            user: {
              select: { nickname: true, avatarUrl: true },
            },
            replies: {
              orderBy: { createdAt: 'asc' },
              include: {
                user: {
                  select: { nickname: true, avatarUrl: true, role: true },
                },
                replyTo: {
                  select: {
                    user: { select: { nickname: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.feedback.count(),
      ]);

      return ApiResponseDto.success({
        items,
        total,
        page: pageNum,
        pageSize: size,
        totalPages: Math.ceil(total / size),
      });
    } catch (error) {
      console.error('[Feedback] List failed:', error);
      return new ApiResponseDto(500, '获取失败', null);
    }
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除反馈' })
  async deleteFeedback(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    try {
      const feedback = await this.prisma.feedback.findUnique({
        where: { id },
      });

      if (!feedback) {
        return new ApiResponseDto(404, '反馈不存在', null);
      }

      if (feedback.userId !== user.customerId) {
        return new ApiResponseDto(403, '只能删除自己的反馈', null);
      }

      // Clean up feedback COS images
      if (feedback.imageKeys?.length) {
        for (const key of feedback.imageKeys) {
          try {
            await this.cosService.deleteImage(key);
          } catch (e) {
            console.error('[Feedback] Failed to delete COS image:', key, e);
          }
        }
      }

      // Clean up reply COS images
      const replies = await this.prisma.feedbackReply.findMany({
        where: { feedbackId: id },
        select: { imageKeys: true },
      });
      for (const reply of replies) {
        if (reply.imageKeys?.length) {
          for (const key of reply.imageKeys) {
            try {
              await this.cosService.deleteImage(key);
            } catch (e) {
              console.error('[Feedback] Failed to delete reply COS image:', key, e);
            }
          }
        }
      }

      await this.prisma.feedback.delete({ where: { id } });
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error('[Feedback] Delete failed:', error);
      return new ApiResponseDto(500, '删除失败', null);
    }
  }

  @Post(':feedbackId/replies')
  @ApiOperation({ summary: '创建回复' })
  @ApiResponse({ status: 201, description: '回复成功', type: ApiResponseDto })
  async createReply(
    @CurrentUser() user: RequestUser,
    @Param('feedbackId') feedbackId: string,
    @Body() dto: CreateFeedbackReplyDto,
  ) {
    if (!dto.content?.trim()) {
      return new ApiResponseDto(400, '回复内容不能为空', null);
    }

    try {
      const feedback = await this.prisma.feedback.findUnique({
        where: { id: feedbackId },
      });
      if (!feedback) {
        return new ApiResponseDto(404, '反馈不存在', null);
      }

      let replyToUserId: string | null = null;
      if (dto.replyToId) {
        const parentReply = await this.prisma.feedbackReply.findUnique({
          where: { id: dto.replyToId },
        });
        if (!parentReply) {
          return new ApiResponseDto(400, '被回复的回复不存在', null);
        }
        replyToUserId = parentReply.userId;
      }

      const reply = await this.prisma.feedbackReply.create({
        data: {
          feedbackId,
          userId: user.customerId,
          content: dto.content.trim(),
          imageUrls: dto.imageUrls || [],
          imageKeys: dto.imageKeys || [],
          replyToId: dto.replyToId || null,
          replyToUserId,
        },
        include: {
          user: {
            select: { nickname: true, avatarUrl: true, role: true },
          },
          replyTo: {
            select: {
              user: { select: { nickname: true } },
            },
          },
        },
      });

      return ApiResponseDto.success(reply);
    } catch (error) {
      console.error('[Feedback] Create reply failed:', error);
      return new ApiResponseDto(500, '回复失败，请重试', null);
    }
  }

  @Get(':feedbackId/replies')
  @ApiOperation({ summary: '获取反馈的所有回复' })
  async getReplies(@Param('feedbackId') feedbackId: string) {
    try {
      const replies = await this.prisma.feedbackReply.findMany({
        where: { feedbackId },
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: { nickname: true, avatarUrl: true, role: true },
          },
          replyTo: {
            select: {
              user: { select: { nickname: true } },
            },
          },
        },
      });

      return ApiResponseDto.success(replies);
    } catch (error) {
      console.error('[Feedback] Get replies failed:', error);
      return new ApiResponseDto(500, '获取回复失败', null);
    }
  }

  @Delete(':feedbackId/replies/:replyId')
  @ApiOperation({ summary: '删除回复' })
  async deleteReply(
    @CurrentUser() user: RequestUser,
    @Param('feedbackId') feedbackId: string,
    @Param('replyId') replyId: string,
  ) {
    try {
      const reply = await this.prisma.feedbackReply.findUnique({
        where: { id: replyId },
      });

      if (!reply) {
        return new ApiResponseDto(404, '回复不存在', null);
      }

      if (reply.feedbackId !== feedbackId) {
        return new ApiResponseDto(400, '回复不属于该反馈', null);
      }

      if (reply.userId !== user.customerId) {
        return new ApiResponseDto(403, '只能删除自己的回复', null);
      }

      // Clean up COS images
      if (reply.imageKeys?.length) {
        for (const key of reply.imageKeys) {
          try {
            await this.cosService.deleteImage(key);
          } catch (e) {
            console.error('[Feedback] Failed to delete reply COS image:', key, e);
          }
        }
      }

      await this.prisma.feedbackReply.delete({ where: { id: replyId } });
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error('[Feedback] Delete reply failed:', error);
      return new ApiResponseDto(500, '删除失败', null);
    }
  }
}
