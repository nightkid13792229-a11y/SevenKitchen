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

const EVIDENCE_KEYWORDS: Array<[RegExp, number]> = [
  [/胰腺炎|pancreatitis/gi, 8],
  [/脂肪|fat/gi, 5],
  [/蛋白|protein/gi, 5],
  [/钠|sodium/gi, 4],
  [/磷|phosphorus/gi, 4],
  [/钙|calcium/gi, 3],
  [/能量密度|energy density/gi, 3],
  [/FEDIAF/gi, 6],
  [/Table 67-3|table 36-4/gi, 8],
  [/EPA|DHA|omega-3|n-3/gi, 3],
  [/心脏|cardiac|heart/gi, 3],
  [/肿瘤|cancer|neoplasia/gi, 3],
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
      '请直接调用 propose_plan 提交方案。summary 只写方案定位，不复述年龄/体重/品种/BCS；' +
      '理由与建议写 rationale。constraints 只放疾病特异性、或比 FEDIAF 2025 默认评估更严的数值约束；' +
      '通用蛋白/脂肪/钙磷等上下限不要重复写。非数值约束放 nonNutrient，用文案。' +
      'MAINTAIN 不要列 energyDensity；钠只有比 FEDIAF 上限 0.55 g/1000 kcal 更严才列；' +
      '蛋白在胰腺炎与肿瘤冲突时以胰腺炎安全为先，肿瘤高蛋白标待确认。' +
      '不要计算每日总热量；如果确实需要控制能量，用 key=energyDensity、unit=KCAL_PER_100G 或 KCAL_PER_KG 的约束。' +
      '不要继续检索，不要调用其他工具。',
  });

  return messages;
}
