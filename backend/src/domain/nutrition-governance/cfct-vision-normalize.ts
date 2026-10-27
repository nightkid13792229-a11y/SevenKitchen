import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { getNutritionSourceDefinition } from '../ingredient/nutrition-source-contract';
import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import { getVitaminEConversion } from '../ingredient/vitamin-e-conversion';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * 中国食物成分表（CFCT）标准版第 6 版第一册主表 → `NutritionProfileV2` 的归一化。
 *
 * 输入是视觉提取后按食品聚合的英文列名（`columns`；结构见 `/tmp/cfct_final.json`），
 * 导入脚本在 `scripts/import-cfct-vision.ts`。本模块是纯函数：不读文件、不碰数据库。
 *
 * 口径：
 * - 只有有限数值才写入 profile；null / 缺失 / NaN / Infinity 一律保持 null，绝不补 0；
 * - 明确的 0 是有效表值，必须保留；
 * - 目录单位与 CFCT 原始单位不同的字段（维生素 A/E）必须显式换算；
 * - 胆固醇 / 胡萝卜素 / 视黄醇不在 60 字段目录里，只保留在导入记录的 rawData，
 *   不进入 profile，也不塞进 customItems；
 * - 每个写入字段都在 `meta.sourceForms` 留原始列名、原值、原单位与换算结果。
 */

export const CFCT_SOURCE_TYPE = 'CFCT' as const;
/** 登记口径，来自 `nutrition-source-contract.ts` 的 `NUTRITION_SOURCE_DEFINITIONS`。 */
export const CFCT_SOURCE_CODE = 'CFCT' as const;
export const CFCT_SOURCE_PROVIDER =
  '中国疾病预防控制中心营养与健康所 / 北京大学医学出版社';
export const CFCT_SOURCE_TITLE = '中国食物成分表 标准版 第6版 第一册';
export const CFCT_SOURCE_VERSION = 'CFCT_V6_VOL1_2018';

/** 印刷版主表的基准是每 100 克可食部。 */
const CFCT_BASIS_TYPE = 'PER_100_G';

/** 维生素 A：CFCT 报 µgRAE，目录存 IU（1 µg RAE = 3.33 IU）。 */
const VITAMIN_A_UG_TO_IU = 3.33;

/** 维生素 E：CFCT 报 mg（α-生育酚当量），目录存 IU（FEDIAF 2025：1 mg = 1.49 IU）。 */
const VITAMIN_E_MG_TO_IU =
  getVitaminEConversion('D_ALPHA_TOCOPHEROL')?.iuPerMg ?? 1.49;

export interface CfctVisionFood {
  code: string;
  name: string;
  columns: Record<string, number | null>;
  pages?: number[];
}

export interface CfctVisionNutrientMapping {
  /** 视觉提取出的英文列名，**精确匹配** `columns` 的 key。 */
  column: string;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  /** CFCT 原始单位；换算倍率按该单位标定，不做单位推断。 */
  sourceUnit: string;
  /** 换算到目录单位的倍率，缺省 1。 */
  multiplier?: number;
  /** 需要换算时写进 `meta.conversionNotes` 的说明。 */
  conversionNote?: string;
}

const cfctField = (
  column: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  sourceUnit: string,
  options: { multiplier?: number; conversionNote?: string } = {},
): CfctVisionNutrientMapping => ({
  column,
  tabKey,
  fieldKey,
  sourceUnit,
  ...(options.multiplier === undefined
    ? {}
    : { multiplier: options.multiplier }),
  ...(options.conversionNote === undefined
    ? {}
    : { conversionNote: options.conversionNote }),
});

/**
 * 显式映射表，覆盖 CFCT 主表里能落到营养目录的列。
 * 每个 `tabKey.fieldKey` 只出现一次：同一字段不做多条候选、也不求和。
 */
export const CFCT_VISION_NUTRIENT_MAP: readonly CfctVisionNutrientMapping[] = [
  // ── 一般成分（macros）─────────────────────────────────────────────
  cfctField('energyKcal', 'macros', 'energyKcal', 'kcal'),
  cfctField('water', 'macros', 'moisture', 'g'),
  cfctField('protein', 'macros', 'crudeProtein', 'g'),
  cfctField('fat', 'macros', 'crudeFat', 'g'),
  cfctField('cho', 'macros', 'carbohydrate', 'g'),
  cfctField('fiber', 'macros', 'fiber', 'g'),
  cfctField('ash', 'macros', 'ash', 'g'),

  // ── 矿物质（minerals，mg；硒是 µg）────────────────────────────────
  cfctField('calcium', 'minerals', 'calcium', 'mg'),
  cfctField('phosphorus', 'minerals', 'phosphorus', 'mg'),
  cfctField('potassium', 'minerals', 'potassium', 'mg'),
  cfctField('sodium', 'minerals', 'sodium', 'mg'),
  cfctField('magnesium', 'minerals', 'magnesium', 'mg'),
  cfctField('iron', 'minerals', 'iron', 'mg'),
  cfctField('zinc', 'minerals', 'zinc', 'mg'),
  // 硒：CFCT 是 µg、目录也是 µg，原样写入，不要误当 mg。
  cfctField('selenium', 'minerals', 'selenium', 'µg'),
  cfctField('copper', 'minerals', 'copper', 'mg'),
  cfctField('manganese', 'minerals', 'manganese', 'mg'),

  // ── 维生素（vitamins）─────────────────────────────────────────────
  cfctField('thiamin', 'vitamins', 'vitaminB1', 'mg'),
  cfctField('riboflavin', 'vitamins', 'vitaminB2', 'mg'),
  cfctField('niacin', 'vitamins', 'vitaminB3', 'mg'),
  cfctField('vitaminC', 'vitamins', 'vitaminC', 'mg'),
  // A/E：CFCT 的 µg/mg 与目录的 IU 不同，必须换算并留下换算说明。
  cfctField('vitaminA', 'vitamins', 'vitaminA', 'µg', {
    multiplier: VITAMIN_A_UG_TO_IU,
    conversionNote:
      'CFCT 维生素 A 以 µgRAE（视黄醇活性当量）记录；按 1 µgRAE = 3.33 IU 换算为维生素 A 活性。',
  }),
  cfctField('vitaminE', 'vitamins', 'vitaminE', 'mg', {
    multiplier: VITAMIN_E_MG_TO_IU,
    conversionNote:
      'CFCT 维生素 E 以 mg（α-生育酚当量）记录；FEDIAF 2025 按 1 mg d-α-生育酚 = 1.49 IU 换算为维生素 E 活性。',
  }),
];

/** 去掉 1.49 / 3.33 这类倍率带来的浮点尾数。 */
function roundCanonicalValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolveCfctSourceDefinition() {
  const definition = getNutritionSourceDefinition(CFCT_SOURCE_CODE);
  if (!definition) {
    throw new Error(
      `Nutrition source definition not registered: ${CFCT_SOURCE_CODE}`,
    );
  }
  return definition;
}

/**
 * 把一份 CFCT 视觉提取食品翻成 `NutritionProfileV2`。
 *
 * 纯函数：不读 IO、不改入参；`pages` 只属于导入记录（rawData），不写进 profile。
 */
export function buildCfctVisionProfile(
  food: CfctVisionFood,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  const definition = resolveCfctSourceDefinition();
  const sourceForms: Record<string, NutritionSourceForm> = {};
  const conversionNotes: Record<string, string> = {};

  profile.meta.rawBasisType = CFCT_BASIS_TYPE;
  profile.meta.sourceType = CFCT_SOURCE_TYPE;
  profile.meta.sourceCode = definition.sourceCode;
  profile.meta.sourceProvider = CFCT_SOURCE_PROVIDER;
  profile.meta.sourceTitle = CFCT_SOURCE_TITLE;
  profile.meta.sourceVersion = CFCT_SOURCE_VERSION;
  profile.meta.externalId = `${CFCT_SOURCE_TYPE}:${food.code}`;
  profile.meta.confidenceLevel = 'MEDIUM';

  for (const mapping of CFCT_VISION_NUTRIENT_MAP) {
    const originalValue = food.columns?.[mapping.column];
    if (typeof originalValue !== 'number' || !Number.isFinite(originalValue)) {
      continue;
    }

    const fieldPath = `${mapping.tabKey}.${mapping.fieldKey}`;
    const canonicalValue = roundCanonicalValue(
      originalValue * (mapping.multiplier ?? 1),
    );
    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = canonicalValue;

    sourceForms[fieldPath] = {
      sourceNutrientName: mapping.column,
      originalValue,
      originalUnit: mapping.sourceUnit,
      canonicalValue,
      canonicalUnit: findNutritionField(fieldPath)?.unit ?? mapping.sourceUnit,
      basisType: CFCT_BASIS_TYPE,
    };

    if (mapping.conversionNote) {
      conversionNotes[fieldPath] = mapping.conversionNote;
    }
  }

  profile.meta.sourceForms = sourceForms;
  if (Object.keys(conversionNotes).length > 0) {
    profile.meta.conversionNotes = conversionNotes;
  }

  return profile;
}
