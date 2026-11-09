/**
 * Packaging Service
 * Domain service for calculating packaging costs and selecting appropriate packaging materials
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Ingredient } from '../ingredient';
import type { IngredientRepository } from '../ingredient';
import { IngredientType } from '../ingredient/enums';
import { INGREDIENT_REPOSITORY } from '../../application/ingredient/ingredient.service';
import {
  normalizePackagePlan,
  summarizePackagePlan,
  type OrderPackagePlanItem,
} from '../order';

export interface ShippingContainer {
  boxItem: Ingredient;
  thermalItem: Ingredient;
  icePacks: number;
}

export interface PackagingCost {
  cost: number;
  weightG: number;
  breakdown: {
    perPackConsumables: {
      vacuumBagName: string;
      vacuumBagSpec: string; // 真空袋规格
      labelName: string;
      labelSpec: string; // 标签规格
      vacuumBagCostPerPack: number; // 真空袋每袋成本
      labelCostPerPack: number; // 标签每袋成本
      costPerPack: number; // 每袋总成本
      weightPerPack: number;
      vacuumBagTotalCost?: number;
      labelTotalCost?: number;
      totalCost?: number;
      vacuumBagsCount?: number;
      labelsCount?: number;
      calculation?: string;
      packageRows?: Array<{
        packageSpecG: number;
        packageCount: number;
        vacuumBagName: string;
        vacuumBagSpec: string;
        vacuumBagCostPerPack: number;
        vacuumBagTotalCost: number;
        labelCostPerPack: number;
        labelTotalCost: number;
        totalCost: number;
        weightG: number;
      }>;
    };
    shippingContainers: Array<{
      boxName: string;
      boxSpec: string; // 泡沫箱规格
      thermalBagName: string;
      thermalBagSpec: string; // 保温袋规格
      icePacks: number;
      cost: number;
      weight: number;
    }>;
  };
}

export const ICE_PACK_INGREDIENT_ID =
  '1e3d5990-e553-44fb-8bb9-6144593b6899';

/** 箱号 → 冰袋个数；4 号 3 个、3 号 5 个，其它按 3 个兜底。 */
export const ICE_PACKS_BY_BOX_NUMBER: Record<string, number> = {
  '4': 3,
  '3': 5,
};

interface GlobalConfig {
  defaultProductLabelId: string;
  defaultIcePackId: string;
}

/**
 * 默认产品标签原料 id（历史写死值，2026-11-06 抽成常量）。
 *
 * 只有后台 `global_config.default_product_label_id` 为空时才会用到它，
 * 目的是让「什么都没配」时的行为和改造前完全一致。
 */
export const DEFAULT_PRODUCT_LABEL_INGREDIENT_ID =
  '22831322-3463-49c7-8346-f5cc14277943';

@Injectable()
export class PackagingService {
  constructor(
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepo: IngredientRepository,
  ) {}

  /**
   * Select appropriate vacuum bag based on pack weight
   * Matching rules:
   * - < 70g: 10×15cm
   * - 70-120g: 12×17cm
   * - 120-200g: 15×20cm
   * - > 200g: 20×25cm
   */
  async selectVacuumBag(packSpecG: number): Promise<Ingredient> {
    // Query all packaging materials and filter for vacuum bags
    const allPackaging = await this.ingredientRepo.findByType(
      IngredientType.PACKAGING,
    );
    const bags = allPackaging
      .filter((item) => item.name.includes('食品真空袋'))
      .sort((a, b) => (a.weightG || 0) - (b.weightG || 0));

    if (bags.length < 4) {
      throw new NotFoundException(
        'Insufficient vacuum bag SKUs in database. Expected 4 different sizes.',
      );
    }

    // Match by weight range
    if (packSpecG < 70) return bags[0]; // 10×15cm
    if (packSpecG < 120) return bags[1]; // 12×17cm
    if (packSpecG < 200) return bags[2]; // 15×20cm
    return bags[3]; // 20×25cm
  }

  /**
   * Calculate shipping containers using greedy bin packing algorithm
   * Dynamically queries foam boxes from database
   */
  /**
   * 给发货时手选的箱型配对应的保温袋和冰袋数。
   * 找不到保温袋直接抛错——宁可不发，也不扣一半。
   */
  async resolveBoxContainer(box: Ingredient): Promise<{
    thermalBag: Ingredient;
    icePacks: number;
  }> {
    const boxNumMatch = box.productModel?.match(/(\d+)号/);
    const boxNum = boxNumMatch ? boxNumMatch[1] : '';

    const allPackaging = await this.ingredientRepo.findByType(
      IngredientType.PACKAGING,
    );
    const thermalBags = allPackaging.filter((item) =>
      item.name.includes('保温袋'),
    );
    const thermalBag = thermalBags.find((item) =>
      item.productModel?.includes(`适配${boxNum}号`),
    );
    if (!thermalBag) {
      throw new NotFoundException(
        `箱型「${box.name}」找不到匹配的保温袋（适配${boxNum}号）`,
      );
    }

    return {
      thermalBag,
      icePacks: ICE_PACKS_BY_BOX_NUMBER[boxNum] ?? 3,
    };
  }

  async calculateShippingContainers(
    foodWeightG: number,
  ): Promise<ShippingContainer[]> {
    // Query all packaging materials and filter for foam boxes
    const allPackaging = await this.ingredientRepo.findByType(
      IngredientType.PACKAGING,
    );
    const boxes = allPackaging
      .filter((item) => item.name.includes('泡沫箱'))
      .sort((a, b) => (a.maxCapacityG || 0) - (b.maxCapacityG || 0)); // Sort by capacity ascending (smallest first)

    if (boxes.length === 0) {
      throw new NotFoundException('No foam box SKUs found in database');
    }

    // Query all thermal bags for later matching
    const thermalBags = allPackaging.filter((item) =>
      item.name.includes('铝箔保温袋'),
    );

    const containers: ShippingContainer[] = [];
    let remainingWeight = foodWeightG;
    let iteration = 0;

    console.log('[PackagingService] Starting bin packing algorithm:', {
      foodWeightG,
      boxesAvailable: boxes.map((b) => ({
        name: b.productModel,
        capacityG: b.maxCapacityG,
      })),
    });

    while (remainingWeight > 0) {
      iteration++;
      console.log(
        `[PackagingService] Iteration ${iteration}: remainingWeight = ${remainingWeight}g`,
      );

      // Greedy strategy: select smallest box that can fit remaining weight
      const selectedBox =
        boxes.find(
          (b) => b.maxCapacityG && b.maxCapacityG >= remainingWeight,
        ) || boxes[boxes.length - 1]; // Fallback: use largest box

      console.log(
        `[PackagingService] Selected box: ${selectedBox.productModel} (capacity: ${selectedBox.maxCapacityG}g)`,
      );

      // Find matching thermal bag (extract box number: "3号箱" -> "3")
      const boxNumMatch = selectedBox.productModel?.match(/(\d+)号/);
      const boxNum = boxNumMatch ? boxNumMatch[1] : '';

      const bag = thermalBags.find((b) =>
        b.productModel?.includes(`适配${boxNum}号`),
      );

      if (!bag) {
        throw new NotFoundException(
          `No matching thermal bag found for ${selectedBox.name}`,
        );
      }

      // Get ice pack
      const ice = await this.ingredientRepo.findById(
        ICE_PACK_INGREDIENT_ID, // Ice pack
      );

      if (!ice) {
        throw new NotFoundException('Ice pack not found');
      }

      // Calculate ice packs based on box number
      // 4号箱: 3个冰袋, 3号箱: 5个冰袋
      const icePacks = ICE_PACKS_BY_BOX_NUMBER[boxNum] ?? 3;

      containers.push({
        boxItem: selectedBox,
        thermalItem: bag,
        icePacks: icePacks,
      });

      remainingWeight -= selectedBox.maxCapacityG || foodWeightG;
      console.log(
        `[PackagingService] After packing: remainingWeight = ${remainingWeight}g`,
      );
    }

    return containers;
  }

  async calculatePackagingCostForPlan(
    packagePlanInput: OrderPackagePlanItem[],
    totalFoodWeightG: number,
    /**
     * 产品标签原料 id（2026-11-06）。后台 `global_config.default_product_label_id`
     * 一直存在但以前**没被读过** —— 代码里写死了一个 UUID，换标签就得改代码。
     * 传了就用配置值，没传（且配置为空）继续用原来的默认值，行为不变。
     */
    productLabelId?: string | null,
  ): Promise<PackagingCost> {
    const packagePlan = normalizePackagePlan(packagePlanInput);
    const summary = summarizePackagePlan(packagePlan);
    const productLabel = await this.ingredientRepo.findById(
      productLabelId || DEFAULT_PRODUCT_LABEL_INGREDIENT_ID,
    );

    if (!productLabel) {
      throw new NotFoundException(
        `产品标签原料不存在：${productLabelId || DEFAULT_PRODUCT_LABEL_INGREDIENT_ID}（请到全局配置里指定「默认产品标签」）`,
      );
    }

    let cost = 0;
    let weight = 0;
    let vacuumBagTotalCost = 0;
    let labelTotalCost = 0;
    let perPackWeightTotal = 0;
    const labelCostPerPack = productLabel.getUnitCost();
    const packageRows: NonNullable<
      PackagingCost['breakdown']['perPackConsumables']['packageRows']
    > = [];

    for (const row of packagePlan) {
      const vacuumBag = await this.selectVacuumBag(row.packageSpecG);
      const vacuumBagCostPerPack = vacuumBag.getUnitCost();
      const rowVacuumBagTotalCost = row.packageCount * vacuumBagCostPerPack;
      const rowLabelTotalCost = row.packageCount * labelCostPerPack;
      const rowWeight =
        row.packageCount *
        ((vacuumBag.weightG || 0) + (productLabel.weightG || 0));

      vacuumBagTotalCost += rowVacuumBagTotalCost;
      labelTotalCost += rowLabelTotalCost;
      perPackWeightTotal += rowWeight;
      cost += rowVacuumBagTotalCost + rowLabelTotalCost;
      weight += rowWeight;

      packageRows.push({
        packageSpecG: row.packageSpecG,
        packageCount: row.packageCount,
        vacuumBagName: vacuumBag.name,
        vacuumBagSpec: vacuumBag.productModel || vacuumBag.name,
        vacuumBagCostPerPack,
        vacuumBagTotalCost: rowVacuumBagTotalCost,
        labelCostPerPack,
        labelTotalCost: rowLabelTotalCost,
        totalCost: rowVacuumBagTotalCost + rowLabelTotalCost,
        weightG: rowWeight,
      });
    }

    const containers = await this.calculateShippingContainers(totalFoodWeightG);
    const ice = await this.ingredientRepo.findById(
      ICE_PACK_INGREDIENT_ID,
    );

    if (!ice) {
      throw new NotFoundException('Ice pack not found');
    }

    const shippingContainersBreakdown = [];

    for (const c of containers) {
      const boxCost = c.boxItem.getUnitCost();
      const bagCost = c.thermalItem.getUnitCost();
      const iceCost = c.icePacks * ice.getUnitCost();

      const containerCost = boxCost + bagCost + iceCost;
      cost += containerCost;

      const boxWeight = c.boxItem.weightG || 0;
      const bagWeight = c.thermalItem.weightG || 0;
      const iceWeight = c.icePacks * (ice.weightG || 0);

      const containerWeight = boxWeight + bagWeight + iceWeight;
      weight += containerWeight;

      shippingContainersBreakdown.push({
        boxName: c.boxItem.name,
        boxSpec: c.boxItem.maxCapacityG
          ? `容量${(c.boxItem.maxCapacityG / 1000).toFixed(1)}kg`
          : c.boxItem.productModel || c.boxItem.name,
        thermalBagName: c.thermalItem.name,
        thermalBagSpec: c.thermalItem.productModel || c.thermalItem.name,
        icePacks: c.icePacks,
        cost: containerCost,
        weight: containerWeight,
      });
    }

    const firstRow = packageRows[0]!;
    const hasMultipleSpecs = packageRows.length > 1;
    const totalPerPackCost = vacuumBagTotalCost + labelTotalCost;
    const averageVacuumBagCostPerPack =
      vacuumBagTotalCost / summary.totalPackageCount;
    const averageLabelCostPerPack = labelTotalCost / summary.totalPackageCount;

    console.log('[PackagingService] Package plan consumables:', {
      packagePlan,
      totalPacks: summary.totalPackageCount,
      totalFoodWeightG,
      vacuumBagTotalCost,
      labelTotalCost,
      totalPerPackCost,
    });

    return {
      cost,
      weightG: weight,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: hasMultipleSpecs
            ? '多规格食品真空袋'
            : firstRow.vacuumBagName,
          vacuumBagSpec: hasMultipleSpecs
            ? summary.packageSpecSummary
            : firstRow.vacuumBagSpec,
          labelName: productLabel.name,
          labelSpec: productLabel.productModel || productLabel.name,
          vacuumBagCostPerPack: averageVacuumBagCostPerPack,
          labelCostPerPack: averageLabelCostPerPack,
          costPerPack: totalPerPackCost / summary.totalPackageCount,
          weightPerPack: perPackWeightTotal / summary.totalPackageCount,
          vacuumBagTotalCost,
          labelTotalCost,
          totalCost: totalPerPackCost,
          vacuumBagsCount: summary.totalPackageCount,
          labelsCount: summary.totalPackageCount,
          calculation: `${summary.packageSpecSummary} 包材小计 = ¥${totalPerPackCost.toFixed(2)}`,
          packageRows,
        },
        shippingContainers: shippingContainersBreakdown,
      },
    };
  }

  /**
   * Calculate total packaging cost
   * D1: Per-pack consumables (vacuum bag + label)
   * D2: Shipping containers (box + thermal bag + ice pack + label)
   */
  async calculatePackagingCost(
    totalPacks: number,
    singlePackSpecG: number,
    totalFoodWeightG: number,
  ): Promise<PackagingCost> {
    let cost = 0;
    let weight = 0;

    // ==========================================
    // D1. Per-pack consumables (each pack)
    // ==========================================
    const vacuumBag = await this.selectVacuumBag(singlePackSpecG);
    const productLabel = await this.ingredientRepo.findById(
      DEFAULT_PRODUCT_LABEL_INGREDIENT_ID,
    );

    if (!productLabel) {
      throw new NotFoundException(
        `产品标签原料不存在：${DEFAULT_PRODUCT_LABEL_INGREDIENT_ID}`,
      );
    }

    const vacuumBagCostPerPack = vacuumBag.getUnitCost();
    const labelCostPerPack = productLabel.getUnitCost();
    const perPackCost = vacuumBagCostPerPack + labelCostPerPack;
    const perPackWeight =
      (vacuumBag.weightG || 0) + (productLabel.weightG || 0);

    cost += totalPacks * perPackCost;
    weight += totalPacks * perPackWeight;

    console.log('[PackagingService] Per-pack consumables:', {
      totalPacks,
      singlePackSpecG,
      vacuumBagName: vacuumBag.name,
      labelName: productLabel.name,
      vacuumBagCostPerPack: vacuumBagCostPerPack.toFixed(4),
      labelCostPerPack: labelCostPerPack.toFixed(4),
      perPackCost: perPackCost.toFixed(4),
      perPackWeight,
    });

    // ==========================================
    // D2. Shipping containers (bin packing)
    // ==========================================
    const containers = await this.calculateShippingContainers(totalFoodWeightG);
    const ice = await this.ingredientRepo.findById(
      ICE_PACK_INGREDIENT_ID,
    );

    if (!ice) {
      throw new NotFoundException('Ice pack not found in database');
    }

    const shippingContainersBreakdown = [];

    for (const c of containers) {
      const boxCost = c.boxItem.getUnitCost();
      const bagCost = c.thermalItem.getUnitCost();
      const iceCost = c.icePacks * ice.getUnitCost();

      const containerCost = boxCost + bagCost + iceCost;
      cost += containerCost;

      const boxWeight = c.boxItem.weightG || 0;
      const bagWeight = c.thermalItem.weightG || 0;
      const iceWeight = c.icePacks * (ice.weightG || 0);

      const containerWeight = boxWeight + bagWeight + iceWeight;
      weight += containerWeight;

      shippingContainersBreakdown.push({
        boxName: c.boxItem.name,
        boxSpec: c.boxItem.maxCapacityG
          ? `容量${(c.boxItem.maxCapacityG / 1000).toFixed(1)}kg`
          : c.boxItem.productModel || c.boxItem.name,
        thermalBagName: c.thermalItem.name,
        thermalBagSpec: c.thermalItem.productModel || c.thermalItem.name,
        icePacks: c.icePacks,
        cost: containerCost,
        weight: containerWeight,
      });
    }

    // Calculate total ice packs
    const totalIcePacks = containers.reduce((sum, c) => sum + c.icePacks, 0);

    console.log('[PackagingService] Shipping containers:', {
      totalFoodWeightG,
      containersCount: containers.length,
      totalIcePacks,
      containersBreakdown: containers.map((c) => ({
        boxName: c.boxItem.name,
        boxSpec: c.boxItem.productModel,
        icePacks: c.icePacks,
      })),
      totalCost: cost.toFixed(2),
      totalWeightG: weight.toFixed(0),
    });

    return {
      cost,
      weightG: weight,
      breakdown: {
        perPackConsumables: {
          vacuumBagName: vacuumBag.name,
          vacuumBagSpec: vacuumBag.productModel || vacuumBag.name,
          labelName: productLabel.name,
          labelSpec: productLabel.productModel || productLabel.name,
          vacuumBagCostPerPack,
          labelCostPerPack,
          costPerPack: perPackCost,
          weightPerPack: perPackWeight,
        },
        shippingContainers: shippingContainersBreakdown,
      },
    };
  }
}
