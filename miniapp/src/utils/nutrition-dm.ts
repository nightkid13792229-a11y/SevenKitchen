/**
 * 干物质（DM）宏量营养。
 *
 * 交付快照里的蛋白/脂肪/灰分/纤维/碳水都是 **as-fed**（含水分）；
 * 调整页要的是干物质占比：
 *   DM = 100 - 水分
 *   某营养素 DM% = 该营养素 as-fed% ÷ DM × 100
 *
 * 水分缺失或为 0 时无法折算，返回 null，页面显示“—”。
 */

export interface DryMatterMacros {
  protein: number | null;
  fat: number | null;
  ash: number | null;
  fiber: number | null;
  carbohydrate: number | null;
}

export interface AsFedMacros {
  proteinPercent?: number | null;
  fatPercent?: number | null;
  ashPercent?: number | null;
  moisturePercent?: number | null;
  crudeFiberPercent?: number | null;
  carbohydratePercent?: number | null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function toDryMatterMacros(
  macros: AsFedMacros | null | undefined,
): DryMatterMacros {
  const empty: DryMatterMacros = {
    protein: null,
    fat: null,
    ash: null,
    fiber: null,
    carbohydrate: null,
  };

  if (!macros) return empty;

  const missing = (value: number | null | undefined) =>
    value === null || value === undefined;

  if (missing(macros.moisturePercent)) return empty;
  const moisture = Number(macros.moisturePercent);
  if (!Number.isFinite(moisture) || moisture <= 0 || moisture >= 100) {
    return empty;
  }

  const dryMatter = 100 - moisture;
  if (!Number.isFinite(dryMatter) || dryMatter <= 0) return empty;

  const convert = (value: number | null | undefined): number | null => {
    if (missing(value)) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return round1((numeric / dryMatter) * 100);
  };

  return {
    protein: convert(macros.proteinPercent),
    fat: convert(macros.fatPercent),
    ash: convert(macros.ashPercent),
    fiber: convert(macros.crudeFiberPercent),
    carbohydrate: convert(macros.carbohydratePercent),
  };
}
