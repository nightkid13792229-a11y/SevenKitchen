/**
 * Pricing Service
 * Domain service for calculating order prices based on cost and margin
 * Based on 07_Core_Architecture.md Section 3.5 "Order Price & Shipping Cost"
 */

import { Injectable, Inject } from '@nestjs/common';
import { Ingredient } from '../ingredient/ingredient.entity';
import { IngredientType } from '../ingredient/enums';
import { resolveSupplementAddTimingLabel } from '../ingredient/supplement-add-timing';
import { resolveSupplementNutrients } from '../ingredient/supplement-nutrition-resolver';
import { ValidationError } from '../common/errors';
import { PackagingService } from '../packaging';
import { INGREDIENT_REPOSITORY } from '../../application/ingredient/ingredient.service';
import {
  normalizePackagePlan,
  summarizePackagePlan,
  type OrderPackagePlanItem,
} from '../order';

export interface GlobalConfig {
  laborHourlyRate: number;
  minOrderWeightG: number;
  defaultBatchCapacityG: number;
  minPotWeightG: number;
  targetMargin: number;
  overheadCostPerKg: number;
  targetBatchUtilization: number;
  supplementLossRate: number;
  defaultProductLabelId: string | null;
  defaultIcePackId: string | null;
  defaultShippingTemplateId: string | null;
  packageExampleImageUrl: string | null;
  shippingCompanyLogoUrl: string | null;
  paymentTimeoutMinutes: number;
  homeHeaderBgImageUrl: string | null;
  ingredientPriceAutoApproveThreshold?: number;
  equipmentRecommendations?: EquipmentRecommendations | null;
}

// 设备推荐相关接口
export interface EquipmentRecommendations {
  meatGrinder?: EquipmentRecommendation;
  blender?: EquipmentRecommendation;
  grinder?: EquipmentRecommendation;
  vacuumSealer?: EquipmentRecommendation;
  vacuumBag?: EquipmentRecommendation;
}

export interface EquipmentRecommendation {
  equipmentType: string;
  name: string;
  brand: string;
  productModel?: string;
  recommendationReason?: string;
  imageUrl?: string;
  purchaseLink?: PurchaseLink;
}

export interface PurchaseLink {
  url?: string;
  mini_program_appid?: string;
  mini_program_path?: string;
  type: 'external' | 'mini_program';
}

export interface RecipeItem {
  id?: string;
  ingredientId: string;
  ingredient: Ingredient;
  preparationMethod?: string | null; // 添加时机/制备方法
  ratioPercent?: number | null;
  exampleWeight?: number | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
}

export interface Recipe {
  id: string;
  productionLossRate: number;
  batchLaborHours: number;
  items: RecipeItem[];
}

export interface DogProfile {
  mealsPerDay: number;
}

export interface PricingCalculationInput {
  dog: DogProfile;
  recipe: Recipe;
  dailyG?: number;
  days?: number;
  totalNetFoodWeightG?: number;
  packagePlan?: OrderPackagePlanItem[];
  discountRate?: number;
  globalConfig: GlobalConfig;
  singlePackSpecG?: number; // Optional: use provided value instead of calculating
}

export interface PricingBreakdown {
  costIngredients: number;
  costPackaging: number;
  costLabor: number;
  costOverhead: number;
  totalProductCost: number;
  productPrice: number;
  shippingFee: number;
  totalPrice: number;
  weightPackagingG?: number; // Total weight including packaging (in grams)
  ingredientDetails?: IngredientCostItem[];
  packagingDetails?: PackagingCostDetail;
  laborDetails?: LaborCostDetail;
  overheadDetails?: OverheadCostDetail;
}

export interface IngredientCostItem {
  recipeItemId?: string;
  name: string;
  type: string;
  amount: number; // 成本计算用量（含出肉率和生产损耗率）
  unit: string;
  unitCost: number;
  cost: number;
  calculation: string;
  purchaseChannel?: string; // 采购渠道
  brand?: string; // 品牌
  displayUnit?: string; // 显示单位（前端用于显示）
  netAmount?: number; // 净需求（不含生产损耗和出肉率，用于前端显示和补剂用量计算）
  purchaseAmount?: number; // 采购用量（仅含生产损耗率，不含出肉率）
  productModel?: string; // 规格
  ingredientId?: string; // 原料ID
  properties?: any; // 完整的properties对象（包含purchase_link等）
  preparationMethod?: string; // 添加时机/制备方法
  nutrientTargetKey?: string; // 营养素名称（补剂用）
  nutrientTargetValue?: number; // 营养目标值（补剂用）
}

export interface PackagingPerPackConsumables {
  vacuumBagName: string;
  vacuumBagSpec: string; // 真空袋规格
  labelName: string;
  labelSpec: string; // 标签规格
  vacuumBagCostPerPack: number; // 真空袋每袋成本
  labelCostPerPack: number; // 标签每袋成本
  vacuumBagTotalCost: number; // 真空袋总成本
  labelTotalCost: number; // 标签总成本
  totalCost: number; // 小计（总成本）
  weightPerPack: number;
  calculation: string;
  vacuumBagsCount: number; // 真空袋总数量
  labelsCount: number; // 标签总数量
}

export interface PackagingShippingContainer {
  boxName: string;
  boxSpec: string; // 泡沫箱规格
  thermalBagName: string;
  thermalBagSpec: string; // 保温袋规格
  icePacks: number;
  boxCost: number;
  thermalBagCost: number;
  icePackCost: number;
  totalCost: number;
  weight: number;
  calculation: string;
  boxesCount: number; // 泡沫箱数量（每个容器1个）
  thermalBagsCount: number; // 保温袋数量（每个容器1个）
}

export interface PackagingCostDetail {
  perPackConsumables: PackagingPerPackConsumables;
  shippingContainers: PackagingShippingContainer[];
}

export interface LaborCostDetail {
  standardBatchOutputKg: number;
  standardLaborCostPerKg: number;
  rawInputWeightKg: number;
  totalCost: number;
  calculation: string;
}

export interface OverheadCostDetail {
  overheadCostPerKg: number;
  rawInputWeightKg: number;
  totalCost: number;
  calculation: string;
}

@Injectable()
export class PricingService {
  constructor(
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepo: any,
    private readonly packagingService: PackagingService,
  ) {}

  /**
   * Calculate order price details
   * Implements algorithm from 07_Core_Architecture.md Section 3.5
   */
  async calculateOrderPrice(
    input: PricingCalculationInput,
  ): Promise<PricingBreakdown> {
    const {
      dog,
      recipe,
      dailyG,
      days,
      totalNetFoodWeightG: providedTotalNetFoodWeightG,
      discountRate = 1.0,
      globalConfig,
    } = input;
    const packagePlan = input.packagePlan
      ? normalizePackagePlan(input.packagePlan)
      : null;
    const packagePlanSummary = packagePlan
      ? summarizePackagePlan(packagePlan)
      : null;

    const hasLegacyQuantityInput = dailyG !== undefined && days !== undefined;
    const hasPackagePlanQuantityInput = packagePlan !== null;

    if (!hasLegacyQuantityInput && !hasPackagePlanQuantityInput) {
      throw new ValidationError(
        'Pricing calculation requires either dailyG and days, or totalNetFoodWeightG and packagePlan',
      );
    }

    if (
      packagePlanSummary &&
      providedTotalNetFoodWeightG !== undefined &&
      providedTotalNetFoodWeightG !== packagePlanSummary.totalQuantityG
    ) {
      throw new ValidationError(
        `packagePlan total weight (${packagePlanSummary.totalQuantityG}g) must equal totalNetFoodWeightG (${providedTotalNetFoodWeightG}g)`,
      );
    }

    // ==========================================
    // 0. 起订量检查 (Minimum Order Check)
    // ==========================================
    const totalNetFoodWeightG =
      packagePlanSummary?.totalQuantityG ??
      providedTotalNetFoodWeightG ??
      (dailyG as number) * (days as number);
    if (totalNetFoodWeightG < globalConfig.minOrderWeightG) {
      throw new ValidationError(
        `订单净重不足 ${globalConfig.minOrderWeightG}g (当前 ${totalNetFoodWeightG}g)`,
      );
    }

    // ==========================================
    // 1. 基础物理量 (Basic Physical Quantities)
    // ==========================================
    const mealsPerDay = dog.mealsPerDay;
    // Use provided singlePackSpecG if available, otherwise calculate from dailyG
    const singlePackSpecG =
      input.singlePackSpecG ||
      packagePlanSummary?.primaryPackageSpecG ||
      (dailyG as number) / mealsPerDay;
    const totalPacks =
      packagePlanSummary?.totalPackageCount ?? mealsPerDay * (days as number);

    // 生产投料毛重 (含烹饪损耗) (Gross input weight with production loss)
    // 单位：kg (从 totalNetFoodWeightG 转换)
    const rawInputWeightKg =
      (totalNetFoodWeightG / 1000.0) * recipe.productionLossRate;

    console.log('========== PricingService 步骤1: 基础物理量 ==========');
    console.log('[输入]', {
      dailyG,
      days,
      mealsPerDay,
      productionLossRate: recipe.productionLossRate,
    });
    console.log('[计算结果]', {
      totalNetFoodWeightG,
      totalNetWeightKg: totalNetFoodWeightG / 1000.0,
      singlePackSpecG,
      totalPacks,
      rawInputWeightKg,
    });
    console.log('==========================================');

    // ==========================================
    // 2. 核心成本计算 (Product Cost)
    // ==========================================
    let costIngredients = 0;
    const ingredientDetails: IngredientCostItem[] = [];

    console.log('[PricingService] Starting cost calculation:', {
      recipeId: recipe.id,
      itemsCount: recipe.items.length,
      dailyG,
      days,
      totalNetWeightKg: totalNetFoodWeightG / 1000.0,
      rawInputWeightKg,
    });

    for (const item of recipe.items) {
      const ingredient = item.ingredient;

      console.log('[PricingService] Processing ingredient:', {
        name: ingredient.name,
        type: ingredient.type,
        ratioPercent: item.ratioPercent,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue,
      });

      // --- A. 食材 (Food - Yield Rate Logic) ---
      if (ingredient.type === IngredientType.FOOD) {
        if (!item.ratioPercent) {
          throw new ValidationError(
            `ratio_percent is required for FOOD ingredient: ${ingredient.name}`,
          );
        }

        // 不含生产损耗和出肉率的净需求（用于前端显示和补剂用量计算）
        // 单位：kg (从 totalNetFoodWeightG 转换)
        const itemNetNeededKg =
          (totalNetFoodWeightG / 1000.0) * (item.ratioPercent / 100.0);

        // 出肉率校准（用于成本计算）
        const yieldRate = ingredient.getEdibleYieldRate();
        const itemGrossPurchaseKg =
          (itemNetNeededKg / yieldRate) * recipe.productionLossRate;

        // 采购用量（仅含生产损耗率，不含出肉率）
        const itemPurchaseKg = itemNetNeededKg * recipe.productionLossRate;

        const unitCost = ingredient.getUnitCost();
        const grossPurchaseBaseAmount = this.convertFoodMassKgToBaseAmount(
          ingredient,
          itemGrossPurchaseKg,
        );
        const itemCost = grossPurchaseBaseAmount * unitCost;
        const unitCostLabel = ingredient.baseUnit === 'ML' ? '元/ml' : '元/g';
        const foodCalculation =
          ingredient.baseUnit === 'ML'
            ? `净需求${itemNetNeededKg.toFixed(3)}kg ÷ 出成率${yieldRate} × 损耗率${recipe.productionLossRate} = 毛需求${itemGrossPurchaseKg.toFixed(3)}kg ≈ ${grossPurchaseBaseAmount.toFixed(1)}ml（按密度${this.getFoodDensityGPerMl(ingredient).toFixed(3)}g/ml换算） × ${unitCost.toFixed(4)}${unitCostLabel} = ${itemCost.toFixed(2)}元`
            : `净需求${itemNetNeededKg.toFixed(3)}kg ÷ 出成率${yieldRate} × 损耗率${recipe.productionLossRate} = 毛需求${itemGrossPurchaseKg.toFixed(3)}kg × ${unitCost.toFixed(4)}${unitCostLabel} = ${itemCost.toFixed(2)}元`;

        console.log('[PricingService] Food ingredient cost:', {
          name: ingredient.name,
          type: ingredient.type,
          baseUnit: ingredient.baseUnit,
          ratioPercent: item.ratioPercent,
          itemNetNeededKg,
          yieldRate,
          itemGrossPurchaseKg,
          grossPurchaseBaseAmount,
          unitCost,
          itemCost,
        });

        // Collect detailed data
        ingredientDetails.push({
          recipeItemId: item.id,
          name: ingredient.name,
          type: 'FOOD',
          amount: itemGrossPurchaseKg, // 成本计算用量（含出肉率和生产损耗率）
          netAmount: itemNetNeededKg, // 净需求（不含生产损耗和出肉率）
          purchaseAmount: itemPurchaseKg, // 采购用量（仅含生产损耗率，不含出肉率）
          unit: 'kg',
          unitCost: unitCost,
          cost: itemCost,
          calculation: foodCalculation,
          purchaseChannel: ingredient.purchaseChannel || undefined,
          brand: ingredient.brand || undefined,
          productModel: ingredient.productModel || undefined,
          preparationMethod: item.preparationMethod || undefined,
          ingredientId: ingredient.id,
          displayUnit: 'g', // 前端显示时转换为克
          properties: ingredient.properties, // 添加完整properties
        });

        // Convert kg to g, then multiply by unit cost (per g)
        costIngredients += itemCost;
      }

      // --- B. 补剂 (Supplement - Custom Loss Logic) ---
      else if (ingredient.type === IngredientType.SUPPLEMENT) {
        console.log('[PricingService] Processing SUPPLEMENT:', {
          name: ingredient.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
        });

        if (!item.nutrientTargetKey || !item.nutrientTargetValue) {
          throw new ValidationError(
            `nutrient_target_key and nutrient_target_value are required for SUPPLEMENT ingredient: ${ingredient.name}`,
          );
        }

        const targetKey = item.nutrientTargetKey;
        const targetVal = item.nutrientTargetValue;
        const activeNutrients = resolveSupplementNutrients({
          nutritionProfile: ingredient.nutritionProfile,
          fallback: (ingredient.properties as any)?.active_nutrients,
        });
        const concentrationObj = activeNutrients[targetKey];
        const concentration = concentrationObj?.value || 0;
        const concentrationUnit = concentrationObj?.unit || '';

        console.log('[PricingService] SUPPLEMENT concentration lookup:', {
          name: ingredient.name,
          targetKey,
          targetVal,
          activeNutrients,
          concentrationObj,
          concentration,
        });

        if (concentration <= 0) {
          throw new ValidationError(
            `Missing or zero concentration for ${targetKey} in ingredient ${ingredient.name}`,
          );
        }

        // Total nutrient needed: target_val * total_food_net_weight_kg
        // 补剂用量基于食材类原料的总净重，而不是所有原料的毛重
        // 单位：mg 或 μg (totalFoodNetWeightKg 单位为 kg)
        const totalNutrientNeeded = targetVal * (totalNetFoodWeightG / 1000.0);
        const unitsTheoretical = totalNutrientNeeded / concentration;

        // Read ingredient-specific loss rate (default to global)
        const customLoss =
          ingredient.getProductionLossRate() ?? globalConfig.supplementLossRate;
        const unitsNeeded = unitsTheoretical * customLoss;

        const unitCost = ingredient.getUnitCost();
        const itemCost = unitsNeeded * unitCost;

        console.log('[PricingService] SUPPLEMENT cost:', {
          name: ingredient.name,
          targetVal,
          totalFoodNetWeightKg: totalNetFoodWeightG / 1000.0, // 食材总净重
          rawInputWeightKg, // 所有原料毛重（对比用）
          totalNutrientNeeded,
          unitsTheoretical,
          customLoss,
          unitsNeeded,
          unitCost,
          itemCost,
        });

        const addTimingEnum = (ingredient.properties as any)?.add_timing;
        const finalPrepMethod = resolveSupplementAddTimingLabel(addTimingEnum);

        console.log('[PricingService] SUPPLEMENT 添加时机:', {
          name: ingredient.name,
          addTimingEnum,
          finalPrepMethod,
        });

        // Collect detailed data for SUPPLEMENT
        ingredientDetails.push({
          recipeItemId: item.id,
          name: ingredient.name,
          type: 'SUPPLEMENT',
          amount: unitsNeeded, // 补剂的用量已含损耗率
          netAmount: unitsTheoretical, // 补剂净需求 = 理论用量（不含损耗）
          purchaseAmount: unitsNeeded, // 补剂采购用量 = 实际用量（含损耗）
          unit: 'g',
          unitCost: unitCost,
          cost: itemCost,
          calculation: `营养需求${totalNutrientNeeded.toFixed(3)}${concentrationUnit} ÷ 浓度${concentration}${concentrationUnit} = 理论用量${unitsTheoretical.toFixed(3)}g × 损耗率${customLoss} = 实际用量${unitsNeeded.toFixed(3)}g × ${unitCost.toFixed(4)}元/g = ${itemCost.toFixed(2)}元`,
          purchaseChannel: ingredient.purchaseChannel || undefined,
          brand: ingredient.brand || undefined,
          productModel: ingredient.productModel || undefined,
          preparationMethod: finalPrepMethod,
          ingredientId: ingredient.id,
          displayUnit: ingredient.unitDisplayLabel || 'g', // 使用显示单位标签
          properties: ingredient.properties, // 添加完整properties（包含purchase_link）
          nutrientTargetKey: item.nutrientTargetKey, // 营养素名称
          nutrientTargetValue: item.nutrientTargetValue, // 营养目标值
        });

        costIngredients += itemCost;
      }
      // Note: PACKAGING is handled separately below
    }

    // --- C. 人工与制造费用 (Labor & Overhead - Standard Costing) ---
    // Standard batch output (kg)
    const standardBatchOutputKg =
      (globalConfig.defaultBatchCapacityG / 1000.0) *
      globalConfig.targetBatchUtilization;
    const standardLaborCostPerKg =
      (globalConfig.laborHourlyRate * recipe.batchLaborHours) /
      standardBatchOutputKg;

    const costLabor = rawInputWeightKg * standardLaborCostPerKg;

    // Collect labor cost details
    const laborDetails = {
      standardBatchOutputKg,
      standardLaborCostPerKg,
      rawInputWeightKg,
      totalCost: costLabor,
      calculation: `标准批次产量${standardBatchOutputKg.toFixed(3)}kg，人工成本${(globalConfig.laborHourlyRate * recipe.batchLaborHours).toFixed(2)}元 ÷ ${standardBatchOutputKg.toFixed(3)}kg = ${standardLaborCostPerKg.toFixed(4)}元/kg × ${rawInputWeightKg.toFixed(3)}kg = ${costLabor.toFixed(2)}元`,
    };

    // Manufacturing Overhead
    const costOverhead = rawInputWeightKg * globalConfig.overheadCostPerKg;

    // Collect overhead cost details
    const overheadDetails = {
      overheadCostPerKg: globalConfig.overheadCostPerKg,
      rawInputWeightKg,
      totalCost: costOverhead,
      calculation: `间接成本${globalConfig.overheadCostPerKg.toFixed(4)}元/kg × ${rawInputWeightKg.toFixed(3)}kg = ${costOverhead.toFixed(2)}元`,
    };

    console.log('========== PricingService 步骤3: 人工与制造费用 ==========');
    console.log('[人工成本]', {
      defaultBatchCapacityG: globalConfig.defaultBatchCapacityG,
      targetBatchUtilization: globalConfig.targetBatchUtilization,
      standardBatchOutputKg,
      batchLaborHours: recipe.batchLaborHours,
      laborHourlyRate: globalConfig.laborHourlyRate,
      standardLaborCostPerKg,
      rawInputWeightKg,
      costLabor,
    });
    console.log('[间接成本]', {
      overheadCostPerKg: globalConfig.overheadCostPerKg,
      rawInputWeightKg,
      costOverhead,
    });
    console.log('==========================================');

    // --- D. 包材成本与重量 (Packaging Cost & Weight) ---
    // Use PackagingService to calculate packaging costs
    const packagingResult = packagePlan
      ? await this.packagingService.calculatePackagingCostForPlan(
          packagePlan,
          totalNetFoodWeightG,
        )
      : await this.packagingService.calculatePackagingCost(
          totalPacks,
          singlePackSpecG,
          totalNetFoodWeightG,
        );

    const costPackaging = packagingResult.cost;
    const weightPackagingG = packagingResult.weightG;

    // Collect packaging cost details from breakdown
    console.log('[PricingService] PackagingResult breakdown:', {
      shippingContainersCount:
        packagingResult.breakdown.shippingContainers.length,
      shippingContainers: packagingResult.breakdown.shippingContainers.map(
        (c) => ({
          boxName: c.boxName,
          boxSpec: c.boxSpec,
          cost: c.cost,
        }),
      ),
    });

    const perPackConsumables = packagingResult.breakdown
      .perPackConsumables as typeof packagingResult.breakdown.perPackConsumables & {
      vacuumBagTotalCost?: number;
      labelTotalCost?: number;
      totalCost?: number;
      vacuumBagsCount?: number;
      labelsCount?: number;
      calculation?: string;
    };
    const vacuumBagTotalCost =
      perPackConsumables.vacuumBagTotalCost ??
      perPackConsumables.vacuumBagCostPerPack * totalPacks;
    const labelTotalCost =
      perPackConsumables.labelTotalCost ??
      perPackConsumables.labelCostPerPack * totalPacks;
    const totalPerPackConsumablesCost =
      perPackConsumables.totalCost ??
      (perPackConsumables.vacuumBagCostPerPack +
        perPackConsumables.labelCostPerPack) *
        totalPacks;
    const packagingDetails = {
      perPackConsumables: {
        vacuumBagName: perPackConsumables.vacuumBagName,
        vacuumBagSpec: perPackConsumables.vacuumBagSpec,
        labelName: perPackConsumables.labelName,
        labelSpec: perPackConsumables.labelSpec,
        vacuumBagCostPerPack: perPackConsumables.vacuumBagCostPerPack,
        labelCostPerPack: perPackConsumables.labelCostPerPack,
        vacuumBagTotalCost,
        labelTotalCost,
        totalCost: totalPerPackConsumablesCost,
        weightPerPack: perPackConsumables.weightPerPack,
        vacuumBagsCount: perPackConsumables.vacuumBagsCount ?? totalPacks, // 真空袋总数量 = 总袋数
        labelsCount: perPackConsumables.labelsCount ?? totalPacks, // 标签总数量 = 总袋数
        calculation:
          perPackConsumables.calculation ??
          `每袋¥${perPackConsumables.vacuumBagCostPerPack.toFixed(4)} + ¥${perPackConsumables.labelCostPerPack.toFixed(4)}，共${totalPacks}袋 = ¥${totalPerPackConsumablesCost.toFixed(2)}`,
      },
      shippingContainers: packagingResult.breakdown.shippingContainers.map(
        (container) => ({
          boxName: container.boxName,
          boxSpec: container.boxSpec,
          thermalBagName: container.thermalBagName,
          thermalBagSpec: container.thermalBagSpec,
          icePacks: container.icePacks,
          boxCost: container.cost,
          thermalBagCost: 0, // Included in total cost
          icePackCost: 0, // Included in total cost
          totalCost: container.cost,
          weight: container.weight,
          boxesCount: 1, // 每个容器1个泡沫箱
          thermalBagsCount: 1, // 每个容器1个保温袋
          calculation: `快递包装：${container.boxName} + ${container.thermalBagName} + 冰袋${container.icePacks}个 = ¥${container.cost.toFixed(2)}`,
        }),
      ),
    };

    console.log('========== PricingService 步骤4: 包材成本 ==========');
    console.log('[包材成本]', {
      totalPacks,
      singlePackSpecG,
      totalNetFoodWeightG,
      costPackaging,
      weightPackagingG,
      breakdown: packagingResult.breakdown,
    });
    console.log('==========================================');

    const totalProductCost =
      costIngredients + costLabor + costOverhead + costPackaging;

    console.log('========== PricingService 步骤5: 成本汇总 ==========');
    console.log('[成本汇总]', {
      costIngredients,
      costLabor,
      costOverhead,
      costPackaging,
      totalProductCost,
    });
    console.log('==========================================');

    // ==========================================
    // 3. 产品定价 (Product Pricing)
    // ==========================================
    // Apply margin only to product cost, not shipping
    const baseProductPrice = totalProductCost / (1 - globalConfig.targetMargin);

    console.log('========== PricingService 步骤6: 毛利应用 ==========');
    console.log('[价格计算]', {
      totalProductCost,
      targetMargin: globalConfig.targetMargin,
      baseProductPrice,
    });
    console.log('==========================================');

    // ==========================================
    // 4. 运费计算 (Shipping Fee)
    // ==========================================
    // For MVP, shipping fee is stubbed to 0 or calculated separately
    // Per doc: "can return 0 with clear TODO, but keep the interface consistent"
    const shippingFee = 0; // TODO: Implement shipping fee calculation

    // ==========================================
    // 5. 最终总价 (Final Total)
    // ==========================================
    // Product discount, shipping usually not discounted
    const finalTotal = baseProductPrice * discountRate + shippingFee;

    console.log('========== PricingService 步骤7: 最终价格 ==========');
    console.log('[最终返回]', {
      baseProductPrice,
      discountRate,
      shippingFee,
      finalTotal,
      productPrice: baseProductPrice * discountRate,
    });
    console.log('==========================================');

    return {
      costIngredients,
      costPackaging,
      costLabor,
      costOverhead,
      totalProductCost,
      productPrice: baseProductPrice * discountRate,
      shippingFee,
      totalPrice: finalTotal,
      weightPackagingG,
      ingredientDetails,
      packagingDetails,
      laborDetails,
      overheadDetails,
    };
  }

  private getFoodDensityGPerMl(ingredient: Ingredient): number {
    const density = Number((ingredient.properties as any)?.density_g_per_ml);
    if (!Number.isFinite(density) || density <= 0) {
      throw new ValidationError(
        `density_g_per_ml is required for ML-based FOOD ingredient: ${ingredient.name}`,
      );
    }

    return density;
  }

  private convertFoodMassKgToBaseAmount(
    ingredient: Ingredient,
    quantityKg: number,
  ): number {
    const quantityG = quantityKg * 1000;

    if (ingredient.baseUnit === 'ML') {
      const density = this.getFoodDensityGPerMl(ingredient);
      return quantityG / density;
    }

    return quantityG;
  }
}
