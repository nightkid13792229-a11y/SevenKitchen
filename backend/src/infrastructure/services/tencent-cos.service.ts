/**
 * Tencent COS (Cloud Object Storage) Service
 * Handles image uploads to Tencent Cloud COS
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface UploadResult {
  url: string;
  key: string;
}

@Injectable()
export class TencentCosService {
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnDomain: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.secretId = this.configService.get<string>('COS_SECRET_ID') || '';
    this.secretKey = this.configService.get<string>('COS_SECRET_KEY') || '';
    this.bucket = this.configService.get<string>('COS_BUCKET') || '';
    this.region = this.configService.get<string>('COS_REGION') || 'ap-guangzhou';
    this.cdnDomain = this.configService.get<string>('COS_CDN_DOMAIN');

    if (!this.secretId || !this.secretKey || !this.bucket) {
      console.error('[TencentCosService] Missing COS credentials. Image upload will not work.');
      console.error('[TencentCosService] Required: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET');
    }
  }

  /**
   * Upload image to Tencent COS
   * @param file Buffer or file stream
   * @param filename Original filename
   * @param folder Folder path in bucket (default: 'recipes')
   */
  async uploadImage(
    file: Buffer | Express.Multer.File,
    filename?: string,
    folder: string = 'recipes',
  ): Promise<UploadResult> {
    if (!this.secretId || !this.secretKey || !this.bucket) {
      throw new BadRequestException('COS credentials not configured');
    }

    // Get file buffer and original name
    let fileBuffer: Buffer;
    let originalName: string;

    if (Buffer.isBuffer(file)) {
      fileBuffer = file;
      originalName = filename || `image-${Date.now()}`;
    } else if ((file as any).buffer) {
      fileBuffer = (file as any).buffer;
      originalName = (file as any).originalname || filename || `image-${Date.now()}`;
    } else {
      throw new BadRequestException('Invalid file format');
    }

    // Generate unique file key
    const ext = this.getFileExtension(originalName);
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const key = `${folder}/${timestamp}-${random}.${ext}`;

    try {
      // Using cos-nodejs-sdk-v5
      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      // Upload to COS
      await new Promise((resolve, reject) => {
        cosClient.putObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Body: fileBuffer,
        }, (err: any, data: any) => {
          if (err) {
            console.error('[TencentCosService] Upload error:', err);
            reject(new BadRequestException(`Failed to upload image: ${err.message}`));
          } else {
            resolve(data);
          }
        });
      });

      // Generate URL
      // Use HTTP for CDN domain until SSL certificate is configured
      const url = this.cdnDomain
        ? `http://${this.cdnDomain}/${key}`
        : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;

      console.log(`[TencentCosService] Uploaded ${key} to ${url}`);

      return { url, key };
    } catch (error) {
      console.error('[TencentCosService] Upload failed:', error);
      throw new BadRequestException('Failed to upload image to COS');
    }
  }

  /**
   * Delete image from COS
   */
  async deleteImage(key: string): Promise<void> {
    if (!this.secretId || !this.secretKey || !this.bucket) {
      throw new BadRequestException('COS credentials not configured');
    }

    try {
      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      await new Promise((resolve, reject) => {
        cosClient.deleteObject({
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
        }, (err: any, data: any) => {
          if (err) {
            console.error('[TencentCosService] Delete error:', err);
            reject(err);
          } else {
            resolve(data);
          }
        });
      });

      console.log(`[TencentCosService] Deleted ${key}`);
    } catch (error) {
      console.error('[TencentCosService] Delete failed:', error);
      throw new BadRequestException('Failed to delete image from COS');
    }
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)) {
      return 'jpg';
    }
    return ext;
  }
}
