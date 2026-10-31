import { PREPARATION_FIELD_LABEL } from './preparation-field.constants';

/**
 * 食谱设计草稿「可发布 / 可下单」统一门槛（2026-10-22 · 发布门槛任务）。
 *
 * 为什么要有这个共享模块：
 *  · 产品线发布（`publishDraft`）与订单「加入待提交」（`publishOrderDesignSlot`）
 *    必须对「这份草稿能不能进入下一步」给出**完全一致**的结论；
 *  · 后台预览接口 `GET /api/v1/recipe-designer/drafts/:id/launch-readiness`
 *    也要展示同一份阻断项 / 提醒项，不能各算各的。
 *
 * 本文件只做**纯函数判断**：评估结果、报告是否可生成、原料预处理、补剂目标等
 * 都由调用方（RecipeDesignerService）准备好后传进来。这样：
 *  · 不重复 assessment 数学；
 *  · 单测可以直接覆盖各种阻断/提醒组合；
 *  · 不会在这里偷偷调用补剂目标推断（no inference）。
 *
 * 口径说明（本次实现约定）：
 *  · **名称**：系列名称优先，其次草稿名称；去空格后不能为空。
 *  · **参与评估的原料**：`includeInAssessment !== false` 的项才算，至少一项。
 *  · **总重量 / 能量密度**：以最新评估结果为准，不能用草稿上可能过期的缓存值。
 *  · **完整营养报告**：必须能通过
 *    `RecipeDesignerService.buildPublishedNutritionDetailedDataForDraft` 构建。
 *    构建失败时才阻断；只是「有营养项缺数据」但报告仍能生成时，只给提醒。
 *  · **补剂目标**：补剂必须已经显式保存 `supplementTargets`，且至少一条包含
 *    非空 `fieldPath` 和大于 0 的每 kg 目标值。每 kg 目标值在库里叫
 *    `targetValue`，早期/接口层叫 `targetValuePerKg`，两者都认（同一含义）。
 *    **不接受**只靠营养档案默认目标或按移除补剂后的缺口反推（no inference）。
 *  · **预处理方式**：必填类别的原料必须有非空 `preparationMethod`。
 *  · **制作步骤**：结构化步骤里至少有一条有效步骤，否则不能发布 / 加入待提交。
 *  · **评估未完全合规**：只是提醒（发布时仍需审核说明），不是硬阻断。
 *
 * 产品展示与设计分支（2026-10-22）：
 *  · 订单绑定（ORDER）必须先完成产品展示：封面图 + 封面标题；
 *  · 产品线（CATALOG）的阶段草稿只以 `Recipe.status=DRAFT` 存入系列仓库，
 *    封面图 / 封面标题 / 卖点等**展示资料已上移到系列层级**，由整系列发布
 *    （`series-release-readiness.ts`）统一检查 —— 阶段发布不再要求；
 *    因此调用方对 CATALOG 传 `requirePresentation=false`；
 *  · ORDER 额外要求系列上的订单号 / 本单份数，以及草稿绑定的顾客爱犬；
 *  · 公共营养提醒只出现一次（scope=COMMON），分支检查不得重复添加。
 */

/** 问题归属：公共门槛 / 产品展示 / 产品线分支 / 订单分支 */
export type LaunchReadinessScope =
  | 'COMMON'
  | 'PRESENTATION'
  | 'CATALOG'
  | 'ORDER';

export type LaunchReadinessBlockerCode =
  | 'NAME_REQUIRED'
  | 'NO_INCLUDED_ITEMS'
  | 'TOTAL_WEIGHT_INVALID'
  | 'ENERGY_DENSITY_INVALID'
  | 'ASSESSMENT_UNAVAILABLE'
  | 'NUTRITION_REPORT_UNAVAILABLE'
  | 'SUPPLEMENT_TARGETS_REQUIRED'
  | 'PREPARATION_METHOD_REQUIRED'
  | 'PRODUCTION_STEPS_REQUIRED'
  | 'COVER_IMAGE_REQUIRED'
  | 'COVER_TITLE_REQUIRED'
  | 'SELLING_POINT_REQUIRED'
  | 'ORDER_ID_REQUIRED'
  | 'ORDER_QUANTITY_INVALID'
  | 'CUSTOMER_DOG_REQUIRED';

export type LaunchReadinessWarningCode =
  | 'REVIEW_REQUIRED'
  | 'MISSING_NUTRITION_DATA'
  | 'NUTRIENT_OUT_OF_RANGE'
  | 'AI_DELIVERY_WARNING'
  | 'TARGET_HEALTH_TAGS_MISSING';

export interface LaunchReadinessIssue<TCode extends string = string> {
  code: TCode;
  message: string;
  /** 问题归属；旧客户端可忽略，后台可据此分组展示 */
  scope?: LaunchReadinessScope;
  /** 相关原料项 id（整份草稿级别的问题没有这个字段） */
  itemId?: string;
  /** 相关字段路径 / 字段名（便于后台定位） */
  field?: string;
}

export type LaunchReadinessBlocker =
  LaunchReadinessIssue<LaunchReadinessBlockerCode>;
export type LaunchReadinessWarning =
  LaunchReadinessIssue<LaunchReadinessWarningCode>;

export interface DraftLaunchReadinessSummary {
  /** 参与评估的原料项总数（含食材与补剂） */
  itemCount: number;
  /** 参与评估的食材种类数（不含补剂） */
  foodItemCount: number;
  totalWeightG: number;
  /** 成品基础能量密度（校验用，不优先展示） */
  energyDensityKcalPerKg: number | null;
  /** 干物质基础能量密度（展示优先） */
  dryMatterEnergyDensityKcalPerKg: number | null;
  /** 参与评估的补剂数 */
  supplementCount: number;
  /** 有效制作步骤数 */
  stepCount: number;
  /** 完整营养报告是否可生成（本次实时构建，不落库） */
  reportAvailable: boolean;
  /** 草稿上是否已保存过营养报告（不自动生成） */
  reportGenerated: boolean;
  /** 已保存报告是否基于旧 contentRevision（无报告时为 false） */
  reportStale: boolean;
}

export interface DraftLaunchReadiness {
  draftId: string;
  /**
   * 草稿所属系列（2026-10-27）。
   * 上线检查抽屉要用它做两件事：按系列起名、按系列挂需求分类。
   * 历史独立草稿没有系列，为 null。
   */
  seriesId: string | null;
  /** CATALOG（产品线）| ORDER（订单绑定），历史系列缺省按 CATALOG */
  designMode: string;
  ready: boolean;
  blockers: LaunchReadinessBlocker[];
  warnings: LaunchReadinessWarning[];
  summary: DraftLaunchReadinessSummary;
}

export interface LaunchReadinessItemInput {
  id: string;
  /** 原料库中的原料 id；用于「食材种类」去重，缺失时回退 item id */
  ingredientId?: string | null;
  name: string;
  /** includeInAssessment !== false */
  included: boolean;
  isSupplement: boolean;
  /**
   * 是否需要「部位 / 状态 / 预处理」。
   * 缺省 true（保守）；服务层按食材类别计算后显式传入。
   */
  preparationRequired?: boolean;
  preparationMethod?: string | null;
  /** 仅用于文档说明；判断时只认 preparationMethod */
  supplementTargets?: unknown;
}

/** 从评估结果里摘出门槛需要的字段，避免域函数依赖整份评估实现。 */
export interface LaunchReadinessAssessmentSnapshot {
  totalWeightG: number;
  energyDensityKcalPerKg: number | null;
  dryMatterEnergyDensityKcalPerKg: number | null;
  overallStatus: string;
  deficientCount: number;
  excessCount: number;
  missingDataCount: number;
  dataGaps: Array<{
    itemId: string;
    itemName: string;
    fieldPath: string;
    fieldLabel: string;
  }>;
}

/** 草稿上的产品展示字段（发布 / 加入待提交前统一检查）。 */
export interface LaunchReadinessPresentationInput {
  coverImageUrl?: string | null;
  coverTitle?: string | null;
  description?: string | null;
  sellingPoint?: string | null;
  applicableLifeStages?: string[] | null;
  targetHealthTags?: string[] | null;
}

/** 订单分支上下文：订单号 / 本单份数在系列上，顾客爱犬在草稿上。 */
export interface LaunchReadinessOrderInput {
  orderId?: string | null;
  orderQuantity?: number | null;
  customerDogId?: string | null;
}

export interface BuildDraftLaunchReadinessInput {
  draftId: string;
  seriesId?: string | null;
  designMode: string;
  /** 已解析的名称（系列名优先，其次草稿名；发布时可用最终食谱名） */
  name?: string | null;
  items: LaunchReadinessItemInput[];
  productionStepCount: number;
  assessment: LaunchReadinessAssessmentSnapshot | null;
  assessmentError?: string | null;
  reportAvailable: boolean;
  reportGenerated?: boolean;
  reportStale?: boolean;
  reportError?: string | null;
  presentation?: LaunchReadinessPresentationInput | null;
  order?: LaunchReadinessOrderInput | null;
  /**
   * 是否校验产品展示字段（封面图 / 封面标题 / 产品线卖点 / 健康标签提醒）。
   *
   * 默认 `true`（保持历史行为）。产品线（CATALOG）阶段发布传 `false`：
   * 展示资料在系列层级统一维护，整系列发布时才检查；
   * 订单（ORDER）设计必须传 `true` —— 阶段草稿进入「待提交」前就要有封面。
   */
  requirePresentation?: boolean;
}

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const isPositiveFiniteNumber = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 补剂目标是否可用：至少一条 `{ fieldPath, targetValuePerKg | targetValue }`，
 * 字段路径非空且每 kg 目标值 > 0。
 *
 * 这里只读**已保存的显式数据**，不做任何默认目标 / 缺口推断。
 */
export const hasValidSupplementTargets = (value: unknown): boolean => {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((entry) => {
    if (!isPlainObject(entry)) {
      return false;
    }
    const fieldPath = normalizeText(entry.fieldPath);
    if (!fieldPath) {
      return false;
    }
    const targetValuePerKg = entry.targetValuePerKg ?? entry.targetValue;
    return isPositiveFiniteNumber(targetValuePerKg);
  });
};

/** 预处理方式必须是非空字符串。 */
export const hasPreparationMethod = (value: unknown): boolean =>
  normalizeText(value).length > 0;

export const buildDraftLaunchReadiness = (
  input: BuildDraftLaunchReadinessInput,
): DraftLaunchReadiness => {
  const blockers: LaunchReadinessBlocker[] = [];
  const warnings: LaunchReadinessWarning[] = [];

  const includedItems = input.items.filter((item) => item.included);
  const supplementCount = includedItems.filter(
    (item) => item.isSupplement,
  ).length;
  const foodItemCount = new Set(
    includedItems
      .filter((item) => !item.isSupplement)
      .map((item) => item.ingredientId || item.id),
  ).size;

  if (!normalizeText(input.name)) {
    blockers.push({
      code: 'NAME_REQUIRED',
      scope: 'COMMON',
      message: '请填写食谱名称（系列名称或草稿名称）',
      field: 'name',
    });
  }

  if (includedItems.length === 0) {
    blockers.push({
      code: 'NO_INCLUDED_ITEMS',
      scope: 'COMMON',
      message: '请至少添加一个参与评估的食材',
      field: 'items',
    });
  }

  for (const item of includedItems) {
    if (
      (item.preparationRequired ?? true) &&
      !hasPreparationMethod(item.preparationMethod)
    ) {
      blockers.push({
        code: 'PREPARATION_METHOD_REQUIRED',
        scope: 'COMMON',
        message: `食材「${item.name}」未填写${PREPARATION_FIELD_LABEL}，不能发布或加入待提交`,
        itemId: item.id,
        field: 'preparationMethod',
      });
    }

    if (
      item.isSupplement &&
      !hasValidSupplementTargets(item.supplementTargets)
    ) {
      blockers.push({
        code: 'SUPPLEMENT_TARGETS_REQUIRED',
        scope: 'COMMON',
        message: `补剂「${item.name}」未填写有效的补剂目标：需要至少一条包含 fieldPath 且每 kg 目标值大于 0 的 supplementTargets`,
        itemId: item.id,
        field: 'supplementTargets',
      });
    }
  }

  const assessment = input.assessment;
  if (!assessment) {
    blockers.push({
      code: 'ASSESSMENT_UNAVAILABLE',
      scope: 'COMMON',
      message: `配方评估未完成，无法判断是否可发布${
        input.assessmentError ? `：${input.assessmentError}` : ''
      }`,
      field: 'assessment',
    });
  } else {
    if (!isPositiveFiniteNumber(assessment.totalWeightG)) {
      blockers.push({
        code: 'TOTAL_WEIGHT_INVALID',
        scope: 'COMMON',
        message: '配方总重量必须大于 0，请先确认各食材用量',
        field: 'totalWeightG',
      });
    }

    const energyDensity = assessment.energyDensityKcalPerKg;
    if (!isPositiveFiniteNumber(energyDensity)) {
      blockers.push({
        code: 'ENERGY_DENSITY_INVALID',
        scope: 'COMMON',
        message: '能量密度缺失或为 0，无法生成完整营养报告',
        field: 'energyDensityKcalPerKg',
      });
    } else if (!input.reportAvailable) {
      // 能量算得出来、报告却构建失败：这是真正的报告阻断，需要人工排查。
      blockers.push({
        code: 'NUTRITION_REPORT_UNAVAILABLE',
        scope: 'COMMON',
        message: `完整营养报告生成失败${
          input.reportError ? `：${input.reportError}` : ''
        }`,
        field: 'nutritionReport',
      });
    }
  }

  if (input.productionStepCount <= 0) {
    blockers.push({
      code: 'PRODUCTION_STEPS_REQUIRED',
      scope: 'COMMON',
      message: '请至少填写一个制作步骤',
      field: 'productionStepsJson',
    });
  }

  /**
   * 产品展示：订单绑定要求封面图 + 封面标题。
   * 只读草稿上已保存的值，不替用户生成或猜测。
   *
   * 产品线（CATALOG）由调用方传 `requirePresentation=false` 跳过：
   * 展示资料已上移到系列层级，阶段发布时不再重复要求。
   */
  const requirePresentation = input.requirePresentation !== false;
  const presentation = input.presentation ?? {};
  /**
   * 需求分类不再卡阶段入库（2026-10-31）：
   * 归类是系列级资料，只在整系列发布的 `series-release-readiness.ts` 里检查；
   * 阶段检查抽屉不再提供归类编辑，避免同一份资料出现两个维护入口。
   */

  if (requirePresentation && !normalizeText(presentation.coverImageUrl)) {
    blockers.push({
      code: 'COVER_IMAGE_REQUIRED',
      scope: 'PRESENTATION',
      message: '请上传封面图后再发布或加入待提交',
      field: 'coverImageUrl',
    });
  }
  if (requirePresentation && !normalizeText(presentation.coverTitle)) {
    blockers.push({
      code: 'COVER_TITLE_REQUIRED',
      scope: 'PRESENTATION',
      message: '请填写封面标题（最多 20 个字符）',
      field: 'coverTitle',
    });
  }

  const isOrderDesign = input.designMode === 'ORDER';
  if (isOrderDesign) {
    /** 订单绑定设计：必须能追溯到订单、本单份数与顾客爱犬。 */
    const order = input.order ?? {};
    if (!normalizeText(order.orderId)) {
      blockers.push({
        code: 'ORDER_ID_REQUIRED',
        scope: 'ORDER',
        message: '订单设计未绑定订单，请从订单重新打开设计',
        field: 'series.orderId',
      });
    }
    if (!isPositiveFiniteNumber(order.orderQuantity)) {
      blockers.push({
        code: 'ORDER_QUANTITY_INVALID',
        scope: 'ORDER',
        message: '订单份数缺失或无效，请重新打开订单设计',
        field: 'series.orderQuantity',
      });
    }
    if (!normalizeText(order.customerDogId)) {
      blockers.push({
        code: 'CUSTOMER_DOG_REQUIRED',
        scope: 'ORDER',
        message: '订单设计未绑定顾客爱犬，请从订单重新打开设计',
        field: 'customerDogId',
      });
    }
  } else if (requirePresentation) {
    /**
     * 产品线上架文案：只要求卖点。
     * 详情描述已停用（2026-10-22）；适用生命阶段由系列阶段统一决定，
     * 不在产品线资料里重复录入。
     */
    if (!normalizeText(presentation.sellingPoint)) {
      blockers.push({
        code: 'SELLING_POINT_REQUIRED',
        scope: 'CATALOG',
        message: '请填写一句话卖点（最多 200 个字符）',
        field: 'sellingPoint',
      });
    }
  }

  if (assessment) {
    if (assessment.overallStatus !== 'COMPLIANT') {
      warnings.push({
        code: 'REVIEW_REQUIRED',
        scope: 'COMMON',
        message:
          input.designMode === 'ORDER'
            ? `配方评估未完全合规（${assessment.overallStatus}），请复核后再加入待提交`
            : `配方评估未完全合规（${assessment.overallStatus}），发布正式食谱前需填写审核说明`,
        field: 'reviewNote',
      });
    }

    if (assessment.missingDataCount > 0) {
      const gapLabels = [
        ...new Set(
          assessment.dataGaps.map((gap) => `${gap.itemName}/${gap.fieldLabel}`),
        ),
      ];
      warnings.push({
        code: 'MISSING_NUTRITION_DATA',
        scope: 'COMMON',
        message: `有 ${assessment.missingDataCount} 项营养数据缺失${
          gapLabels.length > 0
            ? `（${gapLabels.slice(0, 3).join('、')}${
                gapLabels.length > 3 ? ' 等' : ''
              }）`
            : ''
        }；报告仍可生成，发布前请复核`,
        field: 'nutritionData',
      });
    }

    const outOfRangeCount = assessment.deficientCount + assessment.excessCount;
    if (outOfRangeCount > 0) {
      warnings.push({
        code: 'NUTRIENT_OUT_OF_RANGE',
        scope: 'COMMON',
        message: `有 ${assessment.deficientCount} 项营养不足、${assessment.excessCount} 项超标；报告仍可生成，发布前请复核`,
        field: 'nutrition',
      });
    }
  }

  /**
   * 产品线健康标签只提醒：没有标签仍可上线，但顾客无法按健康需求筛到它。
   * 订单定制不面向货架筛选，不提示这一项。
   * 展示检查关闭时（CATALOG 阶段发布）同样不提示 —— 整系列发布时才检查。
   */
  if (requirePresentation && !isOrderDesign) {
    const targetHealthTags = Array.isArray(presentation.targetHealthTags)
      ? presentation.targetHealthTags.filter((tag) => normalizeText(tag))
      : [];
    if (targetHealthTags.length === 0) {
      warnings.push({
        code: 'TARGET_HEALTH_TAGS_MISSING',
        scope: 'CATALOG',
        message: '未设置目标健康标签，上线后顾客无法按健康需求筛选到这道食谱',
        field: 'targetHealthTags',
      });
    }
  }

  return {
    draftId: input.draftId,
    seriesId: input.seriesId ?? null,
    designMode: input.designMode,
    ready: blockers.length === 0,
    blockers,
    warnings,
    summary: {
      itemCount: includedItems.length,
      foodItemCount,
      totalWeightG: assessment?.totalWeightG ?? 0,
      energyDensityKcalPerKg: assessment?.energyDensityKcalPerKg ?? null,
      dryMatterEnergyDensityKcalPerKg:
        assessment?.dryMatterEnergyDensityKcalPerKg ?? null,
      supplementCount,
      stepCount: Math.max(0, input.productionStepCount),
      reportAvailable: input.reportAvailable,
      reportGenerated: input.reportGenerated ?? false,
      // 没有保存过报告就谈不上过期；有报告时由调用方按 revision 判断。
      reportStale: Boolean(input.reportGenerated && input.reportStale),
    },
  };
};
