import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

/**
 * 敏感附件媒体代理（2026-10-19 P0）。
 *
 * 前端 <image>/微信文档查看器不能带 Authorization，
 * 所以用后端签发的不透明 token 作为短期能力凭证；
 * token 只映射到服务端 COS key，不暴露 key 本身。
 *
 * 这是**无 AuthGuard** 的公开路由，安全性由随机 token + 过期时间保证。
 */
@Controller('api/v1/media')
export class SensitiveMediaController {
  constructor(private readonly cosService: TencentCosService) {}

  @Get('sensitive/:token')
  async getSensitiveMedia(
    @Param('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const key = this.cosService.resolveMediaToken(token);
    if (!key) {
      throw new NotFoundException('附件不存在或已过期');
    }

    const object = await this.cosService.getObjectBuffer(key);
    const contentType =
      object.contentType || guessContentType(key) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(object.buffer);
  }
}

function guessContentType(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext || ''] || '';
}
