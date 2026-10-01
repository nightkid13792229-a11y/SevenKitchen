import {
  Controller,
  Get,
  Header,
  Param,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { HealthShareService } from '../../application/health/health-share.service';

/**
 * 健康信息分享 · 医生侧（2026-10-01，第三期）。
 *
 * ⚠️ 这两个接口**故意不加 AuthGuard**（老板第 6 条：医生点开链接不需要登录）。
 *    安全性靠"令牌本身"：
 *      · 令牌 32 位随机十六进制，猜不到；
 *      · 内容在生成时就是定稿快照，顾客没勾的项根本不在里面；
 *      · 主人一按"停止分享"，这里立刻 410，附件也一起取不到。
 *
 * 附件的真实地址**不下发给前端**，由这里校验令牌后转发 ——
 * 因为上传后拿到的是公开 CDN 地址，直接给出去的话"停止分享"就撤不回来了。
 */
@ApiTags('Shared Health')
@Controller('api/v1/shared-health')
export class SharedHealthController {
  constructor(private readonly shareService: HealthShareService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read a shared health summary by token (no login)' })
  @ApiParam({ name: 'token', description: 'Share token' })
  @ApiResponse({ status: 200, description: 'Snapshot retrieved successfully' })
  @ApiResponse({ status: 410, description: 'Share has been stopped' })
  async getSharedHealth(@Param('token') token: string) {
    const data = await this.shareService.getPublicShare(token);

    // 与其它接口保持同样的信封，前端好统一处理
    return {
      code: 0,
      message: 'success',
      data,
    };
  }

  @Get(':token/attachment/:index')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Stream a shared report attachment by token' })
  @ApiParam({ name: 'token', description: 'Share token' })
  @ApiParam({ name: 'index', description: 'Attachment index in the snapshot' })
  async getSharedAttachment(
    @Param('token') token: string,
    @Param('index') index: string,
    @Res() res: Response,
  ) {
    const attachment = await this.shareService.resolveAttachmentSource(
      token,
      Number(index),
    );

    // 转发而不是 302 重定向：重定向会把 COS 直链暴露给浏览器，
    // 对方存下地址之后，"停止分享"就形同虚设。
    const upstream = await fetch(attachment.sourceUrl);
    if (!upstream.ok) {
      res.status(502).json({ code: 502, message: '附件读取失败', data: null });
      return;
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/octet-stream',
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
