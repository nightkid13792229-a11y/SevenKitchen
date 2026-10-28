import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { CoverReferenceService } from './cover-reference.service';

export type CoverTrashReason =
  | 'REPLACED'
  | 'REMOVED'
  | 'PREVIEW_DISCARDED'
  | 'UPLOAD_DISCARDED';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 旧封面回收站：
 *  · 引用检查通过 → 复制到 recipes/covers/trash/ → 删原对象 → 写表；
 *  · 7 天后每日任务删除 trash 对象并标记 DELETED；
 *  · 只处理本项目 COS 的 recipes/ 前缀。
 */
@Injectable()
export class CoverTrashService {
  private readonly logger = new Logger(CoverTrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceService: CoverReferenceService,
    private readonly cosService: TencentCosService,
  ) {}

  async trashIfUnreferenced(
    url: string,
    reason: CoverTrashReason,
  ): Promise<boolean> {
    const sourceUrl = String(url ?? '').trim();
    if (!sourceUrl) return false;
    if (!this.cosService.isOwnedImageUrl(sourceUrl)) {
      throw new BadRequestException('封面地址不是本站 COS 地址');
    }
    if (sourceUrl.includes('/trash/')) return false;

    if (await this.referenceService.isReferenced(sourceUrl)) {
      this.logger.log(`[cover-trash] still referenced, skip: ${sourceUrl}`);
      return false;
    }

    const trashUrl = await this.cosService.copyImageToTrash(sourceUrl);
    const now = new Date();
    await this.prisma.coverTrash.create({
      data: {
        sourceUrl,
        trashUrl,
        reason,
        movedAt: now,
        deleteAfter: new Date(now.getTime() + TRASH_RETENTION_MS),
        status: 'PENDING',
      },
    });
    this.logger.log(`[cover-trash] moved: ${sourceUrl} -> ${trashUrl}`);
    return true;
  }

  @Cron('0 3 * * *')
  async cleanupExpired(): Promise<number> {
    const rows = await this.prisma.coverTrash.findMany({
      where: {
        status: 'PENDING',
        deleteAfter: { lte: new Date() },
      },
      take: 100,
    });

    let deleted = 0;
    for (const row of rows) {
      try {
        await this.cosService.deleteImageByUrlStrict(row.trashUrl);
        await this.prisma.coverTrash.update({
          where: { id: row.id },
          data: { status: 'DELETED' },
        });
        deleted += 1;
      } catch (error: any) {
        this.logger.error(
          `[cover-trash] cleanup failed for ${row.id}: ${error?.message}`,
        );
      }
    }
    return deleted;
  }
}
