/**
 * 补剂最终写入 · 输入装配 + 事务内直接字段核验（纯函数）。
 *
 * 两件事：
 *
 * 1. `buildFinalizeInput`：把草稿载荷翻译成 `SupplementIngredientService.createInTransaction`
 *    的入参。营养档案、properties 的展开都由建档服务负责，这里**只给原料字段**，
 *    避免两套建档逻辑分叉（spec §8.3）。
 * 2. `buildDirectVerification`：把「草稿期望」与「事务内回读到的实际行」逐项对比，
 *    覆盖 spec §9.1 的每一行。数字精确比较，JSON 深比较；`properties` 里没有的键
 *    按 null 计（建档服务在值为空时不写键，Task 9 的既定行为）。
 *
 * 纯函数、不查库：调用方（`SupplementFinalizeService`）负责把两边的快照查齐。
 */

import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { normalizeSupplementDraftPayload } from './supplement-draft.types';
import type { SupplementDraftPayload } from './supplement-draft.types';
import type { CreateSupplementIngredientInput } from './supplement-ingredient.service';

/**
 * `buildFinalizeInput` 的产物：与建档入参完全一致，只差 `createdBy`。
 *
 * `createdBy` 是登录人，不属于草稿内容，由 finalize 服务补上；这样这个函数
 * 保持纯、不依赖用户上下文。
 */
export type SupplementFinalizeIngredientInput = Omit<
  CreateSupplementIngredientInput,
  'createdBy'
>;

/* ------------------------------------------------------------------ */
/* 核验报告形状（spec §9.3）                                           */
/* ------------------------------------------------------------------ */

/** 一行直接字段对比。`target` 是生产落点，如 ingredient.shelf_life_months。 */
export interface VerificationField {
  key: string;
  label: string;
  target: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

/** 功能核验项（Task 11 填充；Task 10 只产出直接字段）。 */
export type VerificationFeatureCode =
  | 'RETAIL'
  | 'RECIPE'
  | 'DIY'
  | 'PROCUREMENT'
  | 'EQUIVALENCE'
  | 'PACKAGING'
  | 'DUPLICATE';

export type VerificationFeatureSeverity = 'INFO' | 'WARN' | 'ERROR';

export interface VerificationFeatureAction {
  label: string;
  path: string;
}

export interface VerificationFeature {
  code: VerificationFeatureCode;
  label: string;
  ok: boolean;
  severity: VerificationFeatureSeverity;
  detail: string;
  action?: VerificationFeatureAction;
}

/** 写入后核验报告：`ok` 为 false 时页面不能显示「全部成功」。 */
export interface SupplementWriteVerification {
  ok: boolean;
  checkedAt: string;
  fields: VerificationField[];
  features: VerificationFeature[];
}

/* ------------------------------------------------------------------ */
/* buildFinalizeInput                                                  */
/* ------------------------------------------------------------------ */

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** 标签原文保留原始换行/空格，只把「全是空白」当没填。 */
function labelTextOrNull(value: string): string | null {
  return value.trim() ? value : null;
}

/** 名称数组：去首尾空格、去空、去重；保持原顺序。 */
function normalizeNames(values: string[]): string[] {
  const result: string[] = [];
  for (const raw of values) {
    const name = raw.trim();
    if (name && !result.includes(name)) {
      result.push(name);
    }
  }
  return result;
}

/**
 * DIY 购买链接：只要平台或链接有一个，就原样留档。
 *
 * DIY 关闭时也保留（spec §8.3）：以后打开 DIY 不用重新填。
 */
function buildPurchaseLink(
  platform: string,
  url: string,
): { platform: string; url: string | null } | null {
  const normalizedPlatform = platform.trim();
  const normalizedUrl = url.trim();
  if (!normalizedPlatform && !normalizedUrl) {
    return null;
  }
  return {
    platform: normalizedPlatform,
    url: normalizedUrl || null,
  };
}

/**
 * 草稿载荷 → 建档入参。
 *
 * - 每份含量原样传（`servingNutrients`），每单位值由建档服务按「每份 ÷ 份量」算；
 *   **不传 `perUnitNutrients`**，客户端/草稿里的折算值一律不作数。
 * - 上架/DIY/采购/标签的开关与字段全部翻译过来；`noSaleReason` 只在上架关闭时保留。
 * - 未选择物理形态、份量/倍数/价格为 null 时给 0/空值兜底：基础校验会先拦，
 *   真漏到这里时建档服务的 `assertInput` 也会用中文报错，不静默写坏数据。
 */
export function buildFinalizeInput(
  payload: SupplementDraftPayload,
): SupplementFinalizeIngredientInput {
  // 传进来的可能是数据库原始 JSON（旧草稿缺键）：先收成完整载荷再翻译。
  const draft = normalizeSupplementDraftPayload(payload);
  const { basic, nutrition, label, retail, diy, procurement, evidence } = draft;
  const selectionNote = evidence.selectionNote.trim();

  return {
    name: basic.name.trim(),
    brand: trimmedOrNull(basic.brand),
    productModel: trimmedOrNull(basic.productModel),
    purchaseChannel: trimmedOrNull(basic.purchaseChannel),
    baseUnit: basic.baseUnit,
    defaultTargetFields: normalizeNames(nutrition.defaultTargetFields),
    unitDisplayLabel: basic.unitDisplayLabel.trim(),
    physicalForm:
      basic.physicalForm as CreateSupplementIngredientInput['physicalForm'],
    purchaseUnit: basic.purchaseUnit.trim(),
    purchaseToBaseRatio: basic.purchaseToBaseRatio ?? 0,
    currentPricePerPurchaseUnit: basic.currentPricePerPurchaseUnit ?? 0,
    addTiming: basic.addTiming.trim(),
    productionLossRate: basic.productionLossRate,
    diyEnabled: diy.enabled,
    procurementEnabled: procurement.enabled,
    labelCategory: label.labelCategory,
    labelNames: normalizeNames(label.labelNames),
    labelNameSource: trimmedOrNull(label.labelNameSource),
    tagNames: normalizeNames(label.tagNames),
    servingUnitsPerDose: basic.servingUnitsPerDose ?? 0,
    servingNutrients: { ...nutrition.servingNutrients },
    shelfLifeMonths: retail.shelfLifeMonths,
    openedShelfLifeDays: retail.openedShelfLifeDays,
    storageCondition: trimmedOrNull(retail.storageCondition),
    isOilBased: retail.isOilBased,
    supplementRetailEnabled: retail.enabled,
    purchaseLink: buildPurchaseLink(diy.platform, diy.linkUrl),
    imageUrl: trimmedOrNull(diy.imageUrl),
    // 上架时不允许有不上架原因；关闭时必须有（基础校验会拦，这里只做落库口径）。
    noSaleReason: retail.enabled
      ? null
      : trimmedOrNull(retail.noSaleReason ?? ''),
    evidence: {
      frontImageUrl: trimmedOrNull(evidence.frontImageUrl),
      labelImageUrl: trimmedOrNull(evidence.labelImageUrl),
      productUrl: trimmedOrNull(evidence.productUrl),
      labelText: labelTextOrNull(nutrition.labelText),
      // 选品依据快照：有笔记说明是 DSH 选品流程产出的，没有就是人手填。
      selection: {
        source: selectionNote ? 'SKILL' : 'MANUAL',
        note: selectionNote || null,
        recordedAt: new Date().toISOString(),
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* 直接字段核验快照                                                     */
/* ------------------------------------------------------------------ */

type UnknownRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 与 Prisma `Ingredient` 行对齐的核验快照（properties 用原始 snake_case 键）。 */
export interface DirectVerificationIngredient {
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  baseUnit: string;
  unitDisplayLabel: string | null;
  physicalForm: string | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number;
  currentPricePerPurchaseUnit: number;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  shelfLifeMonths: number | null;
  openedShelfLifeDays: number | null;
  storageCondition: string | null;
  isOilBased: boolean;
  supplementRetailEnabled: boolean;
  equivalenceGroupId: string | null;
  equivalencePriority: number;
  properties: UnknownRecord;
}

/**
 * 一份核验快照。
 *
 * `expected` 由草稿 + 建档入参构造，`actual` 由事务内回读的原料/档案/映射/
 * 证据/标签/组/草稿行构造；两边用同一形状，才能逐项对比（spec §9.1）。
 */
export interface DirectVerificationSnapshot {
  ingredient: DirectVerificationIngredient;
  /**
   * `ingredient.nutrition_profile` 里的每单位值。
   *
   * 补剂营养有两个落点：原料档案（配方设计器读）和营养档案（等价组/浓度解析读）。
   * 两边都写、都可能单独写坏，所以两个 sink 都要核验。
   */
  ingredientProfile: {
    nutrients: Record<string, number>;
  };
  nutritionFood: {
    status: string;
    category: string;
    /** 规范字段路径 → 每 1 个基准单位的含量（如 fattyAcids.epa: 325） */
    nutrients: Record<string, number>;
    defaultSupplementTargets: unknown;
    primaryMapping: boolean;
    yieldRate: number;
  };
  evidence: {
    productUrl: string | null;
    frontImageUrl: string | null;
    labelImageUrl: string | null;
    labelText: string | null;
    servingUnitsPerDose: number;
    conversionSnapshot: unknown;
  };
  /** 已挂上的标签名集合（比较时排序，不关心顺序） */
  tags: string[];
  group: { status: string | null };
  draft: {
    status: string;
    ingredientId: string | null;
    nutritionFoodId: string | null;
    evidenceId: string | null;
  };
}

export interface DirectVerificationResult {
  fields: VerificationField[];
  ok: boolean;
  mismatches: string[];
}

/** 数字精确比较（`Object.is`：NaN 也只等于 NaN）；JSON/数组深比较。 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'number') {
    return Object.is(left, right);
  }
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => deepEqual(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        deepEqual(left[key], right[key]),
    );
  }
  return false;
}

function formatValue(value: unknown): string {
  if (value === undefined) return '（未写入）';
  if (typeof value === 'string') return value;
  let text: string;
  try {
    text = JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/**
 * 金额落库精度：`current_price_per_purchase_unit` 是 `Decimal(14, 6)`。
 *
 * 草稿里可能是 0.1234567，写进库里会变成 0.123457；直接用 `Object.is` 会假失败，
 * 所以这一项在比较前按 6 位小数归一。其他数值（营养含量、份量）仍精确比较。
 */
const PRICE_DECIMALS = 6;

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizePrice(value: unknown): unknown {
  return typeof value === 'number' && Number.isFinite(value)
    ? roundToDecimals(value, PRICE_DECIMALS)
    : value;
}

/** `properties` 里没写的键按 null 计（建档服务对空值不写键）。 */
function readProperty(properties: UnknownRecord, key: string): unknown {
  const value = properties[key];
  return value === undefined ? null : value;
}

const INGREDIENT_ROWS: Array<{
  key: string;
  label: string;
  target: string;
  read: (snapshot: DirectVerificationSnapshot) => unknown;
  /** 落库会改精度的字段（目前只有 Decimal 价格）在比较前归一。 */
  normalize?: (value: unknown) => unknown;
}> = [
  {
    key: 'ingredient.name',
    label: '原料名称',
    target: 'ingredient.name',
    read: (s) => s.ingredient.name,
  },
  {
    key: 'ingredient.brand',
    label: '品牌',
    target: 'ingredient.brand',
    read: (s) => s.ingredient.brand,
  },
  {
    key: 'ingredient.productModel',
    label: '产品规格',
    target: 'ingredient.product_model',
    read: (s) => s.ingredient.productModel,
  },
  {
    key: 'ingredient.purchaseChannel',
    label: '采购渠道',
    target: 'ingredient.purchase_channel',
    read: (s) => s.ingredient.purchaseChannel,
  },
  {
    key: 'ingredient.baseUnit',
    label: '基准单位',
    target: 'ingredient.base_unit',
    read: (s) => s.ingredient.baseUnit,
  },
  {
    key: 'ingredient.unitDisplayLabel',
    label: '展示单位',
    target: 'ingredient.unit_display_label',
    read: (s) => s.ingredient.unitDisplayLabel,
  },
  {
    key: 'ingredient.physicalForm',
    label: '物理形态',
    target: 'ingredient.physical_form',
    read: (s) => s.ingredient.physicalForm,
  },
  {
    key: 'ingredient.purchaseUnit',
    label: '采购单位',
    target: 'ingredient.purchase_unit',
    read: (s) => s.ingredient.purchaseUnit,
  },
  {
    key: 'ingredient.purchaseToBaseRatio',
    label: '采购换算倍数',
    target: 'ingredient.purchase_to_base_ratio',
    read: (s) => s.ingredient.purchaseToBaseRatio,
  },
  {
    key: 'ingredient.currentPricePerPurchaseUnit',
    label: '当前采购价',
    target: 'ingredient.current_price_per_purchase_unit',
    read: (s) => s.ingredient.currentPricePerPurchaseUnit,
    normalize: normalizePrice,
  },
  {
    key: 'ingredient.diyEnabled',
    label: 'DIY 开关',
    target: 'ingredient.diy_enabled',
    read: (s) => s.ingredient.diyEnabled,
  },
  {
    key: 'ingredient.procurementEnabled',
    label: '生产采购开关',
    target: 'ingredient.procurement_enabled',
    read: (s) => s.ingredient.procurementEnabled,
  },
  {
    key: 'ingredient.shelfLifeMonths',
    label: '原厂保质期（月）',
    target: 'ingredient.shelf_life_months',
    read: (s) => s.ingredient.shelfLifeMonths,
  },
  {
    key: 'ingredient.openedShelfLifeDays',
    label: '开盖后保质期（天）',
    target: 'ingredient.opened_shelf_life_days',
    read: (s) => s.ingredient.openedShelfLifeDays,
  },
  {
    key: 'ingredient.storageCondition',
    label: '储存条件',
    target: 'ingredient.storage_condition',
    read: (s) => s.ingredient.storageCondition,
  },
  {
    key: 'ingredient.isOilBased',
    label: '内容物油性',
    target: 'ingredient.is_oil_based',
    read: (s) => s.ingredient.isOilBased,
  },
  {
    key: 'ingredient.supplementRetailEnabled',
    label: '商城上架开关',
    target: 'ingredient.supplement_retail_enabled',
    read: (s) => s.ingredient.supplementRetailEnabled,
  },
  {
    key: 'ingredient.equivalenceGroupId',
    label: '等价组',
    target: 'ingredient.equivalence_group_id',
    read: (s) => s.ingredient.equivalenceGroupId,
  },
  {
    key: 'ingredient.equivalencePriority',
    label: '组内排序',
    target: 'ingredient.equivalence_priority',
    read: (s) => s.ingredient.equivalencePriority,
  },
];

const PROPERTY_ROWS: Array<{ key: string; label: string; property: string }> = [
  { key: 'properties.add_timing', label: '添加时机', property: 'add_timing' },
  // spec §9.1 把它写在原料行，实际落点是 properties（§12.1）。
  {
    key: 'properties.production_loss_rate',
    label: '生产损耗率',
    property: 'production_loss_rate',
  },
  {
    key: 'properties.label_category',
    label: '标签分类',
    property: 'label_category',
  },
  { key: 'properties.label_names', label: '标签名称', property: 'label_names' },
  {
    key: 'properties.label_name_source',
    label: '标签名称依据',
    property: 'label_name_source',
  },
  { key: 'properties.tags', label: '标签分类标签', property: 'tags' },
  {
    key: 'properties.serving_units_per_dose',
    label: '每份多少',
    property: 'serving_units_per_dose',
  },
  {
    key: 'properties.display_unit',
    label: '展示单位（档案）',
    property: 'display_unit',
  },
  {
    key: 'properties.no_sale_reason',
    label: '不上架原因',
    property: 'no_sale_reason',
  },
  {
    key: 'properties.purchase_link',
    label: '购买链接',
    property: 'purchase_link',
  },
  { key: 'properties.image_url', label: '商品图片', property: 'image_url' },
];

const EVIDENCE_ROWS: Array<{
  key: string;
  label: string;
  target: string;
  read: (snapshot: DirectVerificationSnapshot) => unknown;
}> = [
  {
    key: 'evidence.productUrl',
    label: '商品链接',
    target: 'supplement_label_evidence.product_url',
    read: (s) => s.evidence.productUrl,
  },
  {
    key: 'evidence.frontImageUrl',
    label: '商品正面图',
    target: 'supplement_label_evidence.front_image_url',
    read: (s) => s.evidence.frontImageUrl,
  },
  {
    key: 'evidence.labelImageUrl',
    label: '标签图',
    target: 'supplement_label_evidence.label_image_url',
    read: (s) => s.evidence.labelImageUrl,
  },
  {
    key: 'evidence.labelText',
    label: '标签原文',
    target: 'supplement_label_evidence.label_text',
    read: (s) => s.evidence.labelText,
  },
  {
    key: 'evidence.servingUnitsPerDose',
    label: '证据每份量',
    target: 'supplement_label_evidence.serving_units_per_dose',
    read: (s) => s.evidence.servingUnitsPerDose,
  },
  {
    key: 'evidence.conversionSnapshot',
    label: '折算快照',
    target: 'supplement_label_evidence.conversion_snapshot',
    read: (s) => s.evidence.conversionSnapshot,
  },
];

/**
 * 直接字段核验：逐项对比草稿期望与回读实际，返回 `fields` / `ok` / `mismatches`。
 *
 * 覆盖 spec §9.1：原料 19 项、properties 11 项、营养档案（状态/分类/每个营养素/
 * 默认目标/主映射/产出率）、证据 6 项、标签关联、等价组状态、草稿状态与三个 id。
 * 数字精确比较，JSON 深比较；任何一项不一致都算失败（调用方据此回滚）。
 */
export function buildDirectVerification(
  expected: DirectVerificationSnapshot,
  actual: DirectVerificationSnapshot,
): DirectVerificationResult {
  const fields: VerificationField[] = [];

  const add = (
    key: string,
    label: string,
    target: string,
    expectedValue: unknown,
    actualValue: unknown,
  ): void => {
    fields.push({
      key,
      label,
      target,
      expected: expectedValue,
      actual: actualValue,
      ok: deepEqual(expectedValue, actualValue),
    });
  };

  for (const row of INGREDIENT_ROWS) {
    const normalize = row.normalize ?? ((value: unknown) => value);
    add(
      row.key,
      row.label,
      row.target,
      normalize(row.read(expected)),
      normalize(row.read(actual)),
    );
  }

  for (const row of PROPERTY_ROWS) {
    add(
      row.key,
      row.label,
      `ingredient.properties.${row.property}`,
      readProperty(expected.ingredient.properties, row.property),
      readProperty(actual.ingredient.properties, row.property),
    );
  }

  add(
    'nutrition.status',
    '营养档案状态',
    'nutrition_food.status',
    expected.nutritionFood.status,
    actual.nutritionFood.status,
  );
  add(
    'nutrition.category',
    '营养档案分类',
    'nutrition_food.category',
    expected.nutritionFood.category,
    actual.nutritionFood.category,
  );

  // 营养值有两个落点，都要和草稿折算值一致：任一写坏都可能让配方/等价组读到错的数。
  for (const [fieldPath, expectedValue] of Object.entries(
    expected.nutritionFood.nutrients,
  )) {
    const field = findNutritionField(fieldPath);
    add(
      `nutrition.nutrients.${fieldPath}`,
      `营养档案营养素值 · ${field?.label ?? fieldPath}`,
      `nutrition_food.nutrition_data.${fieldPath}`,
      expectedValue,
      actual.nutritionFood.nutrients[fieldPath],
    );
    add(
      `ingredientProfile.nutrients.${fieldPath}`,
      `原料档案营养素值 · ${field?.label ?? fieldPath}`,
      `ingredient.nutrition_profile.${fieldPath}`,
      expectedValue,
      actual.ingredientProfile.nutrients[fieldPath],
    );
  }

  add(
    'nutrition.defaultSupplementTargets',
    '默认目标营养素',
    'nutrition_food.default_supplement_targets',
    expected.nutritionFood.defaultSupplementTargets,
    actual.nutritionFood.defaultSupplementTargets,
  );
  add(
    'nutrition.primaryMapping',
    '主映射',
    'nutrition_food_mapping.is_primary',
    expected.nutritionFood.primaryMapping,
    actual.nutritionFood.primaryMapping,
  );
  add(
    'nutrition.yieldRate',
    '折算产出率',
    'nutrition_food_mapping.yield_rate',
    expected.nutritionFood.yieldRate,
    actual.nutritionFood.yieldRate,
  );

  for (const row of EVIDENCE_ROWS) {
    add(row.key, row.label, row.target, row.read(expected), row.read(actual));
  }

  add(
    'tags',
    '标签关联',
    'ingredient_tag_assignment',
    [...expected.tags].sort(),
    [...actual.tags].sort(),
  );

  add(
    'group.status',
    '等价组状态',
    'supplement_equivalence_group.status',
    expected.group.status,
    actual.group.status,
  );

  add(
    'draft.status',
    '草稿状态',
    'supplement_creation_draft.status',
    expected.draft.status,
    actual.draft.status,
  );
  add(
    'draft.ingredientId',
    '已写入原料 id',
    'supplement_creation_draft.finalized_ingredient_id',
    expected.draft.ingredientId,
    actual.draft.ingredientId,
  );
  add(
    'draft.nutritionFoodId',
    '已写入营养档案 id',
    'supplement_creation_draft.finalized_nutrition_food_id',
    expected.draft.nutritionFoodId,
    actual.draft.nutritionFoodId,
  );
  add(
    'draft.evidenceId',
    '已写入证据 id',
    'supplement_creation_draft.finalized_evidence_id',
    expected.draft.evidenceId,
    actual.draft.evidenceId,
  );

  const mismatches = fields
    .filter((field) => !field.ok)
    .map(
      (field) =>
        `${field.label}（${field.target}）期望 ${formatValue(field.expected)}，实际 ${formatValue(field.actual)}`,
    );

  return {
    fields,
    ok: mismatches.length === 0,
    mismatches,
  };
}
