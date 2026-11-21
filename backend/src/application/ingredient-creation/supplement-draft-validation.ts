/**
 * 补剂草稿的基础校验（纯函数）。
 *
 * 只做「不看外部数据也能判断」的硬校验：名称/单位/份量/营养/采购/标签/时机。
 * 需要查库或查目录的（重复建档、标签规范名、等价组、上架体检、DIY 链接）
 * 留给 `validateSupplementDraftFeatures`（Task 6）。
 *
 * 约定：
 * - 阻断项（BLOCKER）：数据会错、功能一定用不了；必须改，不能写入。
 * - 提醒项（WARNING）：能写入但建议改；审核屏要人逐条确认。
 * - code 是 UI/确认记录的稳定键，改文案可以，别改 code。
 * - 面向人的 message 用中文；只有必要提示时才带原始字段路径（放在 fieldPath 里）。
 */

import { findNutritionField } from '../../domain/ingredient/nutrition-field-catalog';
import { isSupplementUnitOneToOne } from '../supplement-shop/supplement-unit.util';
import type {
  SupplementBaseUnit,
  SupplementDraftPayload,
  SupplementPhysicalForm,
} from './supplement-draft.types';

export type SupplementDraftIssueLevel = 'BLOCKER' | 'WARNING';

export type SupplementDraftIssueCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'NAME_FORM_WORD'
  | 'BRAND_TOO_LONG'
  | 'PRODUCT_MODEL_TOO_LONG'
  | 'PURCHASE_CHANNEL_TOO_LONG'
  | 'UNIT_PHYSICAL_FORM_MISMATCH'
  | 'UNIT_DISPLAY_MISMATCH'
  | 'SERVING_SIZE_REQUIRED'
  | 'SERVING_SIZE_NOT_INTEGER'
  | 'NUTRIENT_EMPTY'
  | 'NUTRIENT_FIELD_UNKNOWN'
  | 'NUTRIENT_VALUE_INVALID'
  | 'DEFAULT_TARGET_REQUIRED'
  | 'DEFAULT_TARGET_INVALID'
  | 'PURCHASE_UNIT_REQUIRED'
  | 'PURCHASE_RATIO_INVALID'
  | 'PURCHASE_PRICE_INVALID'
  | 'PRODUCTION_LOSS_RATE_INVALID'
  | 'LABEL_CATEGORY_REQUIRED'
  | 'LABEL_NAMES_REQUIRED'
  | 'TAG_NAMES_REQUIRED'
  | 'ADD_TIMING_INVALID'
  | 'OPENED_SHELF_LIFE_DAYS_INVALID';

export interface SupplementDraftIssue {
  code: SupplementDraftIssueCode;
  level: SupplementDraftIssueLevel;
  message: string;
  /** 供前端定位到具体输入框；不要求展示给用户。 */
  fieldPath?: string;
  /** 需要人确认的提醒项：稳定 `${code}:${paramsHash}`（Task 6 起使用）。 */
  ackKey?: string;
}

/** 物理形态 → 应有的基准单位（spec §7.2）。 */
const BASE_UNIT_BY_PHYSICAL_FORM: Record<
  SupplementPhysicalForm,
  SupplementBaseUnit
> = {
  POWDER: 'G',
  LIQUID: 'ML',
  TABLET: 'PCS',
  CAPSULE: 'PCS',
};

/** 与 DTO/领域词表同一套；服务端不引用前端常量。 */
const ALLOWED_ADD_TIMINGS: readonly string[] = ['BEFORE_MIXING', 'BEFORE_MEAL'];

/** 名称结尾带这些词说明写成了「商品名/剂型名」，只提醒不改。 */
const NAME_FORM_WORDS: readonly string[] = [
  '胶囊',
  '片',
  '粉剂',
  '滴剂',
  '颗粒',
  '冲剂',
  '口服液',
  '软胶囊',
  '咀嚼片',
  '含片',
  '泡腾片',
  '片剂',
  '胶丸',
];

const NAME_MAX_LENGTH = 200;
const BRAND_MAX_LENGTH = 100;
const PRODUCT_MODEL_MAX_LENGTH = 100;
const PURCHASE_CHANNEL_MAX_LENGTH = 200;

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isPositiveNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function nutrientFieldPath(fieldPath: string): string {
  return `nutrition.servingNutrients.${fieldPath}`;
}

/**
 * 基础校验入口。
 *
 * 空草稿会同时报出「名称/单位/营养」等多条阻断，这是有意的：
 * 审核屏一次把所有缺口列出来，而不是让人改一条刷新一次。
 */
export function validateSupplementDraftBasics(
  payload: SupplementDraftPayload,
): SupplementDraftIssue[] {
  const issues: SupplementDraftIssue[] = [];
  const { basic, nutrition, label } = payload;

  // ① 名称
  const name = basic.name.trim();
  if (!name) {
    issues.push({
      code: 'NAME_REQUIRED',
      level: 'BLOCKER',
      message: '请填写原料名称',
      fieldPath: 'basic.name',
    });
  } else {
    if (name.length > NAME_MAX_LENGTH) {
      issues.push({
        code: 'NAME_TOO_LONG',
        level: 'BLOCKER',
        message: `原料名称不能超过 ${NAME_MAX_LENGTH} 字`,
        fieldPath: 'basic.name',
      });
    }
    if (NAME_FORM_WORDS.some((word) => name.endsWith(word))) {
      issues.push({
        code: 'NAME_FORM_WORD',
        level: 'WARNING',
        message: '名称结尾带了剂型词，建议只写物质名（剂型在物理形态里选）',
        fieldPath: 'basic.name',
      });
    }
  }

  // ② 品牌/规格/渠道长度（与建档 DTO 的限制保持一致）
  if (basic.brand.trim().length > BRAND_MAX_LENGTH) {
    issues.push({
      code: 'BRAND_TOO_LONG',
      level: 'BLOCKER',
      message: `品牌不能超过 ${BRAND_MAX_LENGTH} 字`,
      fieldPath: 'basic.brand',
    });
  }
  if (basic.productModel.trim().length > PRODUCT_MODEL_MAX_LENGTH) {
    issues.push({
      code: 'PRODUCT_MODEL_TOO_LONG',
      level: 'BLOCKER',
      message: `产品规格不能超过 ${PRODUCT_MODEL_MAX_LENGTH} 字`,
      fieldPath: 'basic.productModel',
    });
  }
  if (basic.purchaseChannel.trim().length > PURCHASE_CHANNEL_MAX_LENGTH) {
    issues.push({
      code: 'PURCHASE_CHANNEL_TOO_LONG',
      level: 'BLOCKER',
      message: `采购渠道不能超过 ${PURCHASE_CHANNEL_MAX_LENGTH} 字`,
      fieldPath: 'basic.purchaseChannel',
    });
  }

  // ③ 单位与物理形态
  const expectedBaseUnit = basic.physicalForm
    ? BASE_UNIT_BY_PHYSICAL_FORM[basic.physicalForm]
    : null;
  if (!expectedBaseUnit || expectedBaseUnit !== basic.baseUnit) {
    issues.push({
      code: 'UNIT_PHYSICAL_FORM_MISMATCH',
      level: 'BLOCKER',
      message:
        '基准单位与物理形态不一致：粉剂用克（G）、液体用毫升（ML）、片/胶囊用粒（PCS）',
      fieldPath: 'basic.baseUnit',
    });
  }
  if (!isSupplementUnitOneToOne(basic.unitDisplayLabel, basic.baseUnit)) {
    issues.push({
      code: 'UNIT_DISPLAY_MISMATCH',
      level: 'BLOCKER',
      message:
        '展示单位必须与基准单位 1:1 对应：粒/片/胶囊 ↔ PCS，g ↔ G，ml ↔ ML；「份」不能作为展示单位',
      fieldPath: 'basic.unitDisplayLabel',
    });
  }

  // ④ 每份量
  const servingUnitsPerDose = basic.servingUnitsPerDose;
  if (!isPositiveNumber(servingUnitsPerDose)) {
    issues.push({
      code: 'SERVING_SIZE_REQUIRED',
      level: 'BLOCKER',
      message: '请填写每份多少，且必须大于 0',
      fieldPath: 'basic.servingUnitsPerDose',
    });
  } else if (
    basic.baseUnit === 'PCS' &&
    !Number.isInteger(servingUnitsPerDose)
  ) {
    issues.push({
      code: 'SERVING_SIZE_NOT_INTEGER',
      level: 'BLOCKER',
      message: '按粒/片/胶囊计时，每份量必须是正整数',
      fieldPath: 'basic.servingUnitsPerDose',
    });
  }

  // ⑤ 营养素：字段在目录内、数值 ≥ 0、至少一个 > 0
  const servingNutrients = nutrition.servingNutrients;
  let hasPositiveNutrient = false;
  for (const [fieldPath, value] of Object.entries(servingNutrients)) {
    const field = findNutritionField(fieldPath);
    if (!field) {
      issues.push({
        code: 'NUTRIENT_FIELD_UNKNOWN',
        level: 'BLOCKER',
        message: `营养素字段「${fieldPath}」不在允许目录内`,
        fieldPath: nutrientFieldPath(fieldPath),
      });
      continue;
    }
    if (!Number.isFinite(value) || value < 0) {
      issues.push({
        code: 'NUTRIENT_VALUE_INVALID',
        level: 'BLOCKER',
        message: `「${field.label}」的含量必须是大于等于 0 的数字`,
        fieldPath: nutrientFieldPath(fieldPath),
      });
      continue;
    }
    if (value > 0) {
      hasPositiveNutrient = true;
    }
  }
  if (!hasPositiveNutrient) {
    issues.push({
      code: 'NUTRIENT_EMPTY',
      level: 'BLOCKER',
      message: '至少填写一个大于 0 的营养素',
      fieldPath: 'nutrition.servingNutrients',
    });
  }

  // ⑥ 默认目标：至少 1 个，且来自有值（>0）的营养素
  const defaultTargetFields = nutrition.defaultTargetFields
    .map((fieldPath) => fieldPath.trim())
    .filter(Boolean);
  if (defaultTargetFields.length === 0) {
    issues.push({
      code: 'DEFAULT_TARGET_REQUIRED',
      level: 'BLOCKER',
      message: '请至少选择一个默认目标营养素',
      fieldPath: 'nutrition.defaultTargetFields',
    });
  } else {
    for (const fieldPath of defaultTargetFields) {
      const field = findNutritionField(fieldPath);
      const value = servingNutrients[fieldPath];
      if (!field) {
        issues.push({
          code: 'DEFAULT_TARGET_INVALID',
          level: 'BLOCKER',
          message: `默认目标「${fieldPath}」不在允许目录内`,
          fieldPath: 'nutrition.defaultTargetFields',
        });
      } else if (!Number.isFinite(value) || value <= 0) {
        issues.push({
          code: 'DEFAULT_TARGET_INVALID',
          level: 'BLOCKER',
          message: `默认目标「${field.label}」必须是已填写且大于 0 的营养素`,
          fieldPath: 'nutrition.defaultTargetFields',
        });
      }
    }
  }

  // ⑦ 采购口径
  if (!hasText(basic.purchaseUnit)) {
    issues.push({
      code: 'PURCHASE_UNIT_REQUIRED',
      level: 'BLOCKER',
      message: '请填写采购单位',
      fieldPath: 'basic.purchaseUnit',
    });
  }
  if (!isPositiveNumber(basic.purchaseToBaseRatio)) {
    issues.push({
      code: 'PURCHASE_RATIO_INVALID',
      level: 'BLOCKER',
      message: '采购换算倍数必须大于 0',
      fieldPath: 'basic.purchaseToBaseRatio',
    });
  }
  if (!isPositiveNumber(basic.currentPricePerPurchaseUnit)) {
    issues.push({
      code: 'PURCHASE_PRICE_INVALID',
      level: 'BLOCKER',
      message: '采购价必须大于 0',
      fieldPath: 'basic.currentPricePerPurchaseUnit',
    });
  }
  if (
    !Number.isFinite(basic.productionLossRate) ||
    basic.productionLossRate < 1 ||
    basic.productionLossRate > 2
  ) {
    issues.push({
      code: 'PRODUCTION_LOSS_RATE_INVALID',
      level: 'BLOCKER',
      message: '生产损耗率必须在 1 到 2 之间',
      fieldPath: 'basic.productionLossRate',
    });
  }

  // ⑧ 标签/合规
  if (label.labelCategory === null) {
    issues.push({
      code: 'LABEL_CATEGORY_REQUIRED',
      level: 'BLOCKER',
      message: '请选择标签分类',
      fieldPath: 'label.labelCategory',
    });
  }
  if (!label.labelNames.some((value) => hasText(value))) {
    issues.push({
      code: 'LABEL_NAMES_REQUIRED',
      level: 'BLOCKER',
      message: '请至少填写一个标签名称',
      fieldPath: 'label.labelNames',
    });
  }
  if (!label.tagNames.some((value) => hasText(value))) {
    issues.push({
      code: 'TAG_NAMES_REQUIRED',
      level: 'BLOCKER',
      message: '请至少选择一个标签分类标签',
      fieldPath: 'label.tagNames',
    });
  }

  // ⑨ 添加时机
  if (!ALLOWED_ADD_TIMINGS.includes(basic.addTiming.trim())) {
    issues.push({
      code: 'ADD_TIMING_INVALID',
      level: 'BLOCKER',
      message: '请选择添加时机（制作中 / 随餐）',
      fieldPath: 'basic.addTiming',
    });
  }

  // ⑩ 上架条件项只校验「填了就必须合法」；开关联动留给功能校验。
  const openedShelfLifeDays = payload.retail.openedShelfLifeDays;
  if (
    openedShelfLifeDays !== null &&
    (!Number.isFinite(openedShelfLifeDays) ||
      !Number.isInteger(openedShelfLifeDays) ||
      openedShelfLifeDays <= 0)
  ) {
    issues.push({
      code: 'OPENED_SHELF_LIFE_DAYS_INVALID',
      level: 'BLOCKER',
      message: '开盖后保质期必须填正整数天',
      fieldPath: 'retail.openedShelfLifeDays',
    });
  }

  return issues;
}
