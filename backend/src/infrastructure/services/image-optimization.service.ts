import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

export type ImageUploadPreset = 'recipe-cover' | 'home-header-bg';

export interface OptimizedImageUpload {
  buffer: Buffer;
  filename: string;
  contentType: 'image/jpeg';
  width: number;
  height: number;
  sizeBytes: number;
}

interface ImagePresetConfig {
  suffix: string;
  width: number;
  height: number;
  maxBytes: number;
}

const IMAGE_PRESETS: Record<ImageUploadPreset, ImagePresetConfig> = {
  'recipe-cover': {
    suffix: 'miniapp-cover',
    width: 750,
    height: 422,
    maxBytes: 160 * 1024,
  },
  'home-header-bg': {
    suffix: 'home-header',
    width: 1125,
    height: 600,
    maxBytes: 220 * 1024,
  },
};

const JPEG_QUALITY_STEPS = [82, 76, 70, 64, 58, 52, 46, 40, 34];

@Injectable()
export class ImageOptimizationService {
  async optimizeForUpload(
    file: Buffer | Express.Multer.File,
    preset: ImageUploadPreset,
  ): Promise<OptimizedImageUpload> {
    const config = IMAGE_PRESETS[preset];
    const { buffer, originalName } = this.resolveInput(file);

    try {
      let smallestOutput: OptimizedImageUpload | null = null;

      for (const quality of JPEG_QUALITY_STEPS) {
        const output = await this.encodeJpeg(buffer, config, quality, originalName);
        if (!smallestOutput || output.sizeBytes < smallestOutput.sizeBytes) {
          smallestOutput = output;
        }

        if (output.sizeBytes <= config.maxBytes) {
          return output;
        }
      }

      return smallestOutput!;
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        '图片处理失败，请上传 JPG、PNG 或 WebP 格式图片',
      );
    }
  }

  private resolveInput(file: Buffer | Express.Multer.File): {
    buffer: Buffer;
    originalName: string;
  } {
    if (Buffer.isBuffer(file)) {
      if (file.length === 0) {
        throw new BadRequestException('请上传图片文件');
      }

      return {
        buffer: file,
        originalName: `image-${Date.now()}.jpg`,
      };
    }

    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('请上传图片文件');
    }

    return {
      buffer: file.buffer,
      originalName: file.originalname || `image-${Date.now()}.jpg`,
    };
  }

  private async encodeJpeg(
    inputBuffer: Buffer,
    config: ImagePresetConfig,
    quality: number,
    originalName: string,
  ): Promise<OptimizedImageUpload> {
    const { data, info } = await sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize({
        width: config.width,
        height: config.height,
        fit: 'cover',
        position: 'centre',
      })
      .jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
      })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      filename: this.buildOutputFilename(originalName, config.suffix),
      contentType: 'image/jpeg',
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
    };
  }

  private buildOutputFilename(originalName: string, suffix: string): string {
    const withoutQuery = originalName.split(/[?#]/)[0] || 'image';
    const base = withoutQuery
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'image';

    return `${base}-${suffix}.jpg`;
  }
}
