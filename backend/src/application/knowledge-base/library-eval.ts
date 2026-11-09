/**
 * 26 题回归集的判分纯函数（spec v1.1 §8 / 附录 A）。
 *
 * 只做判分，不碰数据库、不碰工具：采集由 `scripts/knowledge-base/evaluate-library.ts`
 * 走 Agent 工具层（`executeTool`）完成，这里只回答「这一题算不算过」。
 */

/** 题集分类：数值、分期、中文、负样本、对抗、表格。 */
export type QuestionCategory =
  | 'numeric'
  | 'staging'
  | 'zh'
  | 'negative'
  | 'adversarial'
  | 'table';

/** 一道题的期望（字段与 `docs/knowledge-base/ckd-structure/library-questions.json` 对齐）。 */
export interface QuestionSpec {
  id: string;
  query: string;
  /** 期望节：前 `HIT_DEPTH` 节里出现任一即通过。 */
  expectedSections?: string[];
  /** 禁止节：前 `HIT_DEPTH` 节里出现任一即不通过（仍不硬过滤，只判排序）。 */
  forbiddenSections?: string[];
  /** 期望表：返回的表里出现任一即通过。 */
  expectedTables?: string[];
  /** 负样本：要求 `no_match` 或 0 节。 */
  expectNoSource?: boolean;
  category: QuestionCategory;
  species?: 'dog' | 'cat';
  stage?: 1 | 2 | 3 | 4;
  topics?: string[];
}

/** 工具返回里判分需要的部分（结构兼容 `search_knowledge_library` 的 data）。 */
export interface QuestionResult {
  status: string;
  sections: Array<{ sectionId?: string | null }>;
  tables?: Array<{ tableId?: string | null }>;
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
 * 判分（spec 附录 A）：
 * - 表格题：`tables` 含任一 `expectedTables` → 通过；
 * - 负样本：`status === 'no_match'` 或 0 节 → 通过；
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
    return hit.length > 0
      ? { passed: true, reason: `表格命中 ${hit.join('、')}` }
      : {
          passed: false,
          reason: `未命中表格 ${list(expectedTables)}（返回：${list(tables)}）`,
        };
  }

  if (spec.expectNoSource) {
    const passed = result.status === 'no_match' || sections.length === 0;
    return passed
      ? {
          passed: true,
          reason:
            sections.length === 0
              ? '负样本：0 节'
              : `负样本：${result.status}`,
        }
      : {
          passed: false,
          reason: `负样本却返回了 ${sections.length} 节：${list(top)}`,
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
