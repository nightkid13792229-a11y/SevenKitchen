import type { NutritionFieldTab } from '../ingredient/nutrition-field-catalog';
import { findNutritionField } from '../ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from '../ingredient/nutrition-profile.utils';
import { getVitaminEConversion } from '../ingredient/vitamin-e-conversion';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from '../ingredient/types';

/**
 * 台湾 FDA「食品營養成分資料集」长表 → `NutritionProfileV2` 的归一化。
 *
 * 输入是按食品聚合好的营养素行（CSV 解析在 `tfda-csv.ts`，导入脚本在
 * `scripts/import-tfda.ts`）。本模块是纯函数：不读文件、不碰数据库，
 * 只做「分析項全名 → 目录字段」的显式翻译。
 *
 * 口径（见 plan 2026-10-27-tfda-nutrition-import）：
 * - `每100克含量` 为非空数字的行才进入这里，缺失一律保持 null，绝不补 0；
 * - `分析項` 精确匹配 `TFDA_NUTRIENT_MAP[].match`，匹配不上直接忽略；
 * - 同一营养素在 `樣品平均值` 与 `樣品基本資料` 同时存在时取平均值，
 *   同类别重复只取第一条（见 `indexTfdaRows`）；
 * - 换算倍率按条目声明的 `sourceUnit` 标定，必须显式，不按行内单位推断；
 * - `refuseRate`（廢棄率）只属于导入记录，**不写进 profile**。
 */

export const TFDA_SOURCE_CODE = 'TFDA';
export const TFDA_SOURCE_PROVIDER = 'Taiwan Food and Drug Administration';
export const TFDA_SOURCE_TITLE =
  'Taiwan Food Nutrition Database (TFDA) 2026-10';
export const TFDA_SOURCE_VERSION = 'TFDA_2026_10';

/** TFDA 官方报表的基准是每 100 克可食部。 */
const TFDA_BASIS_TYPE = 'PER_100_G';

/** TFDA 的权威口径：同营养素同时有两种資料類別时，平均值优先于基本資料。 */
const PREFERRED_DATA_TYPE = '樣品平均值';

/** 脂肪酸 / 氨基酸：TFDA 报 mg，目录存 g。 */
const MG_TO_G = 0.001;

/** 维生素 E：TFDA 报 mg，目录存 IU（FEDIAF 2025：1 mg d-α-生育酚 = 1.49 IU）。 */
const VITAMIN_E_MG_TO_IU =
  getVitaminEConversion('D_ALPHA_TOCOPHEROL')?.iuPerMg ?? 1.49;

/** 维生素 A 备用项 `視網醇當量(RE)`：µg → IU。 */
const VITAMIN_A_UG_RE_TO_IU = 3.33;

/** 维生素 D 备用项 `維生素D總量(ug)`：µg → IU（1 µg = 40 IU）。 */
const VITAMIN_D_UG_TO_IU = 40;

export interface TfdaNutrientRow {
  name: string;
  unit: string;
  value: number;
  dataType: '樣品平均值' | '樣品基本資料' | string;
}

export interface TfdaFoodInput {
  foodCode: string;
  name: string;
  nameEn: string | null;
  category: string | null;
  refuseRate: number | null;
  rows: readonly TfdaNutrientRow[];
}

export interface TfdaNutrientMapping {
  /** TFDA `分析項` 全名，精确匹配（含括号内英文缩写）。 */
  match: string;
  tabKey: NutritionFieldTab;
  fieldKey: string;
  /** TFDA 官方单位；换算倍率按该单位标定，不做单位推断。 */
  sourceUnit: string;
  /** 换算到目录单位（`findNutritionField(fieldPath).unit`）的倍率，缺省 1。 */
  multiplier?: number;
  /** 数值取哪一类資料；'平均值' 表示优先 `樣品平均值`。 */
  preferred?: '平均值';
  /** 同字段多来源项求和（维生素 K = K1 + K2），缺省为「先写入者优先」。 */
  combine?: 'SUM';
}

const tfdaField = (
  match: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
  sourceUnit: string,
  options: { multiplier?: number; combine?: 'SUM' } = {},
): TfdaNutrientMapping => ({
  match,
  tabKey,
  fieldKey,
  sourceUnit,
  // 每个分析項都同时可能有「樣品基本資料」与「樣品平均值」，
  // 逐条声明口径，避免以后新增条目时漏掉平均值优先规则。
  preferred: '平均值',
  ...options,
});

/** TFDA 以 mg 报值、目录以 g 存储的字段（÷1000）。 */
const mgToGramField = (
  match: string,
  tabKey: NutritionFieldTab,
  fieldKey: string,
): TfdaNutrientMapping =>
  tfdaField(match, tabKey, fieldKey, 'mg', { multiplier: MG_TO_G });

/**
 * 显式映射表。**数组顺序即同字段的优先级**：同一 `tabKey.fieldKey` 出现多条时，
 * 只有排在前面的条目能写入（如 `維生素A總量(IU)` 先于 `視網醇當量(RE)`）。
 */
export const TFDA_NUTRIENT_MAP: readonly TfdaNutrientMapping[] = [
  // ── 一般成分（macros）─────────────────────────────────────────────
  tfdaField('熱量', 'macros', 'energyKcal', 'kcal'),
  tfdaField('水分', 'macros', 'moisture', 'g'),
  tfdaField('粗蛋白', 'macros', 'crudeProtein', 'g'),
  tfdaField('粗脂肪', 'macros', 'crudeFat', 'g'),
  tfdaField('灰分', 'macros', 'ash', 'g'),
  tfdaField('總碳水化合物', 'macros', 'carbohydrate', 'g'),
  tfdaField('膳食纖維', 'macros', 'fiber', 'g'),

  // ── 脂肪酸（fattyAcids）───────────────────────────────────────────
  // 饱和脂肪酸：优先「飽和脂肪」(g)；缺失时用「脂肪酸S總量」(mg) ÷1000。
  tfdaField('飽和脂肪', 'fattyAcids', 'saturatedFattyAcids', 'g'),
  mgToGramField('脂肪酸S總量', 'fattyAcids', 'saturatedFattyAcids'),
  mgToGramField('脂肪酸M總量', 'fattyAcids', 'monounsaturatedFattyAcids'),
  mgToGramField('脂肪酸P總量', 'fattyAcids', 'polyunsaturatedFattyAcids'),
  mgToGramField('亞麻油酸(18:2)', 'fattyAcids', 'linoleicAcid'),
  mgToGramField('次亞麻油酸(18:3)', 'fattyAcids', 'alphaLinolenicAcid'),
  mgToGramField('花生油酸(20:4)', 'fattyAcids', 'arachidonicAcid'),
  // EPA/DPA/DHA：TFDA 已经是 mg，目录也是 mg，不再 ÷1000。
  tfdaField('廿碳五烯酸(20:5)', 'fattyAcids', 'epa', 'mg'),
  tfdaField('廿二碳五烯酸(22:5)', 'fattyAcids', 'dpa', 'mg'),
  tfdaField('廿二碳六烯酸(22:6)', 'fattyAcids', 'dha', 'mg'),

  // ── 矿物质（minerals，mg）─────────────────────────────────────────
  tfdaField('鈣', 'minerals', 'calcium', 'mg'),
  tfdaField('磷', 'minerals', 'phosphorus', 'mg'),
  tfdaField('鉀', 'minerals', 'potassium', 'mg'),
  tfdaField('鈉', 'minerals', 'sodium', 'mg'),
  tfdaField('鎂', 'minerals', 'magnesium', 'mg'),
  tfdaField('鐵', 'minerals', 'iron', 'mg'),
  tfdaField('鋅', 'minerals', 'zinc', 'mg'),
  tfdaField('銅', 'minerals', 'copper', 'mg'),
  tfdaField('錳', 'minerals', 'manganese', 'mg'),

  // ── 维生素（vitamins）────────────────────────────────────────────
  // A：优先 IU 总量；缺失时「視網醇當量(RE)」µg ×3.33，二者不叠加。
  tfdaField('維生素A總量(IU)', 'vitamins', 'vitaminA', 'IU'),
  tfdaField('視網醇當量(RE)', 'vitamins', 'vitaminA', 'ug', {
    multiplier: VITAMIN_A_UG_RE_TO_IU,
  }),
  // D：优先 IU 总量；缺失时 µg ×40。
  tfdaField('維生素D總量(IU)', 'vitamins', 'vitaminD', 'IU'),
  tfdaField('維生素D總量(ug)', 'vitamins', 'vitaminD', 'ug', {
    multiplier: VITAMIN_D_UG_TO_IU,
  }),
  // E：目录是 IU、TFDA 是 mg，两项都 ×1.49；优先「總量」。
  tfdaField('維生素E總量', 'vitamins', 'vitaminE', 'mg', {
    multiplier: VITAMIN_E_MG_TO_IU,
  }),
  tfdaField('α-維生素E當量(α-TE)', 'vitamins', 'vitaminE', 'mg', {
    multiplier: VITAMIN_E_MG_TO_IU,
  }),
  // K：TFDA 拆成 K1/K2 两行，目录只有 vitaminK，按 µg 相加。
  tfdaField('維生素K1', 'vitamins', 'vitaminK', 'ug', { combine: 'SUM' }),
  tfdaField('維生素K2', 'vitamins', 'vitaminK', 'ug', { combine: 'SUM' }),
  tfdaField('維生素B1', 'vitamins', 'vitaminB1', 'mg'),
  tfdaField('維生素B2', 'vitamins', 'vitaminB2', 'mg'),
  tfdaField('菸鹼素', 'vitamins', 'vitaminB3', 'mg'),
  tfdaField('維生素B6', 'vitamins', 'vitaminB6', 'mg'),
  tfdaField('葉酸', 'vitamins', 'vitaminB9', 'ug'),
  tfdaField('維生素B12', 'vitamins', 'vitaminB12', 'ug'),
  tfdaField('維生素C', 'vitamins', 'vitaminC', 'mg'),

  // ── 氨基酸（aminoAcids，mg → g）───────────────────────────────────
  mgToGramField('精胺酸(Arg)', 'aminoAcids', 'arginine'),
  mgToGramField('離胺酸(Lys)', 'aminoAcids', 'lysine'),
  mgToGramField('甲硫胺酸(Met)', 'aminoAcids', 'methionine'),
  mgToGramField('胱胺酸(Cys)', 'aminoAcids', 'cystine'),
  mgToGramField('色胺酸(Trp)', 'aminoAcids', 'tryptophan'),
  mgToGramField('酥胺酸(Thr)', 'aminoAcids', 'threonine'),
  mgToGramField('白胺酸(Leu)', 'aminoAcids', 'leucine'),
  mgToGramField('異白胺酸(Ile)', 'aminoAcids', 'isoleucine'),
  mgToGramField('纈胺酸(Val)', 'aminoAcids', 'valine'),
  mgToGramField('苯丙胺酸(Phe)', 'aminoAcids', 'phenylalanine'),
  mgToGramField('酪胺酸(Tyr)', 'aminoAcids', 'tyrosine'),
  mgToGramField('組胺酸(His)', 'aminoAcids', 'histidine'),
  mgToGramField('麩胺酸(Glu)', 'aminoAcids', 'glutamicAcid'),
  mgToGramField('甘胺酸(Gly)', 'aminoAcids', 'glycine'),
  mgToGramField('脯胺酸(Pro)', 'aminoAcids', 'proline'),
];

interface TfdaRowCandidates {
  /** 文件里第一次出现的行（该营养素在文件中的原始顺序）。 */
  first: TfdaNutrientRow;
  /** 第一行 `樣品平均值`；没有则 null。 */
  firstAverage: TfdaNutrientRow | null;
}

/**
 * 按分析項名建索引：同类别的重复行保留第一条，`樣品平均值` 单独记一份。
 *
 * 非有限数值（空白 / Tr 解析失败留下的 NaN）直接跳过 —— 缺失只能是 null。
 */
function indexTfdaRows(
  rows: readonly TfdaNutrientRow[],
): Map<string, TfdaRowCandidates> {
  const index = new Map<string, TfdaRowCandidates>();

  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name || !Number.isFinite(row.value)) {
      continue;
    }

    const isAverage = row.dataType === PREFERRED_DATA_TYPE;
    const existing = index.get(name);
    if (!existing) {
      index.set(name, {
        first: row,
        firstAverage: isAverage ? row : null,
      });
      continue;
    }

    if (!existing.firstAverage && isAverage) {
      existing.firstAverage = row;
    }
  }

  return index;
}

function selectTfdaRow(
  candidates: TfdaRowCandidates | undefined,
  preferred: TfdaNutrientMapping['preferred'],
): TfdaNutrientRow | null {
  if (!candidates) {
    return null;
  }
  if (preferred === '平均值' && candidates.firstAverage) {
    return candidates.firstAverage;
  }
  return candidates.first;
}

/** 去掉 0.001 / 1.49 这类倍率带来的浮点尾数。 */
function roundCanonicalValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function buildRowSourceForm(
  fieldPath: string,
  row: TfdaNutrientRow,
  canonicalValue: number,
): NutritionSourceForm {
  return {
    sourceNutrientName: (row.name ?? '').trim(),
    originalValue: row.value,
    originalUnit: row.unit,
    canonicalValue,
    canonicalUnit: findNutritionField(fieldPath)?.unit ?? null,
    basisType: TFDA_BASIS_TYPE,
  };
}

function buildSummedSourceForm(
  fieldPath: string,
  rows: readonly TfdaNutrientRow[],
  canonicalValue: number,
): NutritionSourceForm {
  const first = rows[0];
  const singleSource = rows.length === 1;
  const units = new Set(rows.map((row) => row.unit));

  return {
    sourceNutrientName: rows.map((row) => (row.name ?? '').trim()).join(' + '),
    // 多项相加时没有单一原始值，留 null 而不是挑一个冒充。
    originalValue: singleSource ? first.value : null,
    originalUnit: units.size === 1 ? first.unit : null,
    canonicalValue,
    canonicalUnit: findNutritionField(fieldPath)?.unit ?? null,
    basisType: TFDA_BASIS_TYPE,
  };
}

/**
 * 把一份 TFDA 食品（已聚合的长表行）翻成 `NutritionProfileV2`。
 *
 * 纯函数：不读 IO、不改入参；`refuseRate` 只在入参里，profile 里不出现。
 */
export function buildTfdaNutritionProfile(
  food: TfdaFoodInput,
): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  const sourceForms: Record<string, NutritionSourceForm> = {};

  profile.meta.rawBasisType = TFDA_BASIS_TYPE;
  // sourceType 枚举里这一库就叫 'TFDA'，与 sourceCode 同值。
  profile.meta.sourceType = TFDA_SOURCE_CODE;
  profile.meta.sourceCode = TFDA_SOURCE_CODE;
  profile.meta.sourceProvider = TFDA_SOURCE_PROVIDER;
  profile.meta.sourceTitle = TFDA_SOURCE_TITLE;
  profile.meta.sourceVersion = TFDA_SOURCE_VERSION;
  profile.meta.externalId = `TFDA:${food.foodCode}`;
  profile.meta.confidenceLevel = 'MEDIUM';
  profile.meta.sourceForms = sourceForms;

  const candidatesByName = indexTfdaRows(food.rows);
  const summedByFieldPath = new Map<
    string,
    { rows: TfdaNutrientRow[]; canonicalValue: number }
  >();

  for (const mapping of TFDA_NUTRIENT_MAP) {
    const row = selectTfdaRow(
      candidatesByName.get(mapping.match),
      mapping.preferred,
    );
    if (!row) {
      continue;
    }

    const fieldPath = `${mapping.tabKey}.${mapping.fieldKey}`;
    const canonicalValue = roundCanonicalValue(
      row.value * (mapping.multiplier ?? 1),
    );
    const tab = profile[mapping.tabKey] as Record<string, number | null>;

    if (mapping.combine === 'SUM') {
      const summed = summedByFieldPath.get(fieldPath);
      const total = roundCanonicalValue(
        (summed?.canonicalValue ?? 0) + canonicalValue,
      );
      const contributingRows = [...(summed?.rows ?? []), row];

      tab[mapping.fieldKey] = total;
      summedByFieldPath.set(fieldPath, {
        rows: contributingRows,
        canonicalValue: total,
      });
      sourceForms[fieldPath] = buildSummedSourceForm(
        fieldPath,
        contributingRows,
        total,
      );
      continue;
    }

    if (typeof tab[mapping.fieldKey] === 'number') {
      // 同字段已有更高优先级的条目写入（如维生素 A 的 IU 总量）。
      continue;
    }

    tab[mapping.fieldKey] = canonicalValue;
    sourceForms[fieldPath] = buildRowSourceForm(fieldPath, row, canonicalValue);
  }

  return profile;
}
