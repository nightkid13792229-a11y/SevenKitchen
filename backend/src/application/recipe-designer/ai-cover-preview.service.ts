import { BadRequestException, Injectable } from '@nestjs/common';

import { CoverTrashService } from './cover-trash.service';

/** 未采用的 AI 预览 / 未保存的手动上传：引用安全地进回收站 */
@Injectable()
export class AiCoverPreviewService {
  constructor(private readonly coverTrashService: CoverTrashService) {}

  async discard(
    url: string,
    reason: 'PREVIEW_DISCARDED' | 'UPLOAD_DISCARDED' = 'PREVIEW_DISCARDED',
  ): Promise<{ trashed: boolean }> {
    const normalized = String(url ?? '').trim();
    if (!normalized) {
      throw new BadRequestException('封面地址不能为空');
    }
    const trashed = await this.coverTrashService.trashIfUnreferenced(
      normalized,
      reason,
    );
    return { trashed };
  }
}
