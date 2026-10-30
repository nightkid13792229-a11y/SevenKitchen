/**
 * 「检索方案」：AI 查完库之后，把最终要怎么查、想用哪条记录交给用户确认。
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

/** 方案里列给人挑的候选来源记录（最多 5 条）。 */
export interface SearchPlanCandidate {
  recordId: string | null;
  name: string;
  sourceType: string | null;
  /** 生 / 熟；来源没给就 null。 */
  state: string | null;
}

export interface SearchPlan {
  status: SearchPlanStatus;
  keywords: SearchPlanKeyword[];
  libraries: SearchPlanLibrary[];
  /** 已经查到了什么（各库命中概况），给人判断用。 */
  findings: string;
  /** 列给人挑的候选（最多 5 条）；主选仍看 chosenRecordId。 */
  candidates: SearchPlanCandidate[];
  /** 打算用哪条来源记录；还没定就是 null。 */
  chosenRecordId: string | null;
  chosenRecordName: string | null;
  /** 为什么这么查，一句话。 */
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
  chosenRecordId?: unknown;
  chosenRecordName?: unknown;
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
const CANDIDATES_MAX = 5;

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
    const name = readText(raw.name, RECORD_NAME_MAX);
    if (!name) {
      continue;
    }
    candidates.push({
      recordId: readText(raw.recordId, RECORD_ID_MAX) || null,
      name,
      sourceType: readText(raw.sourceType, 20) || null,
      state: readText(raw.state, 20) || null,
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

  const chosenRecordId = readText(input.chosenRecordId, RECORD_ID_MAX);

  return {
    ok: true,
    plan: {
      status: 'PENDING',
      keywords: keywords.keywords,
      libraries: libraries.libraries,
      findings: readText(input.findings, FINDINGS_MAX),
      candidates: readCandidates(input.candidates),
      chosenRecordId: chosenRecordId || null,
      chosenRecordName:
        readText(input.chosenRecordName, RECORD_NAME_MAX) || null,
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

  const recordId =
    input.chosenRecordId === undefined
      ? plan.chosenRecordId
      : readText(input.chosenRecordId, RECORD_ID_MAX) || null;
  const recordName =
    input.chosenRecordName === undefined
      ? plan.chosenRecordName
      : readText(input.chosenRecordName, RECORD_NAME_MAX) || null;

  const editedByUser =
    !sameKeywords(keywords, plan.keywords) ||
    !sameLibraries(libraries, plan.libraries) ||
    recordId !== plan.chosenRecordId ||
    recordName !== plan.chosenRecordName;

  return {
    ok: true,
    plan: {
      ...plan,
      status: 'APPROVED',
      keywords,
      libraries,
      chosenRecordId: recordId,
      chosenRecordName: recordName,
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

  return {
    status,
    keywords,
    libraries,
    findings: readText(value.findings, FINDINGS_MAX),
    candidates: readCandidates(value.candidates),
    chosenRecordId: readText(value.chosenRecordId, RECORD_ID_MAX) || null,
    chosenRecordName: readText(value.chosenRecordName, RECORD_NAME_MAX) || null,
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
