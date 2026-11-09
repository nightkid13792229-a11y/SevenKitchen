/**
 * 主题词表（受控主题 key ↔ 中英文别名）。
 *
 * 2026-11-09：`section-catalog.service.ts` 与 `knowledge-library.service.ts`
 * 各有一份 `TOPIC_ALIASES`，两份已经分叉（缺 chloride/magnesium/iodine 等）。
 * 这里合并成唯一真源，两边都引用它，避免“目录能识别、检索识别不了”。
 *
 * 词表可评审、可增补；它只用于编目/排序/主题参数归一，不做临床判断。
 */

export const TOPIC_ALIASES: Record<string, string[]> = {
  phosphorus: ['phosph', '磷'],
  protein: ['protein', '蛋白'],
  sodium: ['sodium', '钠'],
  potassium: ['potassium', '钾'],
  chloride: ['chloride', '氯'],
  magnesium: ['magnesium', '镁'],
  iron: ['iron', '铁'],
  zinc: ['zinc', '锌'],
  copper: ['copper', '铜'],
  iodine: ['iodine', '碘'],
  calcium: ['calcium', '钙'],
  omega3: ['omega', 'fish oil', '鱼油'],
  proteinuria: ['proteinuria', 'upc', '蛋白尿'],
  bloodpressure: ['blood pressure', 'hypertension', '血压', '高血压'],
  staging: ['staging', 'stage', 'iris', '分期'],
  vitaminD: ['vitamin d', 'calcitriol', '维生素 d'],
  energy: ['energy', 'kcal', '能量'],
  water: ['water', 'moisture', '水'],
  phosphatebinder: ['binder', 'binders', '结合剂'],
  fiber: ['fiber', 'fibre', '纤维'],
  anemia: ['anemia', 'anaemia', '贫血'],
};

/** 受控主题 key 列表（参数校验/错误提示用）。 */
export const TOPIC_KEYS: string[] = Object.keys(TOPIC_ALIASES);

function compact(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

/**
 * 中文/别名 → 受控主题 key；未知返回 null。
 * 只做归一，不做模糊匹配（`phosphorus` 与 `phosph` 都算 phosphorus，`foo` 就是 null）。
 */
export function normalizeTopic(value: string): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const candidates = new Set<string>([raw, compact(raw)]);
  for (const [key, aliases] of Object.entries(TOPIC_ALIASES)) {
    if (candidates.has(key.toLowerCase()) || candidates.has(compact(key))) {
      return key;
    }
    if (
      aliases.some(
        (alias) =>
          candidates.has(alias.toLowerCase()) || candidates.has(compact(alias)),
      )
    ) {
      return key;
    }
  }
  return null;
}
