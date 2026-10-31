import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';

export type IngredientLabelCategory =
  | 'FEED_MATERIAL'
  | 'FEED_ADDITIVE'
  | 'NON_FEED';

export interface IngredientLabelInfo {
  id: string;
  name: string;
  type: string;
  labelCategory: IngredientLabelCategory | null;
  labelNames: string[];
}

const MAX_IDS = 200;

const LABEL_CATEGORIES: ReadonlyArray<IngredientLabelCategory> = [
  'FEED_MATERIAL',
  'FEED_ADDITIVE',
  'NON_FEED',
];

function normalizeCategory(value: unknown): IngredientLabelCategory | null {
  return typeof value === 'string' &&
    (LABEL_CATEGORIES as ReadonlyArray<string>).includes(value)
    ? (value as IngredientLabelCategory)
    : null;
}

function normalizeNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * 打印标签时按原料 ID 回查原料主数据里的标签字段。
 *
 * 为什么需要：订单快照是下单那一刻冻结的，老订单（2026-10-30 之前）的
 * 快照里没有 `label_category` / `label_names`，直接按快照分组会导致
 * 「添加剂组成」整段消失、补剂被丢弃。打印时以原料主数据为准，快照只兜底。
 *
 * 唯一数据源缺口（原料被删除等）由调用方按「标签信息缺失」拦下，不静默放过。
 */
@Injectable()
export class LabelIngredientInfoService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async getByIngredientIds(ids: string[]): Promise<IngredientLabelInfo[]> {
    const unique = Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean),
      ),
    ).slice(0, MAX_IDS);

    if (unique.length === 0 || !this.prisma) {
      return [];
    }

    const rows = await this.prisma.ingredient.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, type: true, properties: true },
    });

    return rows.map((row) => {
      const properties = (row.properties ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        name: row.name,
        type: String(row.type),
        labelCategory: normalizeCategory(properties.label_category),
        labelNames: normalizeNames(properties.label_names),
      };
    });
  }
}
