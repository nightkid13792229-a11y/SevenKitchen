import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DogsController } from './interfaces/controllers/dogs.controller';
import { RecipesController } from './interfaces/controllers/recipes.controller';
import { HealthController } from './interfaces/controllers/health.controller';
import { OrdersController } from './interfaces/controllers/orders.controller';
import { AddressesController } from './interfaces/controllers/addresses.controller';
import { AuthController } from './interfaces/controllers/auth.controller';
import { AdminController } from './interfaces/controllers/admin.controller';
import { ShippingController } from './interfaces/controllers/shipping.controller';
import { StaffKitchenController } from './interfaces/controllers/staff-kitchen.controller';
import { StaffShippingController } from './interfaces/controllers/staff-shipping.controller';
import {
  DogService,
  DOG_REPOSITORY,
  RECIPE_REPOSITORY,
} from './application/dog/dog.service';
import { InMemoryDogRepository } from './infrastructure/repositories/in-memory-dog.repository';
import { PrismaDogRepository } from './infrastructure/repositories/prisma-dog.repository';
import { InMemoryRecipeRepository } from './infrastructure/repositories/in-memory-recipe.repository';
import { PrismaRecipeRepository } from './infrastructure/repositories/prisma-recipe.repository';
import { InMemoryOrderRepository } from './infrastructure/repositories/in-memory-order.repository';
import { FileBackedOrderRepository } from './infrastructure/repositories/file-backed-order.repository';
import { PrismaOrderRepository } from './infrastructure/repositories/prisma-order.repository';
import { PrismaService } from './infrastructure/prisma.service';
import { InMemoryAddressRepository } from './infrastructure/repositories/in-memory-address.repository';
import { PrismaAddressRepository } from './infrastructure/repositories/prisma-address.repository';
import { RECIPE_REPOSITORY_TOKEN } from './interfaces/controllers/recipes.controller';
import { OrderService, ORDER_REPOSITORY } from './application/order/order.service';
import {
  AddressService,
  ADDRESS_REPOSITORY,
} from './application/address/address.service';
import { DiySheetService } from './application/recipe/diy-sheet.service';
import { JwtAuthService } from './interfaces/auth/jwt.service';
import { AuthGuard } from './interfaces/auth/auth.guard';
import {
  IngredientService,
  INGREDIENT_REPOSITORY,
} from './application/ingredient/ingredient.service';
import { InMemoryIngredientRepository } from './infrastructure/repositories/in-memory-ingredient.repository';
import { Ingredient } from './domain/ingredient';
import { IngredientType, BaseUnit } from './domain/ingredient/enums';
import { randomUUID } from 'crypto';
import { GlobalConfigService } from './application/config/global-config.service';
import { PricingService } from './domain/pricing/pricing.service';
import { ShippingFeeService } from './domain/shipping/shipping-fee.service';
import { ShippingService } from './application/shipping/shipping.service';
import { ShippingFulfillmentService } from './application/shipping/shipping-fulfillment.service';
import { InMemoryShippingTemplateRepository } from './infrastructure/repositories/in-memory-shipping-template.repository';
import { SHIPPING_TEMPLATE_REPOSITORY } from './application/shipping/shipping.service.tokens';
import type { ShippingTemplate } from './domain/shipping/shipping-fee.service';
import { ProductionService, PRODUCTION_BATCH_REPOSITORY } from './application/production/production.service';
import { PrismaProductionRepository } from './infrastructure/repositories/prisma-production.repository';
import { KitchenService } from './application/kitchen/kitchen.service';
import { InventoryService, INVENTORY_REPOSITORY } from './application/inventory/inventory.service';
import { PrismaInventoryRepository } from './infrastructure/repositories/prisma-inventory.repository';

// Compute if Prisma is enabled based on repo switches
const isPrismaEnabled = (): boolean => {
  return (
    process.env.ORDER_REPO === 'prisma' ||
    process.env.ADDRESS_REPO === 'prisma' ||
    process.env.DOG_REPO === 'prisma' ||
    process.env.RECIPE_REPO === 'prisma' ||
    process.env.SHIPPING_REPO === 'prisma' ||
    process.env.PRODUCTION_REPO === 'prisma'
  );
};

// Validate DATABASE_URL when Prisma is enabled
const validatePrismaConfig = (): void => {
  if (isPrismaEnabled()) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl || dbUrl.trim().length === 0) {
      throw new Error(
        'DATABASE_URL is required when Prisma repo mode is enabled. ' +
          'Please set DATABASE_URL environment variable (e.g., DATABASE_URL=postgres://user:pass@host:port/db)',
      );
    }
  }
};

// Call validation at module load time
validatePrismaConfig();

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
      },
    }),
  ],
  controllers: [
    DogsController,
    RecipesController,
    HealthController,
    OrdersController,
    AddressesController,
    AuthController,
    AdminController,
    ShippingController,
    StaffKitchenController,
    StaffShippingController,
  ],
  providers: [
    DogService,
    {
      provide: DOG_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.DOG_REPO ?? 'memory';
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaDogRepository(prismaService);
        }
        return new InMemoryDogRepository();
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: RECIPE_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.RECIPE_REPO ?? 'memory';
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaRecipeRepository(prismaService);
        }
        return new InMemoryRecipeRepository();
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: RECIPE_REPOSITORY_TOKEN,
      useExisting: RECIPE_REPOSITORY, // Use same instance as RECIPE_REPOSITORY
    },
    // PrismaService: only provide when Prisma is enabled
    ...(isPrismaEnabled()
      ? [
          {
            provide: PrismaService,
            useFactory: () => {
              // eslint-disable-next-line no-console
              console.log({
                prismaEnabled: true,
                hasDatabaseUrl: !!process.env.DATABASE_URL,
              });
              return new PrismaService();
            },
          },
        ]
      : []),
    OrderService,
    AddressService,
    {
      provide: ADDRESS_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.ADDRESS_REPO ?? 'memory';
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaAddressRepository(prismaService);
        }
        return new InMemoryAddressRepository();
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    DiySheetService,
    JwtAuthService,
    AuthGuard,
    IngredientService,
    {
      provide: INGREDIENT_REPOSITORY,
      useClass: InMemoryIngredientRepository,
    },
    GlobalConfigService,
    PricingService,
    ShippingFeeService,
    ShippingService,
    {
      provide: SHIPPING_TEMPLATE_REPOSITORY,
      useClass: InMemoryShippingTemplateRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.ORDER_REPO ?? 'memory';
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaOrderRepository(prismaService);
        }

        if (
          mode === 'file' ||
          (process.env.NODE_ENV === 'development' && mode !== 'memory')
        ) {
          return new FileBackedOrderRepository();
        }

        return new InMemoryOrderRepository();
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Phase 8.10: Production Service
    ProductionService,
    // Phase 8.12: Kitchen Service
    KitchenService,
    // Phase 8.13: Inventory Service
    InventoryService,
    // Phase 8.14: Shipping Fulfillment Service
    ShippingFulfillmentService,
    {
      provide: PRODUCTION_BATCH_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.PRODUCTION_REPO ?? 'prisma'; // Default to Prisma for production
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaProductionRepository(prismaService);
        }
        // For MVP, only Prisma is supported
        throw new Error(
          'Production repository only supports Prisma mode. Set PRODUCTION_REPO=prisma and ensure DATABASE_URL is set.',
        );
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Phase 8.13: Inventory Repository
    {
      provide: INVENTORY_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.INVENTORY_REPO ?? 'prisma'; // Default to Prisma
        if (mode === 'prisma') {
          if (!prismaService) {
            throw new Error(
              'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
            );
          }
          return new PrismaInventoryRepository(prismaService);
        }
        throw new Error(
          'Inventory repository only supports Prisma mode. Set INVENTORY_REPO=prisma and ensure DATABASE_URL is set.',
        );
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    // Inject using RECIPE_REPOSITORY token - same instance used by controllers via RECIPE_REPOSITORY_TOKEN (aliased)
    @Inject(RECIPE_REPOSITORY)
    private readonly recipeRepository: InMemoryRecipeRepository,
    @Inject(INGREDIENT_REPOSITORY)
    private readonly ingredientRepository: InMemoryIngredientRepository,
    @Inject(SHIPPING_TEMPLATE_REPOSITORY)
    private readonly shippingTemplateRepository: InMemoryShippingTemplateRepository,
  ) {}

  async onModuleInit() {
    // Phase 5: Seed ingredients first
    await this.seedIngredients();

    // Phase 6: Seed shipping template
    await this.seedShippingTemplate();

    // Seed ONE canonical recipe for Phase 4.3 - MVP end-to-end testing
    // Fixed UUID v4 ensures idempotent seeding and passes @IsUUID('4') validation
    const CANONICAL_RECIPE_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

    // Check if recipe already exists (idempotent)
    const existingRecipe =
      await this.recipeRepository.findById(CANONICAL_RECIPE_ID);
    if (existingRecipe) {
      // Verify it's PUBLIC and visible
      const publicRecipes = await this.recipeRepository.findPublicRecipes();
      const isPublic = existingRecipe.status === 'PUBLIC';
      console.log(
        `[Seed] Recipe exists (id=${CANONICAL_RECIPE_ID}), status=${existingRecipe.status}, PUBLIC=${isPublic}, total PUBLIC recipes=${publicRecipes.length}`,
      );
      if (!isPublic) {
        console.warn(
          `[Seed] WARNING: Recipe exists but status is not PUBLIC. Re-seeding...`,
        );
        // Continue to re-seed below
      } else {
        return; // Recipe exists and is PUBLIC, skip seeding
      }
    }

    // Get seeded ingredient IDs
    const ingredients = await this.ingredientRepository.findAll();
    const chickenBreast = ingredients.find((i) => i.name === '鸡胸肉');
    const pumpkin = ingredients.find((i) => i.name === '南瓜');
    const vacuumBag = ingredients.find((i) => i.name === '真空袋');
    const productLabel = ingredients.find((i) => i.name === '产品标签');

    if (!chickenBreast || !pumpkin || !vacuumBag || !productLabel) {
      console.error(
        '[Seed] ERROR: Required ingredients not found. Recipe seeding failed.',
      );
      console.error(
        `[Seed] Found ingredients: ${ingredients.map((i) => i.name).join(', ')}`,
      );
      // Don't throw - allow server to start, but log error
      return;
    }

    // Seed canonical recipe with items
    // CRITICAL: status must be 'PUBLIC' (exact string match) for findPublicRecipes() to return it
    const seedRecipe = {
      id: CANONICAL_RECIPE_ID,
      version: 1,
      name: 'Chicken Pumpkin Bowl',
      status: 'PUBLIC' as const, // Explicitly PUBLIC status
      energyDensityKcalPerKg: 1200, // 120 kcal/100g = 1200 kcal/kg
      productionLossRate: 1.07,
      batchLaborHours: 2.0,
      items: [
        {
          id: randomUUID(),
          ingredientId: chickenBreast.id,
          ratioPercent: 70.0,
          isPrimarySource: true,
        },
        {
          id: randomUUID(),
          ingredientId: pumpkin.id,
          ratioPercent: 30.0,
          isPrimarySource: false,
        },
        // Packaging items (consumable, per pack)
        {
          id: randomUUID(),
          ingredientId: vacuumBag.id,
          ratioPercent: null,
          isPrimarySource: false,
        },
        {
          id: randomUUID(),
          ingredientId: productLabel.id,
          ratioPercent: null,
          isPrimarySource: false,
        },
      ],
    };

    await this.recipeRepository.save(seedRecipe);
    
    // Verify the recipe was saved and is PUBLIC
    const savedRecipe = await this.recipeRepository.findById(CANONICAL_RECIPE_ID);
    const publicRecipes = await this.recipeRepository.findPublicRecipes();
    const isPublic = savedRecipe?.status === 'PUBLIC';
    
    console.log(
      `[Seed] Seeded MVP recipe: Chicken Pumpkin Bowl (id=${CANONICAL_RECIPE_ID})`,
    );
    console.log(
      `[Seed] Verification: saved=${!!savedRecipe}, status=${savedRecipe?.status}, PUBLIC=${isPublic}, total PUBLIC recipes=${publicRecipes.length}`,
    );
    
    if (!isPublic || publicRecipes.length === 0) {
      console.error(
        `[Seed] ERROR: Recipe was saved but is not visible in findPublicRecipes(). This is a critical issue.`,
      );
    }
  }

  /**
   * Seed canonical ingredients for MVP
   * Phase 5: Ingredients + Recipe Costing
   */
  private async seedIngredients(): Promise<void> {
    // Fixed UUID v4 for idempotent seeding
    const CHICKEN_BREAST_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';
    const PUMPKIN_ID = '5fa85f64-5717-4562-b3fc-2c963f66afa6';
    const VACUUM_BAG_ID = '6fa85f64-5717-4562-b3fc-2c963f66afa6';
    const PRODUCT_LABEL_ID = '7fa85f64-5717-4562-b3fc-2c963f66afa6';

    // Check if ingredients already exist (idempotent)
    const existingChicken = await this.ingredientRepository.findById(
      CHICKEN_BREAST_ID,
    );
    if (existingChicken) {
      console.log('[Seed] Ingredients exist, skipping seed');
      return;
    }

    // 1. Chicken breast (FOOD)
    const chickenBreast = new Ingredient(
      CHICKEN_BREAST_ID,
      '鸡胸肉',
      IngredientType.FOOD,
      'Kirkland', // brand
      '1kg装', // product_model
      '山姆会员店', // purchase_channel
      null, // notes
      BaseUnit.G,
      null, // unit_display_label (uses default "克")
      'kg', // purchase_unit
      1000.0, // purchase_to_base_ratio (1kg = 1000g)
      45.0, // current_price_per_purchase_unit (45 CNY per kg)
      null, // weight_g (not needed for base_unit=G)
      null, // max_capacity_g
      {
        cfct_class: '畜肉类',
        edible_yield_rate: 1.0, // No bones, 100% yield
        main_nutrients_desc: '高蛋白，低脂肪',
      },
    );

    // 2. Pumpkin (FOOD)
    const pumpkin = new Ingredient(
      PUMPKIN_ID,
      '南瓜',
      IngredientType.FOOD,
      '本地供应商',
      '500g装',
      '拼多多',
      null,
      BaseUnit.G,
      null,
      'kg',
      1000.0,
      8.0, // 8 CNY per kg
      null,
      null,
      {
        cfct_class: '蔬菜类',
        edible_yield_rate: 0.85, // 85% yield after peeling
        main_nutrients_desc: '富含纤维和β-胡萝卜素',
      },
    );

    // 3. Vacuum bag (PACKAGING, consumable)
    const vacuumBag = new Ingredient(
      VACUUM_BAG_ID,
      '真空袋',
      IngredientType.PACKAGING,
      '通用包装',
      '标准真空袋',
      '1688',
      null,
      BaseUnit.PCS,
      null,
      '包',
      100.0, // 1 package = 100 pcs
      15.0, // 15 CNY per package (0.15 CNY per bag)
      5.0, // weight_g: 5g per bag
      null, // max_capacity_g (not applicable for bags)
      {
        is_consumable: true,
      },
    );

    // 4. Product label (PACKAGING, consumable)
    const productLabel = new Ingredient(
      PRODUCT_LABEL_ID,
      '产品标签',
      IngredientType.PACKAGING,
      '通用标签',
      '标准标签',
      '1688',
      null,
      BaseUnit.PCS,
      null,
      '包',
      1000.0, // 1 package = 1000 pcs
      20.0, // 20 CNY per package (0.02 CNY per label)
      0.5, // weight_g: 0.5g per label
      null,
      {
        is_consumable: true,
      },
    );

    await this.ingredientRepository.save(chickenBreast);
    await this.ingredientRepository.save(pumpkin);
    await this.ingredientRepository.save(vacuumBag);
    await this.ingredientRepository.save(productLabel);

    console.log(
      `[Seed] Seeded 4 canonical ingredients: 鸡胸肉, 南瓜, 真空袋, 产品标签`,
    );
  }

  /**
   * Seed canonical shipping template for MVP
   * Phase 6: Shipping Fee Domain
   * Fixed UUID v4 for idempotent seeding
   */
  private async seedShippingTemplate(): Promise<void> {
    const CANONICAL_SHIPPING_TEMPLATE_ID =
      '8fa85f64-5717-4562-b3fc-2c963f66afa6';

    // Check if template already exists (idempotent)
    const existingTemplate =
      await this.shippingTemplateRepository.findById(
        CANONICAL_SHIPPING_TEMPLATE_ID,
      );
    if (existingTemplate) {
      console.log('[Seed] Shipping template exists, skipping seed');
      return;
    }

    // Create default CN shipping template
    // Based on 07_Core_Architecture.md Section 2.5 ShippingTemplate schema
    const template: ShippingTemplate = {
      id: CANONICAL_SHIPPING_TEMPLATE_ID,
      name: 'Default CN Template',
      baseWeightKg: 1.0,
      baseFee: 12.0, // CNY
      stepWeightKg: 1.0,
      stepFee: 5.0, // CNY per step
      vasFeePerOrder: 3.0, // CNY
      isActive: true,
    };

    await this.shippingTemplateRepository.save(template);
    console.log(
      `[Seed] Seeded shipping template: Default CN Template (id=${CANONICAL_SHIPPING_TEMPLATE_ID})`,
    );
  }
}
