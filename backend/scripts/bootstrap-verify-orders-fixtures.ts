import {
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
  PrismaClient,
  ProcurementSkuSourceTier,
  RecipeStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.ENV_FILE || '.env' });

const prisma = new PrismaClient();

const FIXTURES = {
  customer: {
    id: 'ci-test-user',
    nickname: 'CI Test User',
  },
  ingredient: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'CI Verify Ingredient',
  },
  recipe: {
    id: '22222222-2222-4222-8222-222222222222',
    version: 1,
    name: 'CI Verify Public Recipe',
  },
  recipeItem: {
    id: '33333333-3333-4333-8333-333333333333',
  },
  procurementSku: {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'CI Verify Market SKU',
  },
  packaging: {
    labelId: '22831322-3463-49c7-8346-f5cc14277943',
    icePackId: '1e3d5990-e553-44fb-8bb9-6144593b6899',
    vacuumBagIds: [
      '55555555-5555-4555-8555-555555555551',
      '55555555-5555-4555-8555-555555555552',
      '55555555-5555-4555-8555-555555555553',
      '55555555-5555-4555-8555-555555555554',
    ],
    foamBoxId: '66666666-6666-4666-8666-666666666666',
    thermalBagId: '77777777-7777-4777-8777-777777777777',
  },
} as const;

type PackagingFixture = {
  id: string;
  name: string;
  productModel: string | null;
  currentPricePerPurchaseUnit: number;
  weightG: number;
  maxCapacityG?: number;
};

async function bootstrapCustomer(): Promise<void> {
  await prisma.user.upsert({
    where: { id: FIXTURES.customer.id },
    update: {
      nickname: FIXTURES.customer.nickname,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
    create: {
      id: FIXTURES.customer.id,
      nickname: FIXTURES.customer.nickname,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  });
}

async function bootstrapIngredient(): Promise<void> {
  await prisma.ingredient.upsert({
    where: { id: FIXTURES.ingredient.id },
    update: {
      name: FIXTURES.ingredient.name,
      type: IngredientType.FOOD,
      procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
      diyEnabled: false,
      procurementEnabled: true,
      baseUnit: BaseUnit.G,
      purchaseUnit: 'kg',
      purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 50,
      effectivePricePerPurchaseUnit: 50,
      properties: {
        edible_yield_rate: 0.8,
        cfct_class: 'CI',
        main_nutrients_desc: 'CI verification ingredient',
      },
    },
    create: {
      id: FIXTURES.ingredient.id,
      name: FIXTURES.ingredient.name,
      type: IngredientType.FOOD,
      procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
      diyEnabled: false,
      procurementEnabled: true,
      baseUnit: BaseUnit.G,
      purchaseUnit: 'kg',
      purchaseToBaseRatio: 1000,
      currentPricePerPurchaseUnit: 50,
      effectivePricePerPurchaseUnit: 50,
      properties: {
        edible_yield_rate: 0.8,
        cfct_class: 'CI',
        main_nutrients_desc: 'CI verification ingredient',
      },
    },
  });
}

async function bootstrapRecipe(): Promise<void> {
  await prisma.recipe.upsert({
    where: {
      recipeId_version: {
        recipeId: FIXTURES.recipe.id,
        version: FIXTURES.recipe.version,
      },
    },
    update: {
      name: FIXTURES.recipe.name,
      status: RecipeStatus.PUBLIC,
      energyDensityKcalPerKg: 1450,
      productionLossRate: 1.07,
      batchLaborHours: 2,
    },
    create: {
      recipeId: FIXTURES.recipe.id,
      version: FIXTURES.recipe.version,
      name: FIXTURES.recipe.name,
      status: RecipeStatus.PUBLIC,
      energyDensityKcalPerKg: 1450,
      productionLossRate: 1.07,
      batchLaborHours: 2,
    },
  });

  await prisma.recipeItem.upsert({
    where: { id: FIXTURES.recipeItem.id },
    update: {
      recipeId: FIXTURES.recipe.id,
      recipeVersion: FIXTURES.recipe.version,
      ingredientId: FIXTURES.ingredient.id,
      ratioPercent: 100,
      sortOrder: 0,
    },
    create: {
      id: FIXTURES.recipeItem.id,
      recipeId: FIXTURES.recipe.id,
      recipeVersion: FIXTURES.recipe.version,
      ingredientId: FIXTURES.ingredient.id,
      ratioPercent: 100,
      sortOrder: 0,
    },
  });

  await prisma.recipeItem.deleteMany({
    where: {
      recipeId: FIXTURES.recipe.id,
      recipeVersion: FIXTURES.recipe.version,
      id: {
        not: FIXTURES.recipeItem.id,
      },
    },
  });
}

async function bootstrapProcurementSku(): Promise<void> {
  await prisma.procurementSku.upsert({
    where: { id: FIXTURES.procurementSku.id },
    update: {
      ingredientId: FIXTURES.ingredient.id,
      name: FIXTURES.procurementSku.name,
      purchaseChannel: '山姆',
      supplierName: 'CI Fixture Supplier',
      purchaseUnit: 'kg',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: 50,
      referencePurchasePrice: 50,
      referencePricePerPurchaseUnit: 50,
      sourceTier: ProcurementSkuSourceTier.MARKET_PREMIUM,
      isDefault: true,
      isActive: true,
      sortOrder: 0,
    },
    create: {
      id: FIXTURES.procurementSku.id,
      ingredientId: FIXTURES.ingredient.id,
      name: FIXTURES.procurementSku.name,
      purchaseChannel: '山姆',
      supplierName: 'CI Fixture Supplier',
      purchaseUnit: 'kg',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: 50,
      referencePurchasePrice: 50,
      referencePricePerPurchaseUnit: 50,
      sourceTier: ProcurementSkuSourceTier.MARKET_PREMIUM,
      isDefault: true,
      isActive: true,
      sortOrder: 0,
    },
  });

  await prisma.procurementSku.deleteMany({
    where: {
      ingredientId: FIXTURES.ingredient.id,
      id: {
        not: FIXTURES.procurementSku.id,
      },
    },
  });
}

async function upsertPackagingIngredient(
  fixture: PackagingFixture,
): Promise<void> {
  await prisma.ingredient.upsert({
    where: { id: fixture.id },
    update: {
      name: fixture.name,
      type: IngredientType.PACKAGING,
      procurementStrategy: IngredientProcurementStrategy.STOCK_REPLENISHMENT,
      diyEnabled: false,
      procurementEnabled: false,
      productModel: fixture.productModel,
      baseUnit: BaseUnit.PCS,
      purchaseUnit: '个',
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: fixture.currentPricePerPurchaseUnit,
      effectivePricePerPurchaseUnit: fixture.currentPricePerPurchaseUnit,
      weightG: fixture.weightG,
      maxCapacityG: fixture.maxCapacityG ?? null,
      properties: {
        is_consumable: true,
      },
    },
    create: {
      id: fixture.id,
      name: fixture.name,
      type: IngredientType.PACKAGING,
      procurementStrategy: IngredientProcurementStrategy.STOCK_REPLENISHMENT,
      diyEnabled: false,
      procurementEnabled: false,
      productModel: fixture.productModel,
      baseUnit: BaseUnit.PCS,
      purchaseUnit: '个',
      purchaseToBaseRatio: 1,
      currentPricePerPurchaseUnit: fixture.currentPricePerPurchaseUnit,
      effectivePricePerPurchaseUnit: fixture.currentPricePerPurchaseUnit,
      weightG: fixture.weightG,
      maxCapacityG: fixture.maxCapacityG ?? null,
      properties: {
        is_consumable: true,
      },
    },
  });
}

async function bootstrapPackagingFixtures(): Promise<void> {
  const packagingFixtures: PackagingFixture[] = [
    {
      id: FIXTURES.packaging.vacuumBagIds[0],
      name: '食品真空袋',
      productModel: '10×15cm',
      currentPricePerPurchaseUnit: 0.1,
      weightG: 2,
    },
    {
      id: FIXTURES.packaging.vacuumBagIds[1],
      name: '食品真空袋',
      productModel: '12×17cm',
      currentPricePerPurchaseUnit: 0.12,
      weightG: 3,
    },
    {
      id: FIXTURES.packaging.vacuumBagIds[2],
      name: '食品真空袋',
      productModel: '15×20cm',
      currentPricePerPurchaseUnit: 0.15,
      weightG: 4,
    },
    {
      id: FIXTURES.packaging.vacuumBagIds[3],
      name: '食品真空袋',
      productModel: '20×25cm',
      currentPricePerPurchaseUnit: 0.2,
      weightG: 5,
    },
    {
      id: FIXTURES.packaging.labelId,
      name: '产品标签',
      productModel: '默认',
      currentPricePerPurchaseUnit: 0.05,
      weightG: 1,
    },
    {
      id: FIXTURES.packaging.foamBoxId,
      name: '泡沫箱',
      productModel: '4号箱',
      currentPricePerPurchaseUnit: 6,
      weightG: 200,
      maxCapacityG: 3000,
    },
    {
      id: FIXTURES.packaging.thermalBagId,
      name: '铝箔保温袋',
      productModel: '适配4号',
      currentPricePerPurchaseUnit: 1.5,
      weightG: 80,
    },
    {
      id: FIXTURES.packaging.icePackId,
      name: '冰袋',
      productModel: '标准',
      currentPricePerPurchaseUnit: 1,
      weightG: 250,
    },
  ];

  for (const fixture of packagingFixtures) {
    await upsertPackagingIngredient(fixture);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL 未设置，无法准备 verify-orders 所需的 CI 测试数据。',
    );
  }

  console.log('Bootstrapping verify-orders fixtures...');

  await bootstrapCustomer();
  await bootstrapIngredient();
  await bootstrapRecipe();
  await bootstrapProcurementSku();
  await bootstrapPackagingFixtures();

  console.log(
    `verify-orders fixtures ready: customer=${FIXTURES.customer.id}, ingredient=${FIXTURES.ingredient.id}, recipe=${FIXTURES.recipe.id}, procurementSku=${FIXTURES.procurementSku.id}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Failed to bootstrap verify-orders fixtures:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
