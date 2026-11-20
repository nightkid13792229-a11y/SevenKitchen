import type { AgentNutritionPlan, AgentSelection } from './propose-plan';

/**
 * 按已确认方案过滤选材：
 * - 低脂方案（脂肪上限 ≤15% DM）不再列坚果种子/油脂类，避免为了凑 CFCT 类型塞高脂食材；
 * - “其他”类不是可评估的食材，选材阶段不列；
 * - 过滤后某类不足 2 个，整类移除并记录原因。
 */
export function filterSelectionByPlan(
  selection: AgentSelection,
  plan: AgentNutritionPlan | null | undefined,
): AgentSelection {
  const fatMax =
    plan?.constraints.find((constraint) => constraint.key === 'fat')?.max ??
    null;
  const banned = new Set<string>(['其他']);
  if (fatMax !== null && fatMax <= 15) {
    banned.add('坚果种子类');
    banned.add('油脂类');
  }

  const removedReasons = new Map<string, string>();
  if (banned.has('坚果种子类')) {
    removedReasons.set(
      '坚果种子类',
      '方案脂肪上限 ≤15% DM，选材阶段不列高脂坚果/种子',
    );
  }
  if (banned.has('油脂类')) {
    removedReasons.set(
      '油脂类',
      '方案脂肪上限 ≤15% DM，选材阶段不列额外油脂；omega-3 等补剂留到配方评估后',
    );
  }
  if (banned.has('其他')) {
    removedReasons.set('其他', '“其他”不是可评估的食材，选材阶段不列');
  }

  const items = selection.items.filter(
    (item) => !banned.has(item.foodCategory ?? '其他'),
  );
  const counts = new Map<string, number>();
  for (const item of items) {
    const category = item.foodCategory ?? '其他';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const filtered = items.filter(
    (item) => (counts.get(item.foodCategory ?? '其他') ?? 0) >= 2,
  );

  const skipped = [...(selection.skippedCategories ?? [])];
  for (const [category, reason] of removedReasons) {
    if (!skipped.some((item) => item.category === category)) {
      skipped.push({ category, reason });
    }
  }
  for (const [category, count] of counts) {
    if (count < 2 && !skipped.some((item) => item.category === category)) {
      skipped.push({
        category,
        reason: '过滤后不足 2 个安全候选，整类不列',
      });
    }
  }

  return {
    ...selection,
    items: filtered,
    ...(skipped.length > 0 ? { skippedCategories: skipped } : {}),
  };
}
