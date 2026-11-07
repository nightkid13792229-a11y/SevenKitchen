/**
 * 草稿写入工具（Agent 的"手"）。
 *
 * 模型想往草稿里写什么就写什么——**这里不做流程判断**（不管它先写形态还是先写价格），
 * 只做两件必须做的事：
 *   1. 字段必须是真实存在的字段（不许凭空造一个"form_quality"这种）；
 *   2. 值必须过基本形状（类型、范围），否则草稿会被写坏，后面所有核验都失真。
 *
 * 真正的业务门禁不在这里，在"草稿 → 正式档案"那一步。
 */
import {
  listSupplementTargetFields,
  type NutritionFieldDefinition
} from './nutrition-field-catalog';
import {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS
} from './nutrition-profile.constants';

export type DraftFieldKind = 'string' | 'number' | 'boolean' | 'stringArray';

export interface DraftFieldRule {
  kind: DraftFieldKind;
  min?: number;
  max?: number;
  /** 只允许这些取值 */
  oneOf?: readonly string[];
  maxLength?: number;
}

export type SupplementDraftRecord = Record<string, unknown>;

export interface DraftPatchResult {
  draft: SupplementDraftRecord;
  applied: string[];
  rejected: { field: string; reason: string }[];
}

/**
 * 营养档案允许写的字段路径——**从档案自己的常量表来**，不是照着正则猜。
 * 用正则的话，模型编一个 `minerals.unobtainium` 也能写进去。
 */
const NUTRIENT_FIELD_PATHS: ReadonlySet<string> = new Set([
  ...MACRO_NUTRIENT_KEYS.map((key) => `macros.${key}`),
  ...MINERAL_NUTRIENT_KEYS.map((key) => `minerals.${key}`),
  ...VITAMIN_NUTRIENT_KEYS.map((key) => `vitamins.${key}`),
  ...FATTY_ACID_NUTRIENT_KEYS.map((key) => `fattyAcids.${key}`),
  ...AMINO_ACID_NUTRIENT_KEYS.map((key) => `aminoAcids.${key}`)
]);

export const SUPPLEMENT_DRAFT_FIELDS: Record<string, DraftFieldRule> = {
  name: { kind: 'string', maxLength: 200 },
  brand: { kind: 'string', maxLength: 100 },
  productModel: { kind: 'string', maxLength: 100 },
  purchaseChannel: { kind: 'string', maxLength: 200 },
  unitDisplayLabel: { kind: 'string', oneOf: ['g', 'ml', '粒', '片', '胶囊', '平勺', '份'] },
  physicalForm: { kind: 'string', oneOf: ['POWDER', 'TABLET', 'CAPSULE', 'LIQUID'] },
  servingUnitsPerDose: { kind: 'number', min: 1, max: 20 },
  purchaseUnit: { kind: 'string', maxLength: 50 },
  purchaseToBaseRatio: { kind: 'number', min: 0.01, max: 100000 },
  currentPricePerPurchaseUnit: { kind: 'number', min: 0.01, max: 1000000 },
  // addTiming / tagNames 刻意**不给模型写**：这两格是人必须自己定的（见 supplementCardFields），
  // 让模型填等于把提交闸门架空。模型要它们就 ask_user。
  productionLossRate: { kind: 'number', min: 1, max: 2 },
  labelCategory: { kind: 'string', oneOf: ['FEED_MATERIAL', 'FEED_ADDITIVE'] },
  labelNames: { kind: 'stringArray', maxLength: 200 },
  labelNameSource: { kind: 'string', maxLength: 200 },
  evidenceLabelText: { kind: 'string', maxLength: 4000 }
};

/** 每个营养字段的标准单位（来自档案自己的字段目录，不另写一份）。 */
const NUTRIENT_UNITS: ReadonlyMap<string, string> = new Map(
  listSupplementTargetFields().map((field: NutritionFieldDefinition) => [
    field.fieldPath,
    field.unit
  ])
);

/**
 * 按标准单位给一个"每份不可能超过"的粗上限。
 *
 * 它能挡住**明显**的量级错误（比如把 55 微克写成 55000），但**挡不住 μg/mg 互换**
 * ——那种错两边数值都"看着正常"，必须有每种营养素的合理区间才能判，属于数据活。
 * 这里先把能挡的挡住，别让粗错一路走到库里。
 */
const MAX_BY_UNIT: Record<string, number> = {
  'μg': 20_000,
  µg: 20_000,
  mg: 5_000,
  g: 200,
  IU: 200_000,
  'kcal': 5_000
};

function maxForUnit(unit: string | undefined): number {
  return (unit && MAX_BY_UNIT[unit]) || 100_000;
}

/** 给模型看的"字段 → 单位"对照，塞进工具说明，省得它自己猜。 */
export function describeNutrientUnits(): string {
  const groups = new Map<string, string[]>();
  for (const [path, unit] of NUTRIENT_UNITS) {
    const list = groups.get(unit) ?? [];
    list.push(path);
    groups.set(unit, list);
  }
  return [...groups.entries()]
    .map(([unit, paths]) => `${unit}: ${paths.join('、')}`)
    .join('；');
}

function checkValue(field: string, rule: DraftFieldRule, value: unknown): string | null {
  if (rule.kind === 'boolean') {
    return typeof value === 'boolean' ? null : '应为 true / false';
  }

  if (rule.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return '应为数字';
    }
    if (rule.min !== undefined && value < rule.min) {
      return `不能小于 ${rule.min}`;
    }
    if (rule.max !== undefined && value > rule.max) {
      return `不能大于 ${rule.max}`;
    }
    return null;
  }

  if (rule.kind === 'stringArray') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      return '应为字符串数组';
    }
    const itemMax = rule.maxLength;
    if (itemMax !== undefined && value.some((item) => item.length > itemMax)) {
      return `单项不能超过 ${itemMax} 字`;
    }
    return null;
  }

  if (typeof value !== 'string') {
    return '应为文本';
  }
  if (rule.oneOf && !rule.oneOf.includes(value)) {
    return `只能取 ${rule.oneOf.join(' / ')}`;
  }
  if (rule.maxLength && value.length > rule.maxLength) {
    return `不能超过 ${rule.maxLength} 字`;
  }
  if (value.trim() === '') {
    return '不能为空';
  }
  return null;
}

/**
 * 把模型给的一批字段合进草稿。不认识的字段、值不对的字段**逐条拒绝并说明原因**，
 * 其余照写——不因为一条坏字段把整批作废，也不静默吞掉。
 */
export function applyDraftPatch(
  draft: SupplementDraftRecord,
  patch: SupplementDraftRecord
): DraftPatchResult {
  const next: SupplementDraftRecord = { ...draft };
  const applied: string[] = [];
  const rejected: { field: string; reason: string }[] = [];

  for (const [field, value] of Object.entries(patch ?? {})) {
    if (field === 'servingNutrients') {
      const nutrients = value as Record<string, unknown>;
      if (!nutrients || typeof nutrients !== 'object' || Array.isArray(nutrients)) {
        rejected.push({ field, reason: '应为 { 字段路径: 数值 }' });
        continue;
      }
      const accepted: Record<string, number> = {};
      for (const [path, amount] of Object.entries(nutrients)) {
        if (!NUTRIENT_FIELD_PATHS.has(path)) {
          rejected.push({ field: `${field}.${path}`, reason: '不是认识的营养字段' });
          continue;
        }
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
          rejected.push({ field: `${field}.${path}`, reason: '应为大于等于 0 的数字' });
          continue;
        }
        const unit = NUTRIENT_UNITS.get(path);
        if (amount > maxForUnit(unit)) {
          rejected.push({
            field: `${field}.${path}`,
            reason: `每份 ${amount} 太大，八成是单位写错（该字段标准单位是 ${unit ?? '见档案'}）`
          });
          continue;
        }
        accepted[path] = amount;
        applied.push(`${field}.${path}`);
      }
      // 只合进通过的那几项：被拒的字段不许混进草稿
      if (Object.keys(accepted).length > 0) {
        next[field] = { ...(draft[field] as object), ...accepted };
      }
      continue;
    }

    const rule = SUPPLEMENT_DRAFT_FIELDS[field];
    if (!rule) {
      rejected.push({ field, reason: '草稿里没有这个字段' });
      continue;
    }
    const problem = checkValue(field, rule, value);
    if (problem) {
      rejected.push({ field, reason: problem });
      continue;
    }
    next[field] = value;
    applied.push(field);
  }

  return { draft: next, applied, rejected };
}
