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

export class ImageContentSafetyError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class TencentCosService {
  private readonly secretId: string;
  private readonly secretKey: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cdnDomain: string | undefined;
  private readonly imageAuditBizType: string | undefined;
  /** 媒体代理 token → COS key（短期、进程内；只用于敏感附件读取） */
  private readonly mediaTokens = new Map<
    string,
    { key: string; expiresAt: number }
  >();

  constructor(private readonly configService: ConfigService) {
    this.secretId = this.configService.get<string>('COS_SECRET_ID') || '';
    this.secretKey = this.configService.get<string>('COS_SECRET_KEY') || '';
    this.bucket = this.configService.get<string>('COS_BUCKET') || '';
    this.region =
      this.configService.get<string>('COS_REGION') || 'ap-guangzhou';
    this.cdnDomain = this.configService.get<string>('COS_CDN_DOMAIN');
    this.imageAuditBizType = this.configService
      .get<string>('COS_IMAGE_AUDIT_BIZ_TYPE')
      ?.trim() || undefined;

    if (!this.secretId || !this.secretKey || !this.bucket) {
      console.error(
        '[TencentCosService] Missing COS credentials. Image upload will not work.',
      );
      console.error(
        '[TencentCosService] Required: COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET',
      );
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
      originalName =
        (file as any).originalname || filename || `image-${Date.now()}`;
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
        cosClient.putObject(
          {
            Bucket: this.bucket,
            Region: this.region,
            Key: key,
            Body: fileBuffer,
            // 敏感目录（过敏报告/定制附件）默认私有；读取时由后端签发短时 URL
            ACL: folder === 'custom-recipe-sensitive-attachments'
              ? 'private'
              : 'public-read',
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

      // Generate URL
      // Use HTTPS for CDN domain (SSL certificate configured)
      const url = this.cdnDomain
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;

      console.log(`[TencentCosService] Uploaded ${key} to ${url}`);

      return { url, key };
    } catch (error) {
      console.error('[TencentCosService] Upload failed:', error);
      throw new BadRequestException('Failed to upload image to COS');
    }
  }

  async uploadReviewedImage(file: Express.Multer.File): Promise<UploadResult> {
    const temporary = await this.uploadPrivateImage(file);
    try {
      const inspection = await this.inspectImage(temporary.key);
      if (!inspection.safe) {
        throw new ImageContentSafetyError('图片含违规或不适宜信息，请更换后重试');
      }

      const ext = this.getFileExtension(file.originalname);
      const key = `review-photos/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const cosClient = this.createCosClient();
      await cosClient.putObjectCopy({
        Bucket: this.bucket,
        Region: this.region,
        Key: key,
        CopySource: `${this.bucket}.cos.${this.region}.myqcloud.com/${temporary.key}`,
      });
      await this.deleteImage(temporary.key);
      return { url: this.buildPublicUrl(key), key };
    } catch (error) {
      await this.deleteImage(temporary.key).catch(() => undefined);
      if (error instanceof ImageContentSafetyError) throw error;
      throw new BadRequestException('图片安全验证暂不可用，请稍后重试');
    }
  }

  private async uploadPrivateImage(file: Express.Multer.File): Promise<{ key: string }> {
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('Invalid file format');
    }
    const key = `review-uploads/pending/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${this.getFileExtension(file.originalname)}`;
    await this.createCosClient().putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: file.buffer,
      ACL: 'private',
    });
    return { key };
  }

  private async inspectImage(key: string): Promise<{ safe: boolean }> {
    const result = await this.createCosClient().request({
      Method: 'GET',
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Query: {
        'ci-process': 'sensitive-content-recognition',
        'large-image-detect': 1,
        ...(this.imageAuditBizType
          ? { 'biz-type': this.imageAuditBizType }
          : {}),
      },
    });
    return { safe: Number(result.RecognitionResult?.Result) === 0 };
  }

  private createCosClient(): any {
    if (!this.secretId || !this.secretKey || !this.bucket) {
      throw new BadRequestException('COS credentials not configured');
    }
    const COS = require('cos-nodejs-sdk-v5');
    return new COS({ SecretId: this.secretId, SecretKey: this.secretKey });
  }

  /** 从 COS URL 提取 key；传入 key 时原样返回 */
  extractKey(urlOrKey: string): string {
    const value = String(urlOrKey || '').trim();
    if (!value) return '';
    if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
    try {
      return new URL(value).pathname.replace(/^\/+/, '');
    } catch {
      return '';
    }
  }

  /**
   * 生成短时签名 URL（2026-10-19 P0）。
   *
   * 敏感目录对象 ACL 为 private；前端 <image> 不能带 Authorization，
   * 因此由后端在每次读取资源时签发 1 小时有效的 URL。
   */
  /**
   * 敏感附件的对外 URL（2026-10-19 P0）。
   *
   * 不再把 COS key/签名直接交给前端：返回后端媒体代理的**不透明 token**，
   * 代理再凭服务端 COS 凭证读取对象。这样前端拿不到 key，
   * 不能绕过代理去拼 CDN 公共地址。
   */
  getSensitiveMediaUrl(urlOrKey: string, expiresSeconds = 3600): string {
    const key = this.extractKey(urlOrKey);
    if (!key) return '';
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();
    for (const [existing, value] of this.mediaTokens) {
      if (value.expiresAt <= now) this.mediaTokens.delete(existing);
    }
    this.mediaTokens.set(token, {
      key,
      expiresAt: now + Math.max(60, Math.floor(expiresSeconds)) * 1000,
    });
    const base = String(
      process.env.PUBLIC_API_BASE_URL ||
        process.env.API_PUBLIC_BASE_URL ||
        'https://api.sevenkitchen.cloud',
    ).replace(/\/+$/, '');
    return `${base}/api/v1/media/sensitive/${token}`;
  }

  resolveMediaToken(token: string): string | null {
    const entry = this.mediaTokens.get(String(token || ''));
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.mediaTokens.delete(String(token));
      return null;
    }
    return entry.key;
  }

  /** 媒体代理读取 COS 对象（私有对象由服务端凭证读取） */
  async getObjectBuffer(
    urlOrKey: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const key = this.extractKey(urlOrKey);
    if (!key) throw new BadRequestException('附件不存在');
    const cos = this.createCosClient();
    return new Promise((resolve, reject) => {
      cos.getObject(
        { Bucket: this.bucket, Region: this.region, Key: key },
        (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }
          const body = data?.Body;
          const buffer = Buffer.isBuffer(body)
            ? body
            : Buffer.from(body || '');
          const contentType =
            data?.ContentType ||
            data?.headers?.['content-type'] ||
            data?.headers?.['Content-Type'] ||
            '';
          resolve({ buffer, contentType });
        },
      );
    });
  }

  async getSignedUrl(urlOrKey: string, expiresSeconds = 3600): Promise<string> {
    const key = this.extractKey(urlOrKey);
    if (!key) return '';
    if (!this.secretId || !this.secretKey || !this.bucket) return '';
    const cos = this.createCosClient();
    return new Promise<string>((resolve, reject) => {
      cos.getObjectUrl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          Sign: true,
          Expires: Math.max(60, Math.floor(expiresSeconds)),
        },
        (err: any, data: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(String(data?.Url || ''));
        },
      );
    });
  }

  /** 把历史对象补成私有（一次性运维脚本用） */
  async makePrivate(urlOrKey: string): Promise<void> {
    const key = this.extractKey(urlOrKey);
    if (!key) return;
    const cos = this.createCosClient();
    await new Promise<void>((resolve, reject) => {
      cos.putObjectAcl(
        {
          Bucket: this.bucket,
          Region: this.region,
          Key: key,
          ACL: 'private',
        },
        (err: any) => (err ? reject(err) : resolve()),
      );
    });
  }

  private buildPublicUrl(key: string): string {
    return this.cdnDomain
      ? `https://${this.cdnDomain}/${key}`
      : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;
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
    if (!this.secretId || !this.secretKey || !this.bucket) {
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
    if (!this.secretId || !this.secretKey || !this.bucket) {
      throw new BadRequestException('COS credentials not configured');
    }

    // Get file buffer and original name
    let fileBuffer: Buffer;
    let originalName: string;

    if (Buffer.isBuffer(file)) {
      fileBuffer = file;
      originalName = filename || `file-${Date.now()}`;
    } else if ((file as any).buffer) {
      fileBuffer = (file as any).buffer;
      originalName =
        (file as any).originalname || filename || `file-${Date.now()}`;
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

      // Generate URL
      const url = this.cdnDomain
        ? `https://${this.cdnDomain}/${key}`
        : `https://${this.bucket}.cos.${this.region}.myqcloud.com/${key}`;

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
}
