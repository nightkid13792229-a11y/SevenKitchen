/**
 * Packaging Service
 * Domain service for calculating packaging costs and selecting appropriate packaging materials
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Ingredient } from '../ingredient';
import type { IngredientRepository } from '../ingredient';
import { IngredientType } from '../ingredient/enums';
import { INGREDIENT_REPOSITORY } from '../../application/ingredient/ingredient.service';

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
      vacuumBagSpec: string;  // 真空袋规格
      labelName: string;
      labelSpec: string;      // 标签规格
      vacuumBagCostPerPack: number;  // 真空袋每袋成本
      labelCostPerPack: number;     // 标签每袋成本
      costPerPack: number;          // 每袋总成本
      weightPerPack: number;
    };
    shippingContainers: Array<{
      boxName: string;
      boxSpec: string;         // 泡沫箱规格
      thermalBagName: string;
      thermalBagSpec: string;  // 保温袋规格
      icePacks: number;
      cost: number;
      weight: number;
    }>;
  };
}

interface GlobalConfig {
  defaultProductLabelId: string;
  defaultIcePackId: string;
}

@Injectable()
export class PackagingService {
  constructor(
    @Inject(INGREDIENT_REPOSITORY) private readonly ingredientRepo: IngredientRepository,
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
    const allPackaging = await this.ingredientRepo.findByType(IngredientType.PACKAGING);
    const bags = allPackaging
      .filter(item => item.name.includes('食品真空袋'))
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
  async calculateShippingContainers(
    foodWeightG: number,
  ): Promise<ShippingContainer[]> {
    // Query all packaging materials and filter for foam boxes
    const allPackaging = await this.ingredientRepo.findByType(IngredientType.PACKAGING);
    const boxes = allPackaging
      .filter(item => item.name.includes('泡沫箱'))
      .sort((a, b) => (b.maxCapacityG || 0) - (a.maxCapacityG || 0)); // Sort by capacity descending

    if (boxes.length === 0) {
      throw new NotFoundException('No foam box SKUs found in database');
    }

    // Query all thermal bags for later matching
    const thermalBags = allPackaging.filter(item => item.name.includes('铝箔保温袋'));

    const containers: ShippingContainer[] = [];
    let remainingWeight = foodWeightG;

    while (remainingWeight > 0) {
      // Greedy strategy: select smallest box that can fit remaining weight
      const box =
        boxes.find((b) => b.maxCapacityG && b.maxCapacityG >= remainingWeight) ||
        boxes[boxes.length - 1]; // Fallback: use largest box

      // Find matching thermal bag (extract box number: "3号箱" -> "3")
      const boxNumMatch = box.productModel?.match(/(\d+)号/);
      const boxNum = boxNumMatch ? boxNumMatch[1] : '';

      const bag = thermalBags.find(b =>
        b.productModel?.includes(`适配${boxNum}号`)
      );

      if (!bag) {
        throw new NotFoundException(
          `No matching thermal bag found for ${box.name}`,
        );
      }

      // Get ice pack
      const ice = await this.ingredientRepo.findById(
        '1e3d5990-e553-44fb-8bb9-6144593b6899', // Ice pack
      );

      if (!ice) {
        throw new NotFoundException('Ice pack not found');
      }

      containers.push({
        boxItem: box,
        thermalItem: bag,
        icePacks: 2,
      });

      remainingWeight -= (box.maxCapacityG || foodWeightG);
    }

    return containers;
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
      '22831322-3463-49c7-8346-f5cc14277943',
    );

    if (!productLabel) {
      throw new NotFoundException('Product label not found in database');
    }

    const vacuumBagCostPerPack = vacuumBag.getUnitCost();
    const labelCostPerPack = productLabel.getUnitCost();
    const perPackCost = vacuumBagCostPerPack + labelCostPerPack;
    const perPackWeight = (vacuumBag.weightG || 0) + (productLabel.weightG || 0);

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
      '1e3d5990-e553-44fb-8bb9-6144593b6899',
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
        boxSpec: c.boxItem.maxCapacityG ? `容量${(c.boxItem.maxCapacityG / 1000).toFixed(1)}kg` : (c.boxItem.productModel || c.boxItem.name),
        thermalBagName: c.thermalItem.name,
        thermalBagSpec: c.thermalItem.productModel || c.thermalItem.name,
        icePacks: c.icePacks,
        cost: containerCost,
        weight: containerWeight,
      });
    }

    console.log('[PackagingService] Shipping containers:', {
      totalFoodWeightG,
      containersCount: containers.length,
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
