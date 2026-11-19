import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { normalizeTermKey, type DimensionKey } from '../../domain/ingredient/supplement-form-candidates';
import { buildAliases } from '../../domain/ingredient/supplement-form-term';

/**
 * 形态词典：给一个写法，回答"它是哪个键、有没有人确认过"。
 *
 * 命中规则：`canonical_key` 相等，或 `aliases` 里含归一化后的写法。
 * 没命中就落一条 `NEEDS_REVIEW`——不自动合并到已有词（认错比认不出更难查）。
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface ResolvedTerm {
  key: string;
  labelZh: string | null;
  status: 'AUTO' | 'NEEDS_REVIEW' | 'CONFIRMED';
}

@Injectable()
export class SupplementFormTermService {
  private readonly logger = new Logger(SupplementFormTermService.name);
  private readonly cache = new Map<string, { at: number; value: ResolvedTerm }>();

  constructor(private readonly prisma: PrismaService) {}

  /** 把一种写法落到词典里的键；没见过的词先记成待确认。 */
  async resolve(
    dimension: DimensionKey,
    raw: string,
    options: { nutrientKey?: string; labelZh?: string; source?: 'KB' | 'MARKET' } = {},
  ): Promise<ResolvedTerm> {
    const normalized = normalizeTermKey(raw);
    if (!normalized) {
      return { key: '', labelZh: null, status: 'AUTO' };
    }

    const cacheKey = `${dimension}:${normalized}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.value;
    }

    const existing = await this.find(dimension, normalized);
    if (existing) {
      const value: ResolvedTerm = {
        key: existing.canonicalKey,
        labelZh: existing.labelZh,
        status: existing.status as ResolvedTerm['status'],
      };
      this.cache.set(cacheKey, { at: Date.now(), value });
      return value;
    }

    const created = await this.create(dimension, normalized, raw, options);
    this.cache.set(cacheKey, { at: Date.now(), value: created });
    return created;
  }

  private async find(dimension: DimensionKey, normalized: string) {
    return this.prisma.supplementFormTerm.findFirst({
      where: {
        dimension,
        OR: [{ canonicalKey: normalized }, { aliases: { has: normalized } }],
      },
      select: { canonicalKey: true, labelZh: true, status: true },
    });
  }

  private async create(
    dimension: DimensionKey,
    normalized: string,
    raw: string,
    options: { nutrientKey?: string; labelZh?: string; source?: 'KB' | 'MARKET' },
  ): Promise<ResolvedTerm> {
    try {
      const row = await this.prisma.supplementFormTerm.create({
        data: {
          dimension,
          canonicalKey: normalized,
          labelZh: options.labelZh?.trim() || null,
          aliases: buildAliases(raw),
          nutrientKeys: options.nutrientKey ? [options.nutrientKey] : [],
          status: 'NEEDS_REVIEW',
          source: options.source ?? 'MARKET',
        },
        select: { canonicalKey: true, labelZh: true, status: true },
      });
      return {
        key: row.canonicalKey,
        labelZh: row.labelZh,
        status: row.status as ResolvedTerm['status'],
      };
    } catch (error) {
      // 并发下可能同时插入同一个键：退回去读已有那条
      if (this.isUniqueViolation(error)) {
        const existing = await this.find(dimension, normalized);
        if (existing) {
          return {
            key: existing.canonicalKey,
            labelZh: existing.labelZh,
            status: existing.status as ResolvedTerm['status'],
          };
        }
      }
      this.logger.warn(
        `[form-term] 落库失败，先用归一化键继续 dimension=${dimension} key=${normalized}`,
      );
      return { key: normalized, labelZh: options.labelZh?.trim() || null, status: 'NEEDS_REVIEW' };
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
