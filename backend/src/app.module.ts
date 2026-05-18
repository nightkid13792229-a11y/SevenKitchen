import { Module, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { DogsController } from './interfaces/controllers/dogs.controller';
import { RecipesController } from './interfaces/controllers/recipes.controller';
import { HealthController } from './interfaces/controllers/health.controller';
import { OrdersController } from './interfaces/controllers/orders.controller';
import { AddressesController } from './interfaces/controllers/addresses.controller';
import { AuthController } from './interfaces/controllers/auth.controller';
import { AdminController } from './interfaces/controllers/admin.controller';
import { AdminFinanceController } from './interfaces/controllers/admin-finance.controller';
import { ShippingController } from './interfaces/controllers/shipping.controller';
import { UsersController } from './interfaces/controllers/users.controller';
import { StaffKitchenController } from './interfaces/controllers/staff-kitchen.controller';
import { StaffShippingController } from './interfaces/controllers/staff-shipping.controller';
import { HealthRecordsController } from './interfaces/controllers/health-records.controller';
import { HealthNotificationController } from './interfaces/controllers/health-notification.controller';
import { HealthUploadController } from './interfaces/controllers/health-upload.controller';
import {
  GlobalConfigController,
  PublicGlobalConfigController,
} from './interfaces/controllers/global-config.controller';
import { ShippingTemplateController } from './interfaces/controllers/shipping-template.controller';
import { DIYSheetsController } from './interfaces/controllers/diy-sheets.controller';
import { StaffProductionPhotosController } from './interfaces/controllers/staff-production-photos.controller';
import { AftersalePhotosController } from './interfaces/controllers/aftersale-photos.controller';
import { FavoritesController } from './interfaces/controllers/favorites.controller';
import { StaffPurchasingController } from './interfaces/controllers/staff-purchasing.controller';
import { StaffInventoryController } from './interfaces/controllers/staff-inventory.controller';
import { AdminPurchasingController } from './interfaces/controllers/admin-purchasing.controller';
import { StaffProductionController } from './interfaces/controllers/staff-production.controller';
import { CustomRecipeController } from './interfaces/controllers/custom-recipe/custom-recipe.controller';
import { AdminCustomRecipeController } from './interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { SharedPhotosController } from './interfaces/controllers/shared-photos.controller';
import { CustomRecipeService } from './application/custom-recipe/custom-recipe.service';
import { FinanceAlertService } from './application/finance/finance-alert.service';
import { ExpenseBillService } from './application/finance/expense-bill.service';
import { FinanceReportService } from './application/finance/finance-report.service';
import { ExpenseTemplateService } from './application/finance/expense-template.service';
import { FinanceSchedulerService } from './application/scheduler/finance-scheduler.service';
import { OrderSchedulerService } from './application/scheduler/order-scheduler.service';
import { LabelModule } from './label/label.module';
import {
  DogService,
  DOG_REPOSITORY,
  RECIPE_REPOSITORY,
  PRISMA_SERVICE,
} from './application/dog/dog.service';
import { InMemoryDogRepository } from './infrastructure/repositories/in-memory-dog.repository';
import { PrismaDogRepository } from './infrastructure/repositories/prisma-dog.repository';
import { InMemoryRecipeRepository } from './infrastructure/repositories/in-memory-recipe.repository';
import { PrismaRecipeRepository } from './infrastructure/repositories/prisma-recipe.repository';
import { InMemoryOrderRepository } from './infrastructure/repositories/in-memory-order.repository';
import { FileBackedOrderRepository } from './infrastructure/repositories/file-backed-order.repository';
import { PrismaOrderRepository } from './infrastructure/repositories/prisma-order.repository';
import { PrismaService } from './infrastructure/prisma.service';
import { RecipeService } from './application/recipe/recipe.service';
import { CoverImageService } from './application/recipe/cover-image.service';
import { InMemoryAddressRepository } from './infrastructure/repositories/in-memory-address.repository';
import { PrismaAddressRepository } from './infrastructure/repositories/prisma-address.repository';
import { RECIPE_REPOSITORY_TOKEN } from './interfaces/controllers/recipes.controller';
import {
  OrderService,
  ORDER_REPOSITORY,
} from './application/order/order.service';
import { OrderSourcePlanService } from './application/order/order-source-plan.service';
import {
  AddressService,
  ADDRESS_REPOSITORY,
} from './application/address/address.service';
import { DiySheetService } from './application/recipe/diy-sheet.service';
import { DIYSheetStorageService } from './application/diy-sheet/diy-sheet-storage.service';
import { JwtAuthService } from './interfaces/auth/jwt.service';
import { AuthGuard } from './interfaces/auth/auth.guard';
import {
  IngredientService,
  INGREDIENT_REPOSITORY,
} from './application/ingredient/ingredient.service';
import { IngredientPricingService } from './application/ingredient/ingredient-pricing.service';
import { PrismaIngredientRepository } from './infrastructure/repositories/prisma-ingredient.repository';
// import { InMemoryIngredientRepository } from './infrastructure/repositories/in-memory-ingredient.repository'; // NOTE: Currently unused
// import { Ingredient } from './domain/ingredient'; // NOTE: Currently unused (seed disabled)
// import { IngredientType, BaseUnit, SupplementCategoryType } from './domain/ingredient/enums'; // NOTE: Currently unused (seed disabled)
// import { randomUUID } from 'crypto'; // NOTE: Currently unused (seed disabled)
import { GlobalConfigService } from './application/config/global-config.service';
import { PricingService } from './domain/pricing/pricing.service';
import { ShippingFeeService } from './domain/shipping/shipping-fee.service';
import { ShippingService } from './application/shipping/shipping.service';
import { ShippingFulfillmentService } from './application/shipping/shipping-fulfillment.service';
import { InMemoryShippingTemplateRepository } from './infrastructure/repositories/in-memory-shipping-template.repository';
import { PrismaShippingTemplateRepository } from './infrastructure/repositories/prisma-shipping-template.repository';
import { SHIPPING_TEMPLATE_REPOSITORY } from './application/shipping/shipping.service.tokens';
import type { ShippingTemplate } from './domain/shipping/shipping-fee.service';
import {
  ProductionService,
  PRODUCTION_BATCH_REPOSITORY,
} from './application/production/production.service';
import { ProductionCostSettlementService } from './application/production/production-cost-settlement.service';
import { PRODUCTION_COST_SETTLEMENT_SERVICE } from './application/production/production-cost-settlement.tokens';
import { PrismaProductionRepository } from './infrastructure/repositories/prisma-production.repository';
import { KitchenService } from './application/kitchen/kitchen.service';
import {
  InventoryService,
  INVENTORY_REPOSITORY,
} from './application/inventory/inventory.service';
import { PrismaInventoryRepository } from './infrastructure/repositories/prisma-inventory.repository';
import { PrismaOrderStatusHistoryRepository } from './infrastructure/repositories/prisma-order-status-history.repository';
import { ORDER_STATUS_HISTORY_REPOSITORY } from './application/order/order.service.tokens';
import { PrismaDogBreedRepository } from './infrastructure/repositories/prisma-dog-breed.repository';
import { DOG_BREED_REPOSITORY } from './application/dog/dog.service';
import {
  IngredientTagService,
  INGREDIENT_TAG_REPOSITORY,
} from './application/ingredient-tag/ingredient-tag.service';
import { PrismaIngredientTagRepository } from './infrastructure/repositories/prisma-ingredient-tag.repository';
import { TencentCosService } from './infrastructure/services/tencent-cos.service';
import { ImageOptimizationService } from './infrastructure/services/image-optimization.service';
import { PdfGeneratorService } from './infrastructure/services/pdf-generator.service';
import { WechatModule } from './infrastructure/wechat/wechat.module';
import { SmsModule } from './infrastructure/sms/sms.module';
import { WeightRecordService } from './application/weight-record/weight-record.service';
import { PrismaWeightRecordRepository } from './infrastructure/repositories/prisma-weight-record.repository';
import {
  HealthService,
  VACCINE_RECORD_REPOSITORY,
  CHECKUP_RECORD_REPOSITORY,
  MEDICAL_RECORD_REPOSITORY,
  ALLERGY_RECORD_REPOSITORY,
} from './application/health/health.service';
import {
  PrismaVaccineRecordRepository,
  PrismaCheckupRecordRepository,
  PrismaMedicalRecordRepository,
  PrismaAllergyRecordRepository,
} from './infrastructure/repositories/prisma-health.repository';
import { PackagingService } from './domain/packaging/packaging.service';
import { PrismaOrderPricingSnapshotRepository } from './infrastructure/repositories/prisma-order-pricing-snapshot.repository';
import type { IOrderPricingSnapshotRepository } from './domain/order-pricing-snapshot/order-pricing-snapshot.repository.interface';
import {
  PurchasingService,
  ReimbursementService,
  PURCHASE_LIST_REPOSITORY,
  REIMBURSEMENT_REPOSITORY,
  PURCHASE_RECORD_REPOSITORY,
} from './application/purchasing';
import { PrismaPurchaseListRepository } from './infrastructure/repositories/prisma-purchase-list.repository';
import { PrismaReimbursementRepository } from './infrastructure/repositories/prisma-reimbursement.repository';
import { PrismaPurchaseRecordRepository } from './infrastructure/repositories/prisma-purchase-record.repository';
import { StaffProductionService } from './application/production/kitchen.service';
import { NutritionFoodController } from './interfaces/controllers/nutrition-food.controller';
import { NutritionFoodService } from './application/nutrition-food/nutrition-food.service';
import { NutritionGovernanceController } from './interfaces/controllers/nutrition-governance.controller';
import { NutritionGovernanceService } from './application/nutrition-governance/nutrition-governance.service';
import { AgentProviderConfigService } from './application/nutrition-governance/agent-provider-config.service';
import { TrustedNutritionWebSearchService } from './application/nutrition-governance/trusted-nutrition-web-search.service';
import {
  DisabledLabelRecognitionProvider,
  LABEL_RECOGNITION_PROVIDER,
} from './application/nutrition-governance/label-recognition.provider';
import {
  createNutritionCandidateReviewProvider,
  NUTRITION_CANDIDATE_REVIEW_PROVIDER,
} from './application/nutrition-governance/nutrition-candidate-review.provider';
import { RecommendedProductController } from './interfaces/controllers/recommended-product.controller';
import { ProcurementSkuController } from './interfaces/controllers/procurement-sku.controller';
import { RecommendedProductService } from './application/ingredient/recommended-product.service';
import { ReviewsController } from './interfaces/controllers/reviews.controller';
import { FeedbackController } from './interfaces/controllers/feedback.controller';
import { DogProfileAnalyticsService } from './application/analytics/dog-profile-analytics.service';
import { DogProfileAnalyticsController } from './interfaces/controllers/dog-profile-analytics.controller';
import { AdminDogProfileAnalyticsController } from './interfaces/controllers/admin-dog-profile-analytics.controller';
import { ProcurementSkuService } from './application/ingredient/procurement-sku.service';
import { IngredientSuggestionsController } from './interfaces/controllers/ingredient-suggestions.controller';
import { loadEnvConfig } from './utils/env-config';

// Load environment variables before module-level Prisma validation runs.
loadEnvConfig();

// Compute if Prisma is enabled based on repo switches
const isPrismaEnabled = (): boolean => {
  // Check explicit 'prisma' settings
  if (
    process.env.ORDER_REPO === 'prisma' ||
    process.env.ADDRESS_REPO === 'prisma' ||
    process.env.DOG_REPO === 'prisma' ||
    process.env.RECIPE_REPO === 'prisma' ||
    process.env.SHIPPING_REPO === 'prisma' ||
    process.env.PRODUCTION_REPO === 'prisma' ||
    process.env.INVENTORY_REPO === 'prisma'
  ) {
    return true;
  }
  // Check defaults: PRODUCTION_REPO and INVENTORY_REPO default to 'prisma' when undefined
  const productionMode = process.env.PRODUCTION_REPO ?? 'prisma';
  const inventoryMode = process.env.INVENTORY_REPO ?? 'prisma';
  return productionMode === 'prisma' || inventoryMode === 'prisma';
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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
      },
    }),
    ScheduleModule.forRoot(),
    WechatModule,
    SmsModule,
    LabelModule,
  ],
  controllers: [
    DogsController,
    RecipesController,
    HealthController,
    OrdersController,
    AddressesController,
    AuthController,
    AdminController,
    AdminFinanceController,
    ShippingController,
    StaffKitchenController,
    StaffShippingController,
    StaffPurchasingController,
    StaffInventoryController,
    AdminPurchasingController,
    UsersController,
    HealthRecordsController,
    HealthNotificationController,
    HealthUploadController,
    GlobalConfigController,
    PublicGlobalConfigController,
    ShippingTemplateController,
    DIYSheetsController,
    StaffProductionPhotosController,
    AftersalePhotosController,
    FavoritesController,
    StaffProductionController,
    CustomRecipeController,
    AdminCustomRecipeController,
    SharedPhotosController,
    NutritionFoodController,
    NutritionGovernanceController,
    RecommendedProductController,
    ReviewsController,
    FeedbackController,
    ProcurementSkuController,
    IngredientSuggestionsController,
    ...(isPrismaEnabled()
      ? [DogProfileAnalyticsController, AdminDogProfileAnalyticsController]
      : []),
  ],
  providers: [
    DogService,
    {
      provide: DOG_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode =
          process.env.DOG_REPO ?? (isPrismaEnabled() ? 'prisma' : 'memory');
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
              console.log({
                prismaEnabled: true,
                hasDatabaseUrl: !!process.env.DATABASE_URL,
              });
              return new PrismaService();
            },
          },
          {
            provide: PRISMA_SERVICE,
            useExisting: PrismaService,
          },
        ]
      : []),
    OrderService,
    OrderSourcePlanService,
    RecipeService,
    CoverImageService,
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
    DIYSheetStorageService,
    JwtAuthService,
    AuthGuard,
    IngredientService,
    IngredientPricingService,
    {
      provide: INGREDIENT_REPOSITORY,
      useClass: PrismaIngredientRepository,
    },
    IngredientTagService,
    {
      provide: INGREDIENT_TAG_REPOSITORY,
      useClass: PrismaIngredientTagRepository,
    },
    TencentCosService,
    ImageOptimizationService,
    PdfGeneratorService,
    GlobalConfigService,
    PricingService,
    PackagingService,
    ShippingFeeService,
    ShippingService,
    PrismaShippingTemplateRepository,
    {
      provide: SHIPPING_TEMPLATE_REPOSITORY,
      useExisting: PrismaShippingTemplateRepository,
    },
    {
      provide: ORDER_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        const mode = process.env.ORDER_REPO ?? 'prisma'; // Default to Prisma for database persistence
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
    ProductionCostSettlementService,
    {
      provide: PRODUCTION_COST_SETTLEMENT_SERVICE,
      useExisting: ProductionCostSettlementService,
    },
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
    // Phase 8.18: Order Status History Repository
    // Always available when Prisma is enabled (required for audit trail)
    {
      provide: ORDER_STATUS_HISTORY_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaOrderStatusHistoryRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Phase 4.1: Dog Breed Repository
    {
      provide: DOG_BREED_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaDogBreedRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Weight Record Service and Repository
    WeightRecordService,
    {
      provide: 'PrismaWeightRecordRepository',
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaWeightRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: 'PrismaDogRepository',
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        const {
          PrismaDogRepository,
        } = require('./infrastructure/repositories/prisma-dog.repository');
        return new PrismaDogRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Health Records Service and Repositories
    HealthService,
    {
      provide: VACCINE_RECORD_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaVaccineRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: CHECKUP_RECORD_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaCheckupRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: MEDICAL_RECORD_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaMedicalRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: ALLERGY_RECORD_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaAllergyRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Pricing Snapshot Repository (for order creation security)
    {
      provide: 'IOrderPricingSnapshotRepository',
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled via repo switches.',
          );
        }
        return new PrismaOrderPricingSnapshotRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Order Scheduler Service
    OrderSchedulerService,
    FinanceSchedulerService,
    // Phase 1: Purchasing Management Services
    PurchasingService,
    ReimbursementService,
    ExpenseBillService,
    ExpenseTemplateService,
    FinanceReportService,
    FinanceAlertService,
    // Phase 2: Staff Production Management Service
    StaffProductionService,
    ProductionService,
    {
      provide: PURCHASE_LIST_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled.',
          );
        }
        return new PrismaPurchaseListRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: REIMBURSEMENT_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled.',
          );
        }
        return new PrismaReimbursementRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    {
      provide: PURCHASE_RECORD_REPOSITORY,
      useFactory: (prismaService?: PrismaService) => {
        if (!prismaService) {
          throw new Error(
            'PrismaService is not available. Ensure Prisma is enabled.',
          );
        }
        return new PrismaPurchaseRecordRepository(prismaService);
      },
      inject: isPrismaEnabled() ? [PrismaService] : [],
    },
    // Custom Recipe Service
    CustomRecipeService,
    // Nutrition Food Service (Recipe Designer)
    NutritionFoodService,
    AgentProviderConfigService,
    TrustedNutritionWebSearchService,
    NutritionGovernanceService,
    {
      provide: LABEL_RECOGNITION_PROVIDER,
      useClass: DisabledLabelRecognitionProvider,
    },
    {
      provide: NUTRITION_CANDIDATE_REVIEW_PROVIDER,
      useFactory: createNutritionCandidateReviewProvider,
    },
    // Recommended Product Service
    RecommendedProductService,
    DogProfileAnalyticsService,
    ProcurementSkuService,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    @Inject(SHIPPING_TEMPLATE_REPOSITORY)
    private readonly shippingTemplateRepository: InMemoryShippingTemplateRepository,
  ) {}

  async onModuleInit() {
    // ✅ 方案B: 禁用自动seed数据，允许用户完全控制原料和配方
    // Phase 5: Seed ingredients first
    // await this.seedIngredients();

    // Phase 6: Seed shipping template
    await this.seedShippingTemplate();

    // ✅ 禁用配方自动seed（依赖被禁用的原料seed）
    // 如需启用配方seed，请先启用原料seed
    return; // 跳过配方seed
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
    const existingTemplate = await this.shippingTemplateRepository.findById(
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
