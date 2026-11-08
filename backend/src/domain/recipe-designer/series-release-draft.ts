/**
 * 产品线发布草稿（2026-11-08）· 纯函数
 *
 * 业务背景：改成「草稿 → 发布」以后，顾客端永远看**线上值**，管理员在发布抽屉里
 * 改的展示资料 / 封面角标 / 需求分类先落在系列的一行 JSON 草稿上。点「发布这一版」
 * 时才把草稿一次应用到系列、已上线食谱门面、角标表、归类表，然后清空草稿。
 *
 * 因此这里只做四件事，全部可单测、不碰数据库：
 *  · JSON ↔ 结构体（脏数据一律按空处理，不让历史脏值卡住发布）；
 *  · 草稿与线上值的差异（决定「有草稿待发布」和抽屉里的变更清单）；
 *  · 部分字段更新的合并；
 *  · 字段的中文口径。
 */

/** 一个分类维度只能挂一个节点：kindId 唯一，nodeId 决定挂在哪个叶子。 */
export interface SeriesReleaseDraftTaxonomyLink {
  kindId: string;
  nodeId: string;
}

export interface SeriesReleaseDraftPayload {
  coverImageUrl: string | null;
  coverTitle: string | null;
  sellingPoint: string | null;
  targetHealthTags: string[];
  /** 封面角标（health_tag id，顺序即展示顺序） */
  badgeHealthTagIds: string[];
  taxonomy: SeriesReleaseDraftTaxonomyLink[];
}

/** 草稿里会被比较 / 展示的字段；`coverBadges` 对应 badgeHealthTagIds。 */
export const SERIES_RELEASE_DRAFT_FIELDS = [
  'coverImageUrl',
  'coverTitle',
  'sellingPoint',
  'targetHealthTags',
  'coverBadges',
  'taxonomy',
] as const;

export type SeriesReleaseDraftField =
  (typeof SERIES_RELEASE_DRAFT_FIELDS)[number];

export const SERIES_RELEASE_DRAFT_FIELD_LABELS: Record<
  SeriesReleaseDraftField,
  string
> = {
  coverImageUrl: '封面图',
  coverTitle: '封面标题',
  sellingPoint: '一句话卖点',
  targetHealthTags: '健康标签',
  coverBadges: '封面角标',
  taxonomy: '需求分类',
};

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const text = normalizeText(entry);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
};

/** 分类链接：kindId 去重（后写的覆盖先写的），非法项直接丢掉。 */
export function normalizeSeriesReleaseDraftTaxonomy(
  value: unknown,
): SeriesReleaseDraftTaxonomyLink[] {
  if (!Array.isArray(value)) return [];
  const byKind = new Map<string, SeriesReleaseDraftTaxonomyLink>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const kindId = normalizeText((entry as { kindId?: unknown }).kindId);
    const nodeId = normalizeText((entry as { nodeId?: unknown }).nodeId);
    if (!kindId || !nodeId) continue;
    byKind.set(kindId, { kindId, nodeId });
  }
  return [...byKind.values()];
}

/**
 * 从数据库 JSON 解析草稿：任何脏结构都退化成空草稿，
 * 宁可让管理员重新填一次，也不要让一条坏 JSON 卡住整个发布抽屉。
 */
export function parseSeriesReleaseDraft(
  raw: unknown,
): SeriesReleaseDraftPayload {
  if (!raw || typeof raw !== 'object') {
    return emptySeriesReleaseDraft();
  }
  const source = raw as Record<string, unknown>;
  return {
    coverImageUrl: normalizeText(source.coverImageUrl) || null,
    coverTitle: normalizeText(source.coverTitle) || null,
    sellingPoint: normalizeText(source.sellingPoint) || null,
    targetHealthTags: normalizeStringList(source.targetHealthTags),
    badgeHealthTagIds: normalizeStringList(source.badgeHealthTagIds),
    taxonomy: normalizeSeriesReleaseDraftTaxonomy(source.taxonomy),
  };
}

export function emptySeriesReleaseDraft(): SeriesReleaseDraftPayload {
  return {
    coverImageUrl: null,
    coverTitle: null,
    sellingPoint: null,
    targetHealthTags: [],
    badgeHealthTagIds: [],
    taxonomy: [],
  };
}

/** 线上值（系列 + 角标表 + 归类表）——用来算差异，也用来做兜底基线。 */
export interface SeriesReleaseLiveValues {
  coverImageUrl?: string | null;
  coverTitle?: string | null;
  sellingPoint?: string | null;
  targetHealthTags?: string[] | null;
  badgeHealthTagIds?: string[] | null;
  taxonomy?: SeriesReleaseDraftTaxonomyLink[] | null;
}

export function buildSeriesReleaseLiveValues(
  live: SeriesReleaseLiveValues,
): SeriesReleaseDraftPayload {
  return {
    coverImageUrl: normalizeText(live.coverImageUrl) || null,
    coverTitle: normalizeText(live.coverTitle) || null,
    sellingPoint: normalizeText(live.sellingPoint) || null,
    targetHealthTags: normalizeStringList(live.targetHealthTags),
    badgeHealthTagIds: normalizeStringList(live.badgeHealthTagIds),
    taxonomy: normalizeSeriesReleaseDraftTaxonomy(live.taxonomy),
  };
}

const isSameStringSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

const taxonomySignature = (links: SeriesReleaseDraftTaxonomyLink[]): string =>
  links
    .map((link) => `${link.kindId}:${link.nodeId}`)
    .sort()
    .join('|');

/**
 * 草稿相对线上值改了什么。
 *
 * 顺序固定（封面图 → 标题 → 卖点 → 健康标签 → 角标 → 分类），
 * 抽屉与变更清单直接照着渲染，不再各自排序。
 */
export function diffSeriesReleaseDraft(
  draft: SeriesReleaseDraftPayload,
  live: SeriesReleaseDraftPayload,
): SeriesReleaseDraftField[] {
  const changed: SeriesReleaseDraftField[] = [];
  if (draft.coverImageUrl !== live.coverImageUrl) changed.push('coverImageUrl');
  if (draft.coverTitle !== live.coverTitle) changed.push('coverTitle');
  if (draft.sellingPoint !== live.sellingPoint) changed.push('sellingPoint');
  if (!isSameStringSet(draft.targetHealthTags, live.targetHealthTags)) {
    changed.push('targetHealthTags');
  }
  if (!isSameStringSet(draft.badgeHealthTagIds, live.badgeHealthTagIds)) {
    changed.push('coverBadges');
  }
  if (taxonomySignature(draft.taxonomy) !== taxonomySignature(live.taxonomy)) {
    changed.push('taxonomy');
  }
  return changed;
}

export type SeriesReleaseDraftPatch = Partial<
  Omit<SeriesReleaseDraftPayload, 'taxonomy'>
> & {
  taxonomy?: SeriesReleaseDraftTaxonomyLink[];
};

/**
 * 在当前草稿上打补丁。
 *
 * 基线是「已有草稿 ?? 线上值」：第一次编辑时草稿还不存在，字段没传的部分
 * 必须落在线上值上，否则只改一个卖点会把封面图冲掉。
 */
export function mergeSeriesReleaseDraft(
  current: SeriesReleaseDraftPayload | null,
  patch: SeriesReleaseDraftPatch,
  live: SeriesReleaseDraftPayload,
): SeriesReleaseDraftPayload {
  const base = current ?? live;
  const merged: SeriesReleaseDraftPayload = {
    coverImageUrl:
      patch.coverImageUrl === undefined
        ? base.coverImageUrl
        : normalizeText(patch.coverImageUrl) || null,
    coverTitle:
      patch.coverTitle === undefined
        ? base.coverTitle
        : normalizeText(patch.coverTitle) || null,
    sellingPoint:
      patch.sellingPoint === undefined
        ? base.sellingPoint
        : normalizeText(patch.sellingPoint) || null,
    targetHealthTags:
      patch.targetHealthTags === undefined
        ? [...base.targetHealthTags]
        : normalizeStringList(patch.targetHealthTags),
    badgeHealthTagIds:
      patch.badgeHealthTagIds === undefined
        ? [...base.badgeHealthTagIds]
        : normalizeStringList(patch.badgeHealthTagIds),
    taxonomy:
      patch.taxonomy === undefined
        ? [...base.taxonomy]
        : normalizeSeriesReleaseDraftTaxonomy(patch.taxonomy),
  };
  return merged;
}

/** 草稿是否已和线上完全一致（一致 = 删掉草稿行，别留一份空草稿）。 */
export function isSeriesReleaseDraftEqualToLive(
  draft: SeriesReleaseDraftPayload,
  live: SeriesReleaseDraftPayload,
): boolean {
  return diffSeriesReleaseDraft(draft, live).length === 0;
}

/** 变更清单文案：`封面图 · 一句话卖点 · 封面角标` */
export function formatSeriesReleaseDraftFieldList(
  fields: SeriesReleaseDraftField[],
): string {
  return fields
    .map((field) => SERIES_RELEASE_DRAFT_FIELD_LABELS[field] ?? field)
    .join(' · ');
}
