/**
 * 补剂草稿的整份载荷（服务端唯一真源）。
 *
 * 草稿在 `supplement_creation_draft.payload` 里存 JSON，前端按区块读写；
 * 形状以 spec §5.2 为准，多出来的 `retail.openedShelfLifeDays` 来自 §12.4。
 *
 * 约定：
 * - 草稿是「人还没确认完」的中间态，没填的就是空值（'' / null / []），
 *   不要用 `undefined` 表示「没填」，否则 JSON 往返后会丢键；
 * - 所有取值都由服务端在最终写入时再校验一遍，这里只负责形状稳定。
 */

/** 库存基准单位；与 `isSupplementUnitOneToOne` 的入参保持一致。 */
export type SupplementBaseUnit = 'PCS' | 'G' | 'ML';

/** 物理形态；决定基准单位（粉=G、液体=ML、片/胶囊=PCS）。 */
export type SupplementPhysicalForm = 'POWDER' | 'TABLET' | 'CAPSULE' | 'LIQUID';

/** 标签分类；合规字段，二选一。 */
export type SupplementLabelCategory = 'FEED_MATERIAL' | 'FEED_ADDITIVE';

/**
 * 人已确认的提醒项：只记 code + 关键参数哈希。
 *
 * 参数（等价组 id、DIY 平台等）变了哈希就变，旧确认自动失效，
 * 避免「确认了旧的、新的没看」。
 */
export interface SupplementDraftAcknowledgedWarning {
  code: string;
  paramsHash: string;
}

/** ① 商品与基本信息。 */
export interface SupplementDraftBasic {
  name: string;
  brand: string;
  productModel: string;
  purchaseChannel: string;
  baseUnit: SupplementBaseUnit;
  unitDisplayLabel: string;
  physicalForm: SupplementPhysicalForm | null;
  servingUnitsPerDose: number | null;
  purchaseUnit: string;
  purchaseToBaseRatio: number | null;
  currentPricePerPurchaseUnit: number | null;
  productionLossRate: number;
  addTiming: string;
}

/** ② 营养档案；每份含量以目录字段路径为键。 */
export interface SupplementDraftNutrition {
  servingNutrients: Record<string, number>;
  defaultTargetFields: string[];
  labelText: string;
}

/** ③ 标签与合规。 */
export interface SupplementDraftLabel {
  labelCategory: SupplementLabelCategory | null;
  labelNames: string[];
  tagNames: string[];
  labelNameSource: string;
}

/** ④ 上架与商城；上架开关是草稿意向，写入时才落到原料档案。 */
export interface SupplementDraftRetail {
  enabled: boolean;
  shelfLifeMonths: number | null;
  /** 开盖后保质期（天）；标签写了才填 */
  openedShelfLifeDays: number | null;
  storageCondition: string;
  isOilBased: boolean;
  noSaleReason: string | null;
}

/** ⑤ DIY 推荐。 */
export interface SupplementDraftDiy {
  enabled: boolean;
  platform: string;
  linkUrl: string;
  imageUrl: string;
}

/** ⑥ 生产采购；采购口径本身复用 basic 里的单位/倍数/价格。 */
export interface SupplementDraftProcurement {
  enabled: boolean;
}

/** ⑦ 等价组。 */
export interface SupplementDraftEquivalence {
  /** groupId / `__SKIP__`（暂不归组）/ null（还没选） */
  groupId: string | null;
  priority: number | null;
  /** 加入已审核组时，是否在本次最终写入里一并重新审核通过；默认 true（人可在审核屏取消） */
  reapproveGroup: boolean;
}

/** ⑧ 证据与来源。 */
export interface SupplementDraftEvidence {
  frontImageUrl: string;
  labelImageUrl: string;
  productUrl: string;
  selectionNote: string;
}

/** ⑨ 审核确认。 */
export interface SupplementDraftReview {
  /** 人已确认的提醒项：code + 关键参数哈希 */
  acknowledgedWarnings: SupplementDraftAcknowledgedWarning[];
}

export interface SupplementDraftPayload {
  basic: SupplementDraftBasic;
  nutrition: SupplementDraftNutrition;
  label: SupplementDraftLabel;
  retail: SupplementDraftRetail;
  diy: SupplementDraftDiy;
  procurement: SupplementDraftProcurement;
  equivalence: SupplementDraftEquivalence;
  evidence: SupplementDraftEvidence;
  review: SupplementDraftReview;
}

/** 生产损耗率的默认值（spec §12.1：默认 1.05）。 */
export const DEFAULT_SUPPLEMENT_PRODUCTION_LOSS_RATE = 1.05;

const BASE_UNITS: readonly SupplementBaseUnit[] = ['PCS', 'G', 'ML'];
const PHYSICAL_FORMS: readonly SupplementPhysicalForm[] = [
  'POWDER',
  'TABLET',
  'CAPSULE',
  'LIQUID',
];
const LABEL_CATEGORIES: readonly SupplementLabelCategory[] = [
  'FEED_MATERIAL',
  'FEED_ADDITIVE',
];

/**
 * 空草稿。每次调用都返回新对象，调用方可以放心改。
 *
 * `baseUnit` 默认 PCS：多数补剂按粒/片/胶囊计，且 §7.2 要求基准单位与
 * 物理形态一致 —— 真正选剂型时人要同时确认基准单位，完整度也不会先把
 * 基准单位算成已填。
 */
export function emptySupplementDraftPayload(): SupplementDraftPayload {
  return {
    basic: {
      name: '',
      brand: '',
      productModel: '',
      purchaseChannel: '',
      baseUnit: 'PCS',
      unitDisplayLabel: '',
      physicalForm: null,
      servingUnitsPerDose: null,
      purchaseUnit: '',
      purchaseToBaseRatio: null,
      currentPricePerPurchaseUnit: null,
      productionLossRate: DEFAULT_SUPPLEMENT_PRODUCTION_LOSS_RATE,
      addTiming: '',
    },
    nutrition: {
      servingNutrients: {},
      defaultTargetFields: [],
      labelText: '',
    },
    label: {
      labelCategory: null,
      labelNames: [],
      tagNames: [],
      labelNameSource: '',
    },
    retail: {
      enabled: false,
      shelfLifeMonths: null,
      openedShelfLifeDays: null,
      storageCondition: '',
      isOilBased: false,
      noSaleReason: null,
    },
    diy: {
      enabled: false,
      platform: '',
      linkUrl: '',
      imageUrl: '',
    },
    procurement: {
      enabled: false,
    },
    equivalence: {
      groupId: null,
      priority: null,
      reapproveGroup: true,
    },
    evidence: {
      frontImageUrl: '',
      labelImageUrl: '',
      productUrl: '',
      selectionNote: '',
    },
    review: {
      acknowledgedWarnings: [],
    },
  };
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** 营养素是目录字段路径 → 数值的映射；保留全部已知键，丢掉非数值。 */
function asNumberMap(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[key] = raw;
    }
  }
  return result;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T | null,
): T | null {
  if (typeof value !== 'string') return fallback;
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function asAcknowledgedWarnings(
  value: unknown,
): SupplementDraftAcknowledgedWarning[] {
  if (!Array.isArray(value)) return [];
  const result: SupplementDraftAcknowledgedWarning[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (
      typeof record.code === 'string' &&
      typeof record.paramsHash === 'string'
    ) {
      result.push({ code: record.code, paramsHash: record.paramsHash });
    }
  }
  return result;
}

/**
 * 把外部输入（数据库 JSON、AI 返回、前端 PUT 体）收成一份完整的草稿载荷。
 *
 * - 以空草稿为底逐层合并：缺的键补默认值，已知键类型不对就回退到默认值；
 * - 未知键直接丢掉，避免前端/AI 往库里塞计划外字段；
 * - 数组与营养素映射按元素过滤，不让一个脏值毁掉整份草稿。
 */
export function normalizeSupplementDraftPayload(
  input: unknown,
): SupplementDraftPayload {
  const empty = emptySupplementDraftPayload();
  const source = asRecord(input);

  const basic = asRecord(source.basic);
  const nutrition = asRecord(source.nutrition);
  const label = asRecord(source.label);
  const retail = asRecord(source.retail);
  const diy = asRecord(source.diy);
  const procurement = asRecord(source.procurement);
  const equivalence = asRecord(source.equivalence);
  const evidence = asRecord(source.evidence);
  const review = asRecord(source.review);

  return {
    basic: {
      name: asString(basic.name, empty.basic.name),
      brand: asString(basic.brand, empty.basic.brand),
      productModel: asString(basic.productModel, empty.basic.productModel),
      purchaseChannel: asString(
        basic.purchaseChannel,
        empty.basic.purchaseChannel,
      ),
      baseUnit:
        asEnum(basic.baseUnit, BASE_UNITS, empty.basic.baseUnit) ??
        empty.basic.baseUnit,
      unitDisplayLabel: asString(
        basic.unitDisplayLabel,
        empty.basic.unitDisplayLabel,
      ),
      physicalForm: asEnum(
        basic.physicalForm,
        PHYSICAL_FORMS,
        empty.basic.physicalForm,
      ),
      servingUnitsPerDose: asNullableNumber(basic.servingUnitsPerDose),
      purchaseUnit: asString(basic.purchaseUnit, empty.basic.purchaseUnit),
      purchaseToBaseRatio: asNullableNumber(basic.purchaseToBaseRatio),
      currentPricePerPurchaseUnit: asNullableNumber(
        basic.currentPricePerPurchaseUnit,
      ),
      productionLossRate: asNumber(
        basic.productionLossRate,
        empty.basic.productionLossRate,
      ),
      addTiming: asString(basic.addTiming, empty.basic.addTiming),
    },
    nutrition: {
      servingNutrients: asNumberMap(nutrition.servingNutrients),
      defaultTargetFields: asStringArray(nutrition.defaultTargetFields),
      labelText: asString(nutrition.labelText, empty.nutrition.labelText),
    },
    label: {
      labelCategory: asEnum(
        label.labelCategory,
        LABEL_CATEGORIES,
        empty.label.labelCategory,
      ),
      labelNames: asStringArray(label.labelNames),
      tagNames: asStringArray(label.tagNames),
      labelNameSource: asString(
        label.labelNameSource,
        empty.label.labelNameSource,
      ),
    },
    retail: {
      enabled: asBoolean(retail.enabled, empty.retail.enabled),
      shelfLifeMonths: asNullableNumber(retail.shelfLifeMonths),
      openedShelfLifeDays: asNullableNumber(retail.openedShelfLifeDays),
      storageCondition: asString(
        retail.storageCondition,
        empty.retail.storageCondition,
      ),
      isOilBased: asBoolean(retail.isOilBased, empty.retail.isOilBased),
      noSaleReason: asNullableString(retail.noSaleReason),
    },
    diy: {
      enabled: asBoolean(diy.enabled, empty.diy.enabled),
      platform: asString(diy.platform, empty.diy.platform),
      linkUrl: asString(diy.linkUrl, empty.diy.linkUrl),
      imageUrl: asString(diy.imageUrl, empty.diy.imageUrl),
    },
    procurement: {
      enabled: asBoolean(procurement.enabled, empty.procurement.enabled),
    },
    equivalence: {
      groupId: asNullableString(equivalence.groupId),
      priority: asNullableNumber(equivalence.priority),
      reapproveGroup: asBoolean(
        equivalence.reapproveGroup,
        empty.equivalence.reapproveGroup,
      ),
    },
    evidence: {
      frontImageUrl: asString(
        evidence.frontImageUrl,
        empty.evidence.frontImageUrl,
      ),
      labelImageUrl: asString(
        evidence.labelImageUrl,
        empty.evidence.labelImageUrl,
      ),
      productUrl: asString(evidence.productUrl, empty.evidence.productUrl),
      selectionNote: asString(
        evidence.selectionNote,
        empty.evidence.selectionNote,
      ),
    },
    review: {
      acknowledgedWarnings: asAcknowledgedWarnings(review.acknowledgedWarnings),
    },
  };
}
