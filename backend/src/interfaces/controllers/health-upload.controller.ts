/**
 * Health Upload Controller
 * Handles image uploads for health record attachments
 */

import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
} from '@nestjs/swagger'
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service'
import { ApiResponseDto } from '../dto/common/response.dto'
import { AuthGuard } from '../auth'

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
      throw new BadRequestException('No file uploaded')
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit')
    }

    // Validate file type (images + PDF)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only JPG, PNG, GIF, WEBP, and PDF are allowed')
    }

    try {
      const result = await this.cosService.uploadImage(file, file.originalname, 'health-records')

      return ApiResponseDto.success(result)
    } catch (error) {
      console.error('[HealthUpload] Upload failed:', error)
      throw new BadRequestException('Failed to upload file')
    }
  }
}
