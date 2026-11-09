/**
 * 26 题回归集的判分纯函数（spec v1.1 §8 / 附录 A）。
 *
 * 只做判分，不碰数据库、不碰工具：采集由 `scripts/knowledge-base/evaluate-library.ts`
 * 走 Agent 工具层（`executeTool`）完成，这里只回答「这一题算不算过」。
 *
 * 2026-11-09 review follow-up：
 * - 表格题必须「命中 + 用检索返回的 citationId 打开成功」才算过（只命中不算）；
 * - 负样本必须真正「无节也无表」，0 节但有表不算通过；
 * - 阶段出口（整体/分期/表格/中文/负样本/对抗/核心表/p95/max）也在这里算，
 *   脚本只负责采集，避免「报告写了阈值、exit code 却没管」。
 */

/** 题集分类：数值、分期、中文、负样本、对抗、表格。 */
export type QuestionCategory =
  | 'numeric'
  | 'staging'
  | 'zh'
  | 'negative'
  | 'adversarial'
  | 'table';

/** 一道题的期望（字段与 `docs/knowledge-base/eval/ckd/questions.json` 对齐）。 */
export interface QuestionSpec {
  id: string;
  query: string;
  /** 期望节：前 `HIT_DEPTH` 节里出现任一即通过。 */
  expectedSections?: string[];
  /** 禁止节：前 `HIT_DEPTH` 节里出现任一即不通过（仍不硬过滤，只判排序）。 */
  forbiddenSections?: string[];
  /** 期望表：返回的表里出现任一、且能打开，才算通过。 */
  expectedTables?: string[];
  /** 负样本：要求 `no_match`，或既无节也无表。 */
  expectNoSource?: boolean;
  category: QuestionCategory;
  species?: 'dog' | 'cat';
  stage?: 1 | 2 | 3 | 4;
  topics?: string[];
}

/** 工具返回里的一张表（判分需要 tableId；打开需要 citationId）。 */
export interface TableHitRef {
  tableId?: string | null;
  citationId?: string | null;
}

/** `open_knowledge` 的逐表结果（脚本按检索返回的 K 打开后回填）。 */
export interface OpenedTableRef {
  tableId?: string | null;
  ok?: boolean;
  citationId?: string | null;
}

/** 工具返回里判分需要的部分（结构兼容 `search_knowledge_library` 的 data）。 */
export interface QuestionResult {
  status: string;
  sections: Array<{ sectionId?: string | null }>;
  tables?: TableHitRef[];
  /** 表格题的打开结果；只包含「检索命中且已尝试打开」的表。 */
  openedTables?: OpenedTableRef[];
}

export interface QuestionVerdict {
  passed: boolean;
  /** 一句话解释，直接进评估报告；不通过时写清实际命中了什么。 */
  reason: string;
}

/** 「前 3 节」——spec 附录 A 的判分口径。 */
export const HIT_DEPTH = 3;

function sectionIds(result: QuestionResult): string[] {
  return (result.sections ?? [])
    .map((section) => String(section?.sectionId ?? '').trim())
    .filter(Boolean);
}

function tableIds(result: QuestionResult): string[] {
  return (result.tables ?? [])
    .map((table) => String(table?.tableId ?? '').trim())
    .filter(Boolean);
}

function list(values: string[]): string {
  return values.length > 0 ? values.join('、') : '无';
}

/**
 * 表格题要打开哪些表：只取「检索返回且在 `expectedTables` 里」的表，
 * 并带上检索时登记的 `citationId`（用它调 `open_knowledge`，验证 K 号可打开）。
 *
 * 不用全部 `expectedTables` 兜底 —— 没检索到的表本来就不该算这题的证据。
 */
export function tableQuestionTargets(
  spec: QuestionSpec,
  tables: TableHitRef[],
): Array<{ tableId: string; citationId: string }> {
  const expected = (spec.expectedTables ?? []).filter(Boolean);
  if (expected.length === 0) return [];
  const seen = new Set<string>();
  const targets: Array<{ tableId: string; citationId: string }> = [];
  for (const table of tables ?? []) {
    const tableId = String(table?.tableId ?? '').trim();
    if (!tableId || !expected.includes(tableId) || seen.has(tableId)) continue;
    seen.add(tableId);
    targets.push({ tableId, citationId: String(table?.citationId ?? '').trim() });
  }
  return targets;
}

/**
 * 判分（spec 附录 A + 2026-11-09 review）：
 * - 表格题：命中任一 `expectedTables`，且命中的表至少一张按检索的 K 打开成功 → 通过；
 * - 负样本：`status === 'no_match'`，或「0 节且 0 表」→ 通过；
 * - 节题：前 3 节至少 1 个 `expectedSections` → 通过；前 3 节出现 `forbiddenSections` → 不通过。
 */
export function judgeQuestion(
  result: QuestionResult,
  spec: QuestionSpec,
): QuestionVerdict {
  const sections = sectionIds(result);
  const tables = tableIds(result);
  const top = sections.slice(0, HIT_DEPTH);
  const expectedTables = (spec.expectedTables ?? []).filter(Boolean);

  if (expectedTables.length > 0) {
    const hit = tables.filter((tableId) => expectedTables.includes(tableId));
    if (hit.length === 0) {
      return {
        passed: false,
        reason: `未命中表格 ${list(expectedTables)}（返回：${list(tables)}）`,
      };
    }
    const opened = (result.openedTables ?? [])
      .filter((table) => table?.ok === true)
      .map((table) => String(table?.tableId ?? '').trim())
      .filter(Boolean);
    const openedHits = hit.filter((tableId) => opened.includes(tableId));
    if (openedHits.length === 0) {
      const attempted = (result.openedTables ?? [])
        .map(
          (table) =>
            `${String(table?.tableId ?? '').trim()}${
              table?.ok ? '✔' : '✘'
            }`,
        )
        .filter(Boolean);
      return {
        passed: false,
        reason: `表格命中 ${list(hit)} 但打不开（open：${list(attempted)}）`,
      };
    }
    return {
      passed: true,
      reason: `表格命中且可打开 ${list(openedHits)}`,
    };
  }

  if (spec.expectNoSource) {
    const sectionCount = sections.length;
    const tableCount = tables.length;
    const passed =
      result.status === 'no_match' ||
      (sectionCount === 0 && tableCount === 0);
    return passed
      ? {
          passed: true,
          reason:
            sectionCount === 0 && tableCount === 0
              ? '负样本：0 节 0 表'
              : `负样本：${result.status}`,
        }
      : {
          passed: false,
          reason: `负样本却返回了 ${sectionCount} 节 ${tableCount} 表：${list(
            top.length > 0 ? top : tables,
          )}`,
        };
  }

  const expected = (spec.expectedSections ?? []).filter(Boolean);
  const forbidden = (spec.forbiddenSections ?? []).filter(Boolean);

  if (expected.length === 0) {
    return {
      passed: false,
      reason: '题目没有期望（缺 expectedSections/expectedTables/expectNoSource）',
    };
  }

  const forbiddenHits = top.filter((sectionId) => forbidden.includes(sectionId));
  if (forbiddenHits.length > 0) {
    return {
      passed: false,
      reason: `前 ${HIT_DEPTH} 节出现禁止节 ${list(forbiddenHits)}（前 ${HIT_DEPTH}：${list(top)}）`,
    };
  }

  const hits = top.filter((sectionId) => expected.includes(sectionId));
  return hits.length > 0
    ? { passed: true, reason: `前 ${HIT_DEPTH} 节命中 ${list(hits)}` }
    : {
        passed: false,
        reason: `前 ${HIT_DEPTH} 节未命中 ${list(expected)}（实际：${list(top)}）`,
      };
}

export interface LibraryThresholds {
  overall: number;
  stage3: number;
  table: number;
  zh: number;
  negative: number;
  adversarial: number;
  coreTables: number;
  p95Ms: number;
  maxMs: number;
}

/** CKD 的阶段出口阈值（spec §8）。 */
export const LIBRARY_THRESHOLDS: LibraryThresholds = {
  overall: 26,
  stage3: 1,
  table: 2,
  zh: 6,
  negative: 4,
  adversarial: 4,
  coreTables: 6,
  /** 检索 p95 上限（ms，spec §8）。 */
  p95Ms: 300,
  /** 单次工具调用上限（ms，spec §8）。 */
  maxMs: 1000,
} as const;

export interface CountStat {
  passed: number;
  total: number;
}

/** 阶段出口要看的全部数字（脚本采集后传进来）。 */
export interface LibraryGateSummary {
  overall: number;
  total: number;
  stage3: CountStat;
  table: CountStat;
  zh: CountStat;
  negative: CountStat;
  adversarial: CountStat;
  coreTables: CountStat;
  timing: { p50: number; p95: number; max: number };
}

export interface GateCheck {
  name: string;
  actual: string;
  target: string;
  passed: boolean;
}

/**
 * 阶段出口判定（spec §8）。
 *
 * 覆盖率类指标（整体/中文）是下限，硬指标（Stage 3/表格/负样本/对抗/核心表）是全过，
 * 耗时类看 p95 与 max；任何一条不过，`exitCodeFor` 返回 1。
 */
export function buildGateChecks(
  summary: LibraryGateSummary,
  thresholds: LibraryThresholds = LIBRARY_THRESHOLDS,
): GateCheck[] {
  return [
    {
      name: '整体',
      actual: `${summary.overall}/${summary.total}`,
      target: `≥${thresholds.overall}/${summary.total}`,
      passed: summary.overall >= thresholds.overall,
    },
    {
      name: 'Stage 3',
      actual: `${summary.stage3.passed}/${summary.stage3.total}`,
      target: `${thresholds.stage3}/${summary.stage3.total}`,
      // 分域题集里没有 Stage 3 题时（total=0）不适用，不判红。
      passed:
        summary.stage3.total === 0
          ? thresholds.stage3 === 0
          : summary.stage3.passed === summary.stage3.total,
    },
    {
      name: '表格',
      actual: `${summary.table.passed}/${summary.table.total}`,
      target: `${thresholds.table}/${summary.table.total}`,
      passed: summary.table.passed >= thresholds.table,
    },
    {
      name: '中文',
      actual: `${summary.zh.passed}/${summary.zh.total}`,
      target: `≥${thresholds.zh}/${summary.zh.total}`,
      passed: summary.zh.passed >= thresholds.zh,
    },
    {
      name: '负样本',
      actual: `${summary.negative.passed}/${summary.negative.total}`,
      target: `${thresholds.negative}/${summary.negative.total}`,
      passed: summary.negative.passed === summary.negative.total,
    },
    {
      name: '对抗',
      actual: `${summary.adversarial.passed}/${summary.adversarial.total}`,
      target: `${thresholds.adversarial}/${summary.adversarial.total}`,
      passed: summary.adversarial.passed === summary.adversarial.total,
    },
    {
      name: '核心表可打开',
      actual: `${summary.coreTables.passed}/${summary.coreTables.total}`,
      target: `${thresholds.coreTables}/${summary.coreTables.total}`,
      passed:
        summary.coreTables.total === 0
          ? thresholds.coreTables === 0
          : summary.coreTables.passed === summary.coreTables.total,
    },
    {
      name: '检索 p95',
      actual: `${summary.timing.p95}ms`,
      target: `<${thresholds.p95Ms}ms`,
      passed: summary.timing.p95 < thresholds.p95Ms,
    },
    {
      name: '单次工具调用 max',
      actual: `${summary.timing.max}ms`,
      target: `<${thresholds.maxMs}ms`,
      passed: summary.timing.max < thresholds.maxMs,
    },
  ];
}

/** 有任一阶段出口指标不过 → 1。 */
/**
 * 分域阈值：CKD 沿用 26/6；其他域"整体 ≥90%，其余类目全过"，
 * p95/max 用全库标准（1500/3000），不再套 CKD 的 300/1000。
 */
export function thresholdsForDomain(
  domain: string,
  summary: LibraryGateSummary,
): LibraryThresholds {
  if (domain === 'ckd') return LIBRARY_THRESHOLDS;
  return {
    overall: Math.ceil(summary.total * 0.9),
    stage3: summary.stage3.total,
    table: summary.table.total,
    zh: summary.zh.total,
    negative: summary.negative.total,
    adversarial: summary.adversarial.total,
    coreTables: summary.coreTables.total,
    p95Ms: 1500,
    maxMs: 3000,
  };
}

/** 聚合退出码：任一域不过 → 1。 */
export function aggregateExitCode(
  summaries: Array<{ domain: string; passed: boolean }>,
): 0 | 1 {
  return summaries.every((item) => item.passed) ? 0 : 1;
}

export function exitCodeFor(checks: GateCheck[]): 0 | 1 {
  return checks.some((check) => !check.passed) ? 1 : 0;
}
