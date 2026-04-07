/**
 * Tencent COS (Cloud Object Storage) Service
 * Handles image uploads to Tencent Cloud COS
 */

import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

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
  private readonly nodeEnv: string;
  private readonly hasCredentials: boolean;
  private readonly mockUploadEnabled: boolean;
  private readonly mockBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.secretId = this.configService.get<string>('COS_SECRET_ID') || '';
    this.secretKey = this.configService.get<string>('COS_SECRET_KEY') || '';
    this.bucket = this.configService.get<string>('COS_BUCKET') || '';
    this.region =
      this.configService.get<string>('COS_REGION') || 'ap-guangzhou';
    this.cdnDomain = this.configService.get<string>('COS_CDN_DOMAIN');
    this.nodeEnv =
      this.configService.get<string>('NODE_ENV') ||
      process.env.NODE_ENV ||
      'development';
    this.hasCredentials = !!(
      this.secretId &&
      this.secretKey &&
      this.bucket
    );
    this.mockUploadEnabled = !this.hasCredentials && this.nodeEnv !== 'production';
    this.mockBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ||
      `http://localhost:${process.env.PORT || '3000'}`;

    if (!this.hasCredentials) {
      console.error(
        '[TencentCosService] Missing COS credentials. Image upload will not work.',
      );
      console.error(
        '[TencentCosService] Required: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET',
      );
      if (this.mockUploadEnabled) {
        console.warn(
          '[TencentCosService] Falling back to mock upload mode outside production.',
        );
      }
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
    const { fileBuffer, originalName } = this.resolveFilePayload(
      file,
      filename,
      'image',
    );
    const key = this.buildObjectKey(folder, originalName);

    if (!this.hasCredentials) {
      if (this.mockUploadEnabled) {
        return this.buildMockUploadResult(key, fileBuffer);
      }
      throw new BadRequestException('COS credentials not configured');
    }

    try {
      // Using cos-nodejs-sdk-v5
      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      // Upload to COS
      await new Promise((resolve, reject) => {
        cosClient.putObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Body: fileBuffer,
          },
          (err: any, data: any) => {
            if (err) {
              console.error('[TencentCosService] Upload error:', err);
              reject(
                new BadRequestException(
                  `Failed to upload image: ${err.message}`,
                ),
              );
            } else {
              resolve(data);
            }
          },
        );
      });

      const url = this.buildCosUrl(key);

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
    if (!this.hasCredentials) {
      if (this.isMockKey(key)) {
        const localPath = this.resolveMockFilePath(key);
        if (existsSync(localPath)) {
          rmSync(localPath, { force: true });
        }
        console.log(`[TencentCosService] Mock upload mode: deleted ${key}`);
        return;
      }
      throw new BadRequestException('COS credentials not configured');
    }

    try {
      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      await new Promise((resolve, reject) => {
        cosClient.deleteObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
          },
          (err: any, data: any) => {
            if (err) {
              console.error('[TencentCosService] Delete error:', err);
              reject(err);
            } else {
              resolve(data);
            }
          },
        );
      });

      console.log(`[TencentCosService] Deleted ${key}`);
    } catch (error) {
      console.error('[TencentCosService] Delete failed:', error);
      throw new BadRequestException('Failed to delete image from COS');
    }
  }

  /**
   * Delete image from COS by URL
   * @param url Full URL of the file (e.g., https://cdn.sevenkitchen.cloud/avatars/123/xxx.jpg)
   */
  async deleteImageByUrl(url: string): Promise<void> {
    if (!url) {
      console.log('[TencentCosService] No URL provided, skipping deletion');
      return;
    }

    try {
      // Extract key from URL
      const urlObj = new URL(url);
      const key = urlObj.pathname.slice(1); // Remove leading '/'

      console.log(`[TencentCosService] Deleting image by URL: ${url}`);
      await this.deleteImage(key);
    } catch (error) {
      console.error(
        '[TencentCosService] Failed to delete image by URL:',
        error,
      );
      // Don't throw error - allow upload to proceed even if deletion fails
    }
  }

  /**
   * Check if a file exists in COS by URL
   * @param url Full URL of the file
   * @returns true if file exists, false otherwise
   */
  async checkFileExists(url: string): Promise<boolean> {
    if (!this.hasCredentials) {
      if (url.startsWith('mock://')) {
        return true;
      }
      console.warn(
        '[TencentCosService] COS credentials not configured, assuming file does not exist',
      );
      return false;
    }

    try {
      // Extract key from URL
      const urlObj = new URL(url);
      const key = urlObj.pathname.slice(1); // Remove leading '/'

      console.log(`[TencentCosService] Checking if file exists: ${key}`);

      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      // Use headObject to check if file exists
      await new Promise<void>((resolve, reject) => {
        cosClient.headObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
          },
          (err: any, data: any) => {
            if (err) {
              // File doesn't exist or access denied
              console.log(`[TencentCosService] File does not exist: ${key}`);
              reject(err);
            } else {
              console.log(`[TencentCosService] File exists: ${key}`);
              resolve(data);
            }
          },
        );
      });

      return true;
    } catch (error: any) {
      console.log(
        `[TencentCosService] File check failed for ${url}:`,
        error?.message || error,
      );
      return false;
    }
  }

  /**
   * Upload any file to Tencent COS
   * @param file Buffer or file stream
   * @param filename Original filename
   * @param folder Folder path in bucket
   */
  async uploadFile(
    file: Buffer | Express.Multer.File,
    filename?: string,
    folder: string = 'general',
  ): Promise<UploadResult> {
    const { fileBuffer, originalName } = this.resolveFilePayload(
      file,
      filename,
      'file',
    );
    const key = this.buildObjectKey(folder, originalName);

    if (!this.hasCredentials) {
      if (this.mockUploadEnabled) {
        return this.buildMockUploadResult(key, fileBuffer);
      }
      throw new BadRequestException('COS credentials not configured');
    }

    try {
      // Using cos-nodejs-sdk-v5
      const cos = require('cos-nodejs-sdk-v5');

      const cosClient = new cos({
        SecretId: this.secretId,
        SecretKey: this.secretKey,
      });

      // Upload to COS
      await new Promise((resolve, reject) => {
        cosClient.putObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Body: fileBuffer,
          },
          (err: any, data: any) => {
            if (err) {
              console.error('[TencentCosService] Upload error:', err);
              reject(
                new BadRequestException(
                  `Failed to upload file: ${err.message}`,
                ),
              );
            } else {
              resolve(data);
            }
          },
        );
      });

      const url = this.buildCosUrl(key);

      console.log(`[TencentCosService] Uploaded ${key} to ${url}`);

      return { url, key };
    } catch (error) {
      console.error('[TencentCosService] Upload failed:', error);
      throw new BadRequestException('Failed to upload file to COS');
    }
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!ext || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'].includes(ext)) {
      return 'bin';
    }
    return ext;
  }

  private resolveFilePayload(
    file: Buffer | Express.Multer.File,
    filename: string | undefined,
    prefix: 'image' | 'file',
  ): { fileBuffer: Buffer; originalName: string } {
    if (Buffer.isBuffer(file)) {
      return {
        fileBuffer: file,
        originalName: filename || `${prefix}-${Date.now()}`,
      };
    }

    if ((file as any).buffer) {
      return {
        fileBuffer: (file as any).buffer,
        originalName:
          (file as any).originalname || filename || `${prefix}-${Date.now()}`,
      };
    }

    throw new BadRequestException('Invalid file format');
  }

  private buildObjectKey(folder: string, originalName: string): string {
    const ext = this.getFileExtension(originalName);
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${folder}/${timestamp}-${random}.${ext}`;
  }

  private buildCosUrl(key: string): string {
    return this.cdnDomain
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
  }

  private buildMockUploadResult(key: string, fileBuffer: Buffer): UploadResult {
    const mockKey = `mock/${key}`;
    const localPath = this.resolveMockFilePath(mockKey);
    mkdirSync(dirname(localPath), { recursive: true });
    writeFileSync(localPath, fileBuffer);
    const url = `${this.mockBaseUrl}/${mockKey}`;
    console.warn(
      `[TencentCosService] Mock upload mode: returning placeholder URL ${url}`,
    );
    return { url, key: mockKey };
  }

  private isMockKey(key: string): boolean {
    return key.startsWith('mock/');
  }

  private resolveMockFilePath(key: string): string {
    return join(process.cwd(), 'public', key);
  }
}
