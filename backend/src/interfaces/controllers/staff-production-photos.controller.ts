/**
 * Production Photos Controller
 * Handles production preparation photo uploads for staff
 */

import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
} from '@nestjs/swagger';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth';

@ApiTags('Staff - Production Photos')
@Controller('api/v1/staff/production')
@UseGuards(AuthGuard)
export class StaffProductionPhotosController {
  constructor(private readonly cosService: TencentCosService) {}

  @Post('photos/:orderId')
  @ApiOperation({ summary: '上传生产备料照片（最多6张）' })
  @ApiSecurity('X-Customer-Id')
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 200,
    description: 'Photos uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'number', example: 0 },
        message: { type: 'string', example: '上传成功' },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            photos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  key: { type: 'string' },
                },
              },
            },
            count: { type: 'number' },
          },
        },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 6))
  async uploadProductionPhotos(
    @Param('orderId') orderId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的照片');
    }

    if (files.length > 6) {
      throw new BadRequestException('最多只能上传6张照片');
    }

    // Validate file size (10MB max each)
    const maxSize = 10 * 1024 * 1024;
    for (const file of files) {
      if (file.size > maxSize) {
        throw new BadRequestException('每张照片大小不能超过10MB');
      }
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
    for (const file of files) {
      if (!allowedTypes.includes(file.mimetype)) {
        throw new BadRequestException('只支持 JPG、PNG、GIF 格式的照片');
      }
    }

    try {
      // Upload all photos to COS
      const uploadPromises = files.map((file) =>
        this.cosService.uploadImage(file, file.originalname, `production-photos/${orderId}`)
      );

      const results = await Promise.all(uploadPromises);

      return ApiResponseDto.success({
        orderId,
        photos: results,
        count: results.length,
      });
    } catch (error) {
      console.error('[ProductionPhotos] Upload failed:', error);
      throw new BadRequestException('照片上传失败，请重试');
    }
  }
}
