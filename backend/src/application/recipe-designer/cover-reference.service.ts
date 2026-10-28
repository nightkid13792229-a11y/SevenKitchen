import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * 封面 URL 引用检查：同一张图可能同时被系列、设计草稿、已发布食谱引用。
 * 只有三张表都不再引用，才允许进回收站。
 */
@Injectable()
export class CoverReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async isReferenced(url: string): Promise<boolean> {
    const normalized = String(url ?? '').trim();
    if (!normalized) return false;

    const [seriesCount, draftCount, recipeCount] = await Promise.all([
      this.prisma.recipeSeries.count({
        where: { coverImageUrl: normalized },
      }),
      this.prisma.designRecipe.count({
        where: { coverImageUrl: normalized },
      }),
      this.prisma.recipe.count({
        where: { coverImageUrl: normalized },
      }),
    ]);

    return seriesCount + draftCount + recipeCount > 0;
  }
}
