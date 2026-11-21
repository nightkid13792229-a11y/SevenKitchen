import type { DeepSeekToolsMessage } from '../deepseek-tools-chat';
import { CFCT_CLASS_PROMPT } from '../../../domain/recipe-designer/cfct-classes';

/**
 * 选材阶段的干净上下文兜底（2026-11-21）。
 *
 * 长工具历史会让模型无视 propose_selection 的 tool_choice，继续调 find_food。
 * 这里只给：已确认方案 + 本单档案 + find_food 候选摘录 + 选材规则，
 * 强制模型直接提交候选，不再检索。
 */
export function buildFoodCandidateDigest(
  messages: DeepSeekToolsMessage[],
  maxChars = 20000,
): string {
  const seen = new Set<string>();
  const lines: string[] = [];
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
    if (!Array.isArray(parsed?.data)) continue;
    for (const item of parsed.data) {
      if (!item || typeof item !== 'object') continue;
      const name = String(item.name ?? '').trim();
      if (!name) continue;
      const key = String(item.ingredientId ?? item.nutritionFoodId ?? name);
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = [
        `名称=${name}`,
        `类型=${item.category ?? '未分类'}`,
        item.preparationState ? `状态=${item.preparationState}` : '',
        item.ingredientId ? `ingredientId=${item.ingredientId}` : '',
        item.nutritionFoodId ? `nutritionFoodId=${item.nutritionFoodId}` : '',
      ].filter(Boolean);
      const line = `- ${parts.join('，')}\n`;
      if (used + line.length > maxChars) return lines.join('');
      lines.push(line);
      used += line.length;
    }
  }

  return lines.join('');
}

export function buildSelectionSynthesisMessages(input: {
  systemPrompt: string;
  phaseLine: string;
  userMessage: string;
  planJson: string;
  designContextJson: string | null;
  candidateDigest: string;
}): DeepSeekToolsMessage[] {
  const messages: DeepSeekToolsMessage[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'system', content: input.phaseLine },
    { role: 'user', content: input.userMessage },
    {
      role: 'user',
      content: `已确认营养方案（JSON）：\n${input.planJson.slice(0, 20000)}`,
    },
  ];
  if (input.designContextJson) {
    messages.push({
      role: 'user',
      content: `本单档案（JSON）：\n${input.designContextJson.slice(0, 20000)}`,
    });
  }
  if (input.candidateDigest) {
    messages.push({
      role: 'user',
      content: `原料库中已找到的候选（来自 find_food）：\n${input.candidateDigest}`,
    });
  }
  messages.push({
    role: 'user',
    content:
      '请直接调用 propose_selection 提交食材候选。只列 FOOD，不要列补剂；不要提药物/用药/处方/剂量；' +
      '先逐条读已确认方案（含 nonNutrient），任何候选违反一条就淘汰；方案约束优先级最高，不要按疾病名做选材特判；' +
      `按 CFCT 固定 15 类（${CFCT_CLASS_PROMPT}）分组；` +
      '15 类是词表，不是必须每类都填：只在合格食材里分组，每个适用类型至少 2 个；凑不出就放 skippedCategories，写清违反的是哪条方案约束；' +
      '不要用补剂、水、加工品、高脂坚果或高碘海藻凑数。' +
      '按营养与忌口自由选，不要因为库里有没有而限制候选；提交后系统会按名称匹配原料库。' +
      '严禁列方案忌口食材（牛、羊、鸡、鸡蛋及其制品），也不要为了凑类型去列禁忌食材；' +
      '不适用或禁忌的类型直接跳过，并在 notes 说明。' +
      '只有用户明确最终确认清单时才把 confirmed 设为 true；只列用户确认的食材，不要补替代；与方案硬约束冲突时先指出并询问。' +
      '不要继续检索，不要调用其他工具。',
  });
  return messages;
}
