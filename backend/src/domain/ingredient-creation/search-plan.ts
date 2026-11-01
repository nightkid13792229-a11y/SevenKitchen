/**
 * 「检索方案」：AI 查完库之后，把最终要怎么查、查到什么、候选有哪些交给用户确认。
 *
 * 闸门在**写草稿之前**，不是查库之前：查库、汇总、读来源、问人都是只读的，
 * 拦它们只会让方案变瞎；写原料卡与营养才是真正落东西，必须先有人点头。
 *
 * 这里只放纯函数：生成待确认方案、人确认后生成已确认方案、从草稿里读回来。
 * 落库与接口编排在 `IngredientSearchPlanService`。
 */
export const SEARCH_PLAN_LIBRARIES = [
  'CFCT',
  'TFDA',
  'USDA',
  'CNF',
  'NZFCD',
  'MEXT',
  'KO_RDA',
] as const;

export type SearchPlanLibrary = (typeof SEARCH_PLAN_LIBRARIES)[number];

export interface SearchPlanKeyword {
  term: string;
  language: string;
}

export type SearchPlanStatus = 'PENDING' | 'APPROVED';

export type SearchPlanProfileState = 'RAW' | 'COOKED';

/** 每个库的检索汇报：用了哪些词、命中多少条、查了几轮。 */
export interface SearchPlanLibraryReport {
  /** 本地库用白名单代码；线上兜底统一记 `ONLINE`。 */
  library: string;
  /** LOCAL = 7 个本地库；ONLINE = 白名单线上兜底。 */
  kind: 'LOCAL' | 'ONLINE';
  terms: string[];
  /** 最后一轮的命中总数（截断前）。 */
  total: number;
  rounds: number;
  /** 模型对这个库的一句判断（数据质量 / 为什么用这些词），显示在汇报表里。 */
  note: string;
}

/** 方案里列给人挑的候选来源记录（由模型挑，代码只补事实列）。 */
export interface SearchPlanCandidate {
  recordId: string;
  name: string;
  sourceType: string;
  /** 展示用：生 / 熟 / 干 / 未标生熟 … */
  state: string;
  /** 写入档案用的状态；模型必须给。 */
  profileState: SearchPlanProfileState;
  /** 字段覆盖率（60 项目录，0 不计入）。 */
  coverage: number;
  /** 一句话入选原因。 */
  reason: string;
  /** true = 来自线上白名单兜底（记录 dataType 为 ONLINE_TRUSTED_WEB）。 */
  isOnline: boolean;
}

/** 人确认时勾中的候选，原样冻结下来作为写入依据。 */
export interface SearchPlanSelection {
  recordId: string;
  name: string;
  sourceType: string;
  state: string;
  profileState: SearchPlanProfileState;
  coverage: number;
  isOnline: boolean;
}

export interface SearchPlan {
  status: SearchPlanStatus;
  keywords: SearchPlanKeyword[];
  libraries: SearchPlanLibrary[];
  /** 每库一行的检索汇报（系统记录，不由模型复述）。 */
  libraryReports: SearchPlanLibraryReport[];
  /** 列给人挑的候选（最多 12 条）。 */
  candidates: SearchPlanCandidate[];
  /** 人勾中的候选；确认后才有。 */
  selections: SearchPlanSelection[];
  /** 已经查到了什么（各库命中概况的补充判断），给人判断用。 */
  findings: string;
  rationale: string;
  proposedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  /** 确认时人改过方案内容；审计用，也用来区分「照单全收」与「人改过」。 */
  editedByUser: boolean;
}

export type SearchPlanResult =
  | { ok: true; plan: SearchPlan }
  | { ok: false; error: string };

export type SearchPlanApprovalInput = {
  keywords?: unknown;
  libraries?: unknown;
  selectedRecordIds?: unknown;
};

/** 没确认就想写草稿时给模型的原文；不给绕过口子。 */
export const SEARCH_PLAN_REQUIRED_MESSAGE =
  '还没有确认检索方案：先调用 proposeSearchPlan，把最终搜索词与目标库交给用户，等确认后再写草稿。';

const KEYWORDS_MIN = 1;
const KEYWORDS_MAX = 6;
const TERM_MAX = 40;
const LANGUAGE_MAX = 10;
const FINDINGS_MAX = 300;
const RATIONALE_MAX = 120;
const RECORD_ID_MAX = 64;
const RECORD_NAME_MAX = 100;
const STATE_MAX = 20;
const REASON_MAX = 120;
const CANDIDATES_MAX = 12;
const REPORT_TERMS_MAX = 30;
const REPORT_NOTE_MAX = 80;

const LIBRARY_SET = new Set<string>(SEARCH_PLAN_LIBRARIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  return Array.from(value.trim()).slice(0, max).join('');
}

function readProfileState(value: unknown): SearchPlanProfileState | null {
  return value === 'RAW' || value === 'COOKED' ? value : null;
}

function readKeywords(
  input: unknown,
): { ok: true; keywords: SearchPlanKeyword[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'keywords 必须是数组。' };
  }

  const keywords: SearchPlanKeyword[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!isRecord(raw)) {
      return { ok: false, error: 'keywords 的每一项必须是 { term, language }。' };
    }
    const term = readText(raw.term, TERM_MAX);
    if (!term) {
      return { ok: false, error: '关键词不能为空。' };
    }
    const language = readText(raw.language, LANGUAGE_MAX) || 'zh';
    const key = `${language}:${term}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keywords.push({ term, language });
  }

  if (keywords.length < KEYWORDS_MIN) {
    return { ok: false, error: '至少要给一个搜索关键词。' };
  }
  if (keywords.length > KEYWORDS_MAX) {
    return {
      ok: false,
      error: `关键词最多 ${KEYWORDS_MAX} 个，收到 ${keywords.length} 个。`,
    };
  }

  return { ok: true, keywords };
}

function readLibraries(
  input: unknown,
): { ok: true; libraries: SearchPlanLibrary[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'libraries 必须是数组。' };
  }

  const libraries: SearchPlanLibrary[] = [];
  for (const raw of input) {
    const name = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!LIBRARY_SET.has(name)) {
      return {
        ok: false,
        error: `目标库「${name || String(raw)}」不在白名单里；可选：${SEARCH_PLAN_LIBRARIES.join('、')}。`,
      };
    }
    if (!libraries.includes(name as SearchPlanLibrary)) {
      libraries.push(name as SearchPlanLibrary);
    }
  }

  if (libraries.length === 0) {
    return { ok: false, error: '至少要选一个目标库。' };
  }

  return { ok: true, libraries };
}

function readLibraryReports(input: unknown): SearchPlanLibraryReport[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const reports: SearchPlanLibraryReport[] = [];
  for (const raw of input) {
    if (!isRecord(raw)) {
      continue;
    }
    const kind = raw.kind === 'ONLINE' ? 'ONLINE' : 'LOCAL';
    const library = readText(raw.library, 20).toUpperCase();
    if (kind === 'LOCAL' && !LIBRARY_SET.has(library)) {
      continue;
    }
    if (kind === 'ONLINE' && !library) {
      continue;
    }
    const terms = Array.isArray(raw.terms)
      ? [
          ...new Set(
            raw.terms
              .map((term) => readText(term, TERM_MAX))
              .filter((term) => term.length > 0),
          ),
        ].slice(0, REPORT_TERMS_MAX)
      : [];
    const total =
      typeof raw.total === 'number' && Number.isFinite(raw.total) && raw.total >= 0
        ? Math.floor(raw.total)
        : 0;
    const rounds =
      typeof raw.rounds === 'number' &&
      Number.isFinite(raw.rounds) &&
      raw.rounds >= 1
        ? Math.floor(raw.rounds)
        : 1;
    reports.push({
      library,
      kind,
      terms,
      total,
      rounds,
      note: readText(raw.note, REPORT_NOTE_MAX),
    });
  }

  return reports;
}

function readCandidates(input: unknown): SearchPlanCandidate[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const candidates: SearchPlanCandidate[] = [];
  for (const raw of input) {
    if (candidates.length >= CANDIDATES_MAX) {
      break;
    }
    if (!isRecord(raw)) {
      continue;
    }
    const recordId = readText(raw.recordId, RECORD_ID_MAX);
    const name = readText(raw.name, RECORD_NAME_MAX);
    const profileState = readProfileState(raw.profileState);
    if (!recordId || !name || !profileState) {
      continue;
    }
    const coverage =
      typeof raw.coverage === 'number' &&
      Number.isFinite(raw.coverage) &&
      raw.coverage >= 0
        ? Math.round(raw.coverage * 10) / 10
        : 0;
    candidates.push({
      recordId,
      name,
      sourceType: readText(raw.sourceType, 20) || 'UNKNOWN',
      state: readText(raw.state, STATE_MAX) || '未标',
      profileState,
      coverage,
      reason: readText(raw.reason, REASON_MAX),
      isOnline: raw.isOnline === true,
    });
  }

  return candidates;
}

function sameKeywords(
  left: readonly SearchPlanKeyword[],
  right: readonly SearchPlanKeyword[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.term === right[index]?.term &&
        item.language === right[index]?.language,
    )
  );
}

function sameLibraries(
  left: readonly SearchPlanLibrary[],
  right: readonly SearchPlanLibrary[],
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function readSelectedIds(
  input: unknown,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'selectedRecordIds 必须是数组。' };
  }

  const ids: string[] = [];
  for (const raw of input) {
    const id = readText(raw, RECORD_ID_MAX);
    if (!id) {
      return { ok: false, error: 'selectedRecordIds 里不能有空值。' };
    }
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }

  if (ids.length === 0) {
    return { ok: false, error: '至少要勾选一条候选记录才能确认。' };
  }
  return { ok: true, ids };
}

/** 生成一份待确认方案；参数不合法时把原因原样交给模型。 */
export function buildPendingSearchPlan(
  input: Record<string, unknown>,
  now: Date = new Date(),
): SearchPlanResult {
  const keywords = readKeywords(input.keywords);
  if (!keywords.ok) {
    return keywords;
  }

  const libraries = readLibraries(input.libraries);
  if (!libraries.ok) {
    return libraries;
  }

  return {
    ok: true,
    plan: {
      status: 'PENDING',
      keywords: keywords.keywords,
      libraries: libraries.libraries,
      libraryReports: readLibraryReports(input.libraryReports),
      candidates: readCandidates(input.candidates),
      selections: [],
      findings: readText(input.findings, FINDINGS_MAX),
      rationale: readText(input.rationale, RATIONALE_MAX),
      proposedAt: now.toISOString(),
      approvedAt: null,
      approvedBy: null,
      editedByUser: false,
    },
  };
}

/**
 * 人确认方案。
 *
 * 只接受待确认的方案；已经确认过的再来一次就是重复操作（可能来自两个标签页），
 * 直接拒绝而不是覆盖审计字段。人改过任何内容都记 `editedByUser`。
 */
export function approveSearchPlan(
  plan: SearchPlan,
  input: SearchPlanApprovalInput,
  approver: { userId: string; now?: Date },
): SearchPlanResult {
  if (plan.status !== 'PENDING') {
    return { ok: false, error: '这份检索方案已经确认过了。' };
  }

  let keywords = plan.keywords;
  if (input.keywords !== undefined) {
    const parsed = readKeywords(input.keywords);
    if (!parsed.ok) {
      return parsed;
    }
    keywords = parsed.keywords;
  }

  let libraries = plan.libraries;
  if (input.libraries !== undefined) {
    const parsed = readLibraries(input.libraries);
    if (!parsed.ok) {
      return parsed;
    }
    libraries = parsed.libraries;
  }

  if (input.selectedRecordIds === undefined) {
    return { ok: false, error: '确认检索方案时必须勾选至少一条候选记录。' };
  }
  const parsedIds = readSelectedIds(input.selectedRecordIds);
  if (!parsedIds.ok) {
    return parsedIds;
  }

  const byId = new Map(
    plan.candidates.map((candidate) => [candidate.recordId, candidate]),
  );
  const selections: SearchPlanSelection[] = [];
  const stateKeys = new Set<string>();

  for (const id of parsedIds.ids) {
    const candidate = byId.get(id);
    if (!candidate) {
      return {
        ok: false,
        error: `记录 ${id} 不在这次方案的候选里；只能勾选候选表中的记录。`,
      };
    }
    const stateKey = `${candidate.sourceType}::${candidate.profileState}`;
    if (stateKeys.has(stateKey)) {
      return {
        ok: false,
        error: `同一来源库、同一状态只能选一条：${candidate.sourceType} ${
          candidate.profileState === 'RAW' ? '生' : '熟'
        }。`,
      };
    }
    stateKeys.add(stateKey);
    selections.push({
      recordId: candidate.recordId,
      name: candidate.name,
      sourceType: candidate.sourceType,
      state: candidate.state,
      profileState: candidate.profileState,
      coverage: candidate.coverage,
      isOnline: candidate.isOnline,
    });
  }

  // 勾选候选是确认动作本身，不算「人改了方案」；只有改词/改库才算。
  const editedByUser =
    !sameKeywords(keywords, plan.keywords) ||
    !sameLibraries(libraries, plan.libraries);

  return {
    ok: true,
    plan: {
      ...plan,
      status: 'APPROVED',
      keywords,
      libraries,
      selections,
      approvedAt: (approver.now ?? new Date()).toISOString(),
      approvedBy: approver.userId,
      editedByUser,
    },
  };
}

/** 从草稿 payload 里读方案；认不出来就当没有（payload 可能是脏数据）。 */
export function readSearchPlan(value: unknown): SearchPlan | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status;
  if (status !== 'PENDING' && status !== 'APPROVED') {
    return null;
  }

  const keywords = Array.isArray(value.keywords)
    ? value.keywords
        .filter(isRecord)
        .map((item) => ({
          term: readText(item.term, TERM_MAX),
          language: readText(item.language, LANGUAGE_MAX),
        }))
        .filter((item) => item.term.length > 0)
    : [];
  const libraries = Array.isArray(value.libraries)
    ? value.libraries
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item): item is SearchPlanLibrary => LIBRARY_SET.has(item))
    : [];

  const candidates = readCandidates(value.candidates);
  const byId = new Map(
    candidates.map((candidate) => [candidate.recordId, candidate]),
  );
  const rawSelections = Array.isArray(value.selections) ? value.selections : [];

  return {
    status,
    keywords,
    libraries,
    libraryReports: readLibraryReports(value.libraryReports),
    candidates,
    selections: rawSelections
      .filter(isRecord)
      .map((item) => byId.get(readText(item.recordId, RECORD_ID_MAX)))
      .filter((candidate): candidate is SearchPlanCandidate => Boolean(candidate))
      .map((candidate) => ({
        recordId: candidate.recordId,
        name: candidate.name,
        sourceType: candidate.sourceType,
        state: candidate.state,
        profileState: candidate.profileState,
        coverage: candidate.coverage,
        isOnline: candidate.isOnline,
      })),
    findings: readText(value.findings, FINDINGS_MAX),
    rationale: readText(value.rationale, RATIONALE_MAX),
    proposedAt: readText(value.proposedAt, 40),
    approvedAt: readText(value.approvedAt, 40) || null,
    approvedBy: readText(value.approvedBy, 64) || null,
    editedByUser: value.editedByUser === true,
  };
}

/** 这份草稿是否已经有人确认过检索方案——写草稿的唯一前置条件。 */
export function hasApprovedSearchPlan(value: unknown): boolean {
  return readSearchPlan(value)?.status === 'APPROVED';
}
