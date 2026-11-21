import type { DeepSeekToolsMessage } from '../deepseek-tools-chat';

/**
 * 强制提交方案时的“干净上下文”（2026-11-20）。
 *
 * 线上实测：会话跑了 34 次工具调用后，即使 `tool_choice` 指定 propose_plan，
 * 模型仍会继续返回 kb_find——历史里全是 tool_calls，它在模仿调用模式。
 * 单独给它一份“档案 + 证据摘录 + 提交方案”的短上下文，强制调用才生效。
 *
 * 摘录不能按时间顺序硬截断：胰腺炎/心脏/FEDIAF 的关键页往往夹在中间。
 * 这里按关键词相关度 + 最近读取排序，并在开头附“本次读过的文档/页码索引”。
 */

/**
 * 证据片段排序的通用信号：来源标识、表格、带单位的数值。
 *
 * 这里刻意不放任何具体疾病/营养素的关键词权重：那会让某一类病例的页面
 * 永远排在前面，对其它病例形成隐性偏向。具体该看什么，由模型的方案推理
 * 和已确认方案决定，排序只做“更像证据的页面优先”。
 */
const EVIDENCE_KEYWORDS: Array<[RegExp, number]> = [
  [/FEDIAF/gi, 6],
  [/Table\s*\d|表\s*\d/gi, 4],
  [/\d+(?:\.\d+)?\s*(?:%|g|mg|μg|ug|mcg|IU|kcal|MJ)/gi, 2],
];

interface EvidenceChunk {
  documentId: string;
  pageNo: number;
  text: string;
  score: number;
  order: number;
  kind: 'page' | 'hit';
}

export function buildEvidenceDigest(
  messages: DeepSeekToolsMessage[],
  maxChars = 60000,
): string {
  const chunks: EvidenceChunk[] = [];
  const seen = new Set<string>();
  let order = 0;

  for (const message of messages) {
    if (message.role !== 'tool' || typeof message.content !== 'string') {
      continue;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      continue;
    }
    const data = parsed?.data;
    if (!data || typeof data !== 'object') continue;

    if (Array.isArray(data.pages)) {
      for (const page of data.pages) {
        if (!page || typeof page !== 'object') continue;
        const documentId = String(data.documentId ?? '');
        const pageNo = Number(page.pageNo);
        const key = `${documentId}#${pageNo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const text = String(page.text ?? '');
        chunks.push({
          documentId,
          pageNo,
          text,
          score: scoreEvidence(`${documentId} ${text}`),
          order: order++,
          kind: 'page',
        });
      }
      continue;
    }

    if (Array.isArray(data.hits)) {
      for (const hit of data.hits.slice(0, 8)) {
        if (!hit || typeof hit !== 'object') continue;
        const documentId = String(hit.documentId ?? '');
        const pageNo = Number(hit.pageNo);
        const key = `hit:${documentId}#${pageNo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const text = String(hit.snippet ?? '');
        chunks.push({
          documentId,
          pageNo,
          text,
          score: scoreEvidence(`${documentId} ${text}`),
          order: order++,
          kind: 'hit',
        });
      }
    }
  }

  if (chunks.length === 0) return '';

  const index = buildReadIndex(chunks);
  const sorted = [...chunks].sort(
    (a, b) => b.score - a.score || b.order - a.order,
  );

  const parts: string[] = [];
  let used = 0;
  if (index) {
    const line = `本次读过的文档/页码：${index}
`;
    parts.push(line);
    used += line.length;
  }

  for (const chunk of sorted) {
    const body =
      chunk.kind === 'page'
        ? `\n【${chunk.documentId} p${chunk.pageNo}】\n${chunk.text.slice(0, 1600)}\n`
        : `\n【命中 ${chunk.documentId} p${chunk.pageNo}】${chunk.text.slice(0, 500)}\n`;
    if (used + body.length > maxChars) continue;
    parts.push(body);
    used += body.length;
  }

  return parts.join('');
}

function scoreEvidence(text: string): number {
  let score = 0;
  for (const [pattern, weight] of EVIDENCE_KEYWORDS) {
    const matches = text.match(pattern);
    if (matches) score += Math.min(matches.length, 5) * weight;
  }
  return score;
}

function buildReadIndex(chunks: EvidenceChunk[]): string {
  const byDoc = new Map<string, number[]>();
  for (const chunk of chunks) {
    if (chunk.kind !== 'page') continue;
    const pages = byDoc.get(chunk.documentId) ?? [];
    pages.push(chunk.pageNo);
    byDoc.set(chunk.documentId, pages);
  }
  return [...byDoc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([doc, pages]) =>
        `${doc} p${[...new Set(pages)].sort((a, b) => a - b).join(',')}`,
    )
    .join('；');
}

export function buildPlanSynthesisMessages(input: {
  systemPrompt: string;
  phaseLine: string;
  userMessage: string;
  designContextJson: string | null;
  evidenceDigest: string;
}): DeepSeekToolsMessage[] {
  const messages: DeepSeekToolsMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'system', content: input.phaseLine },
    { role: 'user', content: input.userMessage },
  ];

  if (input.designContextJson) {
    messages.push({
      role: 'user',
      content: `本单档案（JSON）：\n${input.designContextJson.slice(0, 20000)}`,
    });
  }
  if (input.evidenceDigest) {
    messages.push({
      role: 'user',
      content: `以下是本次检索到的证据摘录（可能不完整）：\n${input.evidenceDigest}`,
    });
  }
  messages.push({
    role: 'user',
    content:
      '请直接调用 propose_plan 提交方案。summary 和 rationale 只写营养方案，不复述年龄/体重/品种/BCS/性别/检验值，不提药物/用药/处方/剂量；' +
      '理由与建议写 rationale。constraints 只放疾病特异性、或比 FEDIAF 2025 默认评估更严的那一侧；' +
      '默认下限、通用蛋白/脂肪/钙磷等上下限不要重复写。非数值约束放 nonNutrient，用文案；nonNutrient 要覆盖会限制食材选择的质地/纤维/产气、忌口/过敏、工艺/形态、餐次，需要低渣时写清避免豆类/粗纤维/菌藻等。' +
      'MAINTAIN 不要列 energyDensity；钠/蛋白等具体阈值按已确认方案、FEDIAF 标准或知识库原文，不要写死通用阈值。' +
      '不同疾病目标冲突时，按知识库/兽医意见处理，先标待确认，不要自行写死优先级。' +
      '不要计算每日总热量；能量密度用 nonNutrient 文案，不要用评估引擎不支持的 KCAL_PER_* 单位。' +
      '不要继续检索，不要调用其他工具。',
  });

  return messages;
}
