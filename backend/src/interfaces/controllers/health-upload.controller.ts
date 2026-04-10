/**
 * Health Upload Controller
 * Handles image uploads for health record attachments
 */

import {
  Controller,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ApiResponseDto } from '../dto/common/response.dto';
import { AuthGuard } from '../auth';
import { resolveHealthUploadErrorMessage } from './health-upload-error';

const ALLOWED_HEALTH_UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
];

const ALLOWED_HEALTH_UPLOAD_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
];

function hasAllowedHealthUploadType(file: Express.Multer.File) {
  if (ALLOWED_HEALTH_UPLOAD_MIME_TYPES.includes(file.mimetype)) {
    return true;
  }

  const normalizedName = file.originalname?.toLowerCase() || '';
  return ALLOWED_HEALTH_UPLOAD_EXTENSIONS.some((extension) =>
    normalizedName.endsWith(extension),
  );
}

@ApiTags('Health Uploads')
@Controller('api/v1/health')
@UseGuards(AuthGuard)
export class HealthUploadController {
  constructor(private readonly cosService: TencentCosService) {}

  @Post('upload-image')
  @ApiOperation({ summary: 'Upload health record image or PDF' })
  @ApiSecurity('X-Customer-Id')
  @ApiConsumes('multipart/form-data')
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
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
  async uploadHealthImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    // Validate file type (images + PDF)
    if (!hasAllowedHealthUploadType(file)) {
      throw new BadRequestException(
        'Invalid file type. Only JPG, PNG, GIF, WEBP, HEIC, HEIF, and PDF are allowed',
      );
    }

    try {
      const result = await this.cosService.uploadImage(
        file,
        file.originalname,
        'allergy-records',
      );

      return ApiResponseDto.success(result);
    } catch (error) {
      console.error('[HealthUpload] Upload failed:', error);
      throw new BadRequestException(
        resolveHealthUploadErrorMessage(error, 'Failed to upload file'),
      );
    }
  }

  @Delete('attachments')
  @ApiOperation({ summary: '删除过敏记录附件' })
  @ApiSecurity('X-Customer-Id')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'COS文件Key',
          example: 'allergy-records/1234567890-abc123.pdf',
        },
      },
      required: ['key'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '文件删除成功',
  })
  async deleteAllergyAttachment(
    @Body() dto: { key: string },
  ): Promise<ApiResponseDto<any>> {
    if (!dto.key) {
      throw new BadRequestException('缺少文件Key');
    }

    console.log('[HealthUpload] Deleting allergy attachment:', dto.key);

    try {
      await this.cosService.deleteImage(dto.key);
      return ApiResponseDto.success(null, '删除成功');
    } catch (error) {
      console.error(
        '[HealthUpload] Failed to delete allergy attachment:',
        error,
      );
      throw new BadRequestException('删除失败，请重试');
    }
  }
}
