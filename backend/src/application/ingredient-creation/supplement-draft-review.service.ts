/**
 * 补剂草稿 · 最终审核（服务层）。
 *
 * 把「审核屏需要的全部证据」一次查齐：
 * - 上架体检（`evaluateSupplementIssues`，复用上架清单同一套纯函数）；
 * - 重复建档、等价组、商城/等价组总开关、两本目录的规范名；
 * - 基础校验 + 功能校验合并后的阻断项/提醒项；
 * - 草稿完成度（列表/编辑页顶部同一口径）。
 *
 * 关键点：草稿还没有 ingredient 行，所以这里构造一份**合成原料**
 * （`id: 'draft'`、`type: 'SUPPLEMENT'`、营养档案由 `buildSupplementProfile` 算）。
 * 浓度解析与等价组推荐都只读这份对象，不需要先写库。
 *
 * 本服务于 Task 9 的草稿接口：
 * - `validate` → `POST :id/validate` / finalize 前置校验；
 * - `recommendGroups` → `POST :id/recommend-groups`；
 * - `buildContext` 同时给 Task 8 的 AI 起草复用（不重复查库）。
 */

import { Injectable } from '@nestjs/common';
import { FeedAdditiveCatalogService } from '../../domain/ingredient/feed-additive-catalog.service';
import { FeedMaterialCatalogService } from '../../domain/ingredient/feed-material-catalog.service';
import type { NutritionProfileV2 } from '../../domain/ingredient/types';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  evaluateSupplementIssues,
  type SupplementCatalogIssue,
  type SupplementIssueConcentration,
} from '../supplement-shop/supplement-catalog-issues';
import {
  type ConcentrationResolution,
  SupplementDosageService,
} from '../supplement-shop/supplement-dosage.service';
import {
  describeRecommendation,
  sortRecommendations,
  type RecommendationCandidate,
} from '../supplement-shop/supplement-equivalence-recommend.logic';
import { SUPPLEMENT_SHOP_CONFIG_ID } from '../supplement-shop/supplement-shop-config.service';
import {
  computeDraftCompleteness,
  type DraftCompleteness,
} from './supplement-draft-completeness';
import { buildSupplementProfile } from './supplement-draft-profile';
import {
  SupplementDraftService,
  type SupplementDraftView,
} from './supplement-draft.service';
import type {
  SupplementBaseUnit,
  SupplementDraftPayload,
  SupplementPhysicalForm,
} from './supplement-draft.types';
import {
  validateSupplementDraftBasics,
  validateSupplementDraftFeatures,
  type SupplementDraftIssue,
  type SupplementDraftValidationContext,
  type SupplementDraftCatalogContext,
} from './supplement-draft-validation';

/** 「暂不归组」的显式表态值（与 admin-web / 校验模块一致）。 */
const GROUP_SKIPPED_ID = '__SKIP__';

/** 与 `SupplementEquivalenceRecommendService` 同一上限，避免审核屏一次列几百个组。 */
const MAX_GROUP_RECOMMENDATIONS = 8;

/** 组推荐的最大查询条数（与现有推荐服务一致）。 */
const GROUP_QUERY_LIMIT = 200;

/** 审核结果：草稿原文 + 两类问题 + 完成度。 */
export interface SupplementDraftReview {
  draft: SupplementDraftView;
  blockers: SupplementDraftIssue[];
  warnings: SupplementDraftIssue[];
  completeness: DraftCompleteness;
}

/** 组推荐候选：在现有 RecommendCandidate 上补一句给人看的结论。 */
export interface SupplementGroupRecommendation extends RecommendationCandidate {
  reason: string;
}

export interface SupplementDraftGroupRecommendations {
  /** 等价组总开关；关着时候选也不会真正参与替换 */
  equivalenceEnabled: boolean;
  candidates: SupplementGroupRecommendation[];
}

/**
 * 草稿的合成原料。
 *
 * 字段名与 Prisma `Ingredient` 对齐（`properties` 用 snake_case 原始键），
 * 这样 `SupplementDosageService.resolveConcentration` 不用为草稿开分支。
 */
interface DraftIngredientLike {
  id: 'draft';
  type: 'SUPPLEMENT';
  name: string;
  brand: string;
  productModel: string;
  baseUnit: SupplementBaseUnit;
  unitDisplayLabel: string;
  purchaseUnit: string;
  properties: {
    display_unit: string;
    serving_unit_label: string;
    serving_units_per_dose: number | null;
    add_timing: string;
    production_loss_rate: number;
  };
  nutritionProfile: NutritionProfileV2;
  physicalForm: SupplementPhysicalForm | null;
  currentPricePerPurchaseUnit: number | null;
  purchaseToBaseRatio: number | null;
  shelfLifeMonths: number | null;
  storageCondition: string;
  supplementRetailEnabled: boolean;
  diyEnabled: boolean;
  procurementEnabled: boolean;
  equivalenceGroupId: string | null;
}

@Injectable()
export class SupplementDraftReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draftService: SupplementDraftService,
    private readonly dosage: SupplementDosageService,
    private readonly feedAdditive: FeedAdditiveCatalogService,
    private readonly feedMaterial: FeedMaterialCatalogService,
  ) {}

  /**
   * 查齐功能校验需要的外部数据。
   *
   * 公开是给 Task 8 的 AI 起草复用的：AI 起草也要知道「这个名字重复吗、
   * 目录里有没有、能归哪些组、商城开着吗」，不该再实现一遍查询。
   */
  async buildContext(
    payload: SupplementDraftPayload,
  ): Promise<SupplementDraftValidationContext> {
    const name = payload.basic.name.trim();
    const brand = payload.basic.brand.trim() || null;
    const productModel = payload.basic.productModel.trim() || null;
    const selectedGroupId =
      payload.equivalence.groupId &&
      payload.equivalence.groupId !== GROUP_SKIPPED_ID
        ? payload.equivalence.groupId
        : null;

    const [duplicate, group, config] = await Promise.all([
      name
        ? this.prisma.ingredient.findFirst({
            where: { type: 'SUPPLEMENT', name, brand, productModel },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
      selectedGroupId
        ? this.prisma.supplementEquivalenceGroup.findUnique({
            where: { id: selectedGroupId },
            select: {
              id: true,
              name: true,
              status: true,
              isActive: true,
              nutrientKey: true,
              nutrientLabel: true,
              nutrientUnit: true,
              _count: { select: { ingredients: true } },
            },
          })
        : Promise.resolve(null),
      this.prisma.supplementShopConfig.findUnique({
        where: { id: SUPPLEMENT_SHOP_CONFIG_ID },
        select: { enabled: true, equivalenceEnabled: true },
      }),
    ]);

    const ingredient = this.buildDraftIngredient(payload);
    const concentration = group
      ? this.toIssueConcentration(
          this.dosage.resolveConcentration(ingredient, {
            fieldPath: group.nutrientKey,
            label: group.nutrientLabel,
            unit: group.nutrientUnit,
            targetValuePerKg: 1,
          }),
        )
      : null;

    const issues = evaluateSupplementIssues({
      price: payload.basic.currentPricePerPurchaseUnit ?? 0,
      purchaseToBaseRatio: payload.basic.purchaseToBaseRatio ?? 0,
      physicalForm: payload.basic.physicalForm,
      baseUnit: payload.basic.baseUnit,
      unitDisplayLabel: payload.basic.unitDisplayLabel,
      // 草稿没有 `properties.display_unit` 的历史包袱，展示单位就是 unitDisplayLabel。
      displayUnit: payload.basic.unitDisplayLabel,
      propertiesDisplayUnit: null,
      shelfLifeMonths: payload.retail.shelfLifeMonths,
      storageCondition: payload.retail.storageCondition,
      // 体检只区分「重名 >1」；具体重复由 feature 校验单独阻断。
      sameNameCount: duplicate ? 2 : 1,
      equivalenceGroup: group
        ? {
            name: group.name,
            status: group.status,
            isActive: group.isActive,
            memberCount: group._count.ingredients,
            nutrientLabel: group.nutrientLabel,
            nutrientUnit: group.nutrientUnit,
          }
        : null,
      concentration,
    });

    return {
      issues,
      duplicate: duplicate
        ? { exists: true, existingName: duplicate.name }
        : { exists: false },
      equivalenceGroup: group
        ? {
            id: group.id,
            name: group.name,
            status: group.status,
            isActive: group.isActive,
            memberCount: group._count.ingredients,
            nutrientKey: group.nutrientKey,
            nutrientLabel: group.nutrientLabel,
            nutrientUnit: group.nutrientUnit,
          }
        : null,
      config: {
        shopEnabled: config?.enabled === true,
        equivalenceEnabled: config?.equivalenceEnabled === true,
      },
      catalog: this.buildCatalogContext(name),
    };
  }

  /**
   * 最终校验：基础 + 功能，按级别拆成 blockers/warnings。
   *
   * 草稿按创建人私有，`draftService.get` 已按 `createdBy` 过滤（别人的 id → 404）。
   */
  async validate(
    userId: string,
    draftId: string,
  ): Promise<SupplementDraftReview> {
    const draft = await this.draftService.get(draftId, userId);
    const context = await this.buildContext(draft.payload);

    const issues = [
      ...validateSupplementDraftBasics(draft.payload),
      ...validateSupplementDraftFeatures(draft.payload, context),
    ];

    return {
      draft,
      blockers: issues.filter((issue) => issue.level === 'BLOCKER'),
      warnings: issues.filter((issue) => issue.level === 'WARNING'),
      completeness: computeDraftCompleteness(draft.payload),
    };
  }

  /**
   * 草稿态等价组推荐：没有 ingredient 行也能算。
   *
   * 查询/排序/文案与 `SupplementEquivalenceRecommendService` 完全一致，
   * 只是「原料」换成草稿的合成对象；返回候选为空也照常返回开关状态。
   */
  async recommendGroups(
    userId: string,
    draftId: string,
  ): Promise<SupplementDraftGroupRecommendations> {
    const draft = await this.draftService.get(draftId, userId);
    const ingredient = this.buildDraftIngredient(draft.payload);

    const [groups, config] = await Promise.all([
      this.prisma.supplementEquivalenceGroup.findMany({
        where: { isActive: true, status: { not: 'DISABLED' } },
        take: GROUP_QUERY_LIMIT,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          nutrientKey: true,
          nutrientLabel: true,
          nutrientUnit: true,
          _count: { select: { ingredients: true } },
        },
      }),
      this.prisma.supplementShopConfig.findUnique({
        where: { id: SUPPLEMENT_SHOP_CONFIG_ID },
        select: { equivalenceEnabled: true },
      }),
    ]);

    const candidates: RecommendationCandidate[] = [];
    for (const group of groups) {
      const resolution = this.dosage.resolveConcentration(ingredient, {
        fieldPath: group.nutrientKey,
        label: group.nutrientLabel,
        unit: group.nutrientUnit,
        targetValuePerKg: 1,
      });

      // 完全没有这个营养素 → 这个组跟它无关，不进候选。
      if (resolution.status === 'MISSING') {
        continue;
      }

      candidates.push({
        groupId: group.id,
        code: group.code,
        name: group.name,
        status: group.status,
        memberCount: group._count.ingredients,
        sameUnit: resolution.status === 'OK',
        nutrientLabel: group.nutrientLabel,
        nutrientUnit: group.nutrientUnit,
        actualUnit:
          resolution.status === 'UNIT_MISMATCH' ? resolution.actualUnit : null,
        mismatchReason:
          resolution.status === 'UNIT_MISMATCH' ? resolution.reason : null,
      });
    }

    return {
      equivalenceEnabled: config?.equivalenceEnabled === true,
      candidates: sortRecommendations(candidates)
        .slice(0, MAX_GROUP_RECOMMENDATIONS)
        .map((candidate) => ({
          ...candidate,
          reason: describeRecommendation(candidate),
        })),
    };
  }

  /** 草稿 → 合成原料（只给浓度解析用，不落库）。 */
  private buildDraftIngredient(
    payload: SupplementDraftPayload,
  ): DraftIngredientLike {
    const { basic } = payload;
    return {
      id: 'draft',
      type: 'SUPPLEMENT',
      name: basic.name,
      brand: basic.brand,
      productModel: basic.productModel,
      baseUnit: basic.baseUnit,
      unitDisplayLabel: basic.unitDisplayLabel,
      purchaseUnit: basic.purchaseUnit,
      properties: {
        display_unit: basic.unitDisplayLabel,
        serving_unit_label: basic.unitDisplayLabel,
        serving_units_per_dose: basic.servingUnitsPerDose,
        add_timing: basic.addTiming,
        production_loss_rate: basic.productionLossRate,
      },
      nutritionProfile: buildSupplementProfile(payload),
      physicalForm: basic.physicalForm,
      currentPricePerPurchaseUnit: basic.currentPricePerPurchaseUnit,
      purchaseToBaseRatio: basic.purchaseToBaseRatio,
      shelfLifeMonths: payload.retail.shelfLifeMonths,
      storageCondition: payload.retail.storageCondition,
      supplementRetailEnabled: payload.retail.enabled,
      diyEnabled: payload.diy.enabled,
      procurementEnabled: payload.procurement.enabled,
      equivalenceGroupId: payload.equivalence.groupId,
    };
  }

  /** 两本目录：完全同名 + 合并去重后的子串候选（最多 5 条）。 */
  private buildCatalogContext(name: string): SupplementDraftCatalogContext {
    const exactAdditive = this.feedAdditive.get(name) !== null;
    const exactMaterial = this.feedMaterial.get(name) !== null;

    const candidates: string[] = [];
    const matches = [
      ...this.feedAdditive.lookup(name, 5),
      ...this.feedMaterial.lookup(name, 5),
    ];
    for (const match of matches) {
      if (candidates.length >= 5) break;
      if (!candidates.includes(match.name)) {
        candidates.push(match.name);
      }
    }

    return { exactAdditive, exactMaterial, candidates };
  }

  /** 浓度解析结果 → 上架体检需要的三态（丢值、只留状态/实际单位）。 */
  private toIssueConcentration(
    resolution: ConcentrationResolution,
  ): SupplementIssueConcentration {
    if (resolution.status === 'OK') {
      return { status: 'OK' };
    }
    if (resolution.status === 'UNIT_MISMATCH') {
      return { status: 'UNIT_MISMATCH', actualUnit: resolution.actualUnit };
    }
    return { status: 'MISSING' };
  }
}
