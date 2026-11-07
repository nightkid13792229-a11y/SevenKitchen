import type { SnapshotMacroRow } from './custom-recipe.delivery';

/**
 * 交付快照 · 核心营养 8 项 / 宏量报告行的**唯一取数口径**。
 *
 * ## 为什么单独一个文件
 *
 * 交付时写快照（`custom-recipe-delivery.service.ts`）与历史回填脚本
 * （`scripts/backfill-delivery-nutrition-snapshots.ts`）必须用**同一套**映射；
 * 各写一份必然漂移 —— 这正是 2026-11-07 那次事故的成因：
 *
 *   · 交付端按 **camelCase**（`proteinPercent`）去 `Recipe.nutritionDetailedData` 里取；
 *   · 库里存的却是 **snake_case**（`protein_dm_pct`，见 recipes.controller 的
 *     `mapNutritionDetailedData`）。
 *
 * 结果 8 项全取不到 → `macros` 写成 `null` → 交付页「核心营养成分」只剩标题。
 * 生产上 19 份交付快照（含 2026-11-07 当天那份）全是 `macros: null`。
 *
 * ## 口径：5 项营养按**干物质（DM）**计
 *
 * 蛋白质 / 脂肪 / 灰分 / 膳食纤维 / 碳水 在库里就是 `*_dm_pct`（干物质占比），
 * 含水量 `moisture_pct` 是实际含水率。**后端原样冻结、不做换算**；
 * 前端卡片底部标注「按干物质（DM）计」，与食谱详情页同一口径
 * （2026-09-16 详情页 D1 决定：鲜食含水量高，不标 DM 会被误读成营养很低）。
 *
 * ## 缺失给 null，不给 0
 *
 * `0%` 和"没算"是两回事 —— 前者会让顾客以为"这道食谱不含脂肪"。
 */

/**
 * 交付页 4×2 网格用的 8 项（键名是前端契约，不随库里的字段名变）。
 *
 * 用 `type` 不用 `interface`：快照的 `macros` 字段类型是
 * `Record<string, number | null>`，结构化赋值时只有类型别名带隐式索引签名。
 */
export type SnapshotMacros = {
  proteinPercent: number | null;
  fatPercent: number | null;
  ashPercent: number | null;
  moisturePercent: number | null;
  crudeFiberPercent: number | null;
  carbohydratePercent: number | null;
  energyDensityKcalPerKg: number | null;
  calciumPhosphorusRatio: number | null;
};

/**
 * 每一项在**库里 / 接口里**的两种写法。
 *
 * `names` 的顺序即优先级：先认库里的 snake_case（快照来源），
 * 再认同义的 camelCase（有些链路已经映射过一遍，喂进来的是接口形状）。
 */
const MACRO_FIELDS: Array<{
  key: keyof SnapshotMacros;
  names: string[];
}> = [
  { key: 'proteinPercent', names: ['protein_dm_pct', 'proteinPercent'] },
  { key: 'fatPercent', names: ['fat_dm_pct', 'fatPercent'] },
  { key: 'ashPercent', names: ['ash_dm_pct', 'ashPercent'] },
  { key: 'moisturePercent', names: ['moisture_pct', 'moisturePercent'] },
  { key: 'crudeFiberPercent', names: ['fiber_dm_pct', 'crudeFiberPercent'] },
  { key: 'carbohydratePercent', names: ['carbs_dm_pct', 'carbohydratePercent'] },
  {
    key: 'energyDensityKcalPerKg',
    names: ['energy_density_kcal_per_kg', 'energyDensityKcalPerKg'],
  },
  {
    key: 'calciumPhosphorusRatio',
    names: ['ca_p_ratio', 'calciumPhosphorusRatio'],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 从一条记录里按名字顺序取第一个有限数字；取不到给 null */
function readNumber(
  record: Record<string, unknown> | null,
  names: string[],
): number | null {
  if (!record) return null;
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * 核心营养 8 项 —— 从 `Recipe.nutritionDetailedData` 里挑出交付页要显示的那些。
 *
 * 只挑 8 项：完整评估有几百项、几十 KB，那是"报告页"按需再查的东西，
 * 不该塞进每一条交付记录。
 *
 * 全空返回 `null` —— 不要给前端一个"8 个 null"的块。
 */
export function readDeliveryMacros(detailed: unknown): SnapshotMacros | null {
  if (!isRecord(detailed)) return null;
  /**
   * `buildPublishedNutritionDetailedData` 把 summary 既铺在顶层、
   * 又放在 `summary` 里；两种都能读到，先在 `summary` 里找。
   */
  const summary = isRecord(detailed.summary) ? detailed.summary : null;

  const macros = {} as SnapshotMacros;
  for (const field of MACRO_FIELDS) {
    macros[field.key] =
      readNumber(summary, field.names) ?? readNumber(detailed, field.names);
  }

  const hasAny = MACRO_FIELDS.some((field) => macros[field.key] !== null);
  return hasAny ? macros : null;
}

/**
 * 宏量报告行 —— 交付那一刻「占干物质 / 占热量 / 占配方」那张表的原样行。
 *
 * 为什么不从 `macros` 现算：这三列需要配方总重与总热量，
 * 快照里只有每公斤口径的数字，事后算不回来。
 *
 * 只留渲染要的 4 个字段（`key` 可选）；没有报告就给 `null`。
 */
export function readDeliveryMacroRows(
  detailed: unknown,
): SnapshotMacroRow[] | null {
  if (!isRecord(detailed)) return null;
  const report = isRecord(detailed.report) ? detailed.report : null;
  const rows = report?.macroRows;
  if (!Array.isArray(rows)) return null;

  const normalized = rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => ({
      ...(typeof row.key === 'string' ? { key: row.key } : {}),
      name: String(row.name ?? '').trim(),
      dryMatterLabel: String(row.dryMatterLabel ?? '').trim(),
      energyPercentLabel: String(row.energyPercentLabel ?? '').trim(),
      weightPercentLabel: String(row.weightPercentLabel ?? '').trim(),
    }))
    .filter((row) => row.name.length > 0);

  return normalized.length > 0 ? normalized : null;
}
