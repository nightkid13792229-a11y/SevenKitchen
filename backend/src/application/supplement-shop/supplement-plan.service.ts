import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { RecommendedProductService } from '../ingredient/recommended-product.service';
import { isSupplementUnitOneToOne } from './supplement-unit.util';
import {
  SupplementDosageResult,
  SupplementDosageService,
  SupplementTargetInput,
} from './supplement-dosage.service';
import { computeSheetTotalWeightG } from './supplement-sheet-weight.util';

/**
 * 补剂三口径：参考产品 / 预分装产品 / DIY 推荐商品（2026-11-15）。
 *
 * 为什么单独一个服务：以前「候选」一份数据同时决定了制作单显示什么、
 * 能不能推荐、能不能卖。现在拆开——
 *   · reference：食谱行引用的原料，只用于展示和用量换算，不看任何开关；
 *   · repackPool：等价组 ∩ 已上架（且分装档案可用），只服务预分装；
 *   · recommendedProducts：原料上挂的外链商品，只服务 DIY 推荐。
 */
export interface SupplementRepackOption {
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  displayUnit: string;
  unit: string;
  amount: number | null;
  available: boolean;
  unavailableReason: string | null;
  isDefault: boolean;
  /** 用量换算的浓度（写进订单快照用，不含价格） */
  concentrations: SupplementDosageResult['concentrations'];
}

export interface SupplementPlanReference {
  ingredientId: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  displayUnit: string;
  amount: number | null;
  unit: string;
  status: SupplementDosageResult['status'];
  targets: SupplementTargetInput[];
}

export interface SupplementPlanRecommendedProduct {
  id: string;
  name: string;
  brand: string | null;
  productModel: string | null;
  purchaseChannel: string | null;
  purchaseLink: unknown;
  imageUrl: string | null;
  displayUnit: string | null;
}

export interface SupplementPlanItem {
  recipeItemId: string;
  sourceIngredientId: string;
  name: string;
  preparationMethod: string | null;
  addTimingLabel: string | null;
  sortOrder: number;
  reference: SupplementPlanReference;
  recommendedProducts: SupplementPlanRecommendedProduct[];
  repackPool: SupplementRepackOption[];
}

export interface SupplementPlanResponse {
  totalWeightG: number;
  weightSource: 'DIY_SHEET' | 'QUERY';
  recipeVersion: number;
  items: SupplementPlanItem[];
}

function memberSortKey(ingredient: any): [number, string] {
  return [
    Number(ingredient?.equivalencePriority ?? 0),
    String(ingredient?.name ?? ''),
  ];
}

@Injectable()
export class SupplementPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dosage: SupplementDosageService,
    private readonly recommendedProducts: RecommendedProductService,
  ) {}

  /** 参考产品：只算展示与用量，不看上下架、不看生产、不看推荐。 */
  computeReference(
    ingredient: any,
    targets: SupplementTargetInput[],
    totalWeightG: number,
    fallbackAmount: number | null = null,
  ): SupplementPlanReference {
    const dosage = this.dosage.computeDosage({
      ingredient,
      targets,
      totalWeightG,
    });
    const amount =
      dosage.status === 'NO_TARGETS' && fallbackAmount !== null
        ? fallbackAmount
        : dosage.amount;
    return {
      ingredientId: ingredient.id,
      name: ingredient.name,
      brand: ingredient.brand ?? null,
      productModel: ingredient.productModel ?? null,
      displayUnit: dosage.unit,
      amount,
      unit: dosage.unit,
      status: dosage.status,
      targets: dosage.targets,
    };
  }

  /**
   * 预分装池：只收「已上架」的成员，不看 DIY 推荐开关。
   * 跨产品开关关闭时退化为「参考产品 + 食谱级旧备选」，保证老食谱不回退。
   */
  buildRepackPool(input: {
    reference: any;
    group: any;
    legacyAlternatives?: any[];
    equivalenceEnabled: boolean;
    targets: SupplementTargetInput[];
    totalWeightG: number;
    /** 没有营养目标、但食谱行配了固定比例时的兜底用量（g） */
    fallbackAmount?: number | null;
  }): SupplementRepackOption[] {
    const groupUsable = Boolean(
      input.equivalenceEnabled &&
        input.group &&
        input.group.status === 'APPROVED' &&
        input.group.isActive !== false &&
        Array.isArray(input.group.ingredients) &&
        input.group.ingredients.length >= 2,
    );

    const legacy = (input.legacyAlternatives ?? []).filter(
      (candidate) => candidate?.id && candidate.id !== input.reference?.id,
    );
    const members: any[] = groupUsable
      ? [...input.group.ingredients].sort((left, right) => {
          const [leftPriority, leftName] = memberSortKey(left);
          const [rightPriority, rightName] = memberSortKey(right);
          return leftPriority - rightPriority || leftName.localeCompare(rightName);
        })
      : [input.reference, ...legacy];

    const seen = new Set<string>();
    const entries: Array<{
      option: SupplementRepackOption;
      priority: number;
      isReference: boolean;
    }> = [];

    for (const member of members) {
      if (!member?.id || seen.has(member.id)) continue;
      seen.add(member.id);
      if (member.type !== 'SUPPLEMENT') continue;
      // 只收已上架；未上架 = 我们不卖，不该出现在预分装池里。
      if (member.supplementRetailEnabled !== true) continue;

      const dosage = this.dosage.computeDosage({
        ingredient: member,
        targets: input.targets,
        totalWeightG: input.totalWeightG,
      });
      // 没有营养目标的克数兜底只对参考产品成立：其他成员的浓度/单位不同，
      // 把参考的克数套到「粒/片」上会算错量和价。
      const isReference = member.id === input.reference?.id;
      const fallback =
        isReference && Number(input.fallbackAmount) > 0
          ? Number(input.fallbackAmount)
          : null;
      const reason = this.repackUnavailableReason(member, dosage, fallback);
      entries.push({
        priority: Number(member.equivalencePriority ?? 0),
        isReference,
        option: {
          ingredientId: member.id,
          name: member.name,
          brand: member.brand ?? null,
          productModel: member.productModel ?? null,
          displayUnit: dosage.unit,
          unit: dosage.unit,
          amount: reason
            ? null
            : dosage.status === 'NO_TARGETS'
              ? fallback
              : dosage.amount,
          available: !reason,
          unavailableReason: reason,
          isDefault: false,
          concentrations: dosage.concentrations,
        },
      });
    }

    entries.sort(
      (left, right) =>
        Number(right.option.available) - Number(left.option.available) ||
        Number(right.isReference) - Number(left.isReference) ||
        left.priority - right.priority ||
        left.option.name.localeCompare(right.option.name),
    );

    const options = entries.map((entry) => entry.option);
    const defaultOption = options.find((option) => option.available) ?? options[0];
    for (const option of options) {
      option.isDefault = option === defaultOption;
    }
    return options;
  }

  pickRepackOption(
    pool: SupplementRepackOption[],
    ingredientId: string,
  ): SupplementRepackOption | null {
    return (
      (pool ?? []).find((option) => option.ingredientId === ingredientId) ?? null
    );
  }

  private repackUnavailableReason(
    ingredient: any,
    dosage: SupplementDosageResult,
    fallbackAmount: number | null = null,
  ): string | null {
    if (ingredient?.physicalForm === 'LIQUID') {
      return '液体补剂暂不支持分装';
    }
    if (!isSupplementUnitOneToOne(dosage.unit || '', ingredient?.baseUnit)) {
      return `展示单位「${dosage.unit}」无法与库存基准单位 ${ingredient?.baseUnit} 1:1 对应`;
    }
    if (dosage.status === 'UNIT_MISMATCH') {
      return '有效成分单位与配方目标不一致';
    }
    if (dosage.status === 'MISSING_CONCENTRATION') {
      return '缺少配方目标的有效成分浓度';
    }
    if (dosage.status === 'NO_TARGETS') {
      if (fallbackAmount !== null) return null;
      return '这条补剂没有营养目标，无法换算';
    }
    if (
      dosage.amount === null ||
      !Number.isFinite(dosage.amount) ||
      dosage.amount <= 0
    ) {
      return '用量暂不可算';
    }
    return null;
  }

  /** 带制作单的入口：版本、总重都以制作单冻结的值为准。 */
  async resolveForRecipeRequest(input: {
    recipeId: string;
    recipeVersion: number;
    totalWeightG: number;
    diySheetId?: string;
    userId?: string;
  }): Promise<SupplementPlanResponse> {
    let totalWeightG = Number(input.totalWeightG);
    let weightSource: 'DIY_SHEET' | 'QUERY' = 'QUERY';
    let recipeVersion = Number(input.recipeVersion);

    if (input.diySheetId) {
      const sheet = await this.prisma.dIYSheet.findUnique({
        where: { id: input.diySheetId },
        select: {
          userId: true,
          recipeVersion: true,
          packagePlan: true,
          dailyIntakeG: true,
          cycleDays: true,
        },
      });
      if (!sheet) {
        throw new BadRequestException('制作单不存在');
      }
      if (input.userId && sheet.userId !== input.userId) {
        throw new BadRequestException('制作单不属于当前用户');
      }
      const fromSheet = computeSheetTotalWeightG(sheet);
      if (fromSheet > 0) {
        totalWeightG = fromSheet;
        weightSource = 'DIY_SHEET';
      }
      if (Number(sheet.recipeVersion) > 0) {
        recipeVersion = Number(sheet.recipeVersion);
      }
    }

    return this.resolveForRecipe({
      recipeBusinessId: input.recipeId,
      recipeVersion,
      totalWeightG,
      weightSource,
    });
  }

  async resolveForRecipe(input: {
    recipeBusinessId: string;
    recipeVersion: number;
    totalWeightG: number;
    weightSource: 'DIY_SHEET' | 'QUERY';
  }): Promise<SupplementPlanResponse> {
    const recipe = await this.prisma.recipe.findUnique({
      where: {
        recipeId_version: {
          recipeId: input.recipeBusinessId,
          version: input.recipeVersion,
        },
      },
      include: {
        items: {
          include: {
            ingredient: true,
            supplementAlternatives: {
              include: { alternativeIngredient: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!recipe) {
      // 冻结版本不存在 = 食谱已发布新版，顾客需要刷新制作单
      throw new BadRequestException('食谱已更新，请刷新制作单');
    }

    const supplementItems = recipe.items.filter(
      (item) => item.ingredient?.type === 'SUPPLEMENT',
    );

    const groupIds = Array.from(
      new Set(
        supplementItems
          .map((item) => item.ingredient?.equivalenceGroupId)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const [groups, config] = await Promise.all([
      groupIds.length
        ? this.prisma.supplementEquivalenceGroup.findMany({
            where: { id: { in: groupIds } },
            include: {
              ingredients: {
                orderBy: [{ equivalencePriority: 'asc' }, { name: 'asc' }],
              },
            },
          })
        : Promise.resolve([]),
      this.prisma.supplementShopConfig.findUnique({
        where: { id: 'singleton' },
        select: { equivalenceEnabled: true },
      }),
    ]);

    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const equivalenceEnabled = config?.equivalenceEnabled === true;

    const recommendedByIngredient = await this.recommendedProducts.batchFindActive(
      supplementItems.map((item) => item.ingredient.id),
    );

    return {
      totalWeightG: input.totalWeightG,
      weightSource: input.weightSource,
      recipeVersion: Number(recipe.version),
      items: supplementItems.map((item) => {
        const ingredient = item.ingredient;
        const targets = this.normalizeTargets(item);
        const group = ingredient.equivalenceGroupId
          ? (groupMap.get(ingredient.equivalenceGroupId) ?? null)
          : null;
        const ratioPercent = Number((item as any).ratioPercent);
        const fallbackAmount =
          targets.length === 0 &&
          Number.isFinite(ratioPercent) &&
          ratioPercent > 0
            ? (input.totalWeightG * ratioPercent) / 100
            : null;

        const legacyAlternatives = ((item as any).supplementAlternatives ?? [])
          .map((alternative: any) => alternative?.alternativeIngredient)
          .filter((candidate: any) => Boolean(candidate?.id));

        return {
          recipeItemId: item.id,
          sourceIngredientId: ingredient.id,
          name: ingredient.name,
          preparationMethod: item.preparationMethod ?? null,
          addTimingLabel:
            typeof (ingredient.properties as any)?.add_timing === 'string'
              ? (ingredient.properties as any).add_timing
              : null,
          sortOrder: Number(item.sortOrder ?? 0),
          reference: this.computeReference(
            ingredient,
            targets,
            input.totalWeightG,
            fallbackAmount,
          ),
          recommendedProducts: this.buildRecommendedProducts(
            ingredient,
            recommendedByIngredient[ingredient.id] ?? [],
          ),
          repackPool: this.buildRepackPool({
            reference: ingredient,
            group,
            legacyAlternatives,
            equivalenceEnabled,
            targets,
            totalWeightG: input.totalWeightG,
            fallbackAmount,
          }),
        };
      }),
    };
  }

  /**
   * DIY 推荐商品（2026-11-15）：
   *   · 后台配了「DIY制作单推荐商品」→ 用配好的（可多个，顾客自己挑）；
   *   · 没配、但原料档案里有购买链接 → 用原料本身兜底成 1 个，别让入口凭空消失；
   *   · 两者都没有 → 空数组，页面不显示入口（没有链接的入口等于死路）。
   */
  private buildRecommendedProducts(
    ingredient: any,
    configured: Array<{
      id: string;
      name: string;
      brand?: string | null;
      productModel?: string | null;
      purchaseChannel?: string | null;
      purchaseLink?: unknown;
      imageUrl?: string | null;
      displayUnit?: string | null;
    }>,
  ): SupplementPlanRecommendedProduct[] {
    if (configured.length > 0) {
      return configured.map((product) => ({
        id: product.id,
        name: product.name,
        brand: product.brand ?? null,
        productModel: product.productModel ?? null,
        purchaseChannel: product.purchaseChannel ?? null,
        purchaseLink: product.purchaseLink ?? null,
        imageUrl: product.imageUrl ?? null,
        displayUnit: product.displayUnit ?? null,
      }));
    }

    const properties = (ingredient?.properties ?? {}) as Record<string, any>;
    const link = properties.purchase_link;
    const url = typeof link?.url === 'string' ? link.url.trim() : '';
    if (!url) return [];

    return [
      {
        id: `ingredient-link-${ingredient.id}`,
        name: ingredient.name,
        brand: ingredient.brand ?? null,
        productModel: ingredient.productModel ?? null,
        purchaseChannel: ingredient.purchaseChannel ?? null,
        purchaseLink: link,
        imageUrl:
          typeof properties.image_url === 'string' ? properties.image_url : null,
        displayUnit: ingredient.unitDisplayLabel ?? null,
      },
    ];
  }

  /**
   * 旧版小程序兼容（一个版本周期）：把新计划映射成旧候选结构。
   * 内容按新口径（预分装池）重算，旧版仍能显示和下单。
   */
  toLegacyCandidates(plan: SupplementPlanResponse): {
    totalWeightG: number;
    weightSource: string;
    items: any[];
  } {
    return {
      totalWeightG: plan.totalWeightG,
      weightSource: plan.weightSource,
      items: plan.items.map((item) => {
        const available = item.repackPool.filter((option) => option.available);
        return {
          recipeItemId: item.recipeItemId,
          sourceIngredientId: item.sourceIngredientId,
          source: 'EQUIVALENCE_GROUP',
          group: null,
          defaultIngredient: {
            ingredientId: item.reference.ingredientId,
            name: item.reference.name,
            displayUnit: item.reference.displayUnit,
            physicalForm: null,
            diyEnabled: true,
            supplementRetailEnabled: available.length > 0,
            selectable: available.length > 0,
            unavailableReason: null,
            dosage: {
              status: item.reference.status,
              amount: item.reference.amount,
              unit: item.reference.unit,
              targets: item.reference.targets,
              concentrations: [],
              missingFieldPaths: [],
            },
          },
          candidates: available.map((option) => ({
            ingredientId: option.ingredientId,
            name: option.name,
            brand: option.brand,
            productModel: option.productModel,
            purchaseChannel: null,
            purchaseLink: null,
            imageUrl: null,
            physicalForm: null,
            displayUnit: option.displayUnit,
            isDefault: option.isDefault,
            selectable: true,
            unavailableReason: null,
            dosage: {
              status: 'OK',
              amount: option.amount,
              unit: option.unit,
              targets: item.reference.targets,
              concentrations: option.concentrations,
              missingFieldPaths: [],
            },
          })),
          fallbackAmount: null,
          unavailableReason:
            available.length > 0 ? null : '暂时买不到，找 Seven爸爸',
          preparationMethod: item.preparationMethod,
          addTimingLabel: item.addTimingLabel,
          sortOrder: item.sortOrder,
        };
      }),
    };
  }

  private normalizeTargets(recipeItem: any): SupplementTargetInput[] {
    const raw = recipeItem?.supplementTargets;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter(
          (target: any) =>
            target?.fieldPath &&
            Number.isFinite(Number(target?.targetValuePerKg)) &&
            Number(target.targetValuePerKg) > 0,
        )
        .map((target: any) => ({
          fieldPath: String(target.fieldPath),
          label: target.label ? String(target.label) : undefined,
          unit: String(target.unit ?? ''),
          targetValuePerKg: Number(target.targetValuePerKg),
        }));
    }

    const legacyKey = String(
      recipeItem?.nutrientTargetKey ??
        recipeItem?.nutrient_target_key ??
        '',
    ).trim();
    const legacyValue = Number(
      recipeItem?.nutrientTargetValue ??
        recipeItem?.nutrient_target_value ??
        0,
    );
    if (legacyKey && Number.isFinite(legacyValue) && legacyValue > 0) {
      return [
        {
          fieldPath: legacyKey,
          label: legacyKey,
          unit: '',
          targetValuePerKg: legacyValue,
        },
      ];
    }

    return [];
  }
}
