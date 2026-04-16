import { Injectable } from '@nestjs/common';
import { Ingredient } from '../../domain/ingredient/ingredient.entity';
import { IngredientType } from '../../domain/ingredient/enums';
import {
  matchSourcePlanChannel,
  type IngredientSourcePlanCode,
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

    return new Map(
      ingredients.map((ingredient) => {
        if (ingredient.type !== IngredientType.FOOD) {
          return [ingredient.id, ingredient];
        }

        const selectedSku = this.selectSkuForPlan(
          skuMap[ingredient.id] || [],
          planCode,
        );

        return [
          ingredient.id,
          selectedSku
            ? this.withProcurementSku(ingredient, selectedSku)
            : ingredient,
        ];
      }),
    );
  }

  private selectSkuForPlan(
    skus: ProcurementSkuSummary[],
    planCode: IngredientSourcePlanCode,
  ): ProcurementSkuSummary | undefined {
    return (
      skus.find((sku) =>
        matchSourcePlanChannel(sku.purchaseChannel, planCode),
      ) ||
      skus.find((sku) => sku.isDefault) ||
      skus[0]
    );
  }

  private withProcurementSku(
    ingredient: Ingredient,
    sku: ProcurementSkuSummary,
  ): SourcePlanIngredient {
    const skuPrice =
      sku.currentPurchasePrice ??
      sku.referencePurchasePrice ??
      sku.referencePricePerPurchaseUnit;
    const hasUsableSkuPricing = this.hasUsablePricingProfile(sku, skuPrice);
    const currentPrice = hasUsableSkuPricing
      ? skuPrice
      : ingredient.currentPricePerPurchaseUnit;
    const effectivePrice = hasUsableSkuPricing
      ? skuPrice
      : ingredient.effectivePricePerPurchaseUnit;
    const purchaseUnit = hasUsableSkuPricing
      ? (sku.purchaseUnit ?? ingredient.purchaseUnit)
      : ingredient.purchaseUnit;
    const purchaseToBaseRatio = hasUsableSkuPricing
      ? sku.purchaseToBaseRatio
      : ingredient.purchaseToBaseRatio;
    const properties = {
      ...ingredient.properties,
      procurement_sku_id: sku.id,
      procurement_sku_name: sku.name,
      procurement_sku_display_unit: sku.displayUnit,
      procurement_sku_supplier_name: sku.supplierName,
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
    cloned.procurementSkuDisplayUnit = sku.displayUnit;

    return cloned;
  }

  private hasUsablePricingProfile(
    sku: ProcurementSkuSummary,
    price: number | null | undefined,
  ): price is number {
    return (
      price !== null &&
      price !== undefined &&
      Number.isFinite(price) &&
      sku.purchaseToBaseRatio !== null &&
      sku.purchaseToBaseRatio !== undefined &&
      Number.isFinite(sku.purchaseToBaseRatio) &&
      sku.purchaseToBaseRatio > 0
    );
  }
}
