import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';
import {
  isPreparationMethodWithinContentLimit,
} from '../../domain/recipe/preparation-field-text';
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

interface HistoryTextEntry {
  ingredientId: string;
  text: string;
  lastUsedAt: Date;
}

interface DeliverySnapshotRecipeItem {
  ingredientId?: string | null;
  preparation?: string | null;
}

interface DeliverySnapshot {
  recipe?: {
    items?: DeliverySnapshotRecipeItem[];
  } | null;
}

interface DeliveryBatchRow {
  orderId: string;
  version: number;
  deliveredAt: Date;
  items: Array<{ contentSnapshot: unknown }>;
}

/**
 * 原料「部位 / 状态 / 预处理」历史。
 *
 * 口径（设计文档 2026-10-26）：
 * - 橱窗已发布正式食谱：`Recipe.status=PUBLIC` 且非定制；
 * - 已交付定制：当前有效交付（legacy 单份：未撤销、未被替换；多份批次：每个订单最新一批）；
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

    const rows = await this.queryRecipeItemRows([id]);
    const methodMap = await this.loadMethodMap(rows);
    const entries = [
      ...this.toRowEntries(rows, methodMap),
      ...(await this.loadBatchEntries([id])),
    ];

    return this.aggregateEntries(entries, limit);
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

    const rows = await this.queryRecipeItemRows(ids);
    const methodMap = await this.loadMethodMap(rows);
    const batchEntries = await this.loadBatchEntries(ids);

    const rowEntriesByIngredient = new Map<string, HistoryTextEntry[]>();
    for (const entry of this.toRowEntries(rows, methodMap)) {
      const list = rowEntriesByIngredient.get(entry.ingredientId) ?? [];
      list.push(entry);
      rowEntriesByIngredient.set(entry.ingredientId, list);
    }
    const batchEntriesByIngredient = new Map<string, HistoryTextEntry[]>();
    for (const entry of batchEntries) {
      const list = batchEntriesByIngredient.get(entry.ingredientId) ?? [];
      list.push(entry);
      batchEntriesByIngredient.set(entry.ingredientId, list);
    }

    for (const ingredientId of ids) {
      const [first] = this.aggregateEntries(
        [
          ...(rowEntriesByIngredient.get(ingredientId) ?? []),
          ...(batchEntriesByIngredient.get(ingredientId) ?? []),
        ],
        1,
      );
      if (first) result.set(ingredientId, first.text);
    }

    return result;
  }

  private async queryRecipeItemRows(
    ingredientIds: string[],
  ): Promise<RecipeItemHistoryRow[]> {
    return (await this.prisma.recipeItem.findMany({
      where: {
        ingredientId: { in: ingredientIds },
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
  }

  private async loadMethodMap(
    rows: RecipeItemHistoryRow[],
  ): Promise<Map<string, string>> {
    return this.loadMethodMapFromValues(
      rows.map((row) => row.preparationMethod),
    );
  }

  private async loadMethodMapFromValues(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) return new Map();

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(methods.map((method) => [method.id, method.name] as const));
  }

  /**
   * 多份交付走 `CustomRecipeDeliveryBatch`，不写 legacy `CustomRecipeDelivery`。
   * 每个订单只取最新一批（version 最大）；批次内的每份食谱各有一份冻结快照。
   */
  private async loadBatchEntries(
    ingredientIds: string[],
  ): Promise<HistoryTextEntry[]> {
    const allowed = new Set(ingredientIds);
    const batches = (await this.prisma.customRecipeDeliveryBatch.findMany({
      select: {
        orderId: true,
        version: true,
        deliveredAt: true,
        items: { select: { contentSnapshot: true } },
      },
      orderBy: [{ orderId: 'asc' }, { version: 'desc' }],
    })) as unknown as DeliveryBatchRow[];

    const latestByOrder = new Map<string, DeliveryBatchRow>();
    for (const batch of batches) {
      if (!latestByOrder.has(batch.orderId)) {
        latestByOrder.set(batch.orderId, batch);
      }
    }

    const candidates: Array<{
      ingredientId: string;
      preparation: string | null;
      lastUsedAt: Date;
    }> = [];
    for (const batch of latestByOrder.values()) {
      for (const item of batch.items) {
        const snapshot = item.contentSnapshot as DeliverySnapshot | null;
        const recipeItems = snapshot?.recipe?.items ?? [];
        for (const recipeItem of recipeItems) {
          const ingredientId = String(recipeItem.ingredientId ?? '').trim();
          if (!ingredientId || !allowed.has(ingredientId)) continue;
          candidates.push({
            ingredientId,
            preparation: recipeItem.preparation ?? null,
            lastUsedAt: batch.deliveredAt,
          });
        }
      }
    }

    const methodMap = await this.loadMethodMapFromValues(
      candidates.map((candidate) => candidate.preparation),
    );
    const entries: HistoryTextEntry[] = [];
    for (const candidate of candidates) {
      const readable = resolvePreparationMethodText(
        candidate.preparation,
        methodMap,
        { preserveUnresolvedLegacy: false },
      );
      const text = normalizePreparationMethodHistoryText(readable);
      // 历史里仍可能保留旧的长文案；10 字上限生效后不再作为候选。
      if (!text || !isPreparationMethodWithinContentLimit(text)) continue;
      entries.push({
        ingredientId: candidate.ingredientId,
        text,
        lastUsedAt: candidate.lastUsedAt,
      });
    }
    return entries;
  }

  private toRowEntries(
    rows: RecipeItemHistoryRow[],
    methodMap: Map<string, string>,
  ): HistoryTextEntry[] {
    const entries: HistoryTextEntry[] = [];
    for (const row of rows) {
      const lastUsedAt = this.resolveLastUsedAt(row);
      if (!lastUsedAt || !row.ingredientId) continue;

      const readable = resolvePreparationMethodText(
        row.preparationMethod,
        methodMap,
        { preserveUnresolvedLegacy: false },
      );
      const text = normalizePreparationMethodHistoryText(readable);
      if (!text || !isPreparationMethodWithinContentLimit(text)) continue;
      entries.push({
        ingredientId: row.ingredientId,
        text,
        lastUsedAt,
      });
    }
    return entries;
  }

  /** 聚合：同文去重、按最近使用时间倒序、可选 limit。 */
  private aggregateEntries(
    entries: HistoryTextEntry[],
    limit?: number,
  ): IngredientPreparationHistoryEntry[] {
    const aggregated = new Map<
      string,
      { text: string; usageCount: number; lastUsedAt: Date }
    >();

    for (const entry of entries) {
      const existing = aggregated.get(entry.text);
      if (existing) {
        existing.usageCount += 1;
        if (entry.lastUsedAt > existing.lastUsedAt) {
          existing.lastUsedAt = entry.lastUsedAt;
        }
        continue;
      }

      aggregated.set(entry.text, {
        text: entry.text,
        usageCount: 1,
        lastUsedAt: entry.lastUsedAt,
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
