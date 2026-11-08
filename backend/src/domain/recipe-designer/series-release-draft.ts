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
  /** 食谱名称：顾客看到的第一行字，也是印在标签上的名字 */
  name: string | null;
  coverImageUrl: string | null;
  coverTitle: string | null;
  sellingPoint: string | null;
  targetHealthTags: string[];
  /** 封面角标（health_tag id，顺序即展示顺序） */
  badgeHealthTagIds: string[];
  taxonomy: SeriesReleaseDraftTaxonomyLink[];
  /**
   * 管理员真正动过的字段（2026-11-08 审核修复）。
   *
   * 草稿存的是全量快照，发布时如果整份应用，会把期间别人改过的
   * 归类 / 角标 / 名称一起回滚。只有这里列出的字段才允许覆盖线上值。
   */
  touched: SeriesReleaseDraftField[];
}

/** 草稿里会被比较 / 展示的字段；`coverBadges` 对应 badgeHealthTagIds。 */
export const SERIES_RELEASE_DRAFT_FIELDS = [
  'name',
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
  name: '食谱名称',
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
    name: normalizeText(source.name) || null,
    coverImageUrl: normalizeText(source.coverImageUrl) || null,
    coverTitle: normalizeText(source.coverTitle) || null,
    sellingPoint: normalizeText(source.sellingPoint) || null,
    targetHealthTags: normalizeStringList(source.targetHealthTags),
    badgeHealthTagIds: normalizeStringList(source.badgeHealthTagIds),
    taxonomy: normalizeSeriesReleaseDraftTaxonomy(source.taxonomy),
    touched: normalizeTouchedFields(source.touched),
  };
}

const FIELD_SET = new Set<string>(SERIES_RELEASE_DRAFT_FIELDS);

function normalizeTouchedFields(value: unknown): SeriesReleaseDraftField[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry).trim()))].filter(
    (entry): entry is SeriesReleaseDraftField => FIELD_SET.has(entry),
  );
}

export function emptySeriesReleaseDraft(): SeriesReleaseDraftPayload {
  return {
    name: null,
    coverImageUrl: null,
    coverTitle: null,
    sellingPoint: null,
    targetHealthTags: [],
    badgeHealthTagIds: [],
    taxonomy: [],
    touched: [],
  };
}

/** 线上值（系列 + 角标表 + 归类表）——用来算差异，也用来做兜底基线。 */
export interface SeriesReleaseLiveValues {
  name?: string | null;
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
    name: normalizeText(live.name) || null,
    coverImageUrl: normalizeText(live.coverImageUrl) || null,
    coverTitle: normalizeText(live.coverTitle) || null,
    sellingPoint: normalizeText(live.sellingPoint) || null,
    targetHealthTags: normalizeStringList(live.targetHealthTags),
    badgeHealthTagIds: normalizeStringList(live.badgeHealthTagIds),
    taxonomy: normalizeSeriesReleaseDraftTaxonomy(live.taxonomy),
    touched: [],
  };
}

const isSameStringSet = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
};

/** 顺序敏感的比较：封面角标数组顺序就是封面上的展示顺序。 */
const isSameOrderedStringList = (
  left: string[],
  right: string[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

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
  if (draft.name !== live.name) changed.push('name');
  if (draft.coverImageUrl !== live.coverImageUrl) changed.push('coverImageUrl');
  if (draft.coverTitle !== live.coverTitle) changed.push('coverTitle');
  if (draft.sellingPoint !== live.sellingPoint) changed.push('sellingPoint');
  if (!isSameStringSet(draft.targetHealthTags, live.targetHealthTags)) {
    changed.push('targetHealthTags');
  }
  if (
    !isSameOrderedStringList(draft.badgeHealthTagIds, live.badgeHealthTagIds)
  ) {
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
    name:
      patch.name === undefined ? base.name : normalizeText(patch.name) || null,
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
    touched: [...base.touched],
  };
  const touched = new Set<SeriesReleaseDraftField>(merged.touched);
  const mapPatchKey = (key: string): SeriesReleaseDraftField | null => {
    if (key === 'badgeHealthTagIds') return 'coverBadges';
    return FIELD_SET.has(key) ? (key as SeriesReleaseDraftField) : null;
  };
  for (const key of Object.keys(patch)) {
    const field = mapPatchKey(key);
    if (field) touched.add(field);
  }
  // 改回和线上一样 = 这个字段不再算「改过」
  for (const field of [...touched]) {
    if (!diffSeriesReleaseDraft(merged, live).includes(field)) {
      touched.delete(field);
    }
  }
  merged.touched = [...touched];
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


/**
 * 发布时真正生效的字段：线上值 + 管理员动过的字段。
 *
 * 没动过的字段一律取**发布这一刻的线上值**，这样别人在期间改的
 * 归类 / 角标 / 名称不会被草稿里的旧值覆盖。
 * 老草稿没有 `touched`：退回「按差异算」，保持与改造前一致。
 */
export function resolveSeriesReleaseDraftApplied(
  draft: SeriesReleaseDraftPayload | null,
  live: SeriesReleaseDraftPayload,
): { applied: SeriesReleaseDraftPayload; fields: SeriesReleaseDraftField[] } {
  if (!draft) return { applied: live, fields: [] };
  const fields = draft.touched.length
    ? draft.touched
    : diffSeriesReleaseDraft(draft, live);
  const fieldSet = new Set(fields);
  const applied: SeriesReleaseDraftPayload = {
    ...live,
    touched: [...fields],
  };
  if (fieldSet.has('name')) applied.name = draft.name;
  if (fieldSet.has('coverImageUrl')) applied.coverImageUrl = draft.coverImageUrl;
  if (fieldSet.has('coverTitle')) applied.coverTitle = draft.coverTitle;
  if (fieldSet.has('sellingPoint')) applied.sellingPoint = draft.sellingPoint;
  if (fieldSet.has('targetHealthTags')) {
    applied.targetHealthTags = [...draft.targetHealthTags];
  }
  if (fieldSet.has('coverBadges')) {
    applied.badgeHealthTagIds = [...draft.badgeHealthTagIds];
  }
  if (fieldSet.has('taxonomy')) applied.taxonomy = [...draft.taxonomy];
  return { applied, fields: fields.filter((field) => diffSeriesReleaseDraft(applied, live).includes(field)) };
}
