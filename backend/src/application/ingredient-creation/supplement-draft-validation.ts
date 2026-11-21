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
import type { SupplementCatalogIssue } from '../supplement-shop/supplement-catalog-issues';
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
  | 'OPENED_SHELF_LIFE_DAYS_INVALID'
  /** 功能校验（需要查库/查目录）：spec §7.2 */
  | 'DUPLICATE_INGREDIENT'
  | 'LABEL_NAME_UNVERIFIED'
  | 'RETAIL_BLOCKED_BY_ISSUES'
  | 'CATALOG_WARNING'
  | 'NO_SALE_REASON_REQUIRED'
  | 'NO_SALE_REASON_INVALID'
  | 'SHELF_LIFE_INVALID'
  | 'DIY_LINK_REQUIRED'
  | 'DIY_PLATFORM_INVALID'
  | 'STORAGE_CONDITION_TOO_LONG'
  | 'PURCHASE_UNIT_TOO_LONG'
  | 'GROUP_INACTIVE'
  | 'GROUP_NOT_APPROVED'
  | 'GROUP_SINGLETON'
  | 'GROUP_SKIPPED'
  | 'SHOP_DISABLED'
  | 'EQUIVALENCE_DISABLED'
  | 'EVIDENCE_MISSING';

export interface SupplementDraftIssue {
  code: SupplementDraftIssueCode;
  level: SupplementDraftIssueLevel;
  message: string;
  /** 供前端定位到具体输入框；不要求展示给用户。 */
  fieldPath?: string;
  /** 需要人确认的提醒项：稳定 `${code}:${paramsHash}`（Task 6 起使用）。 */
  ackKey?: string;
}

/**
 * 草稿选中的等价组（查库后的快照）。
 *
 * 只带判定需要的字段：组名给文案，状态/开关/成员数决定提醒级别，
 * 营养素三件套用来解析草稿浓度。
 */
export interface SupplementDraftEquivalenceGroupContext {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  memberCount: number;
  nutrientKey: string;
  nutrientLabel: string;
  nutrientUnit: string;
}

/** 两本目录（饲料原料/饲料添加剂）的规范名核对结果。 */
export interface SupplementDraftCatalogContext {
  exactAdditive: boolean;
  exactMaterial: boolean;
  /** 名称的子串候选，最多 5 条；只作建议，不改变级别 */
  candidates: string[];
}

/**
 * 功能校验的外部上下文（`SupplementDraftReviewService.buildContext` 产出）。
 *
 * 基础校验只看草稿本身；功能校验要回答「重复了吗/目录里有吗/组还能用吗/
 * 商城开关开着吗」，这些都得先查库、查目录，查完一次性传进来。
 */
export interface SupplementDraftValidationContext {
  /** `evaluateSupplementIssues` 的上架体检结果（原样，由本函数过滤） */
  issues: SupplementCatalogIssue[];
  duplicate: { exists: boolean; existingName?: string };
  equivalenceGroup: SupplementDraftEquivalenceGroupContext | null;
  config: { shopEnabled: boolean; equivalenceEnabled: boolean };
  catalog: SupplementDraftCatalogContext;
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

/** 功能校验（spec §7.2 / §12.4 / §12.5）。 */
const STORAGE_CONDITION_MAX_LENGTH = 200;
const PURCHASE_UNIT_MAX_LENGTH = 50;
const CATALOG_CANDIDATE_LIMIT = 5;
/** 「暂不归组」的显式表态值，与 admin-web `launchConfigState.GROUP_SKIPPED` 一致。 */
const GROUP_SKIPPED_ID = '__SKIP__';
/** 不上架原因四选一（老板 2026-11-14 定）。 */
const NO_SALE_REASONS: readonly string[] = [
  'SELF_MADE',
  'BULK',
  'NO_SUPPLY',
  'UNDECIDED',
];
/**
 * DIY 购买平台允许值。
 *
 * 与 `domain/ingredient/types.ts` 的 `platform` 相比少了 `WEBVIEW`：
 * 那是站内商品页的展示形态，草稿的 DIY 入口只接受真实商品链接。
 */
const DIY_PLATFORMS: readonly string[] = [
  'TAOBAO',
  'JD',
  'PINDUODUO',
  'IHERB',
  'OTHER',
];

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

/* ------------------------------------------------------------------ */
/* 功能校验：需要查库/查目录的那部分（spec §7.2）                       */
/* ------------------------------------------------------------------ */

function blockerIssue(
  code: SupplementDraftIssueCode,
  message: string,
  fieldPath?: string,
): SupplementDraftIssue {
  return fieldPath
    ? { code, level: 'BLOCKER', message, fieldPath }
    : { code, level: 'BLOCKER', message };
}

/**
 * 提醒项。`paramsHash` 是「关键参数」：等价组 id、DIY 平台、不上架原因、
 * 标签名称等。改了对应字段哈希就变，旧确认自动失效（spec §7.3）。
 */
function warningIssue(
  code: SupplementDraftIssueCode,
  message: string,
  paramsHash?: string,
  fieldPath?: string,
): SupplementDraftIssue {
  const issue: SupplementDraftIssue = {
    code,
    level: 'WARNING',
    message,
    ackKey: paramsHash ? `${code}:${paramsHash}` : code,
  };
  if (fieldPath) {
    issue.fieldPath = fieldPath;
  }
  return issue;
}

function isInvalidPositiveInteger(value: number | null): boolean {
  return (
    value !== null &&
    (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0)
  );
}

/**
 * 功能校验入口（纯函数）。
 *
 * 与基础校验分开：这里每条规则都依赖 `context` 里查好的外部数据。
 * 返回顺序 = 审核屏阅读顺序：重复 → 标签 → 上架 → DIY → 长度 → 组 →
 * 开关 → 证据；级别由规则决定，不因上下文缺失而静默降级。
 */
export function validateSupplementDraftFeatures(
  payload: SupplementDraftPayload,
  context: SupplementDraftValidationContext,
): SupplementDraftIssue[] {
  const issues: SupplementDraftIssue[] = [];
  const { basic, retail, diy, evidence, equivalence } = payload;
  const name = basic.name.trim();

  // ① 重复建档（同名 + 同品牌 + 同规格）
  if (context.duplicate.exists) {
    issues.push(
      blockerIssue(
        'DUPLICATE_INGREDIENT',
        context.duplicate.existingName
          ? `同名同品牌同规格的补剂已存在：${context.duplicate.existingName}，请改名/改规格或直接使用已有记录`
          : '同名同品牌同规格的补剂已存在，请改名/改规格或直接使用已有记录',
        'basic.name',
      ),
    );
  }

  // ② 标签规范名：两本目录完全同名 → 通过；否则给候选，由人确认。
  if (
    name &&
    !context.catalog.exactAdditive &&
    !context.catalog.exactMaterial
  ) {
    const candidates = context.catalog.candidates.slice(
      0,
      CATALOG_CANDIDATE_LIMIT,
    );
    issues.push(
      warningIssue(
        'LABEL_NAME_UNVERIFIED',
        `「${name}」在两本目录里都找不到完全同名的规范名${
          candidates.length > 0 ? `，相近写法：${candidates.join('、')}` : ''
        }；请人工确认标签名称`,
        name,
        'label.labelNames',
      ),
    );
  }

  // ③ 上架体检：只在「上架=开」时有意义；重复与等价组由本函数其它规则负责。
  const catalogIssues = context.issues.filter(
    (issue) =>
      issue.code !== 'DUPLICATE_NAME' && !issue.code.startsWith('EQUIVALENCE_'),
  );
  if (retail.enabled) {
    const errors = catalogIssues.filter((issue) => issue.level === 'ERROR');
    if (errors.length > 0) {
      issues.push(
        blockerIssue(
          'RETAIL_BLOCKED_BY_ISSUES',
          `上架开关已打开，但有体检项不通过：${errors
            .map((issue) => issue.message)
            .join('；')}`,
          'retail.enabled',
        ),
      );
    }

    const warnings = catalogIssues.filter((issue) => issue.level === 'WARN');
    if (warnings.length > 0) {
      issues.push(
        warningIssue(
          'CATALOG_WARNING',
          `上架体检提醒：${warnings.map((issue) => issue.message).join('；')}`,
          warnings.map((issue) => issue.code).join(','),
          'retail.enabled',
        ),
      );
    }
  }

  // ④ 不上架原因：上架=关时必填且必须是四选一。
  if (!retail.enabled) {
    const reason = retail.noSaleReason?.trim() ?? '';
    if (!reason) {
      issues.push(
        blockerIssue(
          'NO_SALE_REASON_REQUIRED',
          '关闭上架时必须选择不上架原因',
          'retail.noSaleReason',
        ),
      );
    } else if (!NO_SALE_REASONS.includes(reason)) {
      issues.push(
        blockerIssue(
          'NO_SALE_REASON_INVALID',
          '不上架原因不在允许范围内（自制/散装/暂无稳定货源/待定）',
          'retail.noSaleReason',
        ),
      );
    }
  }

  // ⑤ 保质期：上架体检只查「缺」，这里补「填了但不合法」。
  if (isInvalidPositiveInteger(retail.shelfLifeMonths)) {
    issues.push(
      blockerIssue(
        'SHELF_LIFE_INVALID',
        '原厂保质期必须填正整数（月）',
        'retail.shelfLifeMonths',
      ),
    );
  }

  // ⑥ DIY：开就必须有平台 + 链接，平台还得在允许值内。
  if (diy.enabled) {
    const platform = diy.platform.trim();
    const linkUrl = diy.linkUrl.trim();
    if (!platform || !linkUrl) {
      issues.push(
        blockerIssue(
          'DIY_LINK_REQUIRED',
          '开启 DIY 时必须同时填写购买平台和购买链接',
          'diy.linkUrl',
        ),
      );
    }
    if (platform && !DIY_PLATFORMS.includes(platform)) {
      issues.push(
        blockerIssue(
          'DIY_PLATFORM_INVALID',
          `DIY 购买平台「${platform}」不在允许范围内（淘宝/京东/拼多多/iHerb/其它）`,
          'diy.platform',
        ),
      );
    }
  }

  // ⑦ 长度：finalize 绕过旧建档 DTO，这里必须自己拦。
  if (retail.storageCondition.trim().length > STORAGE_CONDITION_MAX_LENGTH) {
    issues.push(
      blockerIssue(
        'STORAGE_CONDITION_TOO_LONG',
        `储存条件不能超过 ${STORAGE_CONDITION_MAX_LENGTH} 字`,
        'retail.storageCondition',
      ),
    );
  }
  if (basic.purchaseUnit.trim().length > PURCHASE_UNIT_MAX_LENGTH) {
    issues.push(
      blockerIssue(
        'PURCHASE_UNIT_TOO_LONG',
        `采购单位不能超过 ${PURCHASE_UNIT_MAX_LENGTH} 字`,
        'basic.purchaseUnit',
      ),
    );
  }

  // ⑧ 等价组：存在/启停是阻断，审核状态/成员数是提醒，暂不归组是提醒。
  const groupId = equivalence.groupId;
  if (groupId === GROUP_SKIPPED_ID) {
    issues.push(
      warningIssue(
        'GROUP_SKIPPED',
        '已选择暂不归组：缺货时无法推荐同营养替代原料',
        GROUP_SKIPPED_ID,
        'equivalence.groupId',
      ),
    );
  } else if (groupId) {
    const group = context.equivalenceGroup;
    if (!group || !group.isActive || group.status === 'DISABLED') {
      issues.push(
        blockerIssue(
          'GROUP_INACTIVE',
          '等价组不存在或已停用，请重新选择',
          'equivalence.groupId',
        ),
      );
    } else {
      if (group.status !== 'APPROVED') {
        issues.push(
          warningIssue(
            'GROUP_NOT_APPROVED',
            `等价组「${group.name}」还未审核通过，加入后不参与替换`,
            group.id,
            'equivalence.groupId',
          ),
        );
      }
      if (group.memberCount <= 1) {
        issues.push(
          warningIssue(
            'GROUP_SINGLETON',
            `等价组「${group.name}」只有 1 个成员，等于不能替换`,
            group.id,
            'equivalence.groupId',
          ),
        );
      }
    }
  }

  // ⑨ 商城/等价组总开关：写入后功能不生效，必须让人知道。
  if (!context.config.shopEnabled) {
    issues.push(
      warningIssue('SHOP_DISABLED', '补剂商城总开关是关闭的，写入后顾客看不到'),
    );
  }
  if (!context.config.equivalenceEnabled) {
    issues.push(
      warningIssue(
        'EQUIVALENCE_DISABLED',
        '等价组总开关是关闭的，归组也不会参与替换',
      ),
    );
  }

  // ⑩ 证据：建议留档，不阻断手填。
  const missingEvidence: string[] = [];
  if (!evidence.frontImageUrl.trim()) {
    missingEvidence.push('正面图');
  }
  if (!evidence.labelImageUrl.trim()) {
    missingEvidence.push('标签图');
  }
  if (missingEvidence.length > 0) {
    issues.push(
      warningIssue(
        'EVIDENCE_MISSING',
        `缺少${missingEvidence.join('和')}，建议留档；没有也能手填，但事后无法回查`,
        undefined,
        'evidence',
      ),
    );
  }

  return issues;
}
