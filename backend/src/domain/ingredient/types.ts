/**
 * Ingredient Property Types
 * These types define the JSON structure for Ingredient.properties field
 * Based on 07_Core_Architecture.md Section 2.3
 */

import type {
  AMINO_ACID_NUTRIENT_KEYS,
  FATTY_ACID_NUTRIENT_KEYS,
  MACRO_NUTRIENT_KEYS,
  MINERAL_NUTRIENT_KEYS,
  VITAMIN_NUTRIENT_KEYS,
} from './nutrition-profile.constants';
import type {
  NutritionSourceCode,
  NutritionSourceKind,
} from './nutrition-source-contract';

export type NutritionBasisType =
  | 'PER_100_G'
  | 'PER_100_ML'
  | 'PER_1_G'
  | 'PER_1_ML'
  | 'PER_1_PCS';

export type NutritionRawBasisType =
  | 'PER_100_G'
  | 'PER_100_ML'
  | 'PER_1_G'
  | 'PER_1_ML'
  | 'PER_SERVING';

export interface NutritionSourceForm {
  sourceNutrientId?: string | number | null;
  sourceNutrientName?: string | null;
  originalValue?: number | string | null;
  originalUnit?: string | null;
  canonicalValue?: number | null;
  canonicalUnit?: string | null;
  basisType?: NutritionBasisType | NutritionRawBasisType | string | null;
  notes?: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

export type NutritionFieldSourceCompatibility =
  | 'EXACT_FOOD'
  | 'SAME_SPECIES'
  | 'APPROXIMATE_SPECIES'
  | 'PRODUCT_OR_EXTRACT'
  | 'REFERENCE_ONLY'
  | 'LABEL'
  | 'LAB_REPORT'
  | 'MANUAL';

export interface NutritionFieldSource extends NutritionSourceForm {
  sourceRole?: 'PROFILE_PRIMARY' | 'FIELD_SUPPLEMENT' | string | null;
  sourceType?: string | null;
  sourceKind?: NutritionSourceKind | string | null;
  sourceCode?: NutritionSourceCode | string | null;
  sourceVersion?: string | null;
  sourceKey?: string | null;
  externalId?: string | null;
  sourceTitle?: string | null;
  sourceProvider?: string | null;
  compatibility?: NutritionFieldSourceCompatibility | string | null;
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  noteZh?: string | null;
}

export interface NutritionItem {
  nutrientCode?: string | null;
  nutrientName: string;
  value: number;
  unit: string;
  basisType: NutritionBasisType;
  basisQuantity?: number;
  sourceType?: string | null;
  sourceName?: string | null;
  confidenceLevel?: string | null;
  isKeyNutrient?: boolean;
  notes?: string | null;
}

export interface NutritionMeta {
  rawBasisType: NutritionRawBasisType;
  sampleState?:
    | 'RAW'
    | 'COOKED'
    | 'FREEZE_DRIED'
    | 'AIR_DRIED'
    | 'POWDER'
    | 'OIL'
    | 'CONCENTRATE'
    | 'SOAKED';
  isEdiblePortionBasis?: boolean;
  ediblePortionRate?: number | null;
  densityGPerMl?: number | null;
  servingWeightG?: number | null;
  sourceType?:
    | 'LAB_REPORT'
    | 'LABEL'
    | 'LITERATURE'
    | 'SUPPLIER'
    | 'MANUAL_ESTIMATE'
    | 'USDA'
    | 'NZFCD'
    | 'MEXT'
    | 'NEVO'
    | 'TFDA'
    | 'CFCT'
    | 'CNF'
    | 'COFID'
    | 'CIQUAL'
    | 'SUPPLEMENT_LABEL'
    | 'MANUAL'
    | null;
  sourceKind?: NutritionSourceKind | string | null;
  sourceCode?: NutritionSourceCode | string | null;
  sourceVersion?: string | null;
  externalId?: string | null;
  sourceRecordId?: string | null;
  sourceForms?: Record<string, NutritionSourceForm>;
  fieldSources?: Record<string, NutritionFieldSource>;
  conversionNotes?: Record<string, string>;
  sourceTitle?: string | null;
  sourceProvider?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  attachments?: string[];
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  fieldDisplayUnits?: Record<string, string>;
  versionNote?: string | null;
  reviewNotes?: string | string[] | Record<string, unknown> | null;
}

type NutritionTabValue = number | null;

type NutritionTabRecord<TKey extends readonly string[]> = {
  [K in TKey[number]]: NutritionTabValue;
};

export type MacroNutritionProfileTab = NutritionTabRecord<
  typeof MACRO_NUTRIENT_KEYS
>;

export type MineralNutritionProfileTab = NutritionTabRecord<
  typeof MINERAL_NUTRIENT_KEYS
>;

export type VitaminNutritionProfileTab = NutritionTabRecord<
  typeof VITAMIN_NUTRIENT_KEYS
>;

export type FattyAcidNutritionProfileTab = NutritionTabRecord<
  typeof FATTY_ACID_NUTRIENT_KEYS
>;

export type AminoAcidNutritionProfileTab = NutritionTabRecord<
  typeof AMINO_ACID_NUTRIENT_KEYS
>;

export interface NutritionProfileV2 {
  meta: NutritionMeta;
  macros: MacroNutritionProfileTab;
  minerals: MineralNutritionProfileTab;
  vitamins: VitaminNutritionProfileTab;
  fattyAcids: FattyAcidNutritionProfileTab;
  aminoAcids: AminoAcidNutritionProfileTab;
  customItems: Array<{
    name: string;
    value: number;
    unit: string;
    rawBasisType?: NutritionRawBasisType;
    note?: string | null;
    sourceNutrientId?: string | number | null;
    sourceNutrientName?: string | null;
    canonicalFieldPath?: string | null;
    reviewCategory?: string | null;
    reviewStatus?: string | null;
  }>;
}

export interface LegacyNutritionProfile {
  items: NutritionItem[];
}

export type NutritionProfile = NutritionProfileV2 | LegacyNutritionProfile;

/**
 * Food Properties (when Ingredient.type === 'FOOD')
 */
export interface FoodProperties {
  // 采购与定性描述
  cfct_class: string; // CFCT分类 (e.g. "畜肉类", "油脂类")
  edible_yield_rate: number; // 可食部/出肉率 (Default 1.0, e.g. 0.85 for bone-in meat)
  main_nutrients_desc: string; // 主要营养价值 (e.g. "高蛋白, 富含铁")

  // 算法必需字段
  // Required ONLY if base_unit == 'ML'. Used to convert Vol(ml) -> Mass(g).
  density_g_per_ml?: number;
}

/**
 * 有效成分含量值（包含数值和单位）
 */
export interface ActiveNutrientValue {
  value: number; // 显示的数值（原始输入值）
  unit: string; // 单位 (mg, g, μg, IU, %)
}

export interface SupplementTarget {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}

/**
 * 购买链接配置
 */
export interface PurchaseLinkConfig {
  url?: string; // 商品链接或口令，用于复制到剪贴板
  platform: 'TAOBAO' | 'JD' | 'PINDUODUO' | 'IHERB' | 'OTHER' | 'WEBVIEW'; // 平台类型
}

/**
 * Supplement Properties (when Ingredient.type === 'SUPPLEMENT')
 */
export interface SupplementProperties {
  // 营养类型分类
  category_type: string; // Options: "MINERAL", "VITAMIN", "AMINO_ACID", "FATTY_ACID", "PROBIOTIC", "FUNCTIONAL", "OTHER"

  // 添加时机
  add_timing?: 'BEFORE_MIXING' | 'BEFORE_MEAL'; // 添加时机: "搅拌前（生产中）" 或 "饭前（加热后）"

  // 兼容历史数据：补剂专属营养字段已迁移到统一 nutritionProfile。
  // 在过渡阶段保留该字段，方便脚本回填与兼容旧数据读取。
  active_nutrients?: Record<string, ActiveNutrientValue>;

  // 直连产品信息（单层补剂模型）
  display_unit?: string;
  supplier_name?: string | null;
  purchase_link?: PurchaseLinkConfig;
  image_url?: string | null;
  marketing_highlights?: Record<string, ActiveNutrientValue>;

  // 个性化损耗率 (Override Global)
  // 默认建议 1.05 (5%)。鱼油可设为 1.0, 易损粉末设为 1.10
  production_loss_rate?: number;
}

/**
 * Packaging Properties (when Ingredient.type === 'PACKAGING')
 */
export interface PackagingProperties {
  // 业务属性
  is_consumable: boolean; // true=消耗品(随单扣减), false=固定资产
  linked_item_id?: string; // 关联配件 (e.g. 4号箱绑定4号袋)
  supplier_name?: string | null;
}
