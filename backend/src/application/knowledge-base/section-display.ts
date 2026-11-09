/**
 * 章节显示标题 / 子标题 / 分期提示。
 *
 * spec: docs/knowledge-base/2026-11-09-kb-minimal-library-design.md §7.4
 *
 * 只改“怎么显示”，不重切 PDF：页眉型标题不再直接丢给模型，
 * 子标题让模型看到「这一节里有一段讲 Stage 3」。
 */

export interface DisplayTitleInput {
  title: string;
  sourceName: string | null;
  pageNo: number | null;
}

/**
 * SACN5 第 37 章（CKD 章）的章号。
 * 页眉型标题只带书内页码（如 `787 Chronic Kidney Disease`），章号不在标题里，
 * 现有语料这一章固定是第 37 章；v2 重切章节后再从结构里取。
 */
const SACN5_CKD_CHAPTER = 37;

/** 页眉型标题：`787 Chronic Kidney Disease`。 */
const PAGE_HEADER = /^(\d{3})\s+Chronic Kidney Disease$/i;
/** 病例型标题：`CASE 37-1 801 Chronic Kidney Disease`。 */
const CASE_HEADER = /^CASE\s+([\d-]+)\s+(\d{3})\b/i;
/** 文档开头。 */
const DOCUMENT_START = /^[(（]?\s*文档开头\s*[)）]?$/;

/**
 * 显示标题：
 * - 页眉型 → `来源名 · 第37章 · p{书内页}`（书内页取标题前 3 位数字）；
 * - 病例型 → `病例 37-1 · p801`；
 * - `(文档开头)` → `卷首 · p{pageNo}`；
 * - 其他原样返回。
 */
export function deriveDisplayTitle(input: DisplayTitleInput): string {
  const title = String(input?.title ?? '').trim();
  const sourceName = String(input?.sourceName ?? '').trim();
  const pageNo = input?.pageNo ?? null;

  if (!title) return sourceName;

  const header = title.match(PAGE_HEADER);
  if (header) {
    return [sourceName, `第${SACN5_CKD_CHAPTER}章`, `p${header[1]}`]
      .filter(Boolean)
      .join(' · ');
  }

  const caseHeader = title.match(CASE_HEADER);
  if (caseHeader) {
    return `病例 ${caseHeader[1]} · p${caseHeader[2]}`;
  }

  if (DOCUMENT_START.test(title) || title.includes('文档开头')) {
    return pageNo ? `卷首 · p${pageNo}` : '卷首';
  }

  return title;
}

/** 结构行：Stage 3 … / Step 2 … / Table 37-9 … / Figure 37-11 … / `Anemia:`。 */
const SUBHEADING_PATTERN = /^(Stage\s+\d|Step\s+\d|Table\s+\d|Figure\s+\d|[A-Z][A-Za-z ]{3,40}:)/;

/**
 * 从命中的段落文本里取第一条结构行当子标题；没有则 null。
 * 形如 `Stage 3 Canine patients: …` 的句子只保留到冒号前（那才是子标题）。
 */
export function extractSubheading(text: string): string | null {
  const raw = String(text ?? '');
  if (!raw) return null;
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (!SUBHEADING_PATTERN.test(value)) continue;
    const stagePrefix = value.match(/^(Stage\s+\d[^:]{0,60}):\s/);
    const subheading =
      stagePrefix && stagePrefix[1].length >= 12 ? stagePrefix[1] : value;
    return subheading.slice(0, 120);
  }
  return null;
}

const CN_STAGE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4 };

/**
 * 从一段正文里识别出现的分期（Stage 1–4 / 1–4 期）。
 * 用来做软排序：先看命中段正文/子标题，正文没提才看目录 meta.stages。
 */
export function detectStageHints(text: string): number[] {
  const raw = String(text ?? '');
  if (!raw) return [];
  const stages = new Set<number>();
  for (const match of raw.matchAll(/\bstages?\s*([1-4])\b/gi)) {
    stages.add(Number(match[1]));
  }
  for (const match of raw.matchAll(/([1-4])\s*期/g)) {
    stages.add(Number(match[1]));
  }
  for (const match of raw.matchAll(/第?\s*([一二三四])\s*期/g)) {
    stages.add(CN_STAGE_DIGITS[match[1]]);
  }
  return [...stages].sort();
}
