import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
  PrismaClient,
  ProcurementSkuSourceTier,
  RecipeStatus,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

const FOOD_INGREDIENTS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    skuId: '11000000-0000-4000-8000-000000000001',
    name: '去皮鸡腿肉',
    pricePerKg: 32,
    yieldRate: 0.9,
    desc: '优质动物蛋白，脂肪适中',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    skuId: '11000000-0000-4000-8000-000000000002',
    name: '牛后腿肉',
    pricePerKg: 58,
    yieldRate: 0.88,
    desc: '高蛋白，富含铁和锌',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    skuId: '11000000-0000-4000-8000-000000000003',
    name: '三文鱼肉',
    pricePerKg: 72,
    yieldRate: 0.92,
    desc: '富含脂肪酸，适合皮毛护理',
  },
  {
    id: '10000000-0000-4000-8000-000000000004',
    skuId: '11000000-0000-4000-8000-000000000004',
    name: '鸡蛋',
    pricePerKg: 16,
    yieldRate: 0.95,
    desc: '易消化蛋白和卵磷脂来源',
  },
  {
    id: '10000000-0000-4000-8000-000000000005',
    skuId: '11000000-0000-4000-8000-000000000005',
    name: '南瓜',
    pricePerKg: 7,
    yieldRate: 0.9,
    desc: '膳食纤维和碳水来源',
  },
  {
    id: '10000000-0000-4000-8000-000000000006',
    skuId: '11000000-0000-4000-8000-000000000006',
    name: '胡萝卜',
    pricePerKg: 6,
    yieldRate: 0.9,
    desc: '胡萝卜素和膳食纤维来源',
  },
  {
    id: '10000000-0000-4000-8000-000000000007',
    skuId: '11000000-0000-4000-8000-000000000007',
    name: '红薯',
    pricePerKg: 8,
    yieldRate: 0.88,
    desc: '温和碳水和膳食纤维来源',
  },
  {
    id: '10000000-0000-4000-8000-000000000008',
    skuId: '11000000-0000-4000-8000-000000000008',
    name: '大米',
    pricePerKg: 9,
    yieldRate: 1,
    desc: '基础碳水来源',
  },
] as const;

const PACKAGING_INGREDIENTS = [
  {
    id: '22831322-3463-49c7-8346-f5cc14277943',
    name: '产品标签',
    productModel: '通用标签',
    price: 30,
    ratio: 1000,
    purchaseUnit: '卷',
    weightG: 1,
    maxCapacityG: null,
  },
  {
    id: '1e3d5990-e553-44fb-8bb9-6144593b6899',
    name: '冰袋',
    productModel: '200g冰袋',
    price: 0.6,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 200,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000001',
    name: '食品真空袋 10x15cm',
    productModel: '10x15cm',
    price: 0.12,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 3,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    name: '食品真空袋 12x17cm',
    productModel: '12x17cm',
    price: 0.16,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 4,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    name: '食品真空袋 15x20cm',
    productModel: '15x20cm',
    price: 0.22,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 6,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    name: '食品真空袋 20x25cm',
    productModel: '20x25cm',
    price: 0.32,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 9,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000005',
    name: '3号泡沫箱',
    productModel: '3号泡沫箱',
    price: 5.5,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 260,
    maxCapacityG: 5000,
  },
  {
    id: '20000000-0000-4000-8000-000000000006',
    name: '4号泡沫箱',
    productModel: '4号泡沫箱',
    price: 4.2,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 220,
    maxCapacityG: 3000,
  },
  {
    id: '20000000-0000-4000-8000-000000000007',
    name: '铝箔保温袋 适配3号',
    productModel: '适配3号泡沫箱',
    price: 1.8,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 80,
    maxCapacityG: null,
  },
  {
    id: '20000000-0000-4000-8000-000000000008',
    name: '铝箔保温袋 适配4号',
    productModel: '适配4号泡沫箱',
    price: 1.4,
    ratio: 1,
    purchaseUnit: '个',
    weightG: 65,
    maxCapacityG: null,
  },
] as const;

const HEALTH_TAGS = [
  {
    id: '40000000-0000-4000-8000-000000000001',
    key: 'daily',
    name: '日常主食',
    color: '#2f855a',
  },
  {
    id: '40000000-0000-4000-8000-000000000002',
    key: 'digestive',
    name: '肠胃友好',
    color: '#3182ce',
  },
  {
    id: '40000000-0000-4000-8000-000000000003',
    key: 'high_protein',
    name: '高蛋白',
    color: '#c05621',
  },
  {
    id: '40000000-0000-4000-8000-000000000004',
    key: 'skin_coat',
    name: '皮毛护理',
    color: '#805ad5',
  },
  {
    id: '40000000-0000-4000-8000-000000000005',
    key: 'omega',
    name: '脂肪酸补充',
    color: '#0d9488',
  },
  {
    id: '40000000-0000-4000-8000-000000000006',
    key: 'light',
    name: '清淡低负担',
    color: '#64748b',
  },
] as const;

const RECIPES = [
  {
    recipeId: '30000000-0000-4000-8000-000000000001',
    rowId: '31000000-0000-4000-8000-000000000001',
    name: '鸡肉南瓜基础鲜食',
    coverTitle: '鸡肉南瓜',
    energy: 1420,
    tags: ['daily', 'digestive'],
    stages: ['ADULT', 'SENIOR'],
    description: '适合作为日常测试订单的基础款鲜食，口味温和。',
    items: [
      ['10000000-0000-4000-8000-000000000001', 62],
      ['10000000-0000-4000-8000-000000000005', 23],
      ['10000000-0000-4000-8000-000000000006', 10],
      ['10000000-0000-4000-8000-000000000008', 5],
    ],
  },
  {
    recipeId: '30000000-0000-4000-8000-000000000002',
    rowId: '31000000-0000-4000-8000-000000000002',
    name: '牛肉胡萝卜活力鲜食',
    coverTitle: '牛肉胡萝卜',
    energy: 1580,
    tags: ['high_protein', 'daily'],
    stages: ['ADULT'],
    description: '用于测试较高客单价和牛肉原料采购链路。',
    items: [
      ['10000000-0000-4000-8000-000000000002', 64],
      ['10000000-0000-4000-8000-000000000006', 16],
      ['10000000-0000-4000-8000-000000000007', 15],
      ['10000000-0000-4000-8000-000000000004', 5],
    ],
  },
  {
    recipeId: '30000000-0000-4000-8000-000000000003',
    rowId: '31000000-0000-4000-8000-000000000003',
    name: '三文鱼红薯美毛鲜食',
    coverTitle: '三文鱼红薯',
    energy: 1510,
    tags: ['skin_coat', 'omega'],
    stages: ['PUPPY', 'ADULT'],
    description: '用于测试皮毛护理标签、三文鱼高价原料和订单快照。',
    items: [
      ['10000000-0000-4000-8000-000000000003', 58],
      ['10000000-0000-4000-8000-000000000007', 25],
      ['10000000-0000-4000-8000-000000000005', 12],
      ['10000000-0000-4000-8000-000000000004', 5],
    ],
  },
  {
    recipeId: '30000000-0000-4000-8000-000000000004',
    rowId: '31000000-0000-4000-8000-000000000004',
    name: '鸡蛋米饭肠胃友好鲜食',
    coverTitle: '肠胃友好',
    energy: 1360,
    tags: ['digestive', 'light'],
    stages: ['SENIOR', 'ADULT'],
    description: '用于测试低价温和配方和老年犬场景。',
    items: [
      ['10000000-0000-4000-8000-000000000001', 38],
      ['10000000-0000-4000-8000-000000000004', 22],
      ['10000000-0000-4000-8000-000000000008', 25],
      ['10000000-0000-4000-8000-000000000005', 15],
    ],
  },
] as const;

async function upsertFoodIngredients() {
  for (const ingredient of FOOD_INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { id: ingredient.id },
      update: {
        name: ingredient.name,
        type: IngredientType.FOOD,
        procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
        diyEnabled: true,
        procurementEnabled: true,
        baseUnit: BaseUnit.G,
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPricePerPurchaseUnit: ingredient.pricePerKg,
        effectivePricePerPurchaseUnit: ingredient.pricePerKg,
        purchaseChannel: '盒马/山姆测试来源',
        properties: {
          cfct_class: '测试鲜食原料',
          edible_yield_rate: ingredient.yieldRate,
          main_nutrients_desc: ingredient.desc,
        },
      },
      create: {
        id: ingredient.id,
        name: ingredient.name,
        type: IngredientType.FOOD,
        procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
        diyEnabled: true,
        procurementEnabled: true,
        baseUnit: BaseUnit.G,
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPricePerPurchaseUnit: ingredient.pricePerKg,
        effectivePricePerPurchaseUnit: ingredient.pricePerKg,
        purchaseChannel: '盒马/山姆测试来源',
        properties: {
          cfct_class: '测试鲜食原料',
          edible_yield_rate: ingredient.yieldRate,
          main_nutrients_desc: ingredient.desc,
        },
      },
    });

    await prisma.procurementSku.upsert({
      where: { id: ingredient.skuId },
      update: {
        ingredientId: ingredient.id,
        name: `${ingredient.name} 商超测试SKU`,
        purchaseChannel: '盒马/山姆测试来源',
        supplierName: '本地测试供应商',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: ingredient.pricePerKg,
        referencePurchasePrice: ingredient.pricePerKg,
        referencePricePerPurchaseUnit: ingredient.pricePerKg,
        sourceTier: ProcurementSkuSourceTier.MARKET_PREMIUM,
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
      create: {
        id: ingredient.skuId,
        ingredientId: ingredient.id,
        name: `${ingredient.name} 商超测试SKU`,
        purchaseChannel: '盒马/山姆测试来源',
        supplierName: '本地测试供应商',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: ingredient.pricePerKg,
        referencePurchasePrice: ingredient.pricePerKg,
        referencePricePerPurchaseUnit: ingredient.pricePerKg,
        sourceTier: ProcurementSkuSourceTier.MARKET_PREMIUM,
        isDefault: true,
        isActive: true,
        sortOrder: 0,
      },
    });
  }
}

async function upsertPackagingIngredients() {
  for (const item of PACKAGING_INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        type: IngredientType.PACKAGING,
        procurementStrategy: IngredientProcurementStrategy.STOCK_REPLENISHMENT,
        diyEnabled: false,
        procurementEnabled: false,
        productModel: item.productModel,
        baseUnit: BaseUnit.PCS,
        purchaseUnit: item.purchaseUnit,
        purchaseToBaseRatio: item.ratio,
        currentPricePerPurchaseUnit: item.price,
        effectivePricePerPurchaseUnit: item.price,
        weightG: item.weightG,
        maxCapacityG: item.maxCapacityG,
        properties: { is_consumable: true },
      },
      create: {
        id: item.id,
        name: item.name,
        type: IngredientType.PACKAGING,
        procurementStrategy: IngredientProcurementStrategy.STOCK_REPLENISHMENT,
        diyEnabled: false,
        procurementEnabled: false,
        productModel: item.productModel,
        baseUnit: BaseUnit.PCS,
        purchaseUnit: item.purchaseUnit,
        purchaseToBaseRatio: item.ratio,
        currentPricePerPurchaseUnit: item.price,
        effectivePricePerPurchaseUnit: item.price,
        weightG: item.weightG,
        maxCapacityG: item.maxCapacityG,
        properties: { is_consumable: true },
      },
    });
  }
}

async function upsertHealthTags() {
  for (const tag of HEALTH_TAGS) {
    await prisma.recipeHealthTag.upsert({
      where: { id: tag.id },
      update: {
        name: tag.name,
        description: '本地测试标签',
        color: tag.color,
        sort: HEALTH_TAGS.findIndex((item) => item.id === tag.id),
      },
      create: {
        id: tag.id,
        name: tag.name,
        description: '本地测试标签',
        color: tag.color,
        sort: HEALTH_TAGS.findIndex((item) => item.id === tag.id),
      },
    });
  }
}

async function upsertRecipes() {
  for (const recipe of RECIPES) {
    await prisma.recipe.upsert({
      where: {
        recipeId_version: {
          recipeId: recipe.recipeId,
          version: 1,
        },
      },
      update: {
        id: recipe.rowId,
        name: recipe.name,
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: recipe.energy,
        productionLossRate: 1.07,
        batchLaborHours: 2,
        applicableLifeStages: recipe.stages,
        targetHealthTags: recipe.tags,
        coverTitle: recipe.coverTitle,
        description: recipe.description,
        productionSteps: '本地测试数据：称重、蒸煮、冷却、分装。',
      },
      create: {
        id: recipe.rowId,
        recipeId: recipe.recipeId,
        version: 1,
        name: recipe.name,
        status: RecipeStatus.PUBLIC,
        energyDensityKcalPerKg: recipe.energy,
        productionLossRate: 1.07,
        batchLaborHours: 2,
        applicableLifeStages: recipe.stages,
        targetHealthTags: recipe.tags,
        coverTitle: recipe.coverTitle,
        description: recipe.description,
        productionSteps: '本地测试数据：称重、蒸煮、冷却、分装。',
      },
    });

    await prisma.recipeItem.deleteMany({
      where: { recipeId: recipe.recipeId, recipeVersion: 1 },
    });

    await prisma.recipeHealthTagAssignment.deleteMany({
      where: { recipeId: recipe.rowId },
    });

    for (const key of recipe.tags) {
      const tag = HEALTH_TAGS.find((item) => item.key === key);
      if (!tag) {
        continue;
      }

      await prisma.recipeHealthTagAssignment.create({
        data: {
          recipeId: recipe.rowId,
          healthTagId: tag.id,
        },
      });
    }

    for (const [index, [ingredientId, ratio]] of recipe.items.entries()) {
      await prisma.recipeItem.create({
        data: {
          recipeId: recipe.recipeId,
          recipeVersion: 1,
          ingredientId,
          ratioPercent: ratio,
          sortOrder: index,
          preparationMethod: '蒸熟后混合',
        },
      });
    }
  }
}

async function main() {
  await upsertFoodIngredients();
  await upsertPackagingIngredients();
  await upsertHealthTags();
  await upsertRecipes();

  const [ingredientCount, recipeCount] = await Promise.all([
    prisma.ingredient.count(),
    prisma.recipe.count({ where: { status: RecipeStatus.PUBLIC } }),
  ]);

  console.log(
    `Seeded local test data: ${recipeCount} public recipes, ${ingredientCount} ingredients.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
