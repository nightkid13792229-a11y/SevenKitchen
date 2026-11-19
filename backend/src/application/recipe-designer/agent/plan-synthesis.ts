import type { DeepSeekToolsMessage } from '../deepseek-tools-chat';

/**
 * 强制提交方案时的“干净上下文”（2026-11-20）。
 *
 * 线上实测：会话跑了 34 次工具调用后，即使 `tool_choice` 指定 propose_plan，
 * 模型仍会继续返回 kb_find——历史里全是 tool_calls，它在模仿调用模式。
 * 单独给它一份“档案 + 证据摘录 + 提交方案”的短上下文，强制调用才生效。
 */
export function buildEvidenceDigest(
  messages: DeepSeekToolsMessage[],
  maxChars = 30000,
): string {
  const seen = new Set<string>();
  const chunks: string[] = [];
  let used = 0;

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
        const text = String(page.text ?? '').slice(0, 1600);
        const chunk = `\n【${documentId} p${pageNo}】\n${text}\n`;
        if (used + chunk.length > maxChars) return chunks.join('');
        chunks.push(chunk);
        used += chunk.length;
      }
      continue;
    }

    if (Array.isArray(data.hits)) {
      for (const hit of data.hits.slice(0, 6)) {
        if (!hit || typeof hit !== 'object') continue;
        const documentId = String(hit.documentId ?? '');
        const pageNo = Number(hit.pageNo);
        const key = `hit:${documentId}#${pageNo}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const snippet = String(hit.snippet ?? '').slice(0, 500);
        const chunk = `\n【命中 ${documentId} p${pageNo}】${snippet}\n`;
        if (used + chunk.length > maxChars) return chunks.join('');
        chunks.push(chunk);
        used += chunk.length;
      }
    }
  }

  return chunks.join('');
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
      '请直接调用 propose_plan 提交方案。已经查到、可以确定的约束写清 min/max/unit/source；' +
      '查不到或不确定的约束把边界写 null，并在 basis 写「待确认」。不要继续检索，不要调用其他工具。',
  });

  return messages;
}
