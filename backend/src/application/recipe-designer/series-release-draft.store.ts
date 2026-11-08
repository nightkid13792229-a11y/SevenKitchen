import { ConflictException } from '@nestjs/common';
import { Prisma, type RecipeSeries } from '@prisma/client';
import type { PrismaService } from '../../infrastructure/prisma.service';
import {
  buildSeriesReleaseLiveValues,
  diffSeriesReleaseDraft,
  parseSeriesReleaseDraft,
  resolveSeriesReleaseDraftApplied,
  type SeriesReleaseDraftField,
  type SeriesReleaseDraftPayload,
} from '../../domain/recipe-designer/series-release-draft';
import { pickCoverBadgeNames } from '../../domain/recipe-designer/cover-badge-policy';

type SeriesDraftRow = Pick<
  RecipeSeries,
  | 'id'
  | 'name'
  | 'coverImageUrl'
  | 'coverTitle'
  | 'sellingPoint'
  | 'targetHealthTags'
  | 'releaseDraft'
  | 'releaseDraftUpdatedAt'
>;

type DraftPrisma = Pick<
  PrismaService,
  | 'recipeSeriesCoverBadge'
  | 'recipeSeriesTaxonomy'
  | 'recipeHealthTag'
  | 'recipeSeries'
>;

export interface SeriesReleaseDraftContext {
  /** 线上值（系列 + 角标表 + 归类表） */
  live: SeriesReleaseDraftPayload;
  /** 解析后的草稿；没有草稿 / 已与线上一致时为 null */
  draft: SeriesReleaseDraftPayload | null;
  /** 生效值 = 线上值 + 管理员真正动过的字段 */
  effective: SeriesReleaseDraftPayload;
  /** 草稿里真正会改变线上值的字段 */
  changedFields: SeriesReleaseDraftField[];
  /** 草稿保存时间；没有有效草稿时为 null */
  updatedAt: Date | null;
  /** 生效角标名称（已按合规词表过滤，顺序即展示顺序） */
  badgeNames: string[];
  /** 生效角标 id（顺序即展示顺序） */
  badgeIds: string[];
  /** 数据库里还留着一份草稿 JSON（无论是否还有差异） */
  hasStoredDraft: boolean;
}

/**
 * 发布草稿的统一读取（2026-11-08）。
 *
 * 抽屉、发布、保存、归类页、列表标记都走这一份：一次查齐线上值、草稿、
 * 生效值、差异与角标名。任何一处自己拼口径，都会出现「抽屉说有草稿、
 * 列表说没有」这种对不上的情况。
 */
export async function loadSeriesReleaseDraftContext(
  prisma: DraftPrisma,
  series: SeriesDraftRow,
): Promise<SeriesReleaseDraftContext> {
  const [badgeRows, taxonomyRows] = await Promise.all([
    prisma.recipeSeriesCoverBadge.findMany({
      where: { seriesId: series.id },
      select: { healthTagId: true, healthTag: { select: { name: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.recipeSeriesTaxonomy.findMany({
      where: { seriesId: series.id },
      select: { kindId: true, nodeId: true },
    }),
  ]);

  const live = buildSeriesReleaseLiveValues({
    name: series.name,
    coverImageUrl: series.coverImageUrl,
    coverTitle: series.coverTitle,
    sellingPoint: series.sellingPoint,
    targetHealthTags: series.targetHealthTags,
    badgeHealthTagIds: badgeRows.map((row) => row.healthTagId),
    taxonomy: taxonomyRows,
  });
  const draft = series.releaseDraft
    ? parseSeriesReleaseDraft(series.releaseDraft)
    : null;
  // 老草稿（名称进草稿之前存的）没有 name：一律继承线上名，不能当成「清空」。
  if (draft && !draft.name) {
    draft.name = live.name;
  }
  // 生效值 = 线上值 + 管理员真正动过的字段（老草稿按差异兜底），
  // 这样别人期间改的归类 / 角标不会被草稿里的旧值覆盖。
  const resolved = resolveSeriesReleaseDraftApplied(draft, live);
  const changedFields = resolved.fields;
  const hasDraft = changedFields.length > 0;
  const effective = hasDraft ? resolved.applied : live;
  // 线上角标名走同一条合规词表过滤；草稿换了角标时再按 id 查一次名称。
  const liveNames = pickCoverBadgeNames(
    badgeRows.map((row) => row.healthTag?.name),
  );
  const sameBadges =
    effective.badgeHealthTagIds.length === badgeRows.length &&
    effective.badgeHealthTagIds.every(
      (id, index) => id === badgeRows[index]?.healthTagId,
    );
  const badgeNames = sameBadges
    ? liveNames
    : pickCoverBadgeNames(
        (
          await prisma.recipeHealthTag.findMany({
            where: { id: { in: effective.badgeHealthTagIds } },
            select: { id: true, name: true },
          })
        ).reduce<string[]>((names, row) => {
          const index = effective.badgeHealthTagIds.indexOf(row.id);
          if (index >= 0) names[index] = row.name;
          return names;
        }, []),
      );
  return {
    live,
    draft: hasDraft ? draft : null,
    effective,
    changedFields,
    updatedAt: hasDraft ? (series.releaseDraftUpdatedAt ?? null) : null,
    badgeNames,
    badgeIds: [...effective.badgeHealthTagIds],
    hasStoredDraft: Boolean(series.releaseDraft),
  };
}

/**
 * 把合并后的草稿写回数据库。
 *
 * - 只把「管理员真正动过且仍与线上不同」的字段算作 changedFields；
 * - 没有变化时直接删草稿（不留一份空草稿 / stale 标记）；
 * - 返回保存时间，前端用作下一次保存的乐观锁基线。
 */
export async function persistSeriesReleaseDraft(
  prisma: Pick<PrismaService, 'recipeSeries'>,
  seriesId: string,
  merged: SeriesReleaseDraftPayload,
  live: SeriesReleaseDraftPayload,
  actorId: string | null,
  /**
   * 乐观锁（2026-11-08）：传了就用条件更新，只有数据库里的草稿时间
   * 仍等于调用方手上的时间才写得进去。检查与写入是同一条 SQL，避免
   * 「两个请求都通过检查、后写的覆盖先写的」。省略 = 内部调用不做锁。
   */
  expectedUpdatedAt?: string | Date | null,
): Promise<{
  changedFields: SeriesReleaseDraftField[];
  updatedAt: Date | null;
  stored: boolean;
}> {
  const changedFields = diffSeriesReleaseDraft(merged, live).filter((field) =>
    merged.touched.includes(field),
  );
  const savedAt = changedFields.length === 0 ? null : new Date();
  const data = {
    releaseDraft: changedFields.length === 0 ? Prisma.DbNull : (merged as any),
    releaseDraftUpdatedAt: savedAt,
    releaseDraftUpdatedBy: savedAt ? actorId : null,
  };

  if (expectedUpdatedAt === undefined) {
    await prisma.recipeSeries.update({ where: { id: seriesId }, data });
  } else {
    const expected =
      expectedUpdatedAt === null
        ? null
        : expectedUpdatedAt instanceof Date
          ? expectedUpdatedAt
          : new Date(expectedUpdatedAt);
    if (expected !== null && Number.isNaN(expected.getTime())) {
      throw new ConflictException('发布草稿版本不合法，请刷新后重试');
    }
    const result = await prisma.recipeSeries.updateMany({
      where: { id: seriesId, releaseDraftUpdatedAt: expected },
      data,
    });
    if (result.count === 0) {
      throw new ConflictException(
        '发布草稿已被其他人修改，请刷新后再保存（你的修改还没有丢失，刷新后重填即可）',
      );
    }
  }
  return {
    changedFields,
    updatedAt: savedAt,
    stored: changedFields.length > 0,
  };
}

/** 清理「有草稿标记、但内容已和线上一致」的 stale 草稿。 */
export async function clearStaleSeriesReleaseDraft(
  prisma: Pick<PrismaService, 'recipeSeries'>,
  seriesId: string,
  expectedUpdatedAt: Date | string | null,
): Promise<void> {
  const expected =
    expectedUpdatedAt === null ? null : new Date(expectedUpdatedAt);
  await prisma.recipeSeries.updateMany({
    where: { id: seriesId, releaseDraftUpdatedAt: expected },
    data: {
      releaseDraft: Prisma.DbNull,
      releaseDraftUpdatedAt: null,
      releaseDraftUpdatedBy: null,
    },
  });
}

/**
 * 乐观锁：保存 / 发布时对比调用方手里的草稿时间。
 *
 * - `undefined` = 老客户端没传，不做校验（兼容）；
 * - `null` = 调用方认为当前没有草稿；
 * - 字符串 = 上一次保存 / 打开抽屉时拿到的 `releaseDraft.updatedAt`。
 */
export function isSeriesReleaseDraftExpected(
  expected: string | null | undefined,
  current: Date | null,
): boolean {
  if (expected === undefined) return true;
  if (expected === null) return current === null;
  const parsed = new Date(expected);
  if (Number.isNaN(parsed.getTime())) return false;
  return current !== null && current.getTime() === parsed.getTime();
}
