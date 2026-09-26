/**
 * 试吃装定价（应用层）
 *
 * 职责：把「数据库里的食谱」变成「定价服务能算的输入」，并给出**一套**试吃装的
 * 完整报价（商品价 + 运费），供三个场景复用：
 *   ① 后台配置试吃装时的实时试算
 *   ② 小程序商品详情页的实时价格
 *   ③ 备货生产单测算原料需求
 *
 * 口径说明（与鲜食对齐，不另造一套）：
 * - 原料方案默认走 `MARKET_PREMIUM`（商超优先），与顾客端参考价口径一致
 * - 倍率只作用于商品成本，运费按现有重量模板另计
 * - 起订量豁免：试吃装本身就是小额尝鲜，不走 minOrderWeightG 校验
 */

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import {
  PricingService,
  type RecipeItem as PricingRecipeItem,
  type TastingPackRecipeInput,
} from '../../domain/pricing/pricing.service';
import { applyPriceRounding } from '../../domain/pricing/price-rounding';
import {
  INGREDIENT_SOURCE_PLANS,
  type IngredientSourcePlanCode,
} from '../../domain/order/ingredient-source-plan';
import { IngredientType } from '../../domain/ingredient/enums';
import type { Ingredient } from '../../domain/ingredient/ingredient.entity';
import { GlobalConfigService } from '../config/global-config.service';
import { OrderSourcePlanService } from '../order/order-source-plan.service';
import { ShippingService } from '../shipping/shipping.service';
import { TastingPackConfigService } from './tasting-pack-config.service';
import { INGREDIENT_REPOSITORY } from '../ingredient/ingredient.service';
import { RECIPE_REPOSITORY } from '../dog/dog.service';
import {
  extractLegacyPreparationMethodIds,
  resolvePreparationMethodText,
} from '../recipe/preparation-method-text.util';

/** 一道菜在试吃装里的规格 */
export interface TastingPackRecipeSpec {
  recipeId: string;
  /** 这道菜装几袋 */
  packageCount: number;
  /** 每袋多少克 */
  packageSpecG: number;
}

export interface TastingPackQuote {
  /** 每套商品价（实收，已圆整） */
  unitPrice: number;
  /** 每套划线价（正装口径，已圆整） */
  unitListPrice: number;
  /** 实际用于定价的单套成本 */
  unitCost: number;
  /** 按今天原料价重算的单套成本（与 unitCost 对比可看出批次成本偏离多少） */
  liveUnitCost: number;
  /** 本次定价用的成本基数 */
  costBasis: 'MANUAL' | 'STOCK_BATCH' | 'LIVE';
  sets: number;
  amountProduct: number;
  amountShipping: number;
  amountTotal: number;
  totalNetFoodWeightG: number;
  totalPacks: number;
  totalWeightWithPackagingG: number;
  perRecipe: Array<{
    recipeId: string;
    recipeName: string;
    packageCount: number;
    packageSpecG: number;
    netWeightG: number;
    costIngredients: number;
  }>;
  costBreakdown: {
    costIngredients: number;
    costPackaging: number;
    costLabor: number;
    costOverhead: number;
    totalProductCost: number;
  };
  /** 本次报价用的参数快照，便于后台核对"为什么是这个价" */
  pricingParams: {
    tastingMultiplier: number;
    priceRoundingMode: string;
    targetMargin: number;
    ingredientSourcePlan: IngredientSourcePlanCode;
  };
}

const DEFAULT_SOURCE_PLAN: IngredientSourcePlanCode = 'MARKET_PREMIUM';

@Injectable()
export class TastingPackPricingService {
  constructor(
    private readonly pricingService: PricingService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly tastingPackConfigService: TastingPackConfigService,
    private readonly orderSourcePlanService: OrderSourcePlanService,
    private readonly shippingService: ShippingService,
    private readonly prisma: PrismaService,
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: {
      findLatestPublicById(id: string): Promise<any>;
    },
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: {
      findByIds(ids: string[]): Promise<Ingredient[]>;
    },
  ) {}

  /**
   * 把食谱 id + 规格，组装成定价服务能算的输入。
   *
   * 注意：这里**不**走订单里那套"补剂采购替代品"逻辑 ——
   * 试吃装是我们自己做、自己卖，用哪个品牌的补剂由我们自己定，
   * 不是顾客在 DIY 单里挑的。
   */
  /**
   * 加载一套菜的"原始素材"：食谱本身 + 原料映射 + 制备方法映射。
   *
   * 定价只要最后那个可直接计算的形状；**备货生产**还需要原始食谱
   * （要产出生产用的配方快照），因此把加载单独抽出来，两条路共用一份实现。
   */
  async loadPackContext(params: {
    specs: TastingPackRecipeSpec[];
    ingredientSourcePlan?: IngredientSourcePlanCode | null;
  }): Promise<
    Array<{
      spec: TastingPackRecipeSpec;
      recipe: any;
      ingredientMap: Map<string, Ingredient>;
      prepMethodMap: Map<string, string>;
      netWeightG: number;
    }>
  > {
    const { specs } = params;
    if (!Array.isArray(specs) || specs.length === 0) {
      throw new NotFoundException('试吃装至少要配置一道菜');
    }

    const sourcePlan = this.resolveSourcePlan(params.ingredientSourcePlan);

    const recipes = await Promise.all(
      specs.map((spec) => this.recipeRepository.findLatestPublicById(spec.recipeId)),
    );

    const missing = specs
      .map((spec, index) => ({ spec, recipe: recipes[index] }))
      .filter((entry) => !entry.recipe)
      .map((entry) => entry.spec.recipeId);
    if (missing.length > 0) {
      throw new NotFoundException(
        `食谱没有已公开的版本: ${missing.join(', ')}`,
      );
    }

    // 一次性把所有菜的原料取出来，避免 N 次查询
    const allIngredientIds = Array.from(
      new Set(
        recipes.flatMap((recipe) =>
          (recipe.items || []).map((item: any) => item.ingredientId),
        ),
      ),
    );
    const ingredients = await this.ingredientRepository.findByIds(
      allIngredientIds,
    );
    const catalogById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );

    // 原料方案（商超优先/有机/批发）一次性套到全部原料上
    const sourcePlanMap =
      await this.orderSourcePlanService.applySourcePlanToIngredients(
        ingredients,
        sourcePlan,
      );

    const prepMethodMap = await this.loadPreparationMethodNameMap(
      recipes.flatMap((recipe) =>
        (recipe.items || []).map((item: any) => item.preparationMethod),
      ),
    );

    return specs.map((spec, index) => {
      const recipe = recipes[index];
      const ingredientMap = new Map<string, Ingredient>();
      for (const ri of recipe.items || []) {
        const ingredient =
          sourcePlanMap.get(ri.ingredientId) ||
          catalogById.get(ri.ingredientId);
        if (!ingredient) {
          throw new NotFoundException(`原料不存在: ${ri.ingredientId}`);
        }
        ingredientMap.set(ri.ingredientId, ingredient);
      }

      return {
        spec,
        recipe,
        ingredientMap,
        prepMethodMap,
        netWeightG: spec.packageCount * spec.packageSpecG,
      };
    });
  }

  /** 定价输入：把上面的原始素材转成定价服务能算的形状 */
  async buildPackRecipes(params: {
    specs: TastingPackRecipeSpec[];
    ingredientSourcePlan?: IngredientSourcePlanCode | null;
  }): Promise<TastingPackRecipeInput[]> {
    const contexts = await this.loadPackContext(params);

    return contexts.map((context) => {
      const { recipe, ingredientMap, prepMethodMap, spec } = context;
      const pricingItems: PricingRecipeItem[] = (recipe.items || []).map(
        (ri: any) => {
          const ingredient = ingredientMap.get(ri.ingredientId)!;
          return {
            id: ri.id,
            ingredientId: ingredient.id,
            ingredient,
            preparationMethod:
              resolvePreparationMethodText(ri.preparationMethod, prepMethodMap, {
                preserveUnresolvedLegacy: false,
              }) ?? null,
            ratioPercent: ri.ratioPercent ?? null,
            exampleWeight: ri.exampleWeight ?? null,
            nutrientTargetKey: ri.nutrientTargetKey ?? null,
            nutrientTargetValue: ri.nutrientTargetValue ?? null,
            supplementTargets: ri.supplementTargets ?? null,
          };
        },
      );

      return {
        recipe: {
          id: recipe.id,
          name: recipe.name,
          productionLossRate: recipe.productionLossRate,
          batchLaborHours: recipe.batchLaborHours || 2.0,
          items: pricingItems,
        },
        packageCount: spec.packageCount,
        packageSpecG: spec.packageSpecG,
      };
    });
  }
  /**
   * 一套试吃装的报价（含运费）。
   *
   * `sets` 只影响乘数，不影响单价口径：
   * 单价始终按"一套"算，买 N 套 = 单价 × N，运费按 N 套的总重算。
   */
  async quote(params: {
    specs: TastingPackRecipeSpec[];
    sets?: number;
    ingredientSourcePlan?: IngredientSourcePlanCode | null;
    /** 商品手动定价覆盖（后台按商品设置）；有值时跳过自动算价 */
    manualUnitPrice?: number | null;
    /**
     * 库存批次的加权平均单套成本。
     *
     * 现货的售价应该按**仓库里那批货的实际成本**算，而不是按今天的原料价 ——
     * 卖的是早先做好的货，原料价波动不该让毛利凭空蒸发。
     * 传了就优先用它；没传（例如还没有库存、只是上架前预览）才回退到实时成本。
     */
    stockUnitCost?: number | null;
  }): Promise<TastingPackQuote> {
    const sets = this.normalizeSets(params.sets);
    const sourcePlan = this.resolveSourcePlan(params.ingredientSourcePlan);

    const [packRecipes, globalConfig, packConfig] = await Promise.all([
      this.buildPackRecipes({
        specs: params.specs,
        ingredientSourcePlan: sourcePlan,
      }),
      this.globalConfigService.getGlobalConfig(),
      this.tastingPackConfigService.getConfig(),
    ]);

    const pricing = await this.pricingService.calculateTastingPackPrice({
      recipes: packRecipes,
      tastingMultiplier: packConfig.tastingMultiplier,
      globalConfig,
    });

    const roundingMode = packConfig.priceRoundingMode;
    const manualUnitPrice =
      typeof params.manualUnitPrice === 'number' &&
      Number.isFinite(params.manualUnitPrice) &&
      params.manualUnitPrice > 0
        ? params.manualUnitPrice
        : null;

    const stockUnitCost =
      typeof params.stockUnitCost === 'number' &&
      Number.isFinite(params.stockUnitCost) &&
      params.stockUnitCost > 0
        ? params.stockUnitCost
        : null;

    // 定价用的成本基数：有库存批次成本就用批次成本，否则用实时成本
    const liveUnitCost = pricing.totalProductCost;
    const effectiveUnitCost = stockUnitCost ?? liveUnitCost;
    const costBasis: TastingPackQuote['costBasis'] = manualUnitPrice
      ? 'MANUAL'
      : stockUnitCost
        ? 'STOCK_BATCH'
        : 'LIVE';

    const autoUnitPrice = applyPriceRounding(
      effectiveUnitCost * packConfig.tastingMultiplier,
      roundingMode,
    );
    const unitPrice = manualUnitPrice ?? autoUnitPrice;
    // 划线价按同一成本基数、用鲜食口径反算，保证"立省"是真实的
    const unitListPrice = Math.max(
      applyPriceRounding(
        globalConfig.targetMargin < 1
          ? effectiveUnitCost / (1 - globalConfig.targetMargin)
          : effectiveUnitCost,
        roundingMode,
      ),
      unitPrice,
    );

    const amountProduct = this.roundMoney(unitPrice * sets);

    // 运费：按 N 套的总重（净重 + 包材重量）套现有重量模板
    const totalWeightWithPackagingG =
      (pricing.totalNetFoodWeightG + (pricing.weightPackagingG || 0)) * sets;

    let amountShipping = 0;
    try {
      const shippingResult =
        await this.shippingService.calculateShippingFeePreview({
          totalWeightG: totalWeightWithPackagingG,
          shippingTemplateId: null,
        });
      amountShipping = shippingResult.amountShipping;
    } catch (error) {
      // 与鲜食口径一致：运费算不出来时不阻塞报价，运费记 0 并在日志里留痕
      console.error('[TastingPackPricing] 运费计算失败:', error);
    }

    return {
      unitPrice,
      unitListPrice,
      unitCost: this.roundMoney(effectiveUnitCost),
      /** 按今天原料价重算的成本（用于对比：批次成本与当前成本差多少） */
      liveUnitCost: this.roundMoney(liveUnitCost),
      costBasis,
      sets,
      amountProduct,
      amountShipping,
      amountTotal: this.roundMoney(amountProduct + amountShipping),
      totalNetFoodWeightG: pricing.totalNetFoodWeightG * sets,
      totalPacks: pricing.totalPacks * sets,
      totalWeightWithPackagingG,
      perRecipe: pricing.perRecipe.map((entry) => {
        const spec = params.specs.find(
          (item) => item.recipeId === entry.recipeId,
        );
        return {
          recipeId: entry.recipeId,
          recipeName: entry.recipeName,
          packageCount: entry.packageCount,
          packageSpecG: entry.packageSpecG,
          netWeightG: entry.totalNetFoodWeightG * sets,
          costIngredients: this.roundMoney(entry.costIngredients * sets),
        };
      }),
      costBreakdown: {
        costIngredients: this.roundMoney(pricing.costIngredients * sets),
        costPackaging: this.roundMoney(pricing.costPackaging * sets),
        costLabor: this.roundMoney(pricing.costLabor * sets),
        costOverhead: this.roundMoney(pricing.costOverhead * sets),
        totalProductCost: this.roundMoney(pricing.totalProductCost * sets),
      },
      pricingParams: {
        tastingMultiplier: packConfig.tastingMultiplier,
        priceRoundingMode: roundingMode,
        targetMargin: globalConfig.targetMargin,
        ingredientSourcePlan: sourcePlan,
      },
    };
  }

  /**
   * 备货用料测算：做 N 套需要哪些原料、各多少。
   *
   * 返回的 `ingredientDetails` 与订单的
   * `pricingBreakdownSnapshot.ingredientDetails` **同构**，
   * 这样现有采购清单生成逻辑可以原样复用，不必为备货另写一套。
   */
  async buildStockRequirement(params: {
    specs: TastingPackRecipeSpec[];
    sets: number;
    ingredientSourcePlan?: IngredientSourcePlanCode | null;
  }): Promise<{
    sets: number;
    totalNetFoodWeightG: number;
    totalPacks: number;
    ingredientDetails: Array<Record<string, any>>;
    perRecipe: Array<{
      recipeId: string;
      recipeName: string;
      netWeightG: number;
      packageCount: number;
      packageSpecG: number;
    }>;
  }> {
    const sets = this.normalizeSets(params.sets);
    const sourcePlan = this.resolveSourcePlan(params.ingredientSourcePlan);

    const [packRecipes, globalConfig, packConfig] = await Promise.all([
      this.buildPackRecipes({
        specs: params.specs,
        ingredientSourcePlan: sourcePlan,
      }),
      this.globalConfigService.getGlobalConfig(),
      this.tastingPackConfigService.getConfig(),
    ]);

    const pricing = await this.pricingService.calculateTastingPackPrice({
      recipes: packRecipes,
      tastingMultiplier: packConfig.tastingMultiplier,
      globalConfig,
    });

    return {
      sets,
      totalNetFoodWeightG: pricing.totalNetFoodWeightG * sets,
      totalPacks: pricing.totalPacks * sets,
      // 备货按"套数"整体放大用量；采购清单读的是 amount / purchaseAmount
      ingredientDetails: pricing.ingredientDetails.map((detail) => ({
        ...detail,
        amount: detail.amount * sets,
        netAmount:
          detail.netAmount === undefined ? undefined : detail.netAmount * sets,
        purchaseAmount:
          detail.purchaseAmount === undefined
            ? undefined
            : detail.purchaseAmount * sets,
        cost: detail.cost * sets,
      })),
      perRecipe: pricing.perRecipe.map((entry) => ({
        recipeId: entry.recipeId,
        recipeName: entry.recipeName,
        netWeightG: entry.totalNetFoodWeightG * sets,
        packageCount: entry.packageCount * sets,
        packageSpecG: entry.packageSpecG,
      })),
    };
  }

  private resolveSourcePlan(
    value: IngredientSourcePlanCode | null | undefined,
  ): IngredientSourcePlanCode {
    const codes = Object.keys(INGREDIENT_SOURCE_PLANS);
    if (value && codes.includes(value)) {
      return value;
    }
    return DEFAULT_SOURCE_PLAN;
  }

  private normalizeSets(sets: number | undefined): number {
    const value = Number(sets ?? 1);
    if (!Number.isInteger(value) || value < 1) {
      return 1;
    }
    return value;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(
      methods.map((method: { id: string; name: string }) => [
        method.id,
        method.name,
      ]),
    );
  }
}
