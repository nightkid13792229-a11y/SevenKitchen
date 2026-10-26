import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';
import {
  extractLegacyPreparationMethodIds,
  normalizePreparationMethodHistoryText,
  resolvePreparationMethodText,
} from './preparation-method-text.util';

export interface IngredientPreparationHistoryEntry {
  text: string;
  usageCount: number;
  lastUsedAt: Date;
}

interface RecipeItemHistoryRow {
  ingredientId: string | null;
  preparationMethod: string | null;
  recipe: {
    isCustomRecipe: boolean;
    status: string;
    createdAt: Date;
    deliveries: Array<{ deliveredAt: Date }>;
  };
}

/**
 * 原料「部位 / 状态 / 预处理」历史。
 *
 * 口径（设计文档 2026-10-26）：
 * - 橱窗已发布正式食谱：`Recipe.status=PUBLIC` 且非定制；
 * - 已交付定制食谱：只认当前有效交付（未撤销、未被替换），取最近一次交付时间；
 * - 不包含设计草稿、未交付/撤销/替换的定制食谱；
 * - 只读，不返回客户/狗/订单信息。
 */
@Injectable()
export class IngredientPreparationHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getHistory(
    ingredientId: string,
    limit?: number,
  ): Promise<IngredientPreparationHistoryEntry[]> {
    const id = ingredientId?.trim();
    if (!id) return [];

    const rows = (await this.prisma.recipeItem.findMany({
      where: {
        ingredientId: id,
        OR: [
          {
            recipe: {
              status: 'PUBLIC',
              isCustomRecipe: false,
            },
          },
          {
            recipe: {
              isCustomRecipe: true,
              deliveries: {
                some: {
                  revokedAt: null,
                  replacedByDeliveryId: null,
                },
              },
            },
          },
        ],
      },
      select: {
        ingredientId: true,
        preparationMethod: true,
        recipe: {
          select: {
            isCustomRecipe: true,
            status: true,
            createdAt: true,
            deliveries: {
              where: {
                revokedAt: null,
                replacedByDeliveryId: null,
              },
              orderBy: { deliveredAt: 'desc' },
              take: 1,
              select: { deliveredAt: true },
            },
          },
        },
      },
    })) as unknown as RecipeItemHistoryRow[];

    return this.aggregateWithMethodMap(
      rows,
      await this.loadMethodMap(rows),
      limit,
    );
  }

  async getLatestText(ingredientId: string): Promise<string | null> {
    const [first] = await this.getHistory(ingredientId, 1);
    return first?.text ?? null;
  }

  async getLatestTextMap(
    ingredientIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(ingredientIds.filter(Boolean))];
    const result = new Map<string, string>();
    if (ids.length === 0) return result;

    const rows = (await this.prisma.recipeItem.findMany({
      where: {
        ingredientId: { in: ids },
        OR: [
          {
            recipe: {
              status: 'PUBLIC',
              isCustomRecipe: false,
            },
          },
          {
            recipe: {
              isCustomRecipe: true,
              deliveries: {
                some: {
                  revokedAt: null,
                  replacedByDeliveryId: null,
                },
              },
            },
          },
        ],
      },
      select: {
        ingredientId: true,
        preparationMethod: true,
        recipe: {
          select: {
            isCustomRecipe: true,
            status: true,
            createdAt: true,
            deliveries: {
              where: {
                revokedAt: null,
                replacedByDeliveryId: null,
              },
              orderBy: { deliveredAt: 'desc' },
              take: 1,
              select: { deliveredAt: true },
            },
          },
        },
      },
    })) as unknown as RecipeItemHistoryRow[];

    const methodMap = await this.loadMethodMap(rows);
    const byIngredient = new Map<string, RecipeItemHistoryRow[]>();
    for (const row of rows) {
      if (!row.ingredientId) continue;
      const list = byIngredient.get(row.ingredientId) ?? [];
      list.push(row);
      byIngredient.set(row.ingredientId, list);
    }

    for (const [ingredientId, ingredientRows] of byIngredient) {
      const [first] = this.aggregateWithMethodMap(
        ingredientRows,
        methodMap,
        1,
      );
      if (first) result.set(ingredientId, first.text);
    }

    return result;
  }

  private async loadMethodMap(
    rows: RecipeItemHistoryRow[],
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(
      rows.map((row) => row.preparationMethod),
    );
    if (ids.length === 0) return new Map();

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(methods.map((method) => [method.id, method.name] as const));
  }

  /** 聚合：同文去重、按最近使用时间倒序、可选 limit。 */
  private aggregateWithMethodMap(
    rows: RecipeItemHistoryRow[],
    methodMap: Map<string, string>,
    limit?: number,
  ): IngredientPreparationHistoryEntry[] {
    const aggregated = new Map<
      string,
      { text: string; usageCount: number; lastUsedAt: Date }
    >();

    for (const row of rows) {
      const lastUsedAt = this.resolveLastUsedAt(row);
      if (!lastUsedAt) continue;

      const readable = resolvePreparationMethodText(
        row.preparationMethod,
        methodMap,
        { preserveUnresolvedLegacy: false },
      );
      const normalized = normalizePreparationMethodHistoryText(readable);
      if (!normalized) continue;

      const existing = aggregated.get(normalized);
      if (existing) {
        existing.usageCount += 1;
        if (lastUsedAt > existing.lastUsedAt) {
          existing.lastUsedAt = lastUsedAt;
        }
        continue;
      }

      aggregated.set(normalized, {
        text: normalized,
        usageCount: 1,
        lastUsedAt,
      });
    }

    const sorted = [...aggregated.values()].sort((left, right) => {
      const byLastUsed = right.lastUsedAt.getTime() - left.lastUsedAt.getTime();
      if (byLastUsed !== 0) return byLastUsed;
      const byUsage = right.usageCount - left.usageCount;
      if (byUsage !== 0) return byUsage;
      return left.text.localeCompare(right.text);
    });

    return typeof limit === 'number' && limit > 0
      ? sorted.slice(0, limit)
      : sorted;
  }

  private resolveLastUsedAt(row: RecipeItemHistoryRow): Date | null {
    if (row.recipe.isCustomRecipe) {
      return row.recipe.deliveries[0]?.deliveredAt ?? null;
    }
    if (row.recipe.status !== 'PUBLIC') return null;
    return row.recipe.createdAt;
  }
}
