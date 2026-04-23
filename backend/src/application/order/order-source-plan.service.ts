import { BadRequestException, Injectable } from '@nestjs/common';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';
import { IngredientType } from '../../domain/ingredient/enums';
import {
  INGREDIENT_SOURCE_PLAN_FALLBACKS,
  INGREDIENT_SOURCE_PLANS,
  type IngredientSourcePlanCode,
  type IngredientSourceTierCode,
} from '../../domain/order/ingredient-source-plan';
import {
  ProcurementSkuService,
  type ProcurementSkuSummary,
} from '../ingredient/procurement-sku.service';

export type SourcePlanIngredient = Ingredient & {
  procurementSkuId?: string;
  procurementSkuName?: string;
  procurementSku?: ProcurementSkuSummary;
  procurementSkuSupplierName?: string | null;
  procurementSkuDisplayUnit?: string | null;
  procurementSkuSourceTier?: IngredientSourceTierCode | null;
  sourcePlanCode?: IngredientSourcePlanCode;
  sourcePlanFallbackLevel?: number;
};

type SelectedProcurementSku = {
  sku: ProcurementSkuSummary & { sourceTier: IngredientSourceTierCode };
  sourceTier: IngredientSourceTierCode;
  fallbackLevel: number;
};

@Injectable()
export class OrderSourcePlanService {
  constructor(private readonly procurementSkuService: ProcurementSkuService) {}

  async applySourcePlanToIngredients(
    ingredients: Ingredient[],
    planCode: IngredientSourcePlanCode,
  ): Promise<Map<string, Ingredient>> {
    const foodIds = ingredients
      .filter((ingredient) => ingredient.type === IngredientType.FOOD)
      .map((ingredient) => ingredient.id);

    const skuMap =
      foodIds.length > 0
        ? await this.procurementSkuService.batchFindActive(foodIds)
        : {};

    const result = new Map<string, Ingredient>();
    const missingIngredients: string[] = [];

    for (const ingredient of ingredients) {
      if (ingredient.type !== IngredientType.FOOD) {
        result.set(ingredient.id, ingredient);
        continue;
      }

      const selectedSku = this.selectSkuForPlan(
        skuMap[ingredient.id] || [],
        planCode,
      );

      if (!selectedSku) {
        missingIngredients.push(ingredient.name);
        result.set(ingredient.id, ingredient);
        continue;
      }

      result.set(
        ingredient.id,
        this.withProcurementSku(ingredient, selectedSku, planCode),
      );
    }

    if (missingIngredients.length > 0) {
      throw new BadRequestException(
        `部分食材缺少可用于${INGREDIENT_SOURCE_PLANS[planCode].label}的采购来源 SKU：${missingIngredients.join(
          '、',
        )}。请先在后台维护来源等级、采购单位、换算比例和价格。`,
      );
    }

    return result;
  }

  private selectSkuForPlan(
    skus: ProcurementSkuSummary[],
    planCode: IngredientSourcePlanCode,
  ): SelectedProcurementSku | undefined {
    const eligibleSkus = skus.filter(
      (
        sku,
      ): sku is ProcurementSkuSummary & {
        sourceTier: IngredientSourceTierCode;
      } => this.isEligibleSourceSku(sku),
    );

    const fallbackChain = INGREDIENT_SOURCE_PLAN_FALLBACKS[planCode];
    for (const [fallbackLevel, sourceTier] of fallbackChain.entries()) {
      const candidates = eligibleSkus.filter(
        (sku) => sku.sourceTier === sourceTier,
      );

      if (candidates.length === 0) {
        continue;
      }

      const selected = this.selectSkuByPlanCostPreference(
        candidates,
        planCode,
      );
      return {
        sku: selected,
        sourceTier,
        fallbackLevel,
      };
    }

    return undefined;
  }

  private isEligibleSourceSku(sku: ProcurementSkuSummary): boolean {
    const skuPrice = this.getSkuPurchasePrice(sku);

    return (
      Boolean(sku.sourceTier) &&
      Boolean(sku.purchaseUnit?.trim()) &&
      sku.purchaseToBaseRatio !== null &&
      sku.purchaseToBaseRatio !== undefined &&
      Number.isFinite(sku.purchaseToBaseRatio) &&
      sku.purchaseToBaseRatio > 0 &&
      skuPrice !== null &&
      skuPrice !== undefined &&
      Number.isFinite(skuPrice) &&
      skuPrice > 0
    );
  }

  private withProcurementSku(
    ingredient: Ingredient,
    selectedSku: SelectedProcurementSku,
    planCode: IngredientSourcePlanCode,
  ): SourcePlanIngredient {
    const { sku } = selectedSku;
    const skuPrice = this.getSkuPurchasePrice(sku);
    const pricingProfile = this.getUsablePricingProfile(sku, skuPrice);
    const currentPrice = pricingProfile
      ? pricingProfile.price
      : ingredient.currentPricePerPurchaseUnit;
    const effectivePrice = pricingProfile
      ? pricingProfile.price
      : ingredient.effectivePricePerPurchaseUnit;
    const purchaseUnit = pricingProfile
      ? (sku.purchaseUnit ?? ingredient.purchaseUnit)
      : ingredient.purchaseUnit;
    const purchaseToBaseRatio =
      pricingProfile?.purchaseToBaseRatio ?? ingredient.purchaseToBaseRatio;
    const properties = {
      ...ingredient.properties,
      procurement_sku_id: sku.id,
      procurement_sku_name: sku.name,
      procurement_sku_display_unit: sku.purchaseUnit,
      procurement_sku_supplier_name: sku.supplierName,
      procurement_sku_source_plan: planCode,
      procurement_sku_source_tier: selectedSku.sourceTier,
      procurement_sku_fallback_level: selectedSku.fallbackLevel,
    };

    const cloned = new Ingredient(
      ingredient.id,
      ingredient.name,
      ingredient.type,
      ingredient.procurementStrategy,
      ingredient.diyEnabled,
      ingredient.procurementEnabled,
      sku.brand ?? ingredient.brand,
      sku.productModel ?? ingredient.productModel,
      sku.purchaseChannel ?? ingredient.purchaseChannel,
      ingredient.notes,
      ingredient.baseUnit,
      ingredient.unitDisplayLabel,
      purchaseUnit,
      purchaseToBaseRatio,
      currentPrice,
      effectivePrice,
      ingredient.weightG,
      ingredient.maxCapacityG,
      ingredient.safetyStock,
      ingredient.reorderPoint,
      ingredient.targetStock,
      properties,
      ingredient.nutritionProfile,
    ) as SourcePlanIngredient;

    cloned.procurementSkuId = sku.id;
    cloned.procurementSkuName = sku.name;
    cloned.procurementSku = sku;
    cloned.procurementSkuSupplierName = sku.supplierName;
    cloned.procurementSkuDisplayUnit = sku.purchaseUnit;
    cloned.procurementSkuSourceTier = selectedSku.sourceTier;
    cloned.sourcePlanCode = planCode;
    cloned.sourcePlanFallbackLevel = selectedSku.fallbackLevel;

    return cloned;
  }

  private getUsablePricingProfile(
    sku: ProcurementSkuSummary,
    price: number | null | undefined,
  ): { price: number; purchaseToBaseRatio: number } | null {
    if (
      price !== null &&
      price !== undefined &&
      Number.isFinite(price) &&
      price > 0 &&
      sku.purchaseToBaseRatio !== null &&
      sku.purchaseToBaseRatio !== undefined &&
      Number.isFinite(sku.purchaseToBaseRatio) &&
      sku.purchaseToBaseRatio > 0
    ) {
      return { price, purchaseToBaseRatio: sku.purchaseToBaseRatio };
    }

    return null;
  }

  private selectSkuByPlanCostPreference<T extends ProcurementSkuSummary>(
    candidates: T[],
    planCode: IngredientSourcePlanCode,
  ): T {
    return planCode === 'WHOLESALE'
      ? this.selectSkuByUnitCost(candidates, 'LOWEST')
      : this.selectSkuByUnitCost(candidates, 'HIGHEST');
  }

  private selectSkuByUnitCost<T extends ProcurementSkuSummary>(
    candidates: T[],
    costPreference: 'HIGHEST' | 'LOWEST',
  ): T {
    return candidates
      .map((sku, index) => ({
        sku,
        index,
        unitCost: this.getSkuUnitCost(sku),
      }))
      .sort((left, right) => {
        if (left.unitCost !== right.unitCost) {
          return costPreference === 'LOWEST'
            ? left.unitCost - right.unitCost
            : right.unitCost - left.unitCost;
        }

        const nameCompare = left.sku.name.localeCompare(
          right.sku.name,
          'zh-Hans-CN',
        );
        if (nameCompare !== 0) {
          return nameCompare;
        }

        return (
          left.sku.id.localeCompare(right.sku.id) || left.index - right.index
        );
      })[0].sku;
  }

  private getSkuUnitCost(sku: ProcurementSkuSummary): number {
    const price = this.getSkuPurchasePrice(sku);
    if (
      price === null ||
      price === undefined ||
      !Number.isFinite(price) ||
      price <= 0 ||
      sku.purchaseToBaseRatio === null ||
      sku.purchaseToBaseRatio === undefined ||
      !Number.isFinite(sku.purchaseToBaseRatio) ||
      sku.purchaseToBaseRatio <= 0
    ) {
      return Number.POSITIVE_INFINITY;
    }

    return price / sku.purchaseToBaseRatio;
  }

  private getSkuPurchasePrice(
    sku: ProcurementSkuSummary,
  ): number | null | undefined {
    return sku.currentPurchasePrice;
  }
}
