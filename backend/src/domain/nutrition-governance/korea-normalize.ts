import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionSourceDefinition } from '../ingredient/nutrition-source-contract';
import { getNutritionSourceDefinition } from '../ingredient/nutrition-source-contract';
import { getVitaminEConversion } from '../ingredient/vitamin-e-conversion';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * 韩国农村振兴厅「국가표준식품성분 DB 10.4」→ `NutritionProfileV2` 的归一化。
 *
 * 输入是按食品聚合好的营养素（`header → {value, unit}`；Excel 转换在
 * `scripts/data/prepare-korea-xlsx.py`，导入脚本在 `scripts/import-korea.ts`）。
 * 本模块是纯函数：不读文件、不碰数据库，只做「韩文表头 → 目录字段」的显式翻译。
 *
 * 口径（见 plan 2026-10-27-korea-rda-nutrition-import）：
 * - 表头先做空白折叠（`replace(/\s+/g, ' ')` + trim）再匹配；
 * - 只接受有限数值；缺失 / `-` / `Tr` 一律保持 null，绝不补 0；
 * - 换算倍率按条目声明的 `sourceUnit` 标定，必须显式，不按行内单位推断；
 * - `refuseRate`（폐기율）只属于导入记录，**不写进 profile**。
 */

/** legacy `sourceType` 枚举值（`NutritionMeta.sourceType` 里这一库就叫 KO_RDA）。 */
export const KOREA_SOURCE_TYPE = 'KO_RDA' as const;
/**
 * 登记口径，来自 `nutrition-source-contract.ts` 的 `NUTRITION_SOURCE_DEFINITIONS`。
 * **不是** `'KO_RDA'`：后者只是 legacy sourceType，
 * 只有 `normalizeLegacyNutritionSourceType` 才能把它映射到这里。
 */
export const KOREA_SOURCE_CODE = 'KO_RDA_FOOD_COMPOSITION_TABLE' as const;
export const KOREA_SOURCE_TITLE = 'Korean Standard Food Composition DB 10.4';
export const KOREA_SOURCE_VERSION = 'RDA_DB_10_4';

/** RDA 官方报表的基准是每 100 克可食部。 */
const KOREA_BASIS_TYPE = 'PER_100_G';

/** 脂肪酸 / 氨基酸：RDA 报 mg，目录存 g。 */
const MG_TO_G = 0.001;

/** 维生素 A：RDA 报 µg，目录存 IU（1 µg RE = 3.33 IU）。 */
const VITAMIN_A_UG_TO_IU = 3.33;

/** 维生素 D：RDA 报 µg，目录存 IU（1 µg = 40 IU）。 */
const VITAMIN_D_UG_TO_IU = 40;

/** 维生素 E：RDA 报 mg，目录存 IU（FEDIAF 2025：1 mg d-α-生育酚 = 1.49 IU）。 */
const VITAMIN_E_MG_TO_IU =
  getVitaminEConversion('D_ALPHA_TOCOPHEROL')?.iuPerMg ?? 1.49;

export interface KoreaNutrientValue {
  value: number;
  unit: string;
}

export interface KoreaFoodInput {
  index: string;
  code: string;
  nameKo: string;
  nameEn: string | null;
  scientificName: string | null;
  foodGroup: string | null;
  source: string | null;
  refuseRate: number | null;
  nutrients: Record<string, KoreaNutrientValue>;
}

export interface KoreaNutrientMapping {
  /** RDA 表的韩文列名，**空白折叠后**精确匹配。 */
  header: string;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  /** RDA 官方单位；换算倍率按该单位标定，不做单位推断。 */
  sourceUnit: string;
  /** 换算到目录单位的倍率，缺省 1。 */
  multiplier?: number;
}

const koreaField = (
  header: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  sourceUnit: string,
  multiplier?: number,
): KoreaNutrientMapping => ({
  header,
  tabKey,
  fieldKey,
  sourceUnit,
  ...(multiplier === undefined ? {} : { multiplier }),
});

/** RDA 以 mg 报值、目录以 g 存储的字段（÷1000）。 */
const mgToGramField = (
  header: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
): KoreaNutrientMapping => koreaField(header, tabKey, fieldKey, 'mg', MG_TO_G);

/**
 * 显式映射表，覆盖 10.4 表中所有能落到营养目录的列。
 * 每个 `tabKey.fieldKey` 只出现一次：同一字段不做多条候选、也不求和。
 */
export const KOREA_NUTRIENT_MAP: readonly KoreaNutrientMapping[] = [
  // ── 一般成分（macros）─────────────────────────────────────────────
  koreaField('에너지', 'macros', 'energyKcal', 'kcal'),
  koreaField('수분', 'macros', 'moisture', 'g'),
  koreaField('단백질', 'macros', 'crudeProtein', 'g'),
  koreaField('지방', 'macros', 'crudeFat', 'g'),
  koreaField('회분', 'macros', 'ash', 'g'),
  koreaField('탄수화물', 'macros', 'carbohydrate', 'g'),
  koreaField('총 식이섬유', 'macros', 'fiber', 'g'),
  koreaField('수용성 식이섬유', 'macros', 'solubleFiber', 'g'),
  koreaField('불용성 식이섬유', 'macros', 'insolubleFiber', 'g'),

  // ── 矿物质（minerals，mg；硒/碘是 µg）────────────────────────────
  koreaField('칼슘', 'minerals', 'calcium', 'mg'),
  koreaField('철', 'minerals', 'iron', 'mg'),
  koreaField('마그네슘', 'minerals', 'magnesium', 'mg'),
  koreaField('인', 'minerals', 'phosphorus', 'mg'),
  koreaField('칼륨', 'minerals', 'potassium', 'mg'),
  koreaField('나트륨', 'minerals', 'sodium', 'mg'),
  koreaField('아연', 'minerals', 'zinc', 'mg'),
  koreaField('구리', 'minerals', 'copper', 'mg'),
  koreaField('망간', 'minerals', 'manganese', 'mg'),
  // 硒/碘：RDA 是 µg、目录也是 µg，原样写入，不要误当 mg。
  koreaField('셀레늄', 'minerals', 'selenium', 'µg'),
  koreaField('요오드', 'minerals', 'iodine', 'µg'),

  // ── 维生素（vitamins）────────────────────────────────────────────
  // A/D/E：RDA 的 µg/mg 与目录的 IU 不同，必须换算。
  koreaField('비타민 A', 'vitamins', 'vitaminA', 'µg', VITAMIN_A_UG_TO_IU),
  koreaField('비타민 D', 'vitamins', 'vitaminD', 'µg', VITAMIN_D_UG_TO_IU),
  koreaField('비타민 E', 'vitamins', 'vitaminE', 'mg', VITAMIN_E_MG_TO_IU),
  koreaField('비타민 K', 'vitamins', 'vitaminK', 'µg'),
  koreaField('티아민', 'vitamins', 'vitaminB1', 'mg'),
  koreaField('리보플라빈', 'vitamins', 'vitaminB2', 'mg'),
  koreaField('니아신', 'vitamins', 'vitaminB3', 'mg'),
  koreaField('판토텐산', 'vitamins', 'vitaminB5', 'mg'),
  koreaField('비타민 B6', 'vitamins', 'vitaminB6', 'mg'),
  koreaField('비오틴', 'vitamins', 'vitaminB7', 'µg'),
  koreaField('엽산_엽산당량', 'vitamins', 'vitaminB9', 'µg'),
  koreaField('비타민 B12', 'vitamins', 'vitaminB12', 'µg'),
  koreaField('비타민 C', 'vitamins', 'vitaminC', 'mg'),

  // ── 脂肪酸（fattyAcids）───────────────────────────────────────────
  koreaField('총 포화 지방산', 'fattyAcids', 'saturatedFattyAcids', 'g'),
  koreaField(
    '총 단일 불포화지방산',
    'fattyAcids',
    'monounsaturatedFattyAcids',
    'g',
  ),
  koreaField(
    '총 다가 불포화지방산',
    'fattyAcids',
    'polyunsaturatedFattyAcids',
    'g',
  ),
  // 亚油酸 / α-亚麻酸 / 花生四烯酸：RDA 报 mg、目录存 g。
  mgToGramField('리놀레산(18:2(n-6))', 'fattyAcids', 'linoleicAcid'),
  mgToGramField(
    '알파 리놀렌산(18:3 (n-3))',
    'fattyAcids',
    'alphaLinolenicAcid',
  ),
  mgToGramField('아라키돈산(20:4(n-6))', 'fattyAcids', 'arachidonicAcid'),
  // EPA/DPA/DHA：RDA 已经是 mg，目录也是 mg，不再 ÷1000。
  koreaField('에이코사 펜타에노산(20:5(n-3))', 'fattyAcids', 'epa', 'mg'),
  koreaField('도코사 펜타에노산(22:5(n-3))', 'fattyAcids', 'dpa', 'mg'),
  koreaField('도코사 헥사에노산(22:6(n-3))', 'fattyAcids', 'dha', 'mg'),

  // ── 氨基酸（aminoAcids，mg → g）───────────────────────────────────
  mgToGramField('아르기닌', 'aminoAcids', 'arginine'),
  mgToGramField('라이신', 'aminoAcids', 'lysine'),
  mgToGramField('메티오닌', 'aminoAcids', 'methionine'),
  mgToGramField('시스테인', 'aminoAcids', 'cystine'),
  mgToGramField('트립토판', 'aminoAcids', 'tryptophan'),
  mgToGramField('트레오닌', 'aminoAcids', 'threonine'),
  mgToGramField('류신', 'aminoAcids', 'leucine'),
  mgToGramField('이소류신', 'aminoAcids', 'isoleucine'),
  mgToGramField('발린', 'aminoAcids', 'valine'),
  mgToGramField('페닐알라닌', 'aminoAcids', 'phenylalanine'),
  mgToGramField('티로신', 'aminoAcids', 'tyrosine'),
  mgToGramField('히스티딘', 'aminoAcids', 'histidine'),
  mgToGramField('글루탐산', 'aminoAcids', 'glutamicAcid'),
  mgToGramField('글라이신', 'aminoAcids', 'glycine'),
  mgToGramField('프롤린', 'aminoAcids', 'proline'),
  mgToGramField('타우린', 'aminoAcids', 'taurine'),
];

function normalizeKoreaHeader(header: string): string {
  return header.replace(/\s+/g, ' ').trim();
}

/**
 * 按空白折叠后的表头建索引；非有限数值直接跳过（缺失只能是 null）。
 * 同表头重复时保留第一条，避免后面的行覆盖前面的值。
 */
function indexKoreaNutrients(
  nutrients: Record<string, KoreaNutrientValue> | null | undefined,
): Map<string, KoreaNutrientValue> {
  const index = new Map<string, KoreaNutrientValue>();

  for (const [header, nutrient] of Object.entries(nutrients ?? {})) {
    if (!nutrient || !Number.isFinite(nutrient.value)) {
      continue;
    }

    const normalizedHeader = normalizeKoreaHeader(header);
    if (!normalizedHeader || index.has(normalizedHeader)) {
      continue;
    }

    index.set(normalizedHeader, nutrient);
  }

  return index;
}

/** 去掉 0.001 / 1.49 / 3.33 这类倍率带来的浮点尾数。 */
function roundCanonicalValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resolveKoreaSourceDefinition(): NutritionSourceDefinition {
  const definition = getNutritionSourceDefinition(KOREA_SOURCE_CODE);
  if (!definition) {
    throw new Error(
      `Nutrition source definition not registered: ${KOREA_SOURCE_CODE}`,
    );
  }
  return definition;
}

/**
 * 把一份韩国 RDA 食品翻成 `NutritionProfileV2`。
 *
 * 纯函数：不读 IO、不改入参；`refuseRate` 只在入参里，profile 里不出现。
 */
export function buildKoreaNutritionProfile(
  food: KoreaFoodInput,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  const definition = resolveKoreaSourceDefinition();
  const sourceForms: Record<string, NutritionSourceForm> = {};
  const nutrientsByHeader = indexKoreaNutrients(food.nutrients);

  profile.meta.rawBasisType = KOREA_BASIS_TYPE;
  // sourceType 是 legacy 枚举值；sourceCode 必须是登记码，两者不同。
  profile.meta.sourceType = KOREA_SOURCE_TYPE;
  profile.meta.sourceCode = definition.sourceCode;
  profile.meta.sourceProvider = definition.sourceProvider;
  profile.meta.sourceTitle = KOREA_SOURCE_TITLE;
  profile.meta.sourceVersion = KOREA_SOURCE_VERSION;
  profile.meta.externalId = `KO_RDA:${food.code}`;
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.sourceForms = sourceForms;

  for (const mapping of KOREA_NUTRIENT_MAP) {
    const nutrient = nutrientsByHeader.get(mapping.header);
    if (!nutrient) {
      continue;
    }

    const fieldPath = `${mapping.tabKey}.${mapping.fieldKey}`;
    const canonicalValue = roundCanonicalValue(
      nutrient.value * (mapping.multiplier ?? 1),
    );
    const tab = profile[mapping.tabKey] as Record<string, number | null>;
    tab[mapping.fieldKey] = canonicalValue;

    sourceForms[fieldPath] = {
      sourceNutrientName: mapping.header,
      originalValue: nutrient.value,
      originalUnit: nutrient.unit || mapping.sourceUnit,
      canonicalValue,
      canonicalUnit: findNutritionField(fieldPath)?.unit ?? null,
      basisType: KOREA_BASIS_TYPE,
    };
  }

  return profile;
}
