import type { PreparationState } from '../../domain/ingredient-creation/preparation-state';
import type {
  CandidateGroupSummary,
  CandidateNarrowingChoice,
} from './ingredient-candidate-groups';
import type {
  NameClassification,
  NutritionRecordMethod,
  NutritionRecordState,
} from './ingredient-name-classifier.service';

/**
 * AI 分类驱动的收窄。
 *
 * 旧的 `ingredient-candidate-groups.ts` 按关键词表猜部位；这里只消费
 * `nutrition_record_classification` 里的 AI 判断，用**真实统计**（多少条生、
 * 多少条熟、水煮 / 蒸 / 烤 / 煎各几条、各部位几条）生成收窄问句。
 * 判断不在代码里做，代码只负责计数与把选项摆出来。
 */

export interface ClassificationName {
  id: string;
  name: string;
  sourceType: string;
}

export interface ClassificationCutGroupSummary {
  key: string;
  label: string;
  count: number;
  states: PreparationState[];
}

export interface ClassificationNarrowingStats {
  total: number;
  byState: Record<NutritionRecordState, number>;
  byMethod: Record<NutritionRecordMethod, number>;
  cutGroups: ClassificationCutGroupSummary[];
}

export interface ClassificationNarrowingChoice extends CandidateNarrowingChoice {
  /** 「生 + 熟都要」这类多选状态用一个选项表达。 */
  states?: PreparationState[];
}

export interface ClassificationNarrowing {
  required: boolean;
  kind: 'NONE' | 'STATE' | 'GROUP';
  reason: 'STATE_UNSPECIFIED' | 'MULTIPLE_GROUPS' | null;
  question: string;
  options: string[];
  choices: ClassificationNarrowingChoice[];
  groups: CandidateGroupSummary[];
  stats: ClassificationNarrowingStats;
}

export interface BuildClassificationNarrowingInput {
  keyword: string;
  names: readonly ClassificationName[];
  classifications: readonly NameClassification[];
  /** 模型这一轮有没有显式指定状态（`state` / `states`）。 */
  stateSpecified: boolean;
  /** 已选状态；「生 + 熟都要」传 ['RAW', 'COOKED']。 */
  states?: readonly PreparationState[];
  /** 已选部位组 key（来自上一次的 groups / choices）。 */
  groupKey?: string | null;
}

export interface BuildClassificationNarrowingResult {
  narrowing: ClassificationNarrowing;
  selectedStates: PreparationState[];
  selectedGroupKey: string | null;
}

export interface ClassificationListingItem {
  name: ClassificationName;
  classification: NameClassification;
  /** 覆盖率（0-100）；没有营养档案时为 null。 */
  coveragePercent?: number | null;
  verdict?: 'RELEVANT' | 'UNCERTAIN' | 'IRRELEVANT';
  reason?: string | null;
}

export interface ClassificationListingEntry {
  sourceRecordId: string;
  foodName: string;
  sourceType: string;
  coveragePercent: number | null;
  verdict: 'RELEVANT' | 'UNCERTAIN' | 'IRRELEVANT';
  reason: string;
  label: string;
  /** 给页面 / askUser 的 AI 分类标签与依据词。 */
  classification: NameClassification;
}

export interface ClassificationListing {
  question: string;
  options: string[];
  entries: ClassificationListingEntry[];
  single: boolean;
}

export const CLASSIFICATION_FALLBACK_OPTION = '都不对，我直接说';
export const CLASSIFICATION_OTHER_GROUP_KEY = '__other__';
export const CLASSIFICATION_OTHER_GROUP_LABEL = '其他分组';
export const CLASSIFICATION_MAX_ENTRIES = 5;
export const CLASSIFICATION_MAX_GROUP_OPTIONS = 5;

/**
 * 部位 key → 展示中文。
 *
 * 这只是一张**展示标签表**，不参与判断：AI 返回什么 key，代码就按什么 key
 * 归组；表里没有的 key 原样显示，不猜、不合并。
 */
const CUT_GROUP_LABELS: Readonly<Record<string, string>> = {
  ground: '绞肉',
  tenderloin: '里脊',
  loin: '外脊',
  round: '后腿',
  brisket: '腩',
  shank: '腱',
  chuck: '肩',
  rib: '肋排',
  sandwich: '薄片',
  breast: '胸',
  thigh: '腿',
  wing: '翅',
  liver: '肝',
  heart: '心',
  kidney: '肾',
  gizzard: '胗',
  neck: '颈',
  head: '头',
  foot: '爪',
  other: '其他部位',
};

/** 同条数时的稳定展示顺序；只是排版，不参与判断。 */
const CUT_GROUP_ORDER = new Map(
  Object.keys(CUT_GROUP_LABELS).map((key, index) => [key, index] as const),
);

export function cutGroupLabel(key: string | null | undefined): string {
  const normalized = typeof key === 'string' ? key.trim().toLowerCase() : '';
  if (!normalized) {
    return '其他部位';
  }
  if (normalized === '__other__') {
    return '其他分组';
  }
  return CUT_GROUP_LABELS[normalized] ?? normalized;
}

const STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED'];
const METHOD_ORDER: readonly NutritionRecordMethod[] = [
  'BOILED',
  'STEAMED',
  'GRILLED',
  'FRIED',
  'OTHER',
  'NONE',
];
const METHOD_LABELS: Record<NutritionRecordMethod, string> = {
  BOILED: '水煮',
  STEAMED: '蒸',
  GRILLED: '烤',
  FRIED: '煎/炸',
  OTHER: '其它',
  NONE: '无',
};
const STATE_LABELS: Record<PreparationState, string> = {
  RAW: '生',
  COOKED: '熟',
};
const VERDICT_LABELS: Record<
  'RELEVANT' | 'UNCERTAIN' | 'IRRELEVANT',
  string
> = {
  RELEVANT: '相关',
  UNCERTAIN: '存疑',
  IRRELEVANT: '不相关',
};

function uniqueStates(
  values: readonly (PreparationState | null | undefined)[] | undefined,
): PreparationState[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const found = new Set<PreparationState>();
  for (const value of values) {
    if (value === 'RAW' || value === 'COOKED') {
      found.add(value);
    }
  }
  return STATE_ORDER.filter((state) => found.has(state));
}

function classificationGroupKey(
  classification: NameClassification | null | undefined,
): string {
  const key = classification?.cutGroup?.trim().toLowerCase() ?? '';
  return key || 'other';
}

/** 把 AI 分类折成真实统计：状态、做法、部位各多少条。 */
export function buildClassificationStats(
  names: readonly ClassificationName[],
  classifications: readonly NameClassification[],
): ClassificationNarrowingStats {
  const byId = new Map(
    classifications.map((entry) => [entry.id, entry] as const),
  );
  const byState: Record<NutritionRecordState, number> = {
    RAW: 0,
    COOKED: 0,
    UNKNOWN: 0,
  };
  const byMethod: Record<NutritionRecordMethod, number> = {
    BOILED: 0,
    STEAMED: 0,
    GRILLED: 0,
    FRIED: 0,
    OTHER: 0,
    NONE: 0,
  };
  const groupMap = new Map<
    string,
    { count: number; states: Set<PreparationState> }
  >();

  for (const name of names) {
    const classification = byId.get(name.id) ?? null;
    const state = classification?.state ?? 'UNKNOWN';
    const method = classification?.method ?? 'NONE';
    byState[state] += 1;
    byMethod[method] += 1;

    const key = classificationGroupKey(classification);
    const group = groupMap.get(key) ?? {
      count: 0,
      states: new Set<PreparationState>(),
    };
    group.count += 1;
    if (state === 'RAW' || state === 'COOKED') {
      group.states.add(state);
    }
    groupMap.set(key, group);
  }

  const cutGroups: ClassificationCutGroupSummary[] = [...groupMap.entries()]
    .map(([key, group]) => ({
      key,
      label: cutGroupLabel(key),
      count: group.count,
      states: STATE_ORDER.filter((state) => group.states.has(state)),
    }))
.sort(compareCutGroups);

  return { total: names.length, byState, byMethod, cutGroups };
}

/** 按已选状态筛过的词条重新统计部位，保证问句里的条数与所选状态同口径。 */
function buildScopedCutGroups(
  items: ReadonlyArray<{
    name: ClassificationName;
    classification: NameClassification;
  }>,
): ClassificationCutGroupSummary[] {
  const groupMap = new Map<
    string,
    { count: number; states: Set<PreparationState> }
  >();
  for (const item of items) {
    const key = classificationGroupKey(item.classification);
    const group = groupMap.get(key) ?? {
      count: 0,
      states: new Set<PreparationState>(),
    };
    group.count += 1;
    if (
      item.classification.state === 'RAW' ||
      item.classification.state === 'COOKED'
    ) {
      group.states.add(item.classification.state);
    }
    groupMap.set(key, group);
  }
  return [...groupMap.entries()]
    .map(([key, group]) => ({
      key,
      label: cutGroupLabel(key),
      count: group.count,
      states: STATE_ORDER.filter((state) => group.states.has(state)),
    }))
    .sort(compareCutGroups);
}

function compareCutGroups(
  left: ClassificationCutGroupSummary,
  right: ClassificationCutGroupSummary,
): number {
  if (left.key === 'other' && right.key !== 'other') return 1;
  if (right.key === 'other' && left.key !== 'other') return -1;
  if (left.count !== right.count) {
    return right.count - left.count;
  }
  return (
    (CUT_GROUP_ORDER.get(left.key) ?? 999) -
      (CUT_GROUP_ORDER.get(right.key) ?? 999) ||
    left.key.localeCompare(right.key)
  );
}

function toCandidateGroups(
  cutGroups: readonly ClassificationCutGroupSummary[],
): CandidateGroupSummary[] {
  return cutGroups.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.count,
    states: [...group.states],
  }));
}

function methodSummaryText(
  stats: ClassificationNarrowingStats,
): string {
  const parts = METHOD_ORDER.filter(
    (method) => method !== 'NONE' && stats.byMethod[method] > 0,
  ).map((method) => `${METHOD_LABELS[method]} ${stats.byMethod[method]} 条`);
  return parts.length > 0 ? parts.join('、') : '未识别做法';
}

function cutSummaryText(stats: ClassificationNarrowingStats): string {
  const groups = stats.cutGroups.filter((group) => group.count > 0);
  if (groups.length === 0) {
    return '未识别部位';
  }
  const shown = groups.slice(0, 4).map((group) => `${group.label} ${group.count} 条`);
  return groups.length > shown.length
    ? `${shown.join('、')} 等 ${groups.length} 个部位`
    : shown.join('、');
}

function stateSummaryText(stats: ClassificationNarrowingStats): string {
  const parts = [
    `生 ${stats.byState.RAW} 条`,
    `熟 ${stats.byState.COOKED} 条`,
  ];
  if (stats.byState.COOKED > 0) {
    parts[1] = `熟 ${stats.byState.COOKED} 条（${methodSummaryText(stats)}）`;
  }
  if (stats.byState.UNKNOWN > 0) {
    parts.push(`看不出生熟 ${stats.byState.UNKNOWN} 条`);
  }
  return parts.join('、');
}

function statsQuestionPrefix(
  keyword: string,
  stats: ClassificationNarrowingStats,
): string {
  return `「${keyword}」共 ${stats.total} 条：${stateSummaryText(stats)}；部位有：${cutSummaryText(stats)}。`;
}

function optionsWithCount(
  choices: readonly ClassificationNarrowingChoice[],
): string[] {
  return choices.map((choice) =>
    typeof choice.count === 'number'
      ? `${choice.label}（${choice.count} 条）`
      : choice.label,
  );
}

function groupChoices(
  groups: readonly ClassificationCutGroupSummary[],
): ClassificationNarrowingChoice[] {
  if (groups.length <= CLASSIFICATION_MAX_GROUP_OPTIONS) {
    return groups.map((group) => ({
      kind: 'GROUP' as const,
      key: group.key,
      label: group.label,
      count: group.count,
    }));
  }

  const head = groups.slice(0, CLASSIFICATION_MAX_GROUP_OPTIONS - 1);
  const rest = groups.slice(CLASSIFICATION_MAX_GROUP_OPTIONS - 1);
  const restCount = rest.reduce((total, group) => total + group.count, 0);
  return [
    ...head.map((group) => ({
      kind: 'GROUP' as const,
      key: group.key,
      label: group.label,
      count: group.count,
    })),
    {
      kind: 'GROUP' as const,
      key: CLASSIFICATION_OTHER_GROUP_KEY,
      label: CLASSIFICATION_OTHER_GROUP_LABEL,
      count: restCount,
    },
  ];
}

function stateChoices(
  stats: ClassificationNarrowingStats,
): ClassificationNarrowingChoice[] {
  const choices: ClassificationNarrowingChoice[] = [];
  if (stats.byState.RAW > 0) {
    choices.push({
      kind: 'STATE',
      key: 'RAW',
      label: '生',
      count: stats.byState.RAW,
      state: 'RAW',
      states: ['RAW'],
    });
  }
  if (stats.byState.COOKED > 0) {
    choices.push({
      kind: 'STATE',
      key: 'COOKED',
      label: '熟',
      count: stats.byState.COOKED,
      state: 'COOKED',
      states: ['COOKED'],
    });
  }
  if (stats.byState.RAW > 0 && stats.byState.COOKED > 0) {
    choices.push({
      kind: 'STATE',
      key: 'RAW+COOKED',
      label: '生 + 熟都要',
      count: stats.byState.RAW + stats.byState.COOKED,
      states: ['RAW', 'COOKED'],
    });
  }
  return choices;
}

function emptyNarrowing(
  stats: ClassificationNarrowingStats,
  groups: readonly ClassificationCutGroupSummary[] = stats.cutGroups,
): ClassificationNarrowing {
  return {
    required: false,
    kind: 'NONE',
    reason: null,
    question: '',
    options: [],
    choices: [],
    groups: toCandidateGroups(groups),
    stats,
  };
}

/**
 * 生成收窄问题。
 *
 * - 没指定状态：先用真实统计问状态，选项带条数，且必须有「生 + 熟都要」；
 * - 已指定状态：跨多个部位时再按部位收窄，选项同样带真实条数；
 * - 选完组 / 只剩一组 / 全部 UNKNOWN：不再收窄，由调用方直接列 ≤5 条。
 */
export function buildClassificationNarrowing(
  input: BuildClassificationNarrowingInput,
): BuildClassificationNarrowingResult {
  const stats = buildClassificationStats(input.names, input.classifications);
  const groups = toCandidateGroups(stats.cutGroups);
  const knownCount = stats.byState.RAW + stats.byState.COOKED;
  const selectedStates = uniqueStates(
    input.stateSpecified ? input.states : undefined,
  );
  const requestedGroupKey =
    typeof input.groupKey === 'string' && input.groupKey.trim()
      ? input.groupKey.trim()
      : null;

  if (input.stateSpecified !== true) {
    // 全部认不出：不硬问「生 / 熟」，交给调用方把名字摆出来让人自己说。
    if (knownCount === 0) {
      return {
        narrowing: emptyNarrowing(stats),
        selectedStates: [],
        selectedGroupKey: null,
      };
    }

    const choices = stateChoices(stats);
    // 只有一种已知状态但条数很多 / 有 UNKNOWN：也要让人能明确选「生 + 熟都要」，
    // 否则 askUser 只有 1 个选项，问不出去。
    if (choices.length === 1) {
      const only = choices[0]!;
      choices.push({
        kind: 'STATE',
        key: 'RAW+COOKED',
        label: '生 + 熟都要',
        count: knownCount,
        states: ['RAW', 'COOKED'],
      });
      if (only.count === undefined) {
        only.count = knownCount;
      }
    }

    return {
      selectedStates: [],
      selectedGroupKey: null,
      narrowing: {
        required: true,
        kind: 'STATE',
        reason: 'STATE_UNSPECIFIED',
        question: `${statsQuestionPrefix(input.keyword, stats)}要哪些状态？`,
        options: optionsWithCount(choices),
        choices,
        groups,
        stats,
      },
    };
  }

  const statesForScope =
    selectedStates.length > 0 ? selectedStates : (['RAW'] as PreparationState[]);
  // 只有真的选了部位组才算「已收窄」；只选了状态时 selectedGroupKey 仍为 null，
  // askUser 闸门才会继续拦住「跳过部位直接列词条」。
  const selectedGroupKey = requestedGroupKey;

  const scoped = resolveClassificationGroupScope({
    names: input.names,
    classifications: input.classifications,
    groups: stats.cutGroups,
    groupKey: requestedGroupKey,
    states: statesForScope,
  });
  // 选了状态之后，部位条数也必须只统计该状态的词条：不能把生词条的
  // 部位数混进「熟」的收窄问句里。
  const scopedGroups = buildScopedCutGroups(scoped);

  if (
    requestedGroupKey ||
    scoped.length <= CLASSIFICATION_MAX_ENTRIES ||
    scopedGroups.length <= 1
  ) {
    return {
      narrowing: emptyNarrowing(stats, scopedGroups),
      selectedStates: statesForScope,
      selectedGroupKey,
    };
  }

  const choices = groupChoices(scopedGroups);
  const stateLabel = statesForScope.map((state) => STATE_LABELS[state]).join(' + ');
  return {
    selectedStates: statesForScope,
    selectedGroupKey,
    narrowing: {
      required: true,
      kind: 'GROUP',
      reason: 'MULTIPLE_GROUPS',
      question:
        `「${input.keyword}·${stateLabel}」共 ${scoped.length} 条：` +
        `${stateSummaryText(stats)}；部位有：${cutSummaryText({ ...stats, cutGroups: scopedGroups })}。先按部位收窄：`,
      options: optionsWithCount(choices),
      choices,
      groups: toCandidateGroups(scopedGroups),
      stats,
    },
  };
}

/**
 * 按 AI 判出的部位组筛词条。
 *
 * `__other__` 是「不在前 4 个分组里」的聚合组，与收窄选项里的
 * 「其他分组」保持同一口径。未指定组时返回按状态筛过的全部词条。
 */
export function resolveClassificationGroupScope(input: {
  names: readonly ClassificationName[];
  classifications: readonly NameClassification[];
  groups: readonly ClassificationCutGroupSummary[];
  groupKey?: string | null;
  states?: readonly PreparationState[];
}): Array<{ name: ClassificationName; classification: NameClassification }> {
  const byId = new Map(
    input.classifications.map((entry) => [entry.id, entry] as const),
  );
  const states = uniqueStates(input.states);
  const stateSet = states.length > 0 ? new Set(states) : null;
  const groupKey =
    typeof input.groupKey === 'string' && input.groupKey.trim()
      ? input.groupKey.trim()
      : null;

  const topKeys = new Set(
    input.groups.slice(0, CLASSIFICATION_MAX_GROUP_OPTIONS - 1).map(
      (group) => group.key,
    ),
  );

  const scoped: Array<{
    name: ClassificationName;
    classification: NameClassification;
  }> = [];
  for (const name of input.names) {
    const classification = byId.get(name.id);
    if (!classification) continue;
    if (classification.state === 'UNKNOWN') continue;
    if (stateSet && !stateSet.has(classification.state)) continue;

    if (groupKey === CLASSIFICATION_OTHER_GROUP_KEY) {
      if (topKeys.has(classificationGroupKey(classification))) continue;
    } else if (groupKey) {
      if (classificationGroupKey(classification) !== groupKey) continue;
    }
    scoped.push({ name, classification });
  }
  return scoped;
}

function truncateText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function formatCoverage(coveragePercent: number | null | undefined): string {
  if (
    typeof coveragePercent !== 'number' ||
    !Number.isFinite(coveragePercent)
  ) {
    return '未知';
  }
  return `${Math.round(coveragePercent * 10) / 10}%`;
}

/** 词条选项文案：保持旧格式，AI 分类放在结构化字段里，不塞进文案。 */
function entryLabel(item: ClassificationListingItem): string {
  const verdict = item.verdict ?? 'UNCERTAIN';
  const reason = truncateText(
    (item.reason ?? '').replace(/\s+/gu, ' ').trim(),
    40,
  );
  return `${item.name.name} · 来源 ${item.name.sourceType || '未知'} · 覆盖率 ${formatCoverage(
    item.coveragePercent,
  )} · ${VERDICT_LABELS[verdict]}${reason ? `：${reason}` : ''}`;
}

/**
 * 收窄后的词条选项：≤5 条 + 永远最后一条「都不对，我直接说」。
 *
 * 每条都带 AI 分类（状态 / 做法 / 部位 / 依据词），页面据此显示标签。
 */
export function buildClassificationListing(input: {
  title: string;
  items: readonly ClassificationListingItem[];
  maxEntries?: number;
}): ClassificationListing {
  const maxEntries =
    typeof input.maxEntries === 'number' && Number.isFinite(input.maxEntries)
      ? Math.max(1, Math.floor(input.maxEntries))
      : CLASSIFICATION_MAX_ENTRIES;
  const rows = input.items.slice(0, maxEntries);
  const entries: ClassificationListingEntry[] = rows.map((item) => ({
    sourceRecordId: item.name.id,
    foodName: item.name.name,
    sourceType: item.name.sourceType || '未知',
    coveragePercent:
      typeof item.coveragePercent === 'number' &&
      Number.isFinite(item.coveragePercent)
        ? item.coveragePercent
        : null,
    verdict: item.verdict ?? 'UNCERTAIN',
    reason: (item.reason ?? '').replace(/\s+/gu, ' ').trim(),
    label: entryLabel(item),
    classification: item.classification,
  }));

  if (entries.length === 0) {
    return { question: '', options: [], entries: [], single: false };
  }

  if (entries.length === 1) {
    return {
      question: `${input.title}只有 1 条：${entries[0]!.foodName}。`,
      options: [],
      entries,
      single: true,
    };
  }

  const question =
    input.items.length > entries.length
      ? `${input.title}共 ${input.items.length} 条，先列前 ${entries.length} 条，请选一条：`
      : `${input.title}共 ${entries.length} 条，请选一条：`;

  return {
    question,
    options: [
      ...entries.map((entry) => entry.label),
      CLASSIFICATION_FALLBACK_OPTION,
    ],
    entries,
    single: false,
  };
}
