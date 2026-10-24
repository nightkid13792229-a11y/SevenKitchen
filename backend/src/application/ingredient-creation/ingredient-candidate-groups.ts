import type { PreparationState } from '../../domain/ingredient-creation/preparation-state';
import type { CandidateReviewVerdict } from './ingredient-creation.types';

/**
 * 候选部位分组的确定性规则。
 *
 * 线上问题：输入「牛肉」时 50 条候选、11 条相关，模型直接列 5 个词条，
 * 用户既不知道另外 6 条在哪，也不知道这些词条分属哪些部位。这里把
 * 「先按部位收窄」做成纯函数：只按候选名里的关键词分组，不调用模型、
 * 不让模型自由发挥；分组结果原样交给 `searchLocalNutrition` 与页面。
 *
 * 规则只认整词（英文）或明确的中文部位词；认不出就进「其他部位」，
 * 不硬套、不猜。分组顺序：条数从多到少，「其他部位」永远最后。
 */

const RAW_STATE_ORDER: readonly PreparationState[] = ['RAW', 'COOKED'];

export const CANDIDATE_GROUP_FALLBACK_OPTION = '都不对，我直接说';
export const CANDIDATE_GROUP_OTHER_KEY = '__other__';
export const CANDIDATE_GROUP_OTHER_LABEL = '其他分组';
/** 收窄问题最多给 5 个可点选项（与 askUser 的口径一致）。 */
export const CANDIDATE_NARROWING_MAX_OPTIONS = 5;
/** 单个部位组最多列 5 条词条。 */
export const CANDIDATE_GROUP_MAX_ENTRIES = 5;

export interface CandidateGroupCandidate {
  sourceRecordId: string;
  foodName: string;
  foodNameEn?: string | null;
  sourceType?: string;
  preparationState?: PreparationState | null;
  coveragePercent?: number | null;
  review?: {
    verdict: CandidateReviewVerdict;
    reason?: string | null;
  } | null;
}

export interface CandidateGroupSummary {
  key: string;
  label: string;
  count: number;
  states: PreparationState[];
}

export interface CandidateNarrowingChoice {
  kind: 'GROUP' | 'STATE';
  key: string;
  label: string;
  count?: number;
  state?: PreparationState;
}

export interface CandidateNarrowing {
  required: boolean;
  kind: 'NONE' | 'STATE' | 'GROUP';
  reason:
    | 'STATE_UNSPECIFIED'
    | 'CROSS_STATE'
    | 'MULTIPLE_GROUPS'
    | 'MANY_RELEVANT'
    | null;
  question: string;
  options: string[];
  choices: CandidateNarrowingChoice[];
  groups: CandidateGroupSummary[];
}

export interface CandidateGroupEntry {
  sourceRecordId: string;
  foodName: string;
  sourceType: string;
  coveragePercent: number | null;
  verdict: CandidateReviewVerdict;
  reason: string;
  label: string;
}

export interface CandidateGroupListing {
  question: string;
  options: string[];
  entries: CandidateGroupEntry[];
  /** 该组只有 1 条：直接用它，不再生成点选问题。 */
  single: boolean;
}

interface PartGroupRule {
  key: string;
  label: string;
  latin: readonly string[];
  cjk: readonly string[];
  /** 「其他部位」不拼物种前缀（牛其他部位很别扭）。 */
  prefixable: boolean;
}

const PART_GROUP_RULES: readonly PartGroupRule[] = [
  {
    key: 'ground',
    label: '绞肉',
    latin: ['ground', 'grounded', 'minced', 'mince'],
    cjk: ['绞肉', '绞', '肉馅', '肉末'],
    prefixable: true,
  },
  {
    key: 'tenderloin',
    label: '里脊',
    latin: ['tenderloin', 'fillet', 'filet'],
    cjk: ['里脊', '牛柳'],
    prefixable: true,
  },
  {
    key: 'loin',
    label: '外脊',
    latin: ['loin', 'sirloin', 'striploin'],
    cjk: ['外脊', '西冷'],
    prefixable: true,
  },
  {
    key: 'round',
    label: '后腿',
    latin: ['round', 'rump'],
    cjk: ['后腿', '腿肉', '臀'],
    prefixable: true,
  },
  {
    key: 'brisket',
    label: '腩',
    latin: ['brisket'],
    cjk: ['牛腩', '腩'],
    prefixable: true,
  },
  {
    key: 'shank',
    label: '腱',
    latin: ['shank'],
    cjk: ['腱'],
    prefixable: true,
  },
  {
    key: 'rib',
    label: '肋排',
    latin: ['rib', 'ribs', 'ribeye'],
    cjk: ['肋排', '排骨', '肋'],
    prefixable: true,
  },
  {
    key: 'chuck',
    label: '肩',
    latin: ['chuck'],
    cjk: ['肩'],
    prefixable: true,
  },
  {
    key: 'sandwich',
    label: '薄片',
    latin: ['sandwich', 'sliced', 'shaved'],
    cjk: ['薄片', '片'],
    prefixable: true,
  },
  {
    key: 'other',
    label: '其他部位',
    latin: [],
    cjk: [],
    prefixable: false,
  },
] as const;

const PART_GROUP_RULE_BY_KEY = new Map(
  PART_GROUP_RULES.map((rule) => [rule.key, rule] as const),
);
const PART_GROUP_RULE_ORDER = new Map(
  PART_GROUP_RULES.map((rule, index) => [rule.key, index] as const),
);

interface SpeciesRule {
  prefix: string;
  tokens: readonly string[];
}

const SPECIES_RULES: readonly SpeciesRule[] = [
  { prefix: '牛', tokens: ['牛', 'beef', 'cattle', 'bovine'] },
  { prefix: '猪', tokens: ['猪', 'pork', 'pig', 'swine'] },
  { prefix: '羊', tokens: ['羊', 'lamb', 'mutton', 'goat'] },
  { prefix: '鸡', tokens: ['鸡', 'chicken'] },
  { prefix: '鸭', tokens: ['鸭', 'duck'] },
  { prefix: '鱼', tokens: ['鱼', 'fish'] },
];

const HAN_SCRIPT = /\p{Script=Han}/u;

function tokenizeName(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function latinTokenMatches(token: string, candidate: string): boolean {
  return candidate === token || candidate === `${token}s`;
}

function nameMatchesRule(name: string, rule: PartGroupRule): boolean {
  if (!name) {
    return false;
  }
  const normalized = name.normalize('NFKC');
  if (rule.cjk.some((token) => normalized.includes(token))) {
    return true;
  }
  if (rule.latin.length === 0) {
    return false;
  }
  const tokens = tokenizeName(normalized);
  return rule.latin.some((latin) =>
    tokens.some((token) => latinTokenMatches(latin, token)),
  );
}

/**
 * 一条候选落在哪个部位组；认不出返回 `other`。
 *
 * 规则按声明顺序优先（ground 在 round 前、tenderloin 在 loin 前），
 * 英文按整词匹配，所以 `ground` 不会被 `round` 抢走。
 */
export function candidatePartGroupKey(
  candidate: Pick<CandidateGroupCandidate, 'foodName' | 'foodNameEn'> | string,
): string {
  const names =
    typeof candidate === 'string'
      ? [candidate]
      : [candidate.foodName, candidate.foodNameEn ?? ''];
  const nonEmptyNames = names.filter(
    (name) => typeof name === 'string' && name.trim().length > 0,
  );
  for (const rule of PART_GROUP_RULES) {
    if (rule.key === 'other') {
      continue;
    }
    if (nonEmptyNames.some((name) => nameMatchesRule(name, rule))) {
      return rule.key;
    }
  }
  return 'other';
}

/** 从检索词 / 候选名识别物种前缀；认不出就不加前缀，不猜。 */
function detectSpeciesPrefix(
  keyword: string,
  candidates: readonly CandidateGroupCandidate[],
): string {
  const haystacks = [
    keyword,
    ...candidates.flatMap((candidate) => [
      candidate.foodName,
      candidate.foodNameEn ?? '',
    ]),
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);

  for (const species of SPECIES_RULES) {
    for (const haystack of haystacks) {
      const normalized = haystack.normalize('NFKC').toLowerCase();
      for (const token of species.tokens) {
        if (HAN_SCRIPT.test(token)) {
          if (normalized.includes(token)) {
            return species.prefix;
          }
        } else if (tokenizeName(normalized).some((value) => value === token)) {
          return species.prefix;
        }
      }
    }
  }
  return '';
}

function groupLabel(rule: PartGroupRule, speciesPrefix: string): string {
  return rule.prefixable && speciesPrefix
    ? `${speciesPrefix}${rule.label}`
    : rule.label;
}

function uniqueStates(
  states: readonly (PreparationState | null)[],
): PreparationState[] {
  const found = new Set<PreparationState>();
  for (const state of states) {
    if (state === 'RAW' || state === 'COOKED') {
      found.add(state);
    }
  }
  return RAW_STATE_ORDER.filter((state) => found.has(state));
}

/**
 * 把候选按部位分组。每组 `count` 是该组候选条数，`states` 是组内出现过的
 * 生熟状态（去重、生在前）。「其他部位」永远排最后，其余按条数从多到少。
 */
export function buildCandidateGroups(
  candidates: readonly CandidateGroupCandidate[],
  options: { keyword?: string } = {},
): CandidateGroupSummary[] {
  if (candidates.length === 0) {
    return [];
  }

  const keyword = typeof options.keyword === 'string' ? options.keyword : '';
  const speciesPrefix = detectSpeciesPrefix(keyword, candidates);
  const byKey = new Map<string, CandidateGroupCandidate[]>();

  for (const candidate of candidates) {
    const key = candidatePartGroupKey(candidate);
    const rows = byKey.get(key);
    if (rows) {
      rows.push(candidate);
    } else {
      byKey.set(key, [candidate]);
    }
  }

  return [...byKey.entries()]
    .map(([key, rows]) => {
      const rule = PART_GROUP_RULE_BY_KEY.get(key);
      return {
        key,
        label: rule ? groupLabel(rule, speciesPrefix) : key,
        count: rows.length,
        states: uniqueStates(rows.map((row) => row.preparationState ?? null)),
      };
    })
    .sort((left, right) => {
      if (left.key === 'other' && right.key !== 'other') {
        return 1;
      }
      if (right.key === 'other' && left.key !== 'other') {
        return -1;
      }
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return (
        (PART_GROUP_RULE_ORDER.get(left.key) ?? 999) -
        (PART_GROUP_RULE_ORDER.get(right.key) ?? 999)
      );
    });
}

function stateLabel(state: PreparationState): string {
  return state === 'COOKED' ? '熟' : '生';
}

function choicesToOptions(
  choices: readonly CandidateNarrowingChoice[],
): string[] {
  return choices.map((choice) =>
    choice.kind === 'GROUP' && typeof choice.count === 'number'
      ? `${choice.label}（${choice.count} 条）`
      : choice.label,
  );
}

function stateChoices(): CandidateNarrowingChoice[] {
  return [
    { kind: 'STATE', key: 'RAW', label: '生（查生档案）', state: 'RAW' },
    {
      kind: 'STATE',
      key: 'COOKED',
      label: '熟（查熟档案）',
      state: 'COOKED',
    },
  ];
}

function groupChoices(
  groups: readonly CandidateGroupSummary[],
): CandidateNarrowingChoice[] {
  if (groups.length <= CANDIDATE_NARROWING_MAX_OPTIONS) {
    return groups.map((group) => ({
      kind: 'GROUP' as const,
      key: group.key,
      label: group.label,
      count: group.count,
    }));
  }

  // 超过 5 组：保留前 4 组，剩下的合成一个可点的「其他分组」。
  const head = groups.slice(0, CANDIDATE_NARROWING_MAX_OPTIONS - 1);
  const rest = groups.slice(CANDIDATE_NARROWING_MAX_OPTIONS - 1);
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
      key: CANDIDATE_GROUP_OTHER_KEY,
      label: CANDIDATE_GROUP_OTHER_LABEL,
      count: restCount,
    },
  ];
}

export interface BuildCandidateNarrowingInput {
  keyword: string;
  state: PreparationState;
  /** 模型这次调用有没有显式传 state；没传时默认 RAW 不能替用户决定。 */
  stateSpecified: boolean;
  /** 检索命中的候选总数（截断前）。 */
  totalCandidates: number;
  /** AI 判为相关的条数。 */
  relevantCount: number;
  /** 参与分组的候选（通常是相关候选）。 */
  candidates: readonly CandidateGroupCandidate[];
}

/**
 * 是否必须先收窄，以及确定性的收窄问题 / 选项。
 *
 * 触发条件（任一）：
 * - 相关候选 > 5；
 * - 候选跨 ≥2 个部位分组；
 * - 候选跨生 / 熟；
 * - 用户没指定状态（默认只查了生，不能替人决定）。
 *
 * 状态没指定时先问生 / 熟，避免「默认只搜生」；状态定下来后下一轮再按部位收窄。
 */
export function buildCandidateNarrowing(
  input: BuildCandidateNarrowingInput,
): CandidateNarrowing {
  const groups = buildCandidateGroups(input.candidates, {
    keyword: input.keyword,
  });
  const states = uniqueStates(
    input.candidates.map((candidate) => candidate.preparationState ?? null),
  );
  const crossStates = states.length >= 2;
  const multipleGroups = groups.length >= 2;
  const manyRelevant = input.relevantCount > 5;
  const stateUnspecified = input.stateSpecified !== true;
  const required =
    stateUnspecified || crossStates || multipleGroups || manyRelevant;

  if (!required) {
    return {
      required: false,
      kind: 'NONE',
      reason: null,
      question: '',
      options: [],
      choices: [],
      groups,
    };
  }

  if (stateUnspecified || crossStates) {
    const choices = stateChoices();
    const reason = stateUnspecified ? 'STATE_UNSPECIFIED' : 'CROSS_STATE';
    const groupPreview = groups
      .map((group) => `${group.label} ${group.count} 条`)
      .join('、');
    const question = stateUnspecified
      ? `「${input.keyword}」共 ${input.totalCandidates} 条候选，其中 ${input.relevantCount} 条 AI 判为相关，分 ${groups.length} 个部位组（${groupPreview}）。先确认要生档案还是熟档案，下一问再按部位收窄。`
      : `「${input.keyword}」的候选同时有生、熟两套（共 ${input.totalCandidates} 条，其中 ${input.relevantCount} 条相关）。先确认只看生档案还是熟档案。`;
    return {
      required: true,
      kind: 'STATE',
      reason,
      question,
      options: choicesToOptions(choices),
      choices,
      groups,
    };
  }

  const choices = groupChoices(groups);
  // 单组但相关 >5：仍然要收窄（先确认只看这一组），否则无法解释为什么只列 5 条。
  if (choices.length === 1) {
    const first = choices[0]!;
    const fallback: CandidateNarrowingChoice = {
      kind: 'STATE',
      key: 'FREE',
      label: CANDIDATE_GROUP_FALLBACK_OPTION,
    };
    return {
      required: true,
      kind: 'GROUP',
      reason: 'MANY_RELEVANT',
      question: `「${input.keyword}·${stateLabel(input.state)}」有 ${input.relevantCount} 条相关，都在「${first.label}」这一组。先只看这一组，还是你直接说？`,
      options: choicesToOptions([...choices, fallback]),
      choices: [...choices, fallback],
      groups,
    };
  }

  return {
    required: true,
    kind: 'GROUP',
    reason: multipleGroups ? 'MULTIPLE_GROUPS' : 'MANY_RELEVANT',
    question: `「${input.keyword}·${stateLabel(input.state)}」有 ${input.relevantCount} 条相关，分 ${groups.length} 个部位组。先按部位收窄：`,
    options: choicesToOptions(choices),
    choices,
    groups,
  };
}

export interface ResolveCandidateGroupScopeResult {
  key: string;
  label: string;
  count: number;
  states: PreparationState[];
  candidates: CandidateGroupCandidate[];
}

/**
 * 按分组 key 筛候选；`__other__` 表示「不在前 4 个分组里」的聚合组，
 * 与收窄选项里合并出来的「其他分组」保持同一口径。
 */
export function resolveCandidateGroupScope(
  candidates: readonly CandidateGroupCandidate[],
  groups: readonly CandidateGroupSummary[],
  groupKey: string,
): ResolveCandidateGroupScopeResult | null {
  if (groupKey === CANDIDATE_GROUP_OTHER_KEY) {
    const topKeys = new Set(
      groups
        .slice(0, CANDIDATE_NARROWING_MAX_OPTIONS - 1)
        .map((group) => group.key),
    );
    const scoped = candidates.filter(
      (candidate) => !topKeys.has(candidatePartGroupKey(candidate)),
    );
    if (scoped.length === 0) {
      return null;
    }
    return {
      key: CANDIDATE_GROUP_OTHER_KEY,
      label: CANDIDATE_GROUP_OTHER_LABEL,
      count: scoped.length,
      states: uniqueStates(
        scoped.map((candidate) => candidate.preparationState ?? null),
      ),
      candidates: scoped,
    };
  }

  const group = groups.find((entry) => entry.key === groupKey);
  if (!group) {
    return null;
  }
  const scoped = candidates.filter(
    (candidate) => candidatePartGroupKey(candidate) === groupKey,
  );
  if (scoped.length === 0) {
    return null;
  }
  return {
    key: group.key,
    label: group.label,
    count: group.count,
    states: group.states,
    candidates: scoped,
  };
}

const REVIEW_VERDICT_LABELS: Record<CandidateReviewVerdict, string> = {
  RELEVANT: '相关',
  UNCERTAIN: '存疑',
  IRRELEVANT: '不相关',
};

function truncateText(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function entryLabel(entry: CandidateGroupCandidate): string {
  const review = entry.review ?? null;
  const verdict = review?.verdict ?? 'UNCERTAIN';
  const reason = truncateText(
    (review?.reason ?? '').replace(/\s+/g, ' ').trim(),
    40,
  );
  const coverage =
    typeof entry.coveragePercent === 'number' &&
    Number.isFinite(entry.coveragePercent)
      ? `${Math.round(entry.coveragePercent * 10) / 10}%`
      : '未知';
  const sourceType =
    typeof entry.sourceType === 'string' && entry.sourceType.trim()
      ? entry.sourceType.trim()
      : '未知';
  return `${entry.foodName} · 来源 ${sourceType} · 覆盖率 ${coverage} · ${
    REVIEW_VERDICT_LABELS[verdict]
  }${reason ? `：${reason}` : ''}`;
}

export interface BuildCandidateGroupListingInput {
  group: Pick<CandidateGroupSummary, 'key' | 'label' | 'count' | 'states'>;
  state: PreparationState;
  /** 已按组筛过、且带 review 的候选；顺序沿用检索排序。 */
  candidates: readonly CandidateGroupCandidate[];
}

/**
 * 收窄后该组的词条选项：≤5 条 + 永远最后一条「都不对，我直接说」。
 *
 * 只有 1 条时不生成点选问题（`single=true`、`options=[]`），由调用方直接采用。
 */
export function buildCandidateGroupListing(
  input: BuildCandidateGroupListingInput,
): CandidateGroupListing {
  const listable = input.candidates.filter(
    (candidate) => candidate.review?.verdict !== 'IRRELEVANT',
  );
  const rows = (listable.length > 0 ? listable : input.candidates).slice(
    0,
    CANDIDATE_GROUP_MAX_ENTRIES,
  );
  const entries: CandidateGroupEntry[] = rows.map((candidate) => {
    const review = candidate.review ?? null;
    const verdict = review?.verdict ?? 'UNCERTAIN';
    return {
      sourceRecordId: candidate.sourceRecordId,
      foodName: candidate.foodName,
      sourceType:
        typeof candidate.sourceType === 'string' && candidate.sourceType.trim()
          ? candidate.sourceType.trim()
          : '未知',
      coveragePercent:
        typeof candidate.coveragePercent === 'number' &&
        Number.isFinite(candidate.coveragePercent)
          ? candidate.coveragePercent
          : null,
      verdict,
      reason: (review?.reason ?? '').replace(/\s+/g, ' ').trim(),
      label: entryLabel(candidate),
    };
  });

  if (entries.length === 0) {
    return { question: '', options: [], entries: [], single: false };
  }

  if (entries.length === 1) {
    return {
      question: `${input.group.label}这一组只有 1 条：${entries[0]!.foodName}。`,
      options: [],
      entries,
      single: true,
    };
  }

  const stateLabelText =
    input.group.states.length > 0
      ? `（${input.group.states.map(stateLabel).join(' / ')}）`
      : `（${stateLabel(input.state)}）`;
  const shown = entries.length;
  const question =
    input.group.count > shown
      ? `${input.group.label}这一组共有 ${input.group.count} 条${stateLabelText}，先列前 ${shown} 条，请选一条：`
      : `${input.group.label}这一组 ${shown} 条${stateLabelText}，请选一条：`;

  return {
    question,
    options: [
      ...entries.map((entry) => entry.label),
      CANDIDATE_GROUP_FALLBACK_OPTION,
    ],
    entries,
    single: false,
  };
}
