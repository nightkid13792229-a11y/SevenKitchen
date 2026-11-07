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
  unitDisplayLabel: { kind: 'string', maxLength: 20 },
  physicalForm: { kind: 'string', oneOf: ['POWDER', 'TABLET', 'CAPSULE', 'LIQUID'] },
  servingUnitsPerDose: { kind: 'number', min: 1, max: 20 },
  purchaseUnit: { kind: 'string', maxLength: 50 },
  purchaseToBaseRatio: { kind: 'number', min: 0.01, max: 100000 },
  currentPricePerPurchaseUnit: { kind: 'number', min: 0.01, max: 1000000 },
  addTiming: { kind: 'string', oneOf: ['BEFORE_MIXING', 'BEFORE_MEAL'] },
  productionLossRate: { kind: 'number', min: 1, max: 2 },
  diyEnabled: { kind: 'boolean' },
  procurementEnabled: { kind: 'boolean' },
  tagNames: { kind: 'stringArray', maxLength: 100 },
  labelCategory: { kind: 'string', oneOf: ['FEED_MATERIAL', 'FEED_ADDITIVE'] },
  labelNames: { kind: 'stringArray', maxLength: 200 },
  labelNameSource: { kind: 'string', maxLength: 200 },
  evidenceLabelText: { kind: 'string', maxLength: 20000 },
  evidenceProductUrl: { kind: 'string', maxLength: 500 }
};

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
