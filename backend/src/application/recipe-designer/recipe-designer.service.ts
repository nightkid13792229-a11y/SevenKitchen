import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CustomRecipeStatus,
  DesignRecipeReviewStatus,
  DesignRecipeStatus,
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
  NutritionFoodCategory,
  NutritionFoodStatus,
  OrderRecipeDesignStatus,
  Prisma,
  RecipeDesignMode,
  RecipeSeriesBusinessStatus,
  RecipeStatus,
  RecipeSeriesStatus,
  UserRole,
} from '@prisma/client';
import { nutritionDataToNutritionProfile } from '../nutrition-standard/nutrient-value-resolver';
import {
  findAnyNutritionField,
  findNutritionField,
  getNutritionProfileFieldValue,
  listSupplementTargetFields,
} from '../../domain/ingredient/nutrition-field-catalog';
import {
  inferSupplementTargetFieldFromIngredientName,
  resolveSupplementTargetField as resolveSupplementTargetFieldReference,
  toDesignSupplementTargetReference,
} from '../../domain/ingredient/supplement-target-mapping';
import {
  createEmptyNutritionProfile,
  normalizeNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfile,
  SupplementTarget,
} from '../../domain/ingredient/types';
import {
  getProfileEffectiveWeightG,
  readProfileValuePer100g,
} from '../../domain/recipe-designer/nutrition-profile-reader';
import { buildFoodWeightRatioMap } from '../../domain/recipe/food-ratio-normalization';
import {
  assessRecipeDraft,
  type AssessmentDataGap,
  type DesignRecipeAssessmentResult,
} from '../../domain/recipe-designer/recipe-assessment';
import {
  buildDraftLaunchReadiness,
  type DraftLaunchReadiness,
  type LaunchReadinessAssessmentSnapshot,
} from '../../domain/recipe-designer/launch-readiness';
import type {
  AssessmentEntry,
  AssessmentExpressionBasis,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import { PrismaService } from '../../infrastructure/prisma.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import type {
  AddRecipeDesignItemDto,
  CopyRecipeSeriesStageIngredientsDto,
  CreateRecipeDesignerSupplementOptionDto,
  CreatePrivateRecipeSnapshotDto,
  CreateRecipeDesignDraftDto,
  CreateRecipeSeriesDto,
  CreateRecipeSeriesStageDraftDto,
  DeleteRecipeSeriesDto,
  RecipeDesignerSeriesStatusFilter,
  RecipePreparationSource,
  ListRecipeDesignerIngredientOptionsDto,
  ListRecipeDesignerSeriesDto,
  PublishRecipeDesignDraftDto,
  RenameRecipeSeriesDto,
  ReorderRecipeDesignItemsDto,
  UpdateDogDesignNotesDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
  UpdateRecipeProductionStepsDto,
} from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import { RECIPE_PREPARATION_NOTE_MAX_LENGTH } from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  readProductionSteps,
  validateProductionSteps,
  type ProductionStep,
} from '../../domain/recipe-designer/production-steps';
import {
  FEDIAF_TARGET_PROVIDER,
  type FediafTargetProvider,
} from './fediaf-target-provider';
import {
  buildDogDesignInsight,
  normalizeInsightAttachments,
  type DogDesignInsight,
} from '../../domain/recipe-designer/dog-design-insight';
import {
  collectAllergyKeywords,
  formatAllergyKeywordsForAi,
  splitAllergyKeywords,
} from '../../domain/dog/allergy-keywords';
import { AllergenVocabularyService } from '../health/allergen-vocabulary.service';
import {
  AiDesignSuggestionService,
  type AiDesignSuggestionInput,
} from './ai-design-suggestion.service';
import {
  RecipeAiWizardService,
  type AiWizardDogProfile,
  type AiWizardDraftSummary,
} from './recipe-ai-wizard.service';
import {
  SupplementTargetService,
  type SupplementTargetDefinition,
} from './supplement-target.service';
import type {
  IngredientRecommendationResult,
  NutritionPlanResult,
  RecipeAiDesignData,
  RecipeReviewResult,
  SopResult,
} from '../../domain/recipe-designer/recipe-ai-wizard/types';
import {
  getNutritionProfileSourceName,
  resolveNutritionProfileDisplayName,
} from '../nutrition-food/nutrition-food-display-name';
import {
  extractLegacyPreparationMethodIds,
  normalizePreparationMethodHistoryText,
  resolvePreparationMethodText,
} from '../recipe/preparation-method-text.util';
import { SearchGovernanceService } from '../search-governance/search-governance.service';
import { LifeStage as RecipeLifeStage } from '../../domain/recipe/enums';
import { alignPreparationMethodBasis } from '../../domain/recipe-designer/preparation-basis';
import {
  DEFAULT_PRODUCTION_LOSS_RATE,
  MAX_PRODUCTION_LOSS_RATE,
  MIN_PRODUCTION_LOSS_RATE,
  GlobalConfigService,
} from '../config/global-config.service';
import {
  ORDERED_RECIPE_SERIES_LIFE_STAGES,
  RECIPE_SERIES_BUSINESS_STATUS_LABELS,
  SERIES_LIFE_STAGE_LABELS,
  mapDogProfileToSeriesLifeStage,
  mapScenarioToSeriesLifeStage,
  mapSeriesLifeStageToScenario,
  type RecipeSeriesLifeStage,
  type RecipeSeriesStageStatus,
} from '../../domain/recipe/recipe-series';

/** 「最近吃过的食材」时间窗口（天）默认值 */
const RECENT_EATEN_WINDOW_DAYS = 90;

/** 「最近吃过的食材」时间窗口（天）允许范围 */
const RECENT_EATEN_WINDOW_MIN_DAYS = 7;
const RECENT_EATEN_WINDOW_MAX_DAYS = 365;

/** 「最近吃过的食材」订单状态：至少推进到冷冻中 */
const RECENT_EATEN_ORDER_STATUSES = new Set([
  'FREEZING',
  'SHIPPED',
  'COMPLETED',
]);

const DESIGN_RECIPE_INCLUDE = {
  series: {
    select: {
      id: true,
      name: true,
      referenceDogId: true,
      // 发布门槛需要区分产品线（CATALOG）与订单绑定（ORDER）设计
      designMode: true,
    },
  },
  items: {
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          type: true,
          unitDisplayLabel: true,
          purchaseUnit: true,
          properties: true,
          brand: true,
          productModel: true,
        },
      },
      nutritionFood: {
        include: {
          mappings: {
            include: {
              ingredient: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  unitDisplayLabel: true,
                  purchaseUnit: true,
                  properties: true,
                  brand: true,
                  productModel: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

const DESIGN_RECIPE_ITEM_CLIENT_INGREDIENT_SELECT = {
  id: true,
  name: true,
  type: true,
  unitDisplayLabel: true,
  purchaseUnit: true,
  properties: true,
  brand: true,
  productModel: true,
} satisfies Prisma.IngredientSelect;

const DESIGN_RECIPE_ITEM_CLIENT_SELECT = {
  id: true,
  designRecipeId: true,
  ingredientId: true,
  nutritionFoodId: true,
  weightG: true,
  includeInAssessment: true,
  ratioPercent: true,
  preparationMethod: true,
  preparationNote: true,
  preparationSource: true,
  nutrientTargetKey: true,
  nutrientTargetValue: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  ingredient: {
    select: DESIGN_RECIPE_ITEM_CLIENT_INGREDIENT_SELECT,
  },
  nutritionFood: {
    select: {
      id: true,
      name: true,
      nameEn: true,
      displayNameZh: true,
      preparationState: true,
      category: true,
      dataSource: true,
      status: true,
      mappings: {
        select: {
          id: true,
          nutritionFoodId: true,
          ingredientId: true,
          yieldRate: true,
          isPrimary: true,
          notes: true,
          ingredient: {
            select: DESIGN_RECIPE_ITEM_CLIENT_INGREDIENT_SELECT,
          },
        },
      },
    },
  },
} satisfies Prisma.DesignRecipeItemSelect;

const DESIGN_RECIPE_LIST_SELECT = {
  id: true,
  name: true,
  version: true,
  status: true,
  fediafDogScenario: true,
  nutritionStandard: true,
  energyDensityKcalPerKg: true,
  totalWeightG: true,
  complianceStatus: true,
  assessmentSummary: true,
  missingDataReport: true,
  targetHealthTags: true,
  applicableLifeStages: true,
  notes: true,
  createdBy: true,
  publishedAt: true,
  publishedRecipeId: true,
  publishedRecipeVersion: true,
  revisionOfDesignRecipeId: true,
  revisionBaseRecipeId: true,
  customerDogId: true,
  isCompliant: true,
  reviewStatus: true,
  reviewNote: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      ingredientId: true,
      nutritionFoodId: true,
      weightG: true,
      includeInAssessment: true,
      ratioPercent: true,
      preparationMethod: true,
      preparationNote: true,
      preparationSource: true,
      nutrientTargetKey: true,
      nutrientTargetValue: true,
      supplementTargets: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
};

const DESIGN_RECIPE_SERIES_LIST_SELECT = {
  id: true,
  name: true,
  version: true,
  status: true,
  fediafDogScenario: true,
  nutritionStandard: true,
  targetHealthTags: true,
  applicableLifeStages: true,
  notes: true,
  createdBy: true,
  publishedAt: true,
  publishedRecipeId: true,
  publishedRecipeVersion: true,
  revisionOfDesignRecipeId: true,
  revisionBaseRecipeId: true,
  customerDogId: true,
  isCompliant: true,
  reviewStatus: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { items: true },
  },
  // 修订对比需要 item 标量字段；列表不需要食材/营养档案嵌套，故只取标量
  items: {
    select: {
      id: true,
      ingredientId: true,
      nutritionFoodId: true,
      weightG: true,
      includeInAssessment: true,
      preparationMethod: true,
      nutrientTargetKey: true,
      nutrientTargetValue: true,
      supplementTargets: true,
      sortOrder: true,
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  seriesId: true,
  seriesLifeStage: true,
};

const RECIPE_SERIES_WORKBENCH_RECIPE_SELECT = {
  recipeId: true,
  seriesLifeStage: true,
  status: true,
  referenceDogId: true,
  updatedAt: true,
};

const RECIPE_DESIGNER_PUBLISHED_SOURCE = 'Setar';
const RECIPE_DESIGNER_BACKFILL_USER_ID = 'recipe-designer-backfill';
const RECIPE_SERIES_BACKFILL_USER_ID = 'recipe-series-backfill';
const INTERNAL_RECIPE_DESIGNER_CREATOR_IDS = [
  RECIPE_DESIGNER_BACKFILL_USER_ID,
  RECIPE_SERIES_BACKFILL_USER_ID,
];
const PUBLISHED_RECIPE_BATCH_LABOR_HOURS = 2;
const DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS = 3;
const DESIGN_RECIPE_ITEM_ORDER_MAX_ATTEMPTS = 3;
const COPYABLE_RECIPE_STATUS_PRIORITY: Record<string, number> = {
  [RecipeStatus.PRIVATE_CUSTOM]: 3,
  [RecipeStatus.DRAFT]: 2,
  [RecipeStatus.PUBLIC]: 1,
};

const DUPLICATE_SERIES_STAGE_NAME_LABELS: Record<
  RecipeSeriesLifeStage,
  string
> = {
  PUPPY_UNDER_14_WEEKS: '小于14周龄幼犬',
  PUPPY_14_WEEKS_PLUS: '大于等于14周龄幼犬',
  HIGH_ACTIVITY_ADULT: '普通成年犬（110ME）',
  LOW_ACTIVITY_ADULT_OR_SENIOR: '低能量需求成年犬（95ME）',
  REPRODUCTION: '繁殖期母犬',
};

const FEDIAF_DOG_SCENARIO_LABELS: Record<FediafDogScenarioCode, string> = {
  EARLY_GROWTH_REPRODUCTION: '小于14周龄幼犬 / 繁殖期母犬',
  REPRODUCTION: '繁殖期母犬',
  LATE_GROWTH: '大于等于14周龄幼犬',
  ADULT_MER_110: '普通成年犬（110ME）',
  ADULT_MER_95: '低能量需求成年犬（95ME）',
};

const PUBLISHED_RECIPE_LIFE_STAGES_BY_SCENARIO: Record<
  FediafDogScenarioCode,
  string[]
> = {
  EARLY_GROWTH_REPRODUCTION: [RecipeLifeStage.PUPPY_UNDER_14_WEEKS],
  REPRODUCTION: [RecipeLifeStage.REPRODUCTION],
  LATE_GROWTH: [RecipeLifeStage.PUPPY_14_WEEKS_PLUS],
  ADULT_MER_95: [RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR],
  ADULT_MER_110: [RecipeLifeStage.HIGH_ACTIVITY_ADULT],
};

const LEGACY_RECIPE_LIFE_STAGE_MAPPINGS: Record<string, string[]> = {
  PUPPY: [
    RecipeLifeStage.PUPPY_UNDER_14_WEEKS,
    RecipeLifeStage.PUPPY_14_WEEKS_PLUS,
  ],
  ADULT: [
    RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR,
    RecipeLifeStage.HIGH_ACTIVITY_ADULT,
  ],
  SENIOR: [RecipeLifeStage.LOW_ACTIVITY_ADULT_OR_SENIOR],
  PREGNANCY: [RecipeLifeStage.REPRODUCTION],
  LACTATION: [RecipeLifeStage.REPRODUCTION],
};

type DesignRecipeWithItems = {
  id: string;
  name: string;
  version: number;
  contentRevision: number;
  status: string;
  fediafDogScenario: FediafDogScenarioCode;
  nutritionStandard?: string | null;
  energyDensityKcalPerKg: number | null;
  totalWeightG: number;
  targetHealthTags: string[];
  applicableLifeStages: string[];
  notes: string | null;
  /** 结构化制作步骤（JSON 数组）；历史草稿可能为 null */
  productionStepsJson?: unknown;
  /** 最近一次持久化的营养报告（发布口径 report 对象）；未生成过为 null */
  nutritionReportJson?: unknown;
  /** 生成报告时的 contentRevision；与当前值不同即表示报告过期 */
  nutritionReportRevision?: number | null;
  nutritionReportGeneratedAt?: Date | null;
  createdBy: string;
  publishedAt: Date | null;
  publishedRecipeId: string | null;
  publishedRecipeVersion: number | null;
  revisionOfDesignRecipeId: string | null;
  revisionBaseRecipeId: string | null;
  customerDogId?: string | null;
  seriesId?: string | null;
  seriesLifeStage?: string | null;
  series?: {
    id: string;
    name: string;
    referenceDogId?: string | null;
    designMode?: string | null;
  } | null;
  isCompliant: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  calculatedNutrition: unknown;
  complianceStatus: unknown;
  assessmentSummary: unknown;
  missingDataReport: unknown;
  complianceScore?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  items: DesignRecipeItemWithFood[];
};

/** 草稿营养报告的读写响应（POST 生成 / GET 读取共用同一契约）。 */
type DraftNutritionReportSnapshot = {
  draftId: string;
  /** ISO 时间；从未生成过为 null */
  generatedAt: string | null;
  /** 报告对应的内容版本；从未生成过为 null */
  revision: number | null;
  /** 已保存报告是否落后于当前 contentRevision */
  stale: boolean;
  /** 发布口径的 report 对象；从未生成过为 null */
  report: unknown;
};

type DesignRecipeItemWithFood = {
  id: string;
  ingredientId: string | null;
  nutritionFoodId: string;
  weightG: number;
  includeInAssessment: boolean;
  ratioPercent: number | null;
  preparationMethod: string | null;
  preparationNote?: string | null;
  preparationSource?: string | null;
  nutrientTargetKey: string | null;
  nutrientTargetValue: number | null;
  supplementTargets?: unknown;
  sortOrder: number;
  ingredient?: {
    id: string;
    name: string;
    type: IngredientType;
    unitDisplayLabel?: string | null;
    purchaseUnit?: string | null;
    properties?: unknown;
    brand?: string | null;
    productModel?: string | null;
  } | null;
  nutritionFood: {
    id: string;
    name: string;
    displayNameZh?: string | null;
    preparationState?: string | null;
    nutritionData: unknown;
    mappings?: Array<{
      ingredientId: string;
      isPrimary: boolean;
      ingredient?: {
        id: string;
        name: string;
        type: IngredientType;
        unitDisplayLabel?: string | null;
        purchaseUnit?: string | null;
        properties?: unknown;
        brand?: string | null;
        productModel?: string | null;
      } | null;
    }>;
  };
};

type DesignRecipeItemIngredient = NonNullable<
  DesignRecipeItemWithFood['ingredient']
>;

type PublishedSupplementNutrientTarget = {
  nutrientTargetKey: string;
  nutrientTargetValue: number;
  fieldPath?: string;
  label?: string;
  unit?: string;
};

type DesignSupplementTarget = {
  nutrientTargetKey: string;
  fieldPath: string;
  label: string;
  unit: string;
  targetValue?: number | null;
  expressionBasis?: string | null;
};

type RemovableSupplementWarning = {
  itemId: string;
  itemName: string;
  targetLabels: string[];
  message: string;
};

/**
 * 配方里命中了这只狗的过敏原（2026-10-04 第一期）。
 *
 * 改造前营养评估**完全不读过敏** —— 一份含鸡肉的配方可以被判"完全合格"。
 * 现在评估会带上这一项，但它只是**提示**，不拦保存：
 * 过敏信息可能过期，营养师可能有正当理由（顾客已确认可以吃），
 * 所以给确认入口而不是硬拦 —— 这与"系统自动推荐时一律拒绝"是两回事。
 */
type DraftAllergenWarning = {
  itemId: string;
  itemName: string;
  /** 命中的过敏原标准名（走词表）或顾客原文（文字兜底） */
  allergen: string;
  /** CONFIRMED = 确诊，WARNING = 可疑/待排查 */
  level: 'CONFIRMED' | 'WARNING';
  message: string;
};

type PublishedRecipePresentationMedia = {
  coverImageUrl: string | null;
  coverTitle: string | null;
  detailImages: Prisma.JsonValue | null;
  videoUrl: string | null;
};

type PublishedRecipeVersionInheritance = PublishedRecipePresentationMedia & {
  id: string;
  viewCount: number;
  favoriteCount: number;
  diyGenCount: number;
  likeCount: number;
  salesCount: number;
};

type RevisionChangeState = 'NOT_REVISION' | 'UNCHANGED' | 'CHANGED';

type DesignRecipeWorkbenchCard = DesignRecipeWithItems & {
  revisionChangeState: RevisionChangeState;
  versionHistory?: DesignRecipeWorkbenchCard[];
};

type DesignRecipeWorkbenchCardSummary = Omit<
  DesignRecipeWorkbenchCard,
  | 'items'
  | 'calculatedNutrition'
  | 'complianceStatus'
  | 'assessmentSummary'
  | 'missingDataReport'
  | 'versionHistory'
> & {
  versionHistory?: DesignRecipeWorkbenchCardSummary[];
};

type ClientDesignRecipeAssessmentResult = Omit<
  DesignRecipeAssessmentResult,
  'entries'
> & {
  removableSupplementWarnings: RemovableSupplementWarning[];
  /** 配方命中的过敏原（2026-10-04 第一期）。空数组 = 没命中。 */
  allergenWarnings: DraftAllergenWarning[];
};

type RecipeSeriesWorkbenchRecord = {
  id: string;
  name: string;
  status: string;
  businessStatus?: RecipeSeriesBusinessStatus | string | null;
  createdBy?: string | null;
  customerDogId?: string | null;
  referenceDogId?: string | null;
  /** 设计上下文（2026-10-22）：订单绑定系列不进入产品线列表 */
  designMode?: string | null;
  orderId?: string | null;
  orderQuantity?: number | null;
  deletedAt?: Date | null;
  updatedAt?: Date | string | null;
  designs: Array<{
    id: string;
    seriesId?: string | null;
    seriesLifeStage?: string | null;
    status: string;
    reviewStatus: string;
    publishedRecipeId?: string | null;
    publishedAt?: Date | null;
    updatedAt?: Date | string | null;
    name?: string;
    createdBy?: string;
    fediafDogScenario?: FediafDogScenarioCode;
    energyDensityKcalPerKg?: number | null;
    totalWeightG?: number;
    customerDogId?: string | null;
    isCompliant?: boolean;
    complianceStatus?: unknown;
    assessmentSummary?: unknown;
    missingDataReport?: unknown;
    items?: unknown[];
    _count?: { items: number };
  }>;
  recipes: Array<{
    id?: string;
    recipeId: string;
    name?: string;
    seriesLifeStage?: string | null;
    status: string;
    version?: number;
    energyDensityKcalPerKg?: number | null;
    applicableLifeStages?: unknown;
    targetHealthTags?: unknown;
    description?: string | null;
    nutritionStandard?: string | null;
    nutritionDetailedData?: unknown;
    customerDogId?: string | null;
    referenceDogId?: string | null;
    updatedAt?: Date | string | null;
    items?: RecipeSeriesCopyableRecipeItem[];
  }>;
};

type RecipeSeriesCopyableRecipeItem = {
  id?: string;
  ingredientId: string;
  nutritionFoodId?: string | null;
  exampleWeight?: number | null;
  ratioPercent?: number | null;
  preparationMethod?: string | null;
  preparationNote?: string | null;
  preparationSource?: string | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
  supplementTargets?: unknown;
  sortOrder?: number | null;
};

type RecipeSeriesCopyableRecipe =
  RecipeSeriesWorkbenchRecord['recipes'][number] & {
    seriesLifeStage: RecipeSeriesLifeStage;
    items: RecipeSeriesCopyableRecipeItem[];
  };

type CopyableSeriesStageSource =
  | {
      kind: 'design';
      lifeStage: RecipeSeriesLifeStage;
      design: DesignRecipeWithItems;
    }
  | {
      kind: 'recipe';
      lifeStage: RecipeSeriesLifeStage;
      recipe: RecipeSeriesCopyableRecipe;
    };

type RecipeSeriesStageRecipeStatusCategory =
  | 'NOT_DESIGNED'
  | 'DRAFT'
  | 'PUBLIC'
  | 'PRIVATE_CUSTOM';

type IngredientOptionRecord = {
  id: string;
  name: string;
  type: IngredientType;
  unitDisplayLabel?: string | null;
  purchaseUnit: string;
  properties?: unknown;
  brand: string | null;
  productModel: string | null;
  nutritionFoodMappings: Array<{
    id: string;
    nutritionFoodId: string;
    yieldRate: number;
    isPrimary: boolean;
    notes: string | null;
    nutritionFood: {
      id: string;
      name: string;
      nameEn: string | null;
      displayNameZh: string | null;
      category: NutritionFoodCategory;
      dataSource: string;
      status: NutritionFoodStatus;
      nutritionData?: unknown;
    };
  }>;
};

type IngredientNutrientMatch = {
  nutrientKey: string;
  label: string;
  amount: number;
  unit: string;
  basis: AssessmentExpressionBasis | string;
  basisLabel: string;
  displayText: string;
  score: number;
};

type IngredientNutrientSearchTarget = {
  nutrientKey: string;
  label: string;
  fieldPaths: readonly string[];
  unit: string;
  expressionBasis: AssessmentExpressionBasis;
};

type ManualSupplementNutrientEntry = {
  fieldPath: string;
  fieldKey: string;
  tabKey: 'macros' | 'minerals' | 'vitamins' | 'fattyAcids' | 'aminoAcids';
  label: string;
  unit: string;
  value: number;
};

type EditableDesignRecipeRecord = {
  id: string;
  createdBy: string;
  status: string;
  publishedRecipeId: string | null;
  publishedAt: Date | null;
};

type RecipeDesignerAccessInput =
  | string
  | {
      userId: string;
      customerId?: string | null;
      role?: string | null;
    };

interface RecipeDesignerAccessContext {
  userId: string;
  customerId?: string | null;
  role: string;
}

function normalizeRecipeDesignerAccessContext(
  input: RecipeDesignerAccessInput,
): RecipeDesignerAccessContext {
  if (typeof input === 'string') {
    return { userId: input, role: UserRole.STAFF };
  }
  return {
    userId: input.userId,
    customerId: input.customerId ?? null,
    role: String(input.role || UserRole.CUSTOMER).toUpperCase(),
  };
}

function isInternalRecipeDesignerRole(
  context: RecipeDesignerAccessContext,
): boolean {
  return context.role === UserRole.STAFF || context.role === UserRole.ADMIN;
}

function getRecipeDesignerCustomerOwnerId(
  context: RecipeDesignerAccessContext,
): string {
  return context.customerId || context.userId;
}

const MAX_SEARCH_EXPANSION_TERMS = 8;
const RECIPE_PRESENTATION_MEDIA_SELECT = {
  coverImageUrl: true,
  coverTitle: true,
  detailImages: true,
  videoUrl: true,
} as const;
const RECIPE_VERSION_INHERITANCE_SELECT = {
  id: true,
  viewCount: true,
  favoriteCount: true,
  diyGenCount: true,
  likeCount: true,
  salesCount: true,
  ...RECIPE_PRESENTATION_MEDIA_SELECT,
} as const;
const NEGATED_SALT_SEARCH_PHRASES = [
  '不加盐',
  '无盐',
  '未加盐',
  'without salt',
  'no salt',
  'unsalted',
] as const;

type IngredientSearchTextField = 'name' | 'brand' | 'productModel';
type NutritionFoodSearchTextField = 'name' | 'nameEn' | 'displayNameZh';

function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function isSaltSearchTerm(term: string) {
  const normalizedTerm = normalizeSearchText(term);
  return normalizedTerm.includes('盐') || normalizedTerm.includes('salt');
}

function hasNegatedSaltPhrase(value: unknown, term: string) {
  if (!isSaltSearchTerm(term)) {
    return false;
  }

  const normalizedText = normalizeSearchText(value);
  return NEGATED_SALT_SEARCH_PHRASES.some((phrase) =>
    normalizedText.includes(phrase),
  );
}

function textMatchesSearchTerm(value: unknown, term: string) {
  const normalizedText = normalizeSearchText(value);
  const normalizedTerm = normalizeSearchText(term);

  return (
    normalizedTerm.length > 0 &&
    normalizedText.includes(normalizedTerm) &&
    !hasNegatedSaltPhrase(value, term)
  );
}

function buildNegatedSaltFieldConditions(field: string, term: string) {
  if (!isSaltSearchTerm(term)) {
    return [];
  }

  return NEGATED_SALT_SEARCH_PHRASES.map((phrase) => ({
    [field]: { contains: phrase, mode: 'insensitive' as const },
  }));
}

function buildTextSearchCondition(field: string, term: string) {
  const containsCondition = {
    [field]: { contains: term, mode: 'insensitive' as const },
  };
  const negatedSaltConditions = buildNegatedSaltFieldConditions(field, term);

  if (negatedSaltConditions.length === 0) {
    return containsCondition;
  }

  return {
    AND: [
      containsCondition,
      {
        NOT: negatedSaltConditions,
      },
    ],
  };
}

function buildIngredientTextSearchCondition(
  field: IngredientSearchTextField,
  term: string,
) {
  return buildTextSearchCondition(field, term);
}

function buildNutritionFoodSearchCondition(
  field: NutritionFoodSearchTextField,
  term: string,
) {
  return {
    nutritionFoodMappings: {
      some: {
        nutritionFood: buildTextSearchCondition(field, term),
      },
    },
  };
}

function buildIngredientSearchConditions(searchTerms: string[]) {
  return searchTerms.flatMap((term) => [
    buildIngredientTextSearchCondition('name', term),
    buildIngredientTextSearchCondition('brand', term),
    buildIngredientTextSearchCondition('productModel', term),
    buildNutritionFoodSearchCondition('name', term),
    buildNutritionFoodSearchCondition('nameEn', term),
    buildNutritionFoodSearchCondition('displayNameZh', term),
  ]);
}

function scoreTextSearchMatch(value: unknown, term: string, baseScore: number) {
  if (!textMatchesSearchTerm(value, term)) {
    return 0;
  }

  const normalizedText = normalizeSearchText(value);
  const normalizedTerm = normalizeSearchText(term);
  if (normalizedText === normalizedTerm) {
    return baseScore + 30;
  }
  if (normalizedText.startsWith(normalizedTerm)) {
    return baseScore + 20;
  }

  return baseScore;
}

function scoreNutritionProfileSearchMatch(
  mapping: IngredientOptionRecord['nutritionFoodMappings'][number],
  term: string,
) {
  return Math.max(
    scoreTextSearchMatch(mapping.nutritionFood.displayNameZh, term, 120),
    scoreTextSearchMatch(mapping.nutritionFood.name, term, 100),
    scoreTextSearchMatch(mapping.nutritionFood.nameEn, term, 100),
  );
}

function scoreIngredientSearchMatch(
  ingredient: IngredientOptionRecord,
  searchTerms: string[],
) {
  return searchTerms.reduce((bestScore, term, index) => {
    const originalQueryBoost = index === 0 ? 10 : 0;
    const termScore = Math.max(
      scoreTextSearchMatch(ingredient.name, term, 300 + originalQueryBoost),
      scoreTextSearchMatch(ingredient.brand, term, 220 + originalQueryBoost),
      scoreTextSearchMatch(
        ingredient.productModel,
        term,
        220 + originalQueryBoost,
      ),
      ...ingredient.nutritionFoodMappings.map((mapping) =>
        scoreNutritionProfileSearchMatch(mapping, term),
      ),
    );

    return Math.max(bestScore, termScore);
  }, 0);
}

function compareIngredientSearchResults(
  left: { ingredient: IngredientOptionRecord; score: number },
  right: { ingredient: IngredientOptionRecord; score: number },
) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const nameLengthDifference =
    left.ingredient.name.length - right.ingredient.name.length;
  if (nameLengthDifference !== 0) {
    return nameLengthDifference;
  }

  return left.ingredient.name.localeCompare(right.ingredient.name);
}

function compareIngredientOptionsByNutrientMatch(
  left: { name: string; nutrientMatch?: IngredientNutrientMatch },
  right: { name: string; nutrientMatch?: IngredientNutrientMatch },
) {
  const leftScore = left.nutrientMatch?.score ?? -1;
  const rightScore = right.nutrientMatch?.score ?? -1;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }

  return left.name.localeCompare(right.name);
}

function getCompatibleSourceUnit(
  fieldPaths: readonly string[],
  targetUnit: string,
): string | null {
  const fieldUnits = fieldPaths.map((fieldPath) => {
    return findNutritionField(fieldPath)?.unit ?? null;
  });
  const firstUnit = fieldUnits[0];

  if (!firstUnit || !fieldUnits.every((fieldUnit) => fieldUnit === firstUnit)) {
    return null;
  }

  return canConvertUnit(firstUnit, targetUnit) ? firstUnit : null;
}

function canConvertUnit(fromUnit: string, toUnit: string): boolean {
  return (
    normalizeUnit(fromUnit) === normalizeUnit(toUnit) ||
    convertMassUnit(1, fromUnit, toUnit) !== null
  );
}

function convertUnitValue(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (normalizeUnit(fromUnit) === normalizeUnit(toUnit)) {
    return finiteOrNull(value);
  }

  return convertMassUnit(value, fromUnit, toUnit);
}

function normalizeUnit(unit: string | null | undefined): string {
  const normalized = (unit ?? '').trim().toLowerCase();
  if (normalized === 'μg' || normalized === 'ug' || normalized === 'mcg') {
    return 'ug';
  }
  return normalized;
}

function massUnitFactor(unit: string): number | null {
  switch (normalizeUnit(unit)) {
    case 'g':
      return 1;
    case 'mg':
      return 1 / 1000;
    case 'ug':
      return 1 / 1_000_000;
    default:
      return null;
  }
}

function convertMassUnit(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const fromFactor = massUnitFactor(fromUnit);
  const toFactor = massUnitFactor(toUnit);

  if (fromFactor === null || toFactor === null) {
    return null;
  }

  return finiteOrNull((value * fromFactor) / toFactor);
}

function finiteOrNull(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNutrientMatchAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
}

function normalizeRequiredText(value: unknown, fieldLabel: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new BadRequestException(`${fieldLabel}不能为空`);
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeOptionalPositiveNumber(
  value: unknown,
  fieldLabel: string,
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalized =
    typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw new BadRequestException(`${fieldLabel}必须为大于0的数字`);
  }
  return normalized;
}

function normalizeSupplementUsageUnit(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || 'g';
}

function readSupplementDisplayUnit(properties: unknown): string | null {
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return null;
  }
  return normalizeOptionalText(
    (properties as Record<string, unknown>).display_unit,
  );
}

function resolveRecipeDesignerIngredientUnit(
  ingredient: Pick<
    IngredientOptionRecord,
    'type' | 'unitDisplayLabel' | 'purchaseUnit' | 'properties'
  >,
): string {
  if (ingredient.type !== IngredientType.SUPPLEMENT) {
    return ingredient.purchaseUnit;
  }

  return (
    normalizeOptionalText(ingredient.unitDisplayLabel) ??
    readSupplementDisplayUnit(ingredient.properties) ??
    ingredient.purchaseUnit
  );
}

function getSupplementBaseUnit(usageUnit: string): BaseUnit {
  if (usageUnit === 'ml') return BaseUnit.ML;
  if (usageUnit === 'g') return BaseUnit.G;
  return BaseUnit.PCS;
}

function getSupplementEdiblePortionLabel(
  basisType: string,
  usageUnit: string,
): string {
  const labels: Record<string, string> = {
    PER_1_G: '每克补剂',
    PER_100_G: '每100克补剂',
    PER_1_ML: '每毫升补剂',
    PER_100_ML: '每100毫升补剂',
    PER_SERVING: `每${usageUnit}补剂`,
  };
  return labels[basisType] ?? '补剂';
}

function requiresSupplementServingWeight(
  usageUnit: string,
  basisType: string,
): boolean {
  return !['g', 'ml'].includes(usageUnit) && basisType !== 'PER_SERVING';
}

function normalizeManualSupplementNutrients(
  nutrients: Record<string, number | string | null | undefined> | undefined,
): ManualSupplementNutrientEntry[] {
  const supportedFieldPaths = new Set<string>(
    listSupplementTargetFields().map((field) => field.fieldPath),
  );
  const entries: ManualSupplementNutrientEntry[] = [];

  for (const [fieldPath, rawValue] of Object.entries(nutrients ?? {})) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }

    const field = supportedFieldPaths.has(fieldPath)
      ? findNutritionField(fieldPath)
      : undefined;
    if (!field) {
      throw new BadRequestException(`不支持的营养字段：${fieldPath}`);
    }

    const value =
      typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${field.label}必须为非负数字`);
    }
    if (value === 0) {
      continue;
    }

    entries.push({
      fieldPath: field.fieldPath,
      fieldKey: field.fieldKey,
      tabKey: field.tabKey,
      label: field.label,
      unit: field.unit,
      value,
    });
  }

  if (entries.length === 0) {
    throw new BadRequestException('请至少填写一个有效营养成分');
  }

  return entries;
}

function buildManualSupplementNutritionProfile(
  entries: ManualSupplementNutrientEntry[],
  basisType:
    | 'PER_1_G'
    | 'PER_100_G'
    | 'PER_1_ML'
    | 'PER_100_ML'
    | 'PER_SERVING',
  profileName: string,
  options: {
    usageUnit: string;
    servingWeightG: number | null;
    densityGPerMl: number | null;
  },
) {
  const profile = createEmptyNutritionProfile();
  profile.meta = {
    ...profile.meta,
    rawBasisType: basisType,
    sampleState: 'CONCENTRATE',
    isEdiblePortionBasis: true,
    densityGPerMl: options.densityGPerMl,
    servingWeightG: options.servingWeightG,
    amountUnitLabel: options.usageUnit,
    servingUnitLabel:
      basisType === 'PER_SERVING' ? options.usageUnit : undefined,
    sourceType: 'MANUAL',
    sourceKind: 'MANUAL',
    sourceCode: 'MANUAL',
    sourceTitle: profileName,
    sourceProvider: '小程序手工录入',
    confidenceLevel: 'LOW',
    versionNote: '小程序手工新增补剂档案',
    fieldSources: {},
    fieldDisplayUnits: {},
  } as any;

  // 2026-10-14 修正：此处原本无条件把 macros 的 9 项全部写成 0，已移除。
  //
  // 为什么必须去掉：补剂只按成分标签录入，标签上没有的项应当留空（null = 数据缺失）。
  // 写成 0 会被营养评估解读为"该补剂确定不含这一项" —— 因为补剂走
  // missingValueAsZeroForSupplements 分支，null 会被当作 0 计入合计。
  // 实测后果：一个只标了 DHA 的藻油档案，会被算成"不含蛋白质、碳水、水分"，
  // 凭空给整道食谱制造假的营养缺口。
  //
  // createEmptyNutritionProfile() 本就把各项初始化为 null，与老库（如 NOW 碳酸钙粉）
  // 的存档格式一致，沿用初始值即可。

  for (const entry of entries) {
    const tab = profile[entry.tabKey] as Record<string, number | null>;
    tab[entry.fieldKey] = entry.value;
    profile.meta.fieldDisplayUnits![entry.fieldPath] = entry.unit;
    profile.meta.fieldSources![entry.fieldPath] = {
      sourceRole: 'PROFILE_PRIMARY',
      sourceKind: 'MANUAL',
      sourceCode: 'MANUAL',
      sourceTitle: profileName,
      sourceProvider: '小程序手工录入',
      originalValue: entry.value,
      originalUnit: entry.unit,
      canonicalValue: entry.value,
      canonicalUnit: entry.unit,
      basisType,
      compatibility: 'MANUAL',
      confidenceLevel: 'LOW',
      noteZh: '小程序手工录入补剂档案',
    };
  }

  return profile;
}

function buildManualSupplementActiveNutrients(
  entries: ManualSupplementNutrientEntry[],
) {
  return entries.reduce<Record<string, { value: number; unit: string }>>(
    (acc, entry) => {
      acc[entry.fieldKey] = { value: entry.value, unit: entry.unit };
      return acc;
    },
    {},
  );
}

@Injectable()
export class RecipeDesignerService {
  private readonly logger = new Logger(RecipeDesignerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FEDIAF_TARGET_PROVIDER)
    private readonly targetProvider: FediafTargetProvider,
    @Optional()
    private readonly searchGovernanceService?: SearchGovernanceService,
    @Optional()
    private readonly aiDesignSuggestionService?: AiDesignSuggestionService,
    @Optional()
    private readonly recipeAiWizardService?: RecipeAiWizardService,
    /**
     * 过敏原词表（2026-10-04 第一期）。营养评估要靠它判断
     * 配方里的食材有没有命中这只狗的过敏原 —— 改造前评估完全不读过敏。
     *
     * 放在参数表**最后**并且 @Optional：既有测试里有
     * `new RecipeDesignerService(prisma, target, governance, ai, wizard)`
     * 这样的按位置调用，插在中间会让它们全部错位。
     */
    @Optional()
    private readonly allergenVocabulary?: AllergenVocabularyService,
    /**
     * 全局配置（2026-10-21）。
     *
     * 只为取一个值：**内部生产损耗系数**。此前这个文件读
     * `CustomRecipeConfig.productionLossRate`，现在统一读
     * `GlobalConfig.productionLossRate` —— 后台「全局配置 → 生产配置」可改。
     *
     * 只影响**新建**食谱；已有 `Recipe.productionLossRate` 与交付快照
     * 保持原值，不在发布/更新时回写。
     *
     * 同样放在参数表**最后**并 @Optional（与上面 `allergenVocabulary` 同样的理由：
     * 既有测试按位置调用构造函数，插在中间会让它们错位）。
     */
    @Optional()
    private readonly globalConfigService?: GlobalConfigService,
    /**
     * COS 服务（2026-10-22）。
     *
     * 只用于给设计洞察里的就诊/体检/定制单**附件**换短时签名 URL。
     * 同样放在参数表**最后**并 @Optional：既有测试（以及
     * `production-loss-rate.spec.ts`）按位置构造服务，插在中间会全部错位；
     * 本地未配置 COS 时保持原样返回，不影响任何既有字段。
     */
    @Optional()
    private readonly cosService?: TencentCosService,
    /**
     * 显式补剂目标解析（2026-10-22 · Task 3）。
     *
     * 补剂的目标营养素不再按「移除后是否出现缺口」反向推断：添加/修改时由
     * 营养师显式选择（或带出营养档案默认目标），发布/私密快照时只认这份
     * 显式定义，解析不到就直接 400 阻断。
     *
     * 同样放在参数表**最后**并 @Optional：既有测试按位置调用构造函数，
     * 插在中间会让它们错位；模块里已显式注册该 provider。
     */
    @Optional()
    private readonly supplementTargetService?: SupplementTargetService,
  ) {}

  /**
   * 内部生产损耗系数（≥1 的系数，1.07 = 多买 7%）。
   *
   * 读 `GlobalConfig`；读不到 / 值不合法时回落到 **1.07**。
   *
   * 这里原先的落回值是 1.05（设计器发布路径的旧写死值）。2026-10-21
   * 统一到全局配置后，落回值也统一成 1.07 —— 与后台手工建食谱、
   * 小程序 DIY 展示的 7% 一致。这只影响“配置读不到”的异常情况，
   * 不改变任何已有食谱的数值。
   */
  private async resolveProductionLossRate(): Promise<number> {
    try {
      const config = await this.globalConfigService?.getGlobalConfig();
      const value = Number(config?.productionLossRate);
      if (
        Number.isFinite(value) &&
        value >= MIN_PRODUCTION_LOSS_RATE &&
        value <= MAX_PRODUCTION_LOSS_RATE
      ) {
        return value;
      }
      console.warn(
        '[RecipeDesigner] 全局配置里的生产损耗率不合法，按 1.07 处理：',
        config?.productionLossRate,
      );
    } catch (error) {
      console.warn(
        '[RecipeDesigner] 读取生产损耗率失败，按 1.07 处理：',
        error,
      );
    }
    return DEFAULT_PRODUCTION_LOSS_RATE;
  }

  private async listInternalRecipeDesignerUserIds() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.STAFF, UserRole.ADMIN] } },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async listInternalRecipeDesignerCreatorIds() {
    return [
      ...new Set([
        ...(await this.listInternalRecipeDesignerUserIds()),
        ...INTERNAL_RECIPE_DESIGNER_CREATOR_IDS,
      ]),
    ];
  }

  private async buildSeriesVisibilityWhere(
    context: RecipeDesignerAccessContext,
  ) {
    const baseWhere = {
      status: RecipeSeriesStatus.ACTIVE,
      deletedAt: null,
    };

    if (!isInternalRecipeDesignerRole(context)) {
      return {
        ...baseWhere,
        createdBy: context.userId,
      };
    }

    const internalUserIds = await this.listInternalRecipeDesignerCreatorIds();
    return {
      ...baseWhere,
      createdBy: { in: internalUserIds },
    };
  }

  private async isSeriesAccessibleByContext(
    series: { id: string; createdBy?: string | null } | null,
    context: RecipeDesignerAccessContext,
  ) {
    if (!series) return false;
    if (!isInternalRecipeDesignerRole(context)) {
      return series.createdBy === context.userId;
    }

    const internalUserIds = await this.listInternalRecipeDesignerCreatorIds();
    return Boolean(
      series.createdBy && internalUserIds.includes(series.createdBy),
    );
  }

  private async isInternalRecipeDesignerCreatorId(creatorId?: string | null) {
    if (!creatorId) return false;
    if (INTERNAL_RECIPE_DESIGNER_CREATOR_IDS.includes(creatorId)) {
      return true;
    }

    const internalUserIds = await this.listInternalRecipeDesignerUserIds();
    return internalUserIds.includes(creatorId);
  }

  private async loadCustomerDogForRecipeDesigner(
    dogId: string | undefined,
    context: RecipeDesignerAccessContext,
  ) {
    if (isInternalRecipeDesignerRole(context)) {
      return null;
    }
    if (!dogId) {
      throw new BadRequestException('请选择狗狗后再创建食谱');
    }

    const dog = await this.prisma.dog.findFirst({
      where: {
        id: dogId,
        ownerId: getRecipeDesignerCustomerOwnerId(context),
      },
      select: {
        id: true,
        ownerId: true,
        name: true,
        breedId: true,
        birthday: true,
        lifeStageOverride: true,
        activityLevel: true,
        // 生命阶段判定需要体型：混血犬没有品种行，只能靠 sizeClassOverride
        sizeClassOverride: true,
      },
    });
    if (!dog) {
      throw new NotFoundException('未找到可用狗狗档案');
    }

    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: {
            adultAgeMonths: true,
            seniorAgeYears: true,
            // 品种自带的体型分类，是 sizeClassOverride 之外的体型来源
            sizeCategory: true,
          },
        })
      : null;
    return { ...dog, breed };
  }

  private async loadCustomerDogNameMapForSeries(
    series: RecipeSeriesWorkbenchRecord[],
    context: RecipeDesignerAccessContext,
  ) {
    const dogIds = [
      ...new Set(
        series
          .flatMap((record) => [
            record.customerDogId,
            ...record.designs.map((design) => design.customerDogId),
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (dogIds.length === 0) {
      return new Map<string, string>();
    }

    const dogs = await this.prisma.dog.findMany({
      where: {
        id: { in: dogIds },
        ownerId: getRecipeDesignerCustomerOwnerId(context),
      },
      select: { id: true, name: true },
    });
    return new Map(dogs.map((dog) => [dog.id, dog.name]));
  }

  /** 内部工作台卡片展示用：批量加载系列「参考爱犬」名称（含已发布配方上的历史参考犬） */
  private async loadReferenceDogNameMapForSeries(
    series: RecipeSeriesWorkbenchRecord[],
  ) {
    const dogIds = [
      ...new Set(
        series
          .flatMap((record) => [
            record.referenceDogId,
            ...record.recipes.map((recipe) => recipe.referenceDogId),
          ])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (dogIds.length === 0) {
      return new Map<string, string>();
    }
    const dogs = await this.prisma.dog.findMany({
      where: { id: { in: dogIds } },
      select: { id: true, name: true },
    });
    return new Map((dogs ?? []).map((dog) => [dog.id, dog.name]));
  }

  /**
   * 系列关键词搜索条件：
   * 1. 系列名称；
   * 2. 参考爱犬 / 客户爱犬名称（含草稿与已发布配方上的客户犬、定制订单犬）；
   * 3. 历史匹配：订单记录与 DIY 记录中该犬用过的食谱所属系列；
   * 4. 各阶段草稿明细或已发布配方中用到的原料名称（标准原料名或营养食物名）。
   */
  private async buildSeriesKeywordWhere(
    search: string,
  ): Promise<Prisma.RecipeSeriesWhereInput> {
    const nameKeyword = { contains: search, mode: 'insensitive' as const };
    const matchedDogIds = await this.findDogIdsByName(search);
    const dogUsageRecipeClauses =
      matchedDogIds.length > 0
        ? await this.buildDogUsageRecipeClauses(matchedDogIds)
        : [];
    return {
      OR: [
        { name: nameKeyword },
        ...(matchedDogIds.length > 0
          ? [
              { referenceDogId: { in: matchedDogIds } },
              { customerDogId: { in: matchedDogIds } },
              { designs: { some: { customerDogId: { in: matchedDogIds } } } },
              { recipes: { some: { customerDogId: { in: matchedDogIds } } } },
              {
                recipes: {
                  some: { referenceDogId: { in: matchedDogIds } },
                },
              },
              {
                recipes: {
                  some: { customOrder: { dogId: { in: matchedDogIds } } },
                },
              },
            ]
          : []),
        ...dogUsageRecipeClauses,
        {
          designs: {
            some: {
              items: {
                some: {
                  OR: [
                    { ingredient: { name: nameKeyword } },
                    { nutritionFood: { name: nameKeyword } },
                  ],
                },
              },
            },
          },
        },
        {
          recipes: {
            some: {
              items: {
                some: {
                  OR: [
                    { ingredient: { name: nameKeyword } },
                    { nutritionFood: { name: nameKeyword } },
                  ],
                },
              },
            },
          },
        },
      ],
    };
  }

  /**
   * 历史匹配：该犬在订单明细（recipeSnapshot）与 DIY 记录中使用过的食谱，
   * 用于匹配这些食谱所属的设计系列（recipeId 即公开食谱 ID）。
   */
  private async buildDogUsageRecipeClauses(
    dogIds: string[],
  ): Promise<Prisma.RecipeSeriesWhereInput[]> {
    const [orderItems, diySheets] = await Promise.all([
      this.prisma.orderItem.findMany({
        where: { dogId: { in: dogIds } },
        select: { recipeSnapshot: true },
      }),
      this.prisma.dIYSheet.findMany({
        where: { dogId: { in: dogIds } },
        select: { recipeId: true },
      }),
    ]);
    const recipeIds = new Set<string>();
    for (const item of (orderItems ?? []) as Array<{
      recipeSnapshot?: { id?: string } | null;
    }>) {
      if (item?.recipeSnapshot?.id) {
        recipeIds.add(item.recipeSnapshot.id);
      }
    }
    for (const sheet of (diySheets ?? []) as Array<{
      recipeId?: string;
    }>) {
      if (sheet?.recipeId) {
        recipeIds.add(sheet.recipeId);
      }
    }
    return recipeIds.size > 0
      ? [{ recipes: { some: { recipeId: { in: [...recipeIds] } } } }]
      : [];
  }

  /** 按名称模糊查找爱犬 ID（大小写不敏感，用于系列关键词搜索） */
  private async findDogIdsByName(search: string): Promise<string[]> {
    const dogs = await this.prisma.dog.findMany({
      where: { name: { contains: search, mode: 'insensitive' } },
      select: { id: true },
    });
    return (dogs ?? []).map((dog) => dog.id);
  }

  private async expandIngredientSearchTerms(search?: string) {
    const trimmed = search?.trim();
    if (!trimmed) {
      return [];
    }

    let expanded: string[] = [];
    try {
      expanded =
        (await this.searchGovernanceService?.expandQuery(
          'INGREDIENT',
          trimmed,
        )) ?? [];
    } catch {
      this.logger.warn(
        'Ingredient search governance expansion failed; falling back to original query',
      );
    }
    const terms = [trimmed, ...expanded];
    const seen = new Set<string>();

    return terms
      .map((term) => term.trim())
      .filter((term) => {
        const normalized = term.toLocaleLowerCase();
        if (!normalized || seen.has(normalized)) {
          return false;
        }
        seen.add(normalized);
        return true;
      })
      .slice(0, MAX_SEARCH_EXPANSION_TERMS);
  }

  private async recordIngredientOptionSearch(
    search: string | undefined,
    resultCount: number,
  ) {
    const rawQuery = search?.trim();
    if (!rawQuery) {
      return;
    }

    try {
      await this.searchGovernanceService?.recordSearchEvent({
        domain: 'INGREDIENT',
        source: 'RECIPE_DESIGNER_INGREDIENT_OPTIONS',
        rawQuery,
        resultCount,
      });
    } catch {
      this.logger.warn('Ingredient option search logging failed');
    }
  }

  async listIngredientOptions(
    dto: ListRecipeDesignerIngredientOptionsDto = {},
  ) {
    const page = Math.max(1, Number(dto.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(dto.pageSize ?? 20)));
    // 补剂种类有限：指定 type=SUPPLEMENT 时不分页，一次返回全部
    const effectivePageSize =
      dto.type === IngredientType.SUPPLEMENT ? 1000 : pageSize;
    const skip = (page - 1) * effectivePageSize;
    const searchTerms = await this.expandIngredientSearchTerms(dto.search);
    const nutrientTarget =
      await this.resolveIngredientNutrientSearchTarget(dto);
    const verifiedMappingWhere = {
      nutritionFood: { status: NutritionFoodStatus.VERIFIED },
    };
    const searchFilter: Prisma.IngredientWhereInput | undefined =
      searchTerms.length
        ? {
            OR: buildIngredientSearchConditions(searchTerms),
          }
        : undefined;
    const categoryFilter: Prisma.IngredientWhereInput | undefined = dto.category
      ? {
          OR: [
            { properties: { path: ['cfct_class'], equals: dto.category } },
            { properties: { path: ['category_type'], equals: dto.category } },
          ],
        }
      : undefined;
    const where: Prisma.IngredientWhereInput = {
      type: dto.type ?? {
        in: [IngredientType.FOOD, IngredientType.SUPPLEMENT],
      },
      nutritionFoodMappings: { some: verifiedMappingWhere },
      ...(searchFilter ?? {}),
      ...(categoryFilter ? { AND: categoryFilter } : {}),
    };
    const select = this.buildIngredientOptionSelect(!!nutrientTarget);

    const { foodCategories, supplementCategories } =
      await this.aggregateIngredientOptionCategories();

    if (nutrientTarget) {
      const ingredients = await this.prisma.ingredient.findMany({
        where,
        orderBy: { name: 'asc' },
        select,
      });
      const options = ingredients.map((ingredient) =>
        this.toIngredientOption(
          ingredient as IngredientOptionRecord,
          nutrientTarget,
        ),
      );
      const supplementOptions = options
        .filter(
          (option) =>
            option.type === IngredientType.SUPPLEMENT && option.nutrientMatch,
        )
        .sort(compareIngredientOptionsByNutrientMatch);
      const foodOptions = options
        .filter(
          (option) =>
            option.type !== IngredientType.SUPPLEMENT && option.nutrientMatch,
        )
        .sort(compareIngredientOptionsByNutrientMatch);
      const pagedFoodOptions = foodOptions.slice(
        skip,
        skip + effectivePageSize,
      );
      const total = supplementOptions.length + foodOptions.length;
      await this.recordIngredientOptionSearch(dto.search, total);

      return {
        data:
          page === 1
            ? [...supplementOptions, ...pagedFoodOptions]
            : pagedFoodOptions,
        supplementData: supplementOptions,
        foodData: pagedFoodOptions,
        supplementTotal: supplementOptions.length,
        foodTotal: foodOptions.length,
        total,
        page,
        pageSize: effectivePageSize,
        hasMore: skip + effectivePageSize < foodOptions.length,
        foodCategories,
        supplementCategories,
      };
    }

    if (searchTerms.length > 0) {
      const ingredients = await this.prisma.ingredient.findMany({
        where,
        orderBy: { name: 'asc' },
        select,
      });
      const rankedIngredients = ingredients
        .map((ingredient) => ({
          ingredient: ingredient as IngredientOptionRecord,
          score: scoreIngredientSearchMatch(
            ingredient as IngredientOptionRecord,
            searchTerms,
          ),
        }))
        .filter((candidate) => candidate.score > 0)
        .sort(compareIngredientSearchResults);
      const pagedIngredients = rankedIngredients.slice(
        skip,
        skip + effectivePageSize,
      );
      await this.recordIngredientOptionSearch(
        dto.search,
        rankedIngredients.length,
      );

      return {
        data: pagedIngredients.map(({ ingredient }) =>
          this.toIngredientOption(ingredient),
        ),
        total: rankedIngredients.length,
        page,
        pageSize: effectivePageSize,
        hasMore: skip + effectivePageSize < rankedIngredients.length,
        foodCategories,
        supplementCategories,
      };
    }

    const [total, ingredients] = await Promise.all([
      this.prisma.ingredient.count({ where }),
      this.prisma.ingredient.findMany({
        where,
        skip,
        take: effectivePageSize,
        orderBy: { name: 'asc' },
        select,
      }),
    ]);
    await this.recordIngredientOptionSearch(dto.search, total);

    return {
      data: ingredients.map((ingredient) =>
        this.toIngredientOption(ingredient as IngredientOptionRecord),
      ),
      total,
      page,
      pageSize: effectivePageSize,
      hasMore: skip + effectivePageSize < total,
      foodCategories,
      supplementCategories,
    };
  }

  /**
   * 聚合原料库可选分类：
   * 食材按标准原料 CFCT 分类（properties.cfct_class），
   * 补剂按补剂分类（properties.category_type）。
   */
  private async aggregateIngredientOptionCategories(): Promise<{
    foodCategories: string[];
    supplementCategories: string[];
  }> {
    const verifiedMappingWhere = {
      nutritionFood: { status: NutritionFoodStatus.VERIFIED },
    };
    const [foodRows, supplementRows] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: {
          type: IngredientType.FOOD,
          nutritionFoodMappings: { some: verifiedMappingWhere },
        },
        select: { properties: true },
      }),
      this.prisma.ingredient.findMany({
        where: {
          type: IngredientType.SUPPLEMENT,
          nutritionFoodMappings: { some: verifiedMappingWhere },
        },
        select: { properties: true },
      }),
    ]);

    const foodSet = new Set<string>();
    for (const row of foodRows) {
      const value = (row.properties as Record<string, unknown> | null)?.[
        'cfct_class'
      ];
      foodSet.add(typeof value === 'string' && value.trim() ? value : '其他');
    }
    const supplementSet = new Set<string>();
    for (const row of supplementRows) {
      const value = (row.properties as Record<string, unknown> | null)?.[
        'category_type'
      ];
      supplementSet.add(
        typeof value === 'string' && value.trim() ? value : 'OTHER',
      );
    }

    return {
      foodCategories: this.sortFoodCategories(Array.from(foodSet)),
      supplementCategories: this.sortSupplementCategories(
        Array.from(supplementSet),
      ),
    };
  }

  /** CFCT 分类展示顺序 */
  private readonly CFCT_CATEGORY_ORDER = [
    '谷类及制品',
    '薯类及制品',
    '干豆类及制品',
    '蔬菜类及制品',
    '菌藻类',
    '水果类及制品',
    '坚果种子类',
    '畜肉类及制品',
    '禽肉类及制品',
    '乳类及制品',
    '蛋类及制品',
    '水产类',
    '油脂类',
    '调味品类',
    '其他',
  ];

  /** 补剂分类展示顺序 */
  private readonly SUPPLEMENT_CATEGORY_ORDER = [
    'MINERAL',
    'VITAMIN',
    'AMINO_ACID',
    'FATTY_ACID',
    'PROBIOTIC',
    'FUNCTIONAL',
    'OTHER',
  ];

  private sortFoodCategories(categories: string[]): string[] {
    return [...categories].sort((a, b) => {
      const idxA = this.CFCT_CATEGORY_ORDER.indexOf(a);
      const idxB = this.CFCT_CATEGORY_ORDER.indexOf(b);
      const orderA = idxA === -1 ? this.CFCT_CATEGORY_ORDER.length - 1 : idxA;
      const orderB = idxB === -1 ? this.CFCT_CATEGORY_ORDER.length - 1 : idxB;
      return orderA - orderB;
    });
  }

  private sortSupplementCategories(categories: string[]): string[] {
    return [...categories].sort((a, b) => {
      const idxA = this.SUPPLEMENT_CATEGORY_ORDER.indexOf(a);
      const idxB = this.SUPPLEMENT_CATEGORY_ORDER.indexOf(b);
      const orderA =
        idxA === -1 ? this.SUPPLEMENT_CATEGORY_ORDER.length - 1 : idxA;
      const orderB =
        idxB === -1 ? this.SUPPLEMENT_CATEGORY_ORDER.length - 1 : idxB;
      return orderA - orderB;
    });
  }

  async createSupplementOption(
    dto: CreateRecipeDesignerSupplementOptionDto,
    createdBy: string,
  ) {
    const name = normalizeRequiredText(dto.name, '补剂名称');
    const basisType = dto.basisType ?? 'PER_1_G';
    const usageUnit = normalizeSupplementUsageUnit(dto.usageUnit);
    const servingWeightG = normalizeOptionalPositiveNumber(
      dto.servingWeightG,
      '单位换算',
    );
    const densityGPerMl = normalizeOptionalPositiveNumber(
      dto.densityGPerMl,
      '密度',
    );
    if (
      requiresSupplementServingWeight(usageUnit, basisType) &&
      !servingWeightG
    ) {
      throw new BadRequestException(
        '按包装单位使用、但营养数据按重量或体积标注时，需要填写单位换算',
      );
    }
    const nutrients = normalizeManualSupplementNutrients(dto.nutrients);
    const profileName =
      normalizeOptionalText(dto.profileName) ?? `${name} 手工补剂档案`;
    const nutritionProfile = buildManualSupplementNutritionProfile(
      nutrients,
      basisType,
      profileName,
      {
        usageUnit,
        servingWeightG,
        densityGPerMl,
      },
    );
    const activeNutrients = buildManualSupplementActiveNutrients(nutrients);
    const baseUnit = getSupplementBaseUnit(usageUnit);

    return this.prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          name,
          type: IngredientType.SUPPLEMENT,
          procurementStrategy: IngredientProcurementStrategy.DAILY_PURCHASE,
          diyEnabled: false,
          procurementEnabled: false,
          baseUnit,
          unitDisplayLabel: usageUnit,
          purchaseUnit: usageUnit,
          purchaseToBaseRatio: 1,
          currentPricePerPurchaseUnit: 0,
          effectivePricePerPurchaseUnit: 0,
          properties: {
            category_type: 'OTHER',
            display_unit: usageUnit,
            serving_unit_label: usageUnit,
            serving_weight_g: servingWeightG,
            density_g_per_ml: densityGPerMl,
            active_nutrients: activeNutrients,
          },
          nutritionProfile: nutritionProfile as any,
        },
      });
      const nutritionFood = await tx.nutritionFood.create({
        data: {
          name: profileName,
          nameEn: null,
          displayNameZh: profileName,
          displayNameZhSource: 'MANUAL',
          displayNameZhReviewedAt: new Date(),
          displayNameZhReviewedBy: createdBy,
          category: NutritionFoodCategory.SUPPLEMENT,
          dataSource: 'MANUAL',
          externalId: `MINIAPP-MANUAL:${ingredient.id}:${Date.now()}`,
          preparationState: 'SUPPLEMENT',
          preparationStateLabel: '补剂',
          ediblePortionLabel: getSupplementEdiblePortionLabel(
            basisType,
            usageUnit,
          ),
          processingLabel: '手工录入',
          nutritionData: nutritionProfile as any,
          notes: '小程序手工新增补剂档案',
          createdBy,
          status: NutritionFoodStatus.VERIFIED,
        },
      });
      const mapping = await tx.nutritionFoodMapping.create({
        data: {
          nutritionFoodId: nutritionFood.id,
          ingredientId: ingredient.id,
          yieldRate: 1,
          isPrimary: true,
          notes: '小程序手工新增补剂档案',
        },
        include: {
          ingredient: {
            select: {
              id: true,
              name: true,
              type: true,
              unitDisplayLabel: true,
              purchaseUnit: true,
              properties: true,
            },
          },
        },
      });

      return this.toIngredientOption({
        id: ingredient.id,
        name: ingredient.name,
        type: ingredient.type,
        unitDisplayLabel: ingredient.unitDisplayLabel ?? usageUnit,
        purchaseUnit: ingredient.purchaseUnit,
        properties: ingredient.properties,
        brand: ingredient.brand,
        productModel: ingredient.productModel,
        nutritionFoodMappings: [
          {
            id: mapping.id,
            nutritionFoodId: mapping.nutritionFoodId,
            yieldRate: mapping.yieldRate,
            isPrimary: mapping.isPrimary,
            notes: mapping.notes,
            nutritionFood: {
              id: nutritionFood.id,
              name: nutritionFood.name,
              nameEn: nutritionFood.nameEn,
              displayNameZh: nutritionFood.displayNameZh,
              category: nutritionFood.category,
              dataSource: nutritionFood.dataSource,
              status: nutritionFood.status,
            },
          },
        ],
      });
    });
  }

  async listDrafts(access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const where = isInternalRecipeDesignerRole(context)
      ? {
          OR: [
            { createdBy: context.userId },
            {
              status: DesignRecipeStatus.PUBLISHED,
              publishedRecipeId: { not: null },
            },
          ],
        }
      : { createdBy: context.userId };
    const drafts = (await this.prisma.designRecipe.findMany({
      where,
      select: DESIGN_RECIPE_LIST_SELECT,
      orderBy: { updatedAt: 'desc' },
    })) as unknown as DesignRecipeWithItems[];

    return this.buildDesignRecipeWorkbenchCards(drafts).map((draft) =>
      this.toWorkbenchCardSummary(draft),
    );
  }

  async listSeries(
    access: RecipeDesignerAccessInput,
    query: ListRecipeDesignerSeriesDto = {},
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const usePagination =
      query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const searchWhere = search
      ? await this.buildSeriesKeywordWhere(search)
      : undefined;
    const series = (await this.prisma.recipeSeries.findMany({
      where: {
        ...(await this.buildSeriesVisibilityWhere(context)),
        ...(query.status ? { businessStatus: query.status } : {}),
        ...(searchWhere ?? {}),
      },
      include: {
        designs: {
          select: DESIGN_RECIPE_SERIES_LIST_SELECT,
          orderBy: { updatedAt: 'desc' },
        },
        recipes: {
          select: RECIPE_SERIES_WORKBENCH_RECIPE_SELECT,
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      ...(usePagination
        ? {
            skip: (page - 1) * pageSize,
            take: pageSize + 1,
          }
        : {}),
    })) as RecipeSeriesWorkbenchRecord[];

    const hasMore = usePagination && series.length > pageSize;
    const visibleSeries = hasMore ? series.slice(0, pageSize) : series;
    /**
     * 列表上下文（2026-10-22）：
     *  · CATALOG：产品线设计（默认，保持原行为）；
     *  · ORDER：订单绑定设计，单独入口展示，不混入产品线。
     * 历史系列 `designMode` 为空，按 CATALOG 处理（与数据库默认值一致）。
     */
    const designMode = query.designMode ?? RecipeDesignMode.CATALOG;
    const modeSeries = visibleSeries.filter(
      (record) =>
        (record.designMode ?? RecipeDesignMode.CATALOG) === designMode,
    );

    if (!isInternalRecipeDesignerRole(context)) {
      const dogNameById = await this.loadCustomerDogNameMapForSeries(
        modeSeries,
        context,
      );
      const items = modeSeries.map((record) =>
        this.buildCustomerSeriesCard(
          record,
          dogNameById,
          // 客户路径下：系列由这位客户创建 = 客户自助食谱
          record.createdBy === context.userId,
        ),
      );
      return usePagination ? { items, page, pageSize, hasMore } : items;
    }

    const referenceDogNameById =
      await this.loadReferenceDogNameMapForSeries(modeSeries);
    const cards = modeSeries.map((record) => {
      const referenceDogIds = [
        record.referenceDogId,
        ...record.recipes.map((recipe) => recipe.referenceDogId),
      ].filter((id): id is string => Boolean(id));
      const referenceDogNames = [
        ...new Set(
          referenceDogIds
            .map((id) => referenceDogNameById.get(id) ?? '')
            .filter(Boolean),
        ),
      ];
      return this.buildSeriesWorkbenchCard(
        record,
        context.userId,
        undefined,
        referenceDogNames[0] ?? null,
        referenceDogNames,
      );
    });
    const items = this.filterSeriesWorkbenchCards(cards, query.status);
    if (designMode === RecipeDesignMode.ORDER) {
      const orderIds = Array.from(
        new Set(modeSeries.map((record) => record.orderId).filter(Boolean)),
      ) as string[];
      const orders = orderIds.length
        ? await this.prisma.customRecipeOrder.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              orderId: true,
              status: true,
              recipeQuantity: true,
              dog: { select: { name: true } },
            },
          })
        : [];
      const orderById = new Map(orders.map((order) => [order.id, order]));
      const seriesById = new Map(
        modeSeries.map((record) => [record.id, record]),
      );
      const orderItems = items.map((card) => {
        const order = orderById.get(seriesById.get(card.id)?.orderId ?? '');
        return {
          ...card,
          designMode,
          orderNo: order?.orderId ?? null,
          orderStatus: order?.status ?? null,
          orderQuantity: order?.recipeQuantity ?? null,
          orderDogName: order?.dog?.name ?? card.referenceDogName ?? null,
        };
      });
      return usePagination
        ? { items: orderItems, page, pageSize, hasMore }
        : orderItems;
    }

    return usePagination ? { items, page, pageSize, hasMore } : items;
  }

  async createSeries(
    dto: CreateRecipeSeriesDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请填写系列名称');
    }

    // W2：食谱设计器不再向所有用户开放。
    //
    // 已经用设计器建过食谱的老客户可以继续用（存量食谱得能接着编辑），
    // 但没有设计历史的客户一律拒绝 —— 光把入口藏起来不够，
    // 有人绕过界面直接调接口照样能建。
    //
    // 见 docs/plans/2026-09-30-recipe-domain-business-definition.md §5.1
    if (!isInternalRecipeDesignerRole(context)) {
      const hasDesignHistory = await this.hasCustomerDesignHistory(context);
      if (!hasDesignHistory) {
        throw new BadRequestException(
          '食谱设计器已不再对所有用户开放。想为狗狗定制食谱，请使用「定制食谱」服务。',
        );
      }
    }

    const customerDog = await this.loadCustomerDogForRecipeDesigner(
      dto.dogId,
      context,
    );
    let referenceDogId: string | null = null;
    if (isInternalRecipeDesignerRole(context) && dto.referenceDogId) {
      const referenceDog = await this.prisma.dog.findUnique({
        where: { id: dto.referenceDogId },
        select: { id: true },
      });
      if (!referenceDog) {
        throw new BadRequestException('参考爱犬不存在，请重新选择');
      }
      referenceDogId = referenceDog.id;
    }

    /**
     * 2026-10-19：未付款的定制订单禁止开始设计。
     *
     * 订单页的入口已禁用，但有人可以绕过界面直接调接口；
     * 所以服务端再拦一次：这只狗有 PENDING_PAYMENT 的定制单时，
     * 不给它新建设计系列。付款后（PAID/IN_PROGRESS）才能开始。
     */
    const designDogId = customerDog?.id || referenceDogId;
    if (designDogId) {
      const pendingOrder = await this.prisma.customRecipeOrder.findFirst({
        where: {
          dogId: designDogId,
          status: CustomRecipeStatus.PENDING_PAYMENT,
        },
        select: { orderId: true },
      });
      if (pendingOrder) {
        throw new BadRequestException(
          `订单 ${pendingOrder.orderId} 还未付款，付款成功后才能开始设计`,
        );
      }
    }

    const inferredLifeStage = customerDog
      ? mapDogProfileToSeriesLifeStage(customerDog)
      : null;
    const scenario =
      dto.scenario ??
      (inferredLifeStage
        ? mapSeriesLifeStageToScenario(inferredLifeStage)
        : 'ADULT_MER_110');
    const lifeStage = mapScenarioToSeriesLifeStage(scenario);

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const series = await tx.recipeSeries.create({
              data: {
                name,
                status: RecipeSeriesStatus.ACTIVE,
                createdBy: context.userId,
                ...(customerDog ? { customerDogId: customerDog.id } : {}),
                ...(referenceDogId ? { referenceDogId } : {}),
              },
            });

            const version = await this.allocateNextDesignRecipeVersion(
              tx,
              name,
            );
            const design = await tx.designRecipe.create({
              data: {
                name,
                version,
                status: DesignRecipeStatus.DRAFT,
                fediafDogScenario: scenario,
                nutritionStandard: 'FEDIAF_2025',
                targetHealthTags: [],
                applicableLifeStages: [lifeStage],
                createdBy: context.userId,
                seriesId: series.id,
                seriesLifeStage: lifeStage,
                ...(customerDog ? { customerDogId: customerDog.id } : {}),
              },
              include: DESIGN_RECIPE_INCLUDE,
            });

            if (!isInternalRecipeDesignerRole(context)) {
              return this.buildCustomerSeriesCard(
                {
                  ...series,
                  customerDogId: customerDog?.id ?? null,
                  designs: [design],
                  recipes: [],
                } as RecipeSeriesWorkbenchRecord,
                new Map(
                  customerDog ? [[customerDog.id, customerDog.name]] : [],
                ),
                // 这位客户刚新建的阶段草稿 —— 属于客户自助
                true,
              );
            }

            return this.buildSeriesWorkbenchCard(
              {
                ...series,
                designs: [design],
                recipes: [],
              } as RecipeSeriesWorkbenchRecord,
              context.userId,
              design.id,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('配方系列创建失败，请重试');
  }

  /**
   * 订单绑定食谱设计 · 创建一个槽位的系列 / 草稿（2026-10-22 · Task 3）。
   *
   * 约定（与设计文档 §6.2 一致）：**一份 = 一个独立系列 + 一个草稿**。
   *  · 系列写死 `designMode=ORDER`、`orderId`、`orderQuantity`，
   *    `referenceDogId` / `customerDogId` 都锁定为订单狗狗；
   *  · 从模板创建时复用 `createCopiedSeriesDesignFromRecipe` 做原料映射，
   *    不复制原食谱的顾客、订单或交付关系，原食谱不做任何修改；
   *  · 空白草稿只建系列和空设计，不复制原料。
   *
   * 容量、订单状态、阶段提示由 `OrderRecipeDesignService` 负责；
   * 本方法只负责「建系列 + 建草稿」这一件事。
   */
  async createOrderBoundSeriesDesign(input: {
    /** `custom_recipe_order.id`（uuid，不是对外订单号） */
    customOrderId: string;
    dogId: string;
    dogName: string;
    orderQuantity: number;
    createdBy: string;
    name?: string;
    sourceRecipeId?: string | null;
    /** 模板未标注阶段时的兜底阶段（通常是订单狗狗的当前阶段） */
    defaultLifeStage?: string | null;
  }): Promise<{
    seriesId: string;
    draftId: string;
    name: string;
    sourceRecipeId: string | null;
    sourceRecipeVersion: number | null;
    sourceKind: 'CATALOG' | 'CUSTOM' | null;
  }> {
    const sourceRecipeId = input.sourceRecipeId?.trim() || null;

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            let template: RecipeSeriesCopyableRecipe | null = null;
            let sourceKind: 'CATALOG' | 'CUSTOM' | null = null;
            let templateName = '';

            if (sourceRecipeId) {
              const recipe = await tx.recipe.findUnique({
                where: { id: sourceRecipeId },
                include: {
                  items: { orderBy: { sortOrder: 'asc' } },
                },
              });
              if (!recipe) {
                throw new NotFoundException('模板食谱不存在');
              }
              if (
                recipe.status !== RecipeStatus.PUBLIC &&
                recipe.status !== RecipeStatus.PRIVATE_CUSTOM
              ) {
                throw new BadRequestException(
                  '模板食谱不可用，请选择已上架或私密定制食谱',
                );
              }
              sourceKind =
                recipe.status === RecipeStatus.PUBLIC ? 'CATALOG' : 'CUSTOM';
              templateName = recipe.name;
              template = {
                ...recipe,
                seriesLifeStage: this.resolveOrderTemplateLifeStage(
                  recipe,
                  input.defaultLifeStage,
                ),
              } as unknown as RecipeSeriesCopyableRecipe;
            }

            const name = (
              input.name?.trim() ||
              `${input.dogName}定制 · ${templateName || '新食谱'}`
            ).slice(0, 200);
            if (!name) {
              throw new BadRequestException('请填写食谱名称');
            }

            const series = await tx.recipeSeries.create({
              data: {
                name,
                status: RecipeSeriesStatus.ACTIVE,
                createdBy: input.createdBy,
                designMode: RecipeDesignMode.ORDER,
                orderId: input.customOrderId,
                orderQuantity: input.orderQuantity,
                customerDogId: input.dogId,
                referenceDogId: input.dogId,
              },
            });

            const version = await this.allocateNextDesignRecipeVersion(
              tx,
              name,
            );

            let draft: DesignRecipeWithItems;
            if (template) {
              draft = await this.createCopiedSeriesDesignFromRecipe(
                tx,
                template,
                series.id,
                name,
                version,
                input.createdBy,
                input.dogId,
              );
            } else {
              const blankLifeStage = this.resolveOrderTemplateLifeStage(
                null,
                input.defaultLifeStage,
              );
              draft = (await tx.designRecipe.create({
                data: {
                  name,
                  version,
                  status: DesignRecipeStatus.DRAFT,
                  fediafDogScenario:
                    mapSeriesLifeStageToScenario(blankLifeStage),
                  nutritionStandard: 'FEDIAF_2025',
                  targetHealthTags: [],
                  applicableLifeStages: [blankLifeStage],
                  createdBy: input.createdBy,
                  seriesId: series.id,
                  seriesLifeStage: blankLifeStage,
                  customerDogId: input.dogId,
                } as Prisma.DesignRecipeUncheckedCreateInput,
                include: DESIGN_RECIPE_INCLUDE,
              })) as unknown as DesignRecipeWithItems;
            }

            return {
              seriesId: series.id,
              draftId: draft.id,
              name,
              sourceRecipeId,
              sourceRecipeVersion: template?.version ?? null,
              sourceKind,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('订单设计草稿创建失败，请重试');
  }

  /**
   * 订单设计槽位创建失败时的回滚：删掉刚建的草稿与系列。
   *
   * 用 `deleteMany` 避免并发重试时二次删除抛错；调用方只在
   * `OrderRecipeDesign` 记录还没写成功时调用，因此不会有外键引用。
   */
  async deleteOrderBoundSeriesDesign(
    seriesId: string,
    draftId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.designRecipeItem.deleteMany({
        where: { designRecipeId: draftId },
      });
      await tx.designRecipe.deleteMany({ where: { id: draftId } });
      await tx.recipeSeries.deleteMany({ where: { id: seriesId } });
    });
  }

  /**
   * 解析模板食谱应复制进订单草稿的生命阶段：
   * 模板自己的 `seriesLifeStage` > 模板 `applicableLifeStages` >
   * 订单狗狗当前阶段 > 普通成年犬兜底。
   *
   * 阶段只用于草稿的初始场景，与订单狗狗不一致时由调用方提示（不阻断）。
   */
  private resolveOrderTemplateLifeStage(
    recipe: {
      seriesLifeStage?: string | null;
      applicableLifeStages?: unknown;
    } | null,
    fallback?: string | null,
  ): RecipeSeriesLifeStage {
    const candidates: unknown[] = [];
    if (recipe) {
      candidates.push(recipe.seriesLifeStage);
      if (Array.isArray(recipe.applicableLifeStages)) {
        candidates.push(...recipe.applicableLifeStages);
      }
    }
    candidates.push(fallback);

    const orderedStages = ORDERED_RECIPE_SERIES_LIFE_STAGES as string[];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && orderedStages.includes(candidate)) {
        return candidate as RecipeSeriesLifeStage;
      }
    }

    return RecipeLifeStage.HIGH_ACTIVITY_ADULT;
  }

  async duplicateSeries(seriesId: string, access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const sourceSeries = await this.loadAccessibleSeriesForDuplication(
              tx,
              seriesId,
              context,
            );
            const sourceSources =
              this.getLatestCopyableSeriesStageSources(sourceSeries);
            if (sourceSources.length === 0) {
              throw new BadRequestException('该系列暂无可复制的生命阶段');
            }

            const copyName = this.buildDuplicateSeriesName(sourceSeries.name);
            const copiedCustomerDogId = !isInternalRecipeDesignerRole(context)
              ? this.getCustomerDogIdForSeriesCopy(sourceSeries, sourceSources)
              : null;
            const copiedSeries = await tx.recipeSeries.create({
              data: {
                name: copyName,
                status: RecipeSeriesStatus.ACTIVE,
                createdBy: context.userId,
                ...(copiedCustomerDogId
                  ? { customerDogId: copiedCustomerDogId }
                  : {}),
              },
            });
            const firstVersion = await this.allocateNextDesignRecipeVersion(
              tx,
              copyName,
            );
            const copiedDesigns = [];
            let nextVersion = firstVersion;
            for (const source of sourceSources) {
              copiedDesigns.push(
                await this.createCopiedSeriesDesignFromSource(
                  tx,
                  source,
                  copiedSeries.id,
                  copyName,
                  nextVersion,
                  context.userId,
                  copiedCustomerDogId,
                ),
              );
              nextVersion += 1;
            }

            if (!isInternalRecipeDesignerRole(context)) {
              return this.buildCustomerSeriesCard(
                {
                  ...copiedSeries,
                  customerDogId: copiedCustomerDogId,
                  designs: copiedDesigns,
                  recipes: [],
                } as RecipeSeriesWorkbenchRecord,
                new Map(),
                // 这位客户刚复制出来的系列 —— 属于客户自助
                true,
              );
            }

            return this.buildSeriesWorkbenchCard(
              {
                ...copiedSeries,
                designs: copiedDesigns,
                recipes: [],
              } as RecipeSeriesWorkbenchRecord,
              context.userId,
              copiedDesigns[0]?.id,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('系列副本创建失败，请重试');
  }

  async duplicateSeriesStage(
    seriesId: string,
    lifeStage: string,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const normalizedLifeStage =
      this.normalizeRecipeSeriesLifeStageForDuplication(lifeStage);

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const sourceSeries = await this.loadAccessibleSeriesForDuplication(
              tx,
              seriesId,
              context,
            );
            const source = this.getLatestCopyableSeriesStageSources(
              sourceSeries,
            ).find((candidate) => candidate.lifeStage === normalizedLifeStage);
            if (!source) {
              throw new BadRequestException('该生命阶段暂无可复制食谱');
            }

            const copyName = this.buildDuplicateSeriesStageName(
              sourceSeries.name,
              normalizedLifeStage,
            );
            const copiedSeries = await tx.recipeSeries.create({
              data: {
                name: copyName,
                status: RecipeSeriesStatus.ACTIVE,
                createdBy: context.userId,
              },
            });
            const version = await this.allocateNextDesignRecipeVersion(
              tx,
              copyName,
            );
            const copiedDesign = await this.createCopiedSeriesDesignFromSource(
              tx,
              source,
              copiedSeries.id,
              copyName,
              version,
              context.userId,
            );

            return this.buildSeriesWorkbenchCard(
              {
                ...copiedSeries,
                designs: [copiedDesign],
                recipes: [],
              } as RecipeSeriesWorkbenchRecord,
              context.userId,
              copiedDesign.id,
            );
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('生命阶段副本创建失败，请重试');
  }

  async createSeriesStageDraft(
    seriesId: string,
    dto: CreateRecipeSeriesStageDraftDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const lifeStage = mapScenarioToSeriesLifeStage(dto.scenario);

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const series = await tx.recipeSeries.findUnique({
              where: { id: seriesId },
            });

            if (
              !series ||
              series.status !== RecipeSeriesStatus.ACTIVE ||
              series.deletedAt ||
              !(await this.isSeriesAccessibleByContext(series, context))
            ) {
              throw new NotFoundException(
                `Recipe series ${seriesId} not found`,
              );
            }

            const existingDraft = await tx.designRecipe.findFirst({
              where: {
                seriesId,
                seriesLifeStage: lifeStage,
                status: { not: DesignRecipeStatus.PUBLISHED },
                publishedRecipeId: null,
                publishedAt: null,
              },
              include: DESIGN_RECIPE_INCLUDE,
              orderBy: { updatedAt: 'desc' },
            });
            if (existingDraft) {
              // 已有草稿但没有任何原料，且该阶段存在正式发布的食谱（如历史导入数据）：
              // 自动把已发布配方的原料补进草稿，保证进入编辑器即有内容
              if (existingDraft.items.length === 0 && !dto.sourceDraftId) {
                const publishedRecipe =
                  await this.findLatestPublishedRecipeForStage(
                    tx,
                    seriesId,
                    lifeStage,
                  );
                if (publishedRecipe) {
                  const copiedItems = await this.copyRecipeItemsToDesignSafely(
                    tx,
                    publishedRecipe,
                  );
                  if (copiedItems.length > 0) {
                    await tx.designRecipeItem.createMany({
                      data: copiedItems.map((item) => ({
                        ...item,
                        designRecipeId: existingDraft.id,
                      })),
                    });
                    const updated = await tx.designRecipe.findUnique({
                      where: { id: existingDraft.id },
                      include: DESIGN_RECIPE_INCLUDE,
                    });
                    if (updated) {
                      return updated;
                    }
                  }
                }
              }
              return existingDraft;
            }

            const sourceTemplate = dto.sourceDraftId
              ? await this.loadSeriesStageSourceTemplate(
                  tx,
                  seriesId,
                  dto.sourceDraftId,
                )
              : null;

            // 未指定模板时：若该阶段已有正式发布的食谱（如历史导入数据），
            // 自动把已发布配方的原料带入新草稿，保证进入编辑器即有内容
            const publishedRecipe = !sourceTemplate
              ? await this.findLatestPublishedRecipeForStage(
                  tx,
                  seriesId,
                  lifeStage,
                )
              : null;

            const version = await this.allocateNextDesignRecipeVersion(
              tx,
              series.name,
            );

            const copiedItems = sourceTemplate
              ? sourceTemplate.items.map((item) =>
                  this.toCopiedDesignRecipeItemData(item),
                )
              : publishedRecipe
                ? await this.copyRecipeItemsToDesignSafely(tx, publishedRecipe)
                : [];

            return tx.designRecipe.create({
              data: {
                name: series.name,
                version,
                status: DesignRecipeStatus.DRAFT,
                fediafDogScenario: dto.scenario,
                nutritionStandard: 'FEDIAF_2025',
                targetHealthTags: [],
                applicableLifeStages: [lifeStage],
                createdBy: context.userId,
                seriesId,
                seriesLifeStage: lifeStage,
                ...(copiedItems.length > 0
                  ? { items: { create: copiedItems } }
                  : {}),
              },
              include: DESIGN_RECIPE_INCLUDE,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('阶段草稿创建失败，请重试');
  }

  async copySeriesStageIngredients(
    seriesId: string,
    lifeStage: string,
    dto: CopyRecipeSeriesStageIngredientsDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const targetLifeStage =
      this.normalizeRecipeSeriesLifeStageForDuplication(lifeStage);
    const sourceLifeStage = this.normalizeRecipeSeriesLifeStageForDuplication(
      dto.sourceLifeStage,
    );

    if (sourceLifeStage === targetLifeStage) {
      throw new BadRequestException('请选择不同的来源生命阶段');
    }

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const series = await this.loadAccessibleSeriesForDuplication(
              tx,
              seriesId,
              context,
            );
            const sources = this.getLatestCopyableSeriesStageSources(series);
            const source = sources.find(
              (candidate) => candidate.lifeStage === sourceLifeStage,
            );
            if (!source) {
              throw new BadRequestException('来源生命阶段暂无可复制原料');
            }

            const copiedItems =
              await this.toCopiedDesignRecipeItemsFromStageSource(tx, source);
            if (copiedItems.length === 0) {
              throw new BadRequestException('来源生命阶段暂无原料，无法复制');
            }

            const targetDraft =
              await this.resolveEditableSeriesStageDraftForIngredientCopy(
                tx,
                series,
                sources,
                targetLifeStage,
                context.userId,
              );

            await tx.designRecipeItem.deleteMany({
              where: { designRecipeId: targetDraft.id },
            });

            return tx.designRecipe.update({
              where: { id: targetDraft.id },
              data: {
                contentRevision: { increment: 1 },
                status: DesignRecipeStatus.DRAFT,
                fediafDogScenario:
                  mapSeriesLifeStageToScenario(targetLifeStage),
                applicableLifeStages: [targetLifeStage],
                totalWeightG: copiedItems.reduce(
                  (total, item) => total + item.weightG,
                  0,
                ),
                energyDensityKcalPerKg: null,
                calculatedNutrition: {},
                complianceStatus: {},
                assessmentSummary: {},
                missingDataReport: [],
                complianceScore: 0,
                isCompliant: false,
                reviewStatus: DesignRecipeReviewStatus.NONE,
                reviewNote: null,
                reviewedBy: null,
                reviewedAt: null,
                publishedAt: null,
                publishedRecipeId: null,
                publishedRecipeVersion: null,
                items: {
                  create: copiedItems,
                },
              },
              include: DESIGN_RECIPE_INCLUDE,
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isRetryableSeriesDraftCreateError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('生命阶段原料复制失败，请重试');
  }

  private async loadAccessibleSeriesForDuplication(
    tx: Pick<PrismaService, 'recipeSeries'>,
    seriesId: string,
    context: RecipeDesignerAccessContext,
  ) {
    const series = await tx.recipeSeries.findUnique({
      where: { id: seriesId },
      include: {
        designs: {
          include: DESIGN_RECIPE_INCLUDE,
          orderBy: { updatedAt: 'desc' },
        },
        recipes: {
          include: {
            items: {
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt ||
      !(await this.isSeriesAccessibleByContext(series, context))
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }

    return series as unknown as RecipeSeriesWorkbenchRecord & {
      designs: DesignRecipeWithItems[];
    };
  }

  private getLatestCopyableSeriesDesigns(
    designs: DesignRecipeWithItems[],
  ): DesignRecipeWithItems[] {
    const latestByStage = new Map<
      RecipeSeriesLifeStage,
      DesignRecipeWithItems
    >();
    for (const lifeStage of ORDERED_RECIPE_SERIES_LIFE_STAGES) {
      const latest = designs
        .filter((design) => design.seriesLifeStage === lifeStage)
        .sort(
          (left, right) =>
            this.getUpdatedTime(right) - this.getUpdatedTime(left),
        )[0];
      if (latest) {
        latestByStage.set(lifeStage, latest);
      }
    }
    return ORDERED_RECIPE_SERIES_LIFE_STAGES.flatMap((lifeStage) => {
      const design = latestByStage.get(lifeStage);
      return design ? [design] : [];
    });
  }

  private getLatestCopyableSeriesStageSources(
    series: RecipeSeriesWorkbenchRecord & {
      designs: DesignRecipeWithItems[];
      recipes: RecipeSeriesWorkbenchRecord['recipes'];
    },
  ): CopyableSeriesStageSource[] {
    const designsByStage = new Map(
      this.getLatestCopyableSeriesDesigns(series.designs).map((design) => [
        design.seriesLifeStage as RecipeSeriesLifeStage,
        design,
      ]),
    );
    const recipesByStage = new Map(
      this.getLatestCopyableSeriesRecipes(series.recipes).map((recipe) => [
        recipe.seriesLifeStage,
        recipe,
      ]),
    );

    const sources: CopyableSeriesStageSource[] = [];
    for (const lifeStage of ORDERED_RECIPE_SERIES_LIFE_STAGES) {
      const design = designsByStage.get(lifeStage);
      if (design) {
        sources.push({ kind: 'design', lifeStage, design });
        continue;
      }

      const recipe = recipesByStage.get(lifeStage);
      if (recipe) {
        sources.push({ kind: 'recipe', lifeStage, recipe });
      }
    }

    return sources;
  }

  private getLatestCopyableSeriesRecipes(
    recipes: RecipeSeriesWorkbenchRecord['recipes'],
  ): RecipeSeriesCopyableRecipe[] {
    const latestByStage = new Map<
      RecipeSeriesLifeStage,
      RecipeSeriesCopyableRecipe
    >();

    for (const recipe of recipes) {
      if (!this.isCopyableRecipeStatus(recipe.status)) {
        continue;
      }
      if (
        !recipe.seriesLifeStage ||
        !ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(
          recipe.seriesLifeStage as RecipeSeriesLifeStage,
        )
      ) {
        continue;
      }

      const lifeStage = recipe.seriesLifeStage as RecipeSeriesLifeStage;
      const candidate = {
        ...recipe,
        seriesLifeStage: lifeStage,
        items: recipe.items ?? [],
      };
      const current = latestByStage.get(lifeStage);
      if (!current || this.compareCopyableRecipes(candidate, current) > 0) {
        latestByStage.set(lifeStage, candidate);
      }
    }

    return ORDERED_RECIPE_SERIES_LIFE_STAGES.flatMap((lifeStage) => {
      const recipe = latestByStage.get(lifeStage);
      return recipe ? [recipe] : [];
    });
  }

  private isCopyableRecipeStatus(status: string): boolean {
    return COPYABLE_RECIPE_STATUS_PRIORITY[status] !== undefined;
  }

  private compareCopyableRecipes(
    left: RecipeSeriesCopyableRecipe,
    right: RecipeSeriesCopyableRecipe,
  ): number {
    const byStatusPriority =
      (COPYABLE_RECIPE_STATUS_PRIORITY[left.status] ?? 0) -
      (COPYABLE_RECIPE_STATUS_PRIORITY[right.status] ?? 0);
    if (byStatusPriority !== 0) {
      return byStatusPriority;
    }

    const byVersion = (left.version ?? 0) - (right.version ?? 0);
    if (byVersion !== 0) {
      return byVersion;
    }

    return this.getUpdatedTime(left) - this.getUpdatedTime(right);
  }

  private normalizeRecipeSeriesLifeStageForDuplication(
    lifeStage: string,
  ): RecipeSeriesLifeStage {
    if (
      ORDERED_RECIPE_SERIES_LIFE_STAGES.includes(
        lifeStage as RecipeSeriesLifeStage,
      )
    ) {
      return lifeStage as RecipeSeriesLifeStage;
    }
    throw new BadRequestException('不支持复制该生命阶段');
  }

  private buildDuplicateSeriesName(sourceName: string) {
    return `${sourceName} 副本`;
  }

  private buildDuplicateSeriesStageName(
    sourceName: string,
    lifeStage: RecipeSeriesLifeStage,
  ) {
    return `${sourceName} ${DUPLICATE_SERIES_STAGE_NAME_LABELS[lifeStage]}副本`;
  }

  private async toCopiedDesignRecipeItemsFromStageSource(
    tx: Pick<PrismaService, 'nutritionFoodMapping'>,
    source: CopyableSeriesStageSource,
  ) {
    if (source.kind === 'design') {
      return source.design.items.map((item) =>
        this.toCopiedDesignRecipeItemData(item),
      );
    }

    return this.toCopiedDesignRecipeItemsFromRecipe(tx, source.recipe);
  }

  private async resolveEditableSeriesStageDraftForIngredientCopy(
    tx: Pick<PrismaService, 'designRecipe' | 'nutritionFoodMapping'>,
    series: RecipeSeriesWorkbenchRecord & {
      designs: DesignRecipeWithItems[];
      recipes: RecipeSeriesWorkbenchRecord['recipes'];
    },
    sources: CopyableSeriesStageSource[],
    targetLifeStage: RecipeSeriesLifeStage,
    createdBy: string,
  ): Promise<DesignRecipeWithItems> {
    const designs = series.designs as DesignRecipeWithItems[];
    const existingDraft = this.pickLatestByUpdatedAt(
      designs.filter(
        (design) =>
          design.seriesLifeStage === targetLifeStage &&
          !this.isPublishedDraft(design) &&
          design.status !== DesignRecipeStatus.ARCHIVED,
      ),
    );
    if (existingDraft) {
      return existingDraft;
    }

    const targetSource = sources.find(
      (candidate) => candidate.lifeStage === targetLifeStage,
    );
    const version = await this.allocateNextDesignRecipeVersion(tx, series.name);
    if (!targetSource) {
      return this.createBlankEditableSeriesStageDraftShell(
        tx,
        targetLifeStage,
        series.id,
        series.name,
        version,
        createdBy,
      );
    }

    return this.createEditableSeriesStageDraftShell(
      tx,
      targetSource,
      series.id,
      series.name,
      version,
      createdBy,
    );
  }

  private async createBlankEditableSeriesStageDraftShell(
    tx: Pick<PrismaService, 'designRecipe'>,
    lifeStage: RecipeSeriesLifeStage,
    seriesId: string,
    name: string,
    version: number,
    createdBy: string,
  ): Promise<DesignRecipeWithItems> {
    return tx.designRecipe.create({
      data: {
        name,
        version,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: mapSeriesLifeStageToScenario(lifeStage),
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: [],
        applicableLifeStages: [lifeStage],
        createdBy,
        totalWeightG: 0,
        energyDensityKcalPerKg: null,
        calculatedNutrition: {},
        complianceStatus: {},
        assessmentSummary: {},
        missingDataReport: [],
        isCompliant: false,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        revisionOfDesignRecipeId: null,
        revisionBaseRecipeId: null,
        seriesId,
        seriesLifeStage: lifeStage,
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    }) as unknown as Promise<DesignRecipeWithItems>;
  }

  private async createEditableSeriesStageDraftShell(
    tx: Pick<PrismaService, 'designRecipe'>,
    source: CopyableSeriesStageSource,
    seriesId: string,
    name: string,
    version: number,
    createdBy: string,
  ): Promise<DesignRecipeWithItems> {
    if (source.kind === 'recipe') {
      return tx.designRecipe.create({
        data: {
          name,
          version,
          status: DesignRecipeStatus.DRAFT,
          fediafDogScenario: mapSeriesLifeStageToScenario(source.lifeStage),
          nutritionStandard: source.recipe.nutritionStandard || 'FEDIAF_2025',
          targetHealthTags: this.normalizeRecipeStringArray(
            source.recipe.targetHealthTags,
          ),
          applicableLifeStages: [source.lifeStage],
          notes: source.recipe.description ?? null,
          createdBy,
          totalWeightG: 0,
          energyDensityKcalPerKg: null,
          calculatedNutrition: {},
          complianceStatus: {},
          assessmentSummary: {},
          missingDataReport: [],
          isCompliant: false,
          reviewStatus: DesignRecipeReviewStatus.NONE,
          reviewNote: null,
          reviewedBy: null,
          reviewedAt: null,
          publishedAt: null,
          publishedRecipeId: null,
          publishedRecipeVersion: null,
          revisionOfDesignRecipeId: null,
          revisionBaseRecipeId: source.recipe.recipeId,
          seriesId,
          seriesLifeStage: source.lifeStage,
          ...(source.recipe.customerDogId
            ? { customerDogId: source.recipe.customerDogId }
            : {}),
        } as Prisma.DesignRecipeUncheckedCreateInput,
        include: DESIGN_RECIPE_INCLUDE,
      }) as unknown as Promise<DesignRecipeWithItems>;
    }

    const base = source.design;
    return tx.designRecipe.create({
      data: {
        name,
        version,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: mapSeriesLifeStageToScenario(source.lifeStage),
        nutritionStandard: base.nutritionStandard || 'FEDIAF_2025',
        targetHealthTags: base.targetHealthTags,
        applicableLifeStages: [source.lifeStage],
        notes: base.notes,
        createdBy,
        totalWeightG: base.totalWeightG ?? 0,
        energyDensityKcalPerKg: null,
        calculatedNutrition: {},
        complianceStatus: {},
        assessmentSummary: {},
        missingDataReport: [],
        isCompliant: false,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        revisionOfDesignRecipeId: this.isPublishedDraft(base) ? base.id : null,
        revisionBaseRecipeId: this.isPublishedDraft(base)
          ? base.publishedRecipeId
          : null,
        seriesId,
        seriesLifeStage: source.lifeStage,
        ...(base.customerDogId ? { customerDogId: base.customerDogId } : {}),
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    }) as unknown as Promise<DesignRecipeWithItems>;
  }

  private getCustomerDogIdForSeriesCopy(
    sourceSeries: RecipeSeriesWorkbenchRecord & {
      designs: DesignRecipeWithItems[];
    },
    sourceSources: CopyableSeriesStageSource[],
  ) {
    return (
      sourceSeries.customerDogId ??
      sourceSources.find((source) => source.kind === 'design')?.design
        .customerDogId ??
      sourceSources.find((source) => source.kind === 'recipe')?.recipe
        .customerDogId ??
      null
    );
  }

  private async createCopiedSeriesDesignFromSource(
    tx: Pick<PrismaService, 'designRecipe' | 'nutritionFoodMapping'>,
    source: CopyableSeriesStageSource,
    seriesId: string,
    name: string,
    version: number,
    createdBy: string,
    customerDogId?: string | null,
  ) {
    if (source.kind === 'design') {
      return this.createCopiedSeriesDesign(
        tx,
        source.design,
        seriesId,
        name,
        version,
        createdBy,
        customerDogId,
      );
    }

    return this.createCopiedSeriesDesignFromRecipe(
      tx,
      source.recipe,
      seriesId,
      name,
      version,
      createdBy,
      customerDogId,
    );
  }

  private async createCopiedSeriesDesign(
    tx: Pick<PrismaService, 'designRecipe'>,
    source: DesignRecipeWithItems,
    seriesId: string,
    name: string,
    version: number,
    createdBy: string,
    customerDogId?: string | null,
  ) {
    const lifeStage =
      (source.seriesLifeStage as RecipeSeriesLifeStage | null) ||
      mapScenarioToSeriesLifeStage(source.fediafDogScenario);

    return tx.designRecipe.create({
      data: {
        name,
        version,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: source.fediafDogScenario,
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: source.targetHealthTags,
        applicableLifeStages: [lifeStage],
        notes: source.notes,
        createdBy,
        totalWeightG: source.totalWeightG ?? 0,
        energyDensityKcalPerKg: null,
        calculatedNutrition: {},
        complianceStatus: {},
        assessmentSummary: {},
        missingDataReport: [],
        isCompliant: false,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        revisionOfDesignRecipeId: null,
        revisionBaseRecipeId: null,
        seriesId,
        seriesLifeStage: lifeStage,
        ...(customerDogId ? { customerDogId } : {}),
        items: {
          create: source.items.map((item) =>
            this.toCopiedDesignRecipeItemData(item),
          ),
        },
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  private async createCopiedSeriesDesignFromRecipe(
    tx: Pick<PrismaService, 'designRecipe' | 'nutritionFoodMapping'>,
    source: RecipeSeriesCopyableRecipe,
    seriesId: string,
    name: string,
    version: number,
    createdBy: string,
    customerDogId?: string | null,
  ) {
    const lifeStage = source.seriesLifeStage;
    const items = await this.toCopiedDesignRecipeItemsFromRecipe(tx, source);

    return tx.designRecipe.create({
      data: {
        name,
        version,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: mapSeriesLifeStageToScenario(lifeStage),
        nutritionStandard: source.nutritionStandard || 'FEDIAF_2025',
        targetHealthTags: this.normalizeRecipeStringArray(
          source.targetHealthTags,
        ),
        applicableLifeStages: [lifeStage],
        notes: source.description ?? null,
        createdBy,
        totalWeightG: items.reduce((total, item) => total + item.weightG, 0),
        energyDensityKcalPerKg: null,
        calculatedNutrition: {},
        complianceStatus: {},
        assessmentSummary: {},
        missingDataReport: [],
        isCompliant: false,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        revisionOfDesignRecipeId: null,
        revisionBaseRecipeId: null,
        seriesId,
        seriesLifeStage: lifeStage,
        ...(customerDogId ? { customerDogId } : {}),
        items: {
          create: items,
        },
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  private async toCopiedDesignRecipeItemsFromRecipe(
    tx: Pick<PrismaService, 'nutritionFoodMapping'>,
    source: RecipeSeriesCopyableRecipe,
  ): Promise<Prisma.DesignRecipeItemUncheckedCreateWithoutDesignRecipeInput[]> {
    const items = source.items ?? [];
    const mappingByIngredientId =
      await this.loadPrimaryNutritionFoodMappingByIngredientId(tx, items);

    return items.map((item, index) => {
      const nutritionFoodId =
        item.nutritionFoodId ||
        mappingByIngredientId.get(item.ingredientId) ||
        '';
      if (!nutritionFoodId) {
        throw new BadRequestException(
          `正式食谱明细 ${item.id ?? index + 1} 缺少营养档案，无法复制为设计草稿`,
        );
      }

      const supplementTargets =
        this.normalizeCopiedDesignSupplementTargets(item);
      return {
        ingredientId: item.ingredientId,
        nutritionFoodId,
        weightG: this.resolveRecipeItemDesignWeight(item),
        includeInAssessment: true,
        ratioPercent: item.ratioPercent ?? null,
        preparationMethod: this.sanitizeCopiedPreparationMethod(
          item.preparationMethod,
        ),
        preparationNote: this.normalizeStoredPreparationNote(
          item.preparationNote,
        ),
        preparationSource: this.normalizeStoredPreparationSource(
          item.preparationSource,
        ),
        nutrientTargetKey: item.nutrientTargetKey ?? null,
        nutrientTargetValue: item.nutrientTargetValue ?? null,
        ...(supplementTargets.length > 0
          ? { supplementTargets: this.toJsonValue(supplementTargets) }
          : {}),
        sortOrder: item.sortOrder ?? index,
      };
    });
  }

  /**
   * 旧版正式食谱的烹饪方式字段可能是逗号分隔的准备方式ID列表
   * （长度远超设计草稿表列的 100 字符限制），复制时截取为首个
   * 有效片段并限制长度，避免"值超出列长度"错误。
   */
  private sanitizeCopiedPreparationMethod(
    value?: string | null,
  ): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const firstSegment = trimmed
      .split(',')
      .map((s) => s.trim())
      .find(Boolean);
    const candidate = firstSegment || trimmed;
    return candidate.length > 100 ? candidate.slice(0, 100) : candidate;
  }

  private resolveRecipeItemDesignWeight(
    item: RecipeSeriesCopyableRecipeItem,
  ): number {
    const exampleWeight = Number(item.exampleWeight);
    if (Number.isFinite(exampleWeight) && exampleWeight > 0) {
      return exampleWeight;
    }

    const ratioPercent = Number(item.ratioPercent);
    if (Number.isFinite(ratioPercent) && ratioPercent > 0) {
      return ratioPercent;
    }

    return 0;
  }

  private async loadPrimaryNutritionFoodMappingByIngredientId(
    tx: Pick<PrismaService, 'nutritionFoodMapping'>,
    items: RecipeSeriesCopyableRecipeItem[],
  ) {
    const ingredientIds = [
      ...new Set(
        items
          .filter((item) => !item.nutritionFoodId)
          .map((item) => item.ingredientId)
          .filter(Boolean),
      ),
    ];
    if (ingredientIds.length === 0) {
      return new Map<string, string>();
    }

    const mappings = await tx.nutritionFoodMapping.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        isPrimary: true,
        nutritionFood: { status: NutritionFoodStatus.VERIFIED },
      },
      select: {
        ingredientId: true,
        nutritionFoodId: true,
      },
    });

    return new Map(
      mappings.map((mapping) => [
        mapping.ingredientId,
        mapping.nutritionFoodId,
      ]),
    );
  }

  private toCopiedDesignRecipeItemData(item: DesignRecipeItemWithFood) {
    const supplementTargets = this.normalizeCopiedDesignSupplementTargets(item);
    return {
      ingredientId: item.ingredientId,
      nutritionFoodId: item.nutritionFoodId,
      weightG: item.weightG,
      includeInAssessment: item.includeInAssessment,
      ratioPercent: item.ratioPercent,
      preparationMethod: item.preparationMethod,
      preparationNote: this.normalizeStoredPreparationNote(
        item.preparationNote,
      ),
      preparationSource: this.normalizeStoredPreparationSource(
        item.preparationSource,
      ),
      nutrientTargetKey: item.nutrientTargetKey,
      nutrientTargetValue: item.nutrientTargetValue,
      ...(supplementTargets.length > 0
        ? { supplementTargets: this.toJsonValue(supplementTargets) }
        : {}),
      sortOrder: item.sortOrder,
    };
  }

  private normalizeRecipeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  private async loadSeriesStageSourceTemplate(
    tx: Pick<PrismaService, 'designRecipe'>,
    seriesId: string,
    sourceDraftId: string,
  ): Promise<DesignRecipeWithItems> {
    const source = (await tx.designRecipe.findUnique({
      where: { id: sourceDraftId },
      include: DESIGN_RECIPE_INCLUDE,
    })) as unknown as DesignRecipeWithItems | null;

    if (!source) {
      throw new BadRequestException('模板阶段不存在');
    }
    if (source.seriesId !== seriesId) {
      throw new BadRequestException('只能复制同一食谱系列内的阶段');
    }
    // 优先使用该阶段已正式发布的配方作为模板；
    // 若尚未发布（如正在编辑的草稿），直接以源草稿内容作为模板
    const template = this.isPublishedDraft(source)
      ? source
      : ((await this.findPublishedSeriesStageTemplate(tx, source)) ?? source);
    if (!template.items.length) {
      throw new BadRequestException('模板阶段暂无原料，无法复制');
    }

    return template;
  }

  /**
   * 查找某系列某生命阶段最近一次正式发布的食谱。
   * 历史导入的正式食谱可能没有对应的设计草稿，此时用配方本身作为草稿初始内容。
   */
  private async findLatestPublishedRecipeForStage(
    tx: Pick<PrismaService, 'recipe'>,
    seriesId: string,
    lifeStage: string,
  ): Promise<RecipeSeriesCopyableRecipe | null> {
    const recipe = await tx.recipe.findFirst({
      where: {
        seriesId,
        seriesLifeStage: lifeStage,
        status: RecipeStatus.PUBLIC,
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!recipe) return null;
    return recipe as unknown as RecipeSeriesCopyableRecipe;
  }

  /**
   * 把正式食谱原料安全复制为设计草稿明细；
   * 个别明细缺少营养档案时，只跳过那一条，其余正常带入。
   */
  private async copyRecipeItemsToDesignSafely(
    tx: Pick<PrismaService, 'nutritionFoodMapping'>,
    recipe: RecipeSeriesCopyableRecipe,
  ): Promise<Prisma.DesignRecipeItemUncheckedCreateWithoutDesignRecipeInput[]> {
    const items = recipe.items ?? [];
    const mappingByIngredientId =
      await this.loadPrimaryNutritionFoodMappingByIngredientId(tx, items);

    const copied: Prisma.DesignRecipeItemUncheckedCreateWithoutDesignRecipeInput[] =
      [];
    for (const [index, item] of items.entries()) {
      const nutritionFoodId =
        item.nutritionFoodId ||
        mappingByIngredientId.get(item.ingredientId) ||
        '';
      if (!nutritionFoodId) {
        continue;
      }
      copied.push({
        ingredientId: item.ingredientId,
        nutritionFoodId,
        weightG: this.resolveRecipeItemDesignWeight(item),
        includeInAssessment: true,
        ratioPercent: item.ratioPercent ?? null,
        preparationMethod: this.sanitizeCopiedPreparationMethod(
          item.preparationMethod,
        ),
        preparationNote: this.normalizeStoredPreparationNote(
          item.preparationNote,
        ),
        preparationSource: this.normalizeStoredPreparationSource(
          item.preparationSource,
        ),
        nutrientTargetKey: item.nutrientTargetKey ?? null,
        nutrientTargetValue: item.nutrientTargetValue ?? null,
        sortOrder: item.sortOrder ?? index,
      });
    }
    return copied;
  }

  private async findPublishedSeriesStageTemplate(
    tx: Pick<PrismaService, 'designRecipe'>,
    source: DesignRecipeWithItems,
  ): Promise<DesignRecipeWithItems | null> {
    if (!source.seriesId || !source.seriesLifeStage) {
      return null;
    }

    return (await tx.designRecipe.findFirst({
      where: {
        seriesId: source.seriesId,
        seriesLifeStage: source.seriesLifeStage,
        OR: [
          { status: DesignRecipeStatus.PUBLISHED },
          { publishedRecipeId: { not: null } },
          { publishedAt: { not: null } },
        ],
      },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    })) as unknown as DesignRecipeWithItems | null;
  }

  async renameSeries(
    seriesId: string,
    dto: RenameRecipeSeriesDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请填写系列名称');
    }

    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
    });
    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt ||
      !(await this.isSeriesAccessibleByContext(series, context))
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }

    // 合并命名模型：系列名是唯一名字，旗下所有草稿名同步跟随
    //
    // ⚠️ 正式食谱（recipe 表）也必须一起改。
    // 旧实现只改了 series + design_recipe，漏掉 recipe，导致：
    //   · 设计器改完名字，小程序工作台（读 recipe.name）还是旧名
    //   · 而 Web 编辑页又禁止改系列食谱的名字，形成死循环
    // 业务定义：「只有一个名字 —— 系列名」，各阶段食谱名必须与系列名一致。
    // 见 docs/plans/2026-09-30-recipe-domain-business-definition.md
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.recipeSeries.update({
        where: { id: seriesId },
        data: { name },
      });

      const designs = await tx.designRecipe.findMany({
        where: { seriesId, name: { not: name } },
        select: { id: true },
      });

      for (const design of designs) {
        const version = await this.allocateNextDesignRecipeVersion(tx, name);
        await tx.designRecipe.update({
          where: { id: design.id },
          data: { name, version },
        });
      }

      // 正式食谱：该系列下**所有版本行**一起改名，保持与系列名一致
      await tx.recipe.updateMany({
        where: { seriesId, name: { not: name } },
        data: { name },
      });

      return updated;
    });
  }

  async deleteSeries(
    seriesId: string,
    dto: DeleteRecipeSeriesDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      include: {
        designs: true,
      },
    });

    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt ||
      !(await this.isSeriesAccessibleByContext(series, context))
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }
    if (dto.confirmName !== series.name) {
      throw new BadRequestException('系列名称确认不一致');
    }
    if (!dto.confirmUserVisibleRemoval) {
      throw new BadRequestException('请确认下架用户可见食谱');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.designRecipe.deleteMany({
        where: {
          seriesId,
          status: { not: DesignRecipeStatus.PUBLISHED },
          publishedRecipeId: null,
        },
      });
      await tx.recipe.updateMany({
        where: {
          seriesId,
          status: RecipeStatus.PUBLIC,
        },
        data: {
          status: RecipeStatus.DRAFT,
        },
      });

      return tx.recipeSeries.update({
        where: { id: seriesId },
        data: {
          status: RecipeSeriesStatus.DELETED,
          deletedAt: new Date(),
          deletedBy: context.userId,
        },
      });
    });
  }

  private buildSeriesWorkbenchCard(
    series: RecipeSeriesWorkbenchRecord,
    _userId: string,
    initialDraftIdOverride?: string,
    referenceDogName?: string | null,
    referenceDogNames?: string[],
  ) {
    const businessStatus =
      series.businessStatus ?? RecipeSeriesBusinessStatus.DRAFT;
    const stages = ORDERED_RECIPE_SERIES_LIFE_STAGES.map((lifeStage) => {
      const designs = series.designs.filter(
        (design) => design.seriesLifeStage === lifeStage,
      );
      const recipes = series.recipes.filter(
        (recipe) => recipe.seriesLifeStage === lifeStage,
      );
      const effectiveDesigns = this.getSeriesStageEffectiveDesigns(designs);
      const publishedDesigns = designs.filter((design) =>
        this.isPublishedDraft(design),
      );
      const status = this.resolveSeriesStageStatus(effectiveDesigns, recipes);
      const statusDesigns = effectiveDesigns.length
        ? effectiveDesigns
        : publishedDesigns;
      const latestDesign = this.pickLatestByUpdatedAt(statusDesigns);
      const latestPublicRecipe = this.pickLatestByUpdatedAt(
        recipes.filter((recipe) => recipe.status === RecipeStatus.PUBLIC),
      );
      const latestRecord = this.pickLatestByUpdatedAt([
        ...statusDesigns,
        ...recipes,
      ]);
      const recipeStatusCategory =
        this.resolveSeriesStageRecipeStatusCategory(status);

      return {
        lifeStage,
        label: SERIES_LIFE_STAGE_LABELS[lifeStage],
        scenario: mapSeriesLifeStageToScenario(lifeStage),
        status,
        recipeStatusCategory,
        draftId: latestDesign?.id ?? null,
        recipeId: latestPublicRecipe?.recipeId ?? null,
        updatedAt: latestRecord?.updatedAt ?? null,
      };
    });
    const publishedStageCount = stages.filter((stage) =>
      Boolean(stage.recipeId),
    ).length;
    const initialDraftId =
      initialDraftIdOverride ||
      (stages.find((stage) => stage.draftId)?.draftId ?? '');

    return {
      id: series.id,
      initialDraftId,
      name: series.name,
      businessStatus,
      businessStatusLabel:
        RECIPE_SERIES_BUSINESS_STATUS_LABELS[businessStatus] ?? businessStatus,
      referenceDogId: series.referenceDogId ?? null,
      referenceDogName: referenceDogName ?? null,
      referenceDogNames:
        referenceDogNames ?? (referenceDogName ? [referenceDogName] : []),
      updatedAt: series.updatedAt,
      publishedStageCount,
      stages,
    };
  }

  private buildCustomerSeriesCard(
    record: RecipeSeriesWorkbenchRecord,
    dogNameById: Map<string, string> = new Map(),
    /**
     * 这条系列是不是**客户自己**用设计器做的（W3）。
     *
     * 业务规则：客户自助食谱可以出 DIY 制作单，但**永久不能买成品**——
     * 想要成品必须走定制流程。员工替客户做的定制食谱不受此限。
     */
    isCustomerSelfDesigned = false,
  ) {
    const primaryDraft = record.designs[0] as
      | (RecipeSeriesWorkbenchRecord['designs'][number] &
          Partial<DesignRecipeWithItems>)
      | undefined;
    const privateRecipe = record.recipes.find(
      (recipe) => recipe.status === RecipeStatus.PRIVATE_CUSTOM,
    );
    const customerDogId =
      record.customerDogId ?? primaryDraft?.customerDogId ?? null;
    const scenario = (primaryDraft?.fediafDogScenario ??
      'ADULT_MER_110') as FediafDogScenarioCode;
    const readiness = this.getCustomerDraftSnapshotReadiness(primaryDraft);

    return {
      id: record.id,
      initialDraftId: primaryDraft?.id ?? '',
      name: record.name,
      customerDogId,
      customerDogName: customerDogId
        ? (dogNameById.get(customerDogId) ?? '')
        : '',
      scenario,
      scenarioLabel: this.getScenarioDisplayLabel(scenario),
      primaryDraftId: primaryDraft?.id ?? '',
      privateRecipeId: privateRecipe?.recipeId ?? '',
      customerStatus: readiness.canCreateSnapshot
        ? 'READY'
        : primaryDraft
          ? 'DRAFT'
          : 'EMPTY',
      updatedAt: primaryDraft?.updatedAt ?? record.updatedAt,
      actionAvailability: {
        canContinueEditing: Boolean(primaryDraft?.id),
        // 客户自助食谱：只能出 DIY 单，**不能买成品**。
        // 两个开关必须分开——旧实现把它们填成了同一个值，
        // 导致前端"不给买成品"的界面结构形同虚设。
        canOrder: readiness.canCreateSnapshot && !isCustomerSelfDesigned,
        canGenerateDiy: readiness.canCreateSnapshot,
        disabledReason: readiness.canCreateSnapshot
          ? ''
          : readiness.disabledReason,
        nutritionWarning: readiness.nutritionWarning ?? undefined,
      },
    };
  }

  private getScenarioDisplayLabel(scenario: FediafDogScenarioCode): string {
    return FEDIAF_DOG_SCENARIO_LABELS[scenario] ?? scenario;
  }

  private isCustomerDraftReadyForSnapshot(
    draft?:
      | (Partial<DesignRecipeWithItems> & {
          items?: unknown[];
          totalWeightG?: number;
          energyDensityKcalPerKg?: number | null;
          isCompliant?: boolean;
          missingDataReport?: unknown;
          createdBy?: string | null;
          customerDogId?: string | null;
        })
      | null,
  ) {
    return this.getCustomerDraftSnapshotReadiness(draft).canCreateSnapshot;
  }

  private getCustomerDraftSnapshotReadiness(
    draft?:
      | (Partial<DesignRecipeWithItems> & {
          items?: unknown[];
          totalWeightG?: number;
          energyDensityKcalPerKg?: number | null;
          isCompliant?: boolean;
          complianceStatus?: unknown;
          assessmentSummary?: unknown;
          missingDataReport?: unknown;
          createdBy?: string | null;
          customerDogId?: string | null;
        })
      | null,
  ): {
    canCreateSnapshot: boolean;
    disabledReason: string;
    nutritionWarning: ReturnType<
      RecipeDesignerService['buildCustomerNutritionWarning']
    >;
  } {
    if (!draft) {
      return {
        canCreateSnapshot: false,
        disabledReason: '暂无可用草稿',
        nutritionWarning: null,
      };
    }
    if (!draft.createdBy) {
      return {
        canCreateSnapshot: false,
        disabledReason: '当前食谱还未达到可用条件',
        nutritionWarning: null,
      };
    }
    if (!draft.customerDogId) {
      return {
        canCreateSnapshot: false,
        disabledReason: '请先绑定狗狗档案',
        nutritionWarning: null,
      };
    }
    const hasIncludedItems =
      Array.isArray(draft.items) &&
      draft.items.some((item) => {
        const maybeItem = item as { includeInAssessment?: boolean };
        return maybeItem.includeInAssessment !== false;
      });
    if (!hasIncludedItems || Number(draft.totalWeightG) <= 0) {
      return {
        canCreateSnapshot: false,
        disabledReason: '请先添加食材并确认用量',
        nutritionWarning: null,
      };
    }
    if (Number(draft.energyDensityKcalPerKg) <= 0) {
      return {
        canCreateSnapshot: false,
        disabledReason: '缺少能量数据，暂时无法进入下一步',
        nutritionWarning: null,
      };
    }

    return {
      canCreateSnapshot: true,
      disabledReason: '',
      nutritionWarning: this.buildCustomerNutritionWarning(draft),
    };
  }

  private buildCustomerNutritionWarning(
    draft:
      | (Partial<DesignRecipeWithItems> & {
          isCompliant?: boolean;
          complianceStatus?: unknown;
          assessmentSummary?: unknown;
          missingDataReport?: unknown;
        })
      | null,
  ): {
    hasWarning: true;
    overallStatus: string;
    counts: {
      deficient: number;
      excess: number;
      missingData: number;
    };
    message: string;
  } | null {
    if (!draft) return null;
    const missing = Array.isArray(draft.missingDataReport)
      ? draft.missingDataReport
      : [];
    const assessmentSummary = this.asRecord(draft.assessmentSummary);
    const summary = this.asRecord(assessmentSummary?.summary);
    const rawSummary = this.asRecord(assessmentSummary?.rawSummary);
    const overallStatus = String(
      assessmentSummary?.overallStatus ||
        (draft.isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'),
    ).toUpperCase();
    const deficient = this.readFirstNonNegativeNumber(
      summary?.deficient,
      rawSummary?.deficient,
    );
    const excess = this.readFirstNonNegativeNumber(
      summary?.excess,
      rawSummary?.excess,
    );
    const missingData = Math.max(
      missing.length,
      this.readFirstNonNegativeNumber(
        summary?.missingData,
        rawSummary?.missingData,
      ),
    );

    if (
      draft.isCompliant &&
      overallStatus === 'COMPLIANT' &&
      deficient === 0 &&
      excess === 0 &&
      missingData === 0
    ) {
      return null;
    }

    const parts: string[] = [];
    if (missingData > 0) parts.push(`${missingData}项缺少营养数据`);
    if (deficient > 0) parts.push(`${deficient}项营养不足`);
    if (excess > 0) parts.push(`${excess}项营养超标`);
    if (parts.length === 0) {
      parts.push('部分营养项未达标或需复核');
    }

    return {
      hasWarning: true,
      overallStatus,
      counts: { deficient, excess, missingData },
      message: `当前食谱有营养提醒：${parts.join('、')}。可以继续生成制作单或订购，建议后续再优化配方。`,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readFirstNonNegativeNumber(...values: unknown[]): number {
    for (const value of values) {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue) && numericValue >= 0) {
        return Math.trunc(numericValue);
      }
    }
    return 0;
  }

  private filterSeriesWorkbenchCards<
    T extends {
      businessStatus?: RecipeDesignerSeriesStatusFilter | string | null;
    },
  >(cards: T[], status?: ListRecipeDesignerSeriesDto['status']): T[] {
    if (!status) {
      return cards;
    }

    return cards.filter((card) => card.businessStatus === status);
  }

  private resolveSeriesStageRecipeStatusCategory(
    status: RecipeSeriesStageStatus,
  ): RecipeSeriesStageRecipeStatusCategory {
    if (status === 'PRIVATE_CUSTOM') {
      return 'PRIVATE_CUSTOM';
    }
    if (status === 'PUBLISHED') {
      return 'PUBLIC';
    }
    if (status === 'NOT_DESIGNED') {
      return 'NOT_DESIGNED';
    }
    return 'DRAFT';
  }

  private resolveSeriesStageStatus(
    effectiveDesigns: RecipeSeriesWorkbenchRecord['designs'],
    recipes: RecipeSeriesWorkbenchRecord['recipes'],
  ): RecipeSeriesStageStatus {
    if (
      recipes.some((recipe) => recipe.status === RecipeStatus.PRIVATE_CUSTOM)
    ) {
      return 'PRIVATE_CUSTOM';
    }
    if (recipes.some((recipe) => recipe.status === RecipeStatus.DRAFT)) {
      return 'SUBMITTED';
    }
    if (effectiveDesigns.some((design) => this.hasDesignRecipeItems(design))) {
      return 'MODIFIED';
    }
    if (recipes.some((recipe) => recipe.status === RecipeStatus.PUBLIC)) {
      return 'PUBLISHED';
    }
    return 'NOT_DESIGNED';
  }

  private hasDesignRecipeItems(design: {
    items?: unknown[];
    _count?: { items: number };
  }): boolean {
    return design._count?.items !== undefined
      ? design._count.items > 0
      : Array.isArray(design.items) && design.items.length > 0;
  }

  private getSeriesStageEffectiveDesigns(
    designs: RecipeSeriesWorkbenchRecord['designs'],
  ) {
    return designs.filter((design) =>
      this.hasSeriesStagePublishableChange(design, designs),
    );
  }

  private hasSeriesStagePublishableChange(
    design: RecipeSeriesWorkbenchRecord['designs'][number],
    stageDesigns: RecipeSeriesWorkbenchRecord['designs'],
  ) {
    if (this.isPublishedDraft(design)) {
      return false;
    }
    if (!this.isActiveRevisionDraft(design as DesignRecipeWithItems)) {
      return true;
    }

    const baseline = this.findRevisionBaselineDraft(
      design as DesignRecipeWithItems,
      stageDesigns as DesignRecipeWithItems[],
    );
    if (!baseline) {
      return true;
    }

    return !this.hasSamePublishableRecipeInputs(
      design as DesignRecipeWithItems,
      baseline,
    );
  }

  private pickLatestByUpdatedAt<T extends { updatedAt?: Date | string | null }>(
    records: T[],
  ): T | null {
    return (
      [...records].sort(
        (left, right) => this.getUpdatedTime(right) - this.getUpdatedTime(left),
      )[0] ?? null
    );
  }

  private async allocateNextDesignRecipeVersion(
    tx: Pick<PrismaService, 'designRecipe'>,
    name: string,
  ) {
    const latestVersion = await tx.designRecipe.aggregate({
      where: { name },
      _max: { version: true },
    });

    return (latestVersion._max.version ?? 0) + 1;
  }

  private isRetryableSeriesDraftCreateError(error: unknown) {
    return (
      this.isDesignRecipeNameVersionCollision(error) ||
      this.isTransactionConflict(error)
    );
  }

  private isTransactionConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  /** 解析「最近吃过的食材」时间窗口（天），非法值回退默认 */
  private resolveRecentEatenWindowDays(raw?: string): number {
    if (!raw) return RECENT_EATEN_WINDOW_DAYS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return RECENT_EATEN_WINDOW_DAYS;
    }
    return Math.min(
      RECENT_EATEN_WINDOW_MAX_DAYS,
      Math.max(RECENT_EATEN_WINDOW_MIN_DAYS, parsed),
    );
  }

  private isDesignRecipeNameVersionCollision(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return target.includes('name') && target.includes('version');
    }
    return (
      typeof target === 'string' &&
      target.includes('name') &&
      target.includes('version')
    );
  }

  async getDraft(id: string, access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.loadDraft(id);

    if (!isInternalRecipeDesignerRole(context)) {
      if (draft.createdBy !== context.userId) {
        throw new NotFoundException(`Design recipe ${id} not found`);
      }
      return this.withPreparationMethodLabels(draft);
    }

    const internalUserIds = await this.listInternalRecipeDesignerCreatorIds();
    if (!draft.createdBy || !internalUserIds.includes(draft.createdBy)) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    return this.withPreparationMethodLabels(draft);
  }

  /**
   * 发布 / 加入待提交前的统一门槛预览。
   *
   * 权限与草稿详情完全一致（复用 `getDraft`），后台编辑器可以在保存后刷新
   * 同一份 blockers / warnings，而不必先尝试发布再解析报错。
   *
   * 报告生成失败**不会**让这个接口抛错：它会变成 blockers 里的一条，
   * 让后台能看到具体原因。
   */
  async getDraftLaunchReadiness(
    id: string,
    access: RecipeDesignerAccessInput,
  ): Promise<DraftLaunchReadiness> {
    const draft = await this.getDraft(id, access);
    const { readiness } = await this.evaluateDraftLaunchReadiness(draft);
    return readiness;
  }

  /**
   * 生成并持久化草稿的最新营养报告（2026-10-22 · 持久化营养报告）。
   *
   * 权限与草稿详情完全一致（复用 getDraft）。报告数据取发布口径的
   * `buildPublishedNutritionDetailedDataForDraft(...).report`，并记录生成时的
   * contentRevision；之后任何内容保存都会让 contentRevision +1，GET 据此标记过期。
   *
   * 生成失败统一转成 400：这是「当前草稿算不出报告」的业务问题，不是 500。
   * 写库失败不包在这里，仍按原始错误抛出。
   */
  async generateDraftNutritionReport(
    id: string,
    access: RecipeDesignerAccessInput,
  ): Promise<DraftNutritionReportSnapshot> {
    const draft = await this.getDraft(id, access);

    let report: unknown;
    try {
      const assessment = await this.assessLoadedDraft(draft);
      const detailedData =
        await this.buildPublishedNutritionDetailedDataForDraft(
          draft,
          assessment,
        );
      if (!detailedData.report) {
        throw new Error('报告内容为空');
      }
      report = detailedData.report;
    } catch (error) {
      throw new BadRequestException(
        `完整营养报告生成失败：${this.resolveLaunchReadinessErrorMessage(error)}`,
      );
    }

    const generatedAt = new Date();
    // 与 GET 读回的内容保持完全一致（JSON 序列化会去掉 undefined 字段）。
    const persistedReport = this.toJsonValue(report);
    await this.prisma.designRecipe.update({
      where: { id: draft.id },
      data: {
        nutritionReportJson: persistedReport,
        nutritionReportRevision: draft.contentRevision,
        nutritionReportGeneratedAt: generatedAt,
      },
    });

    return {
      draftId: draft.id,
      generatedAt: generatedAt.toISOString(),
      revision: draft.contentRevision,
      stale: false,
      report: persistedReport,
    };
  }

  /**
   * 读取最近一次持久化的营养报告。
   *
   * 没有报告时返回 200 + `report: null`（而不是 404）：草稿还没点「生成报告」
   * 是正常状态，前端不必把 404 当成错误分支处理。`stale` 只比较报告生成时的
   * revision 与当前 contentRevision，不自动重新生成。
   */
  async getDraftNutritionReport(
    id: string,
    access: RecipeDesignerAccessInput,
  ): Promise<DraftNutritionReportSnapshot> {
    const draft = await this.getDraft(id, access);
    const report = draft.nutritionReportJson;
    if (report === null || report === undefined) {
      return {
        draftId: draft.id,
        generatedAt: null,
        revision: null,
        stale: false,
        report: null,
      };
    }

    return {
      draftId: draft.id,
      generatedAt: draft.nutritionReportGeneratedAt?.toISOString() ?? null,
      revision: draft.nutritionReportRevision ?? null,
      stale: draft.nutritionReportRevision !== draft.contentRevision,
      report,
    };
  }

  /**
   * 读取草稿的结构化制作步骤（2026-10-22 · Task 4）。
   *
   * 单独开一个 GET 的原因是 Task 7 的设计器需要轻量刷新步骤区，
   * 不必整份草稿重新拉一遍；权限与草稿详情完全一致（复用 getDraft）。
   */
  async getDraftProductionSteps(
    id: string,
    access: RecipeDesignerAccessInput,
  ): Promise<{ draftId: string; productionSteps: ProductionStep[] }> {
    const draft = await this.getDraft(id, access);
    return {
      draftId: draft.id,
      productionSteps: this.readDraftProductionSteps(draft.productionStepsJson),
    };
  }

  /**
   * 覆盖保存草稿的结构化制作步骤（2026-10-22 · Task 4）。
   *
   * 整数组覆盖而不是逐条增删：排序在客户端完成，服务端只校验唯一/升序，
   * 避免并发编辑时产生重复 sortOrder。空数组表示清空步骤。
   */
  async updateDraftProductionSteps(
    id: string,
    dto: UpdateRecipeProductionStepsDto,
    access: RecipeDesignerAccessInput,
  ): Promise<{ draftId: string; productionSteps: ProductionStep[] }> {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.assertDraftEditableByUser(id, context);
    const productionSteps = this.validateDraftProductionSteps(dto?.steps);

    await this.prisma.designRecipe.update({
      where: { id: draft.id },
      data: {
        ...(productionSteps.length > 0
          ? { productionStepsJson: this.toJsonValue(productionSteps) }
          : { productionStepsJson: Prisma.DbNull }),
        contentRevision: { increment: 1 },
      },
    });

    return { draftId: draft.id, productionSteps };
  }

  private buildDesignRecipeWorkbenchCards(
    drafts: DesignRecipeWithItems[],
  ): DesignRecipeWorkbenchCard[] {
    const grouped = new Map<string, DesignRecipeWithItems[]>();

    for (const draft of drafts) {
      const key = this.resolveDesignRecipeSeriesKey(draft);
      grouped.set(key, [...(grouped.get(key) ?? []), draft]);
    }

    return [...grouped.values()]
      .map((group) => this.buildCurrentDesignRecipeWorkbenchCard(group))
      .filter((draft): draft is DesignRecipeWorkbenchCard => Boolean(draft))
      .sort(
        (left, right) => this.getUpdatedTime(right) - this.getUpdatedTime(left),
      );
  }

  private toWorkbenchCardSummary(
    draft: DesignRecipeWorkbenchCard,
  ): DesignRecipeWorkbenchCardSummary {
    const summary: Partial<DesignRecipeWorkbenchCard> = { ...draft };
    const versionHistory = summary.versionHistory;
    delete summary.items;
    delete summary.calculatedNutrition;
    delete summary.complianceStatus;
    delete summary.assessmentSummary;
    delete summary.missingDataReport;
    delete summary.versionHistory;

    return {
      ...(summary as Omit<DesignRecipeWorkbenchCardSummary, 'versionHistory'>),
      ...(versionHistory?.length
        ? {
            versionHistory: versionHistory.map((item) =>
              this.toWorkbenchCardSummary(item),
            ),
          }
        : {}),
    };
  }

  private resolveDesignRecipeSeriesKey(draft: DesignRecipeWithItems) {
    return draft.revisionBaseRecipeId || draft.publishedRecipeId || draft.id;
  }

  private pickCurrentDesignRecipeCard(group: DesignRecipeWithItems[]) {
    const sorted = [...group].sort((left, right) => {
      const leftPublishedVersion = left.publishedRecipeVersion ?? 0;
      const rightPublishedVersion = right.publishedRecipeVersion ?? 0;
      if (leftPublishedVersion !== rightPublishedVersion) {
        return rightPublishedVersion - leftPublishedVersion;
      }
      return this.getUpdatedTime(right) - this.getUpdatedTime(left);
    });

    return (
      sorted.find((draft) => this.isActiveRevisionDraft(draft)) ??
      sorted.find((draft) => !this.isPublishedDraft(draft)) ??
      sorted.find((draft) => this.isPublishedDraft(draft)) ??
      null
    );
  }

  private buildCurrentDesignRecipeWorkbenchCard(
    group: DesignRecipeWithItems[],
  ) {
    const current = this.pickCurrentDesignRecipeCard(group);
    if (!current) return null;

    const versionHistory = [...group]
      .sort((left, right) => {
        if (
          this.isActiveRevisionDraft(left) !== this.isActiveRevisionDraft(right)
        ) {
          return this.isActiveRevisionDraft(left) ? -1 : 1;
        }

        const leftPublishedVersion = left.publishedRecipeVersion ?? 0;
        const rightPublishedVersion = right.publishedRecipeVersion ?? 0;
        if (leftPublishedVersion !== rightPublishedVersion) {
          return rightPublishedVersion - leftPublishedVersion;
        }

        return this.getUpdatedTime(right) - this.getUpdatedTime(left);
      })
      .map((draft) => this.withRevisionChangeState(draft, group));

    const currentCard = this.withRevisionChangeState(current, group);

    return versionHistory.length > 1
      ? { ...currentCard, versionHistory }
      : currentCard;
  }

  private isActiveRevisionDraft(draft: DesignRecipeWithItems) {
    return Boolean(draft.revisionBaseRecipeId) && !this.isPublishedDraft(draft);
  }

  private withRevisionChangeState(
    draft: DesignRecipeWithItems,
    group: DesignRecipeWithItems[],
  ): DesignRecipeWorkbenchCard {
    return {
      ...draft,
      revisionChangeState: this.resolveRevisionChangeState(draft, group),
    };
  }

  private resolveRevisionChangeState(
    draft: DesignRecipeWithItems,
    group: DesignRecipeWithItems[],
  ): RevisionChangeState {
    if (!this.isActiveRevisionDraft(draft)) {
      return 'NOT_REVISION';
    }

    const baseline = this.findRevisionBaselineDraft(draft, group);
    if (!baseline) {
      return 'CHANGED';
    }

    return this.hasSamePublishableRecipeInputs(draft, baseline)
      ? 'UNCHANGED'
      : 'CHANGED';
  }

  private findRevisionBaselineDraft(
    draft: DesignRecipeWithItems,
    group: DesignRecipeWithItems[],
  ) {
    if (draft.revisionOfDesignRecipeId) {
      const exactBaseline = group.find(
        (candidate) => candidate.id === draft.revisionOfDesignRecipeId,
      );
      if (exactBaseline) {
        return exactBaseline;
      }
    }

    return (
      [...group]
        .filter((candidate) => candidate.id !== draft.id)
        .filter((candidate) => this.isPublishedDraft(candidate))
        .sort((left, right) => {
          const leftVersion = left.publishedRecipeVersion ?? 0;
          const rightVersion = right.publishedRecipeVersion ?? 0;
          if (leftVersion !== rightVersion) {
            return rightVersion - leftVersion;
          }
          return this.getUpdatedTime(right) - this.getUpdatedTime(left);
        })[0] ?? null
    );
  }

  private getUpdatedTime(draft: { updatedAt?: Date | string | null }) {
    const rawValue = draft.updatedAt;
    if (!rawValue) return 0;
    const value =
      rawValue instanceof Date
        ? rawValue.getTime()
        : new Date(rawValue).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  async createDraft(
    dto: CreateRecipeDesignDraftDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    return this.prisma.$transaction(async (tx) => {
      const latestVersion = await tx.designRecipe.aggregate({
        where: { name: dto.name },
        _max: { version: true },
      });

      return tx.designRecipe.create({
        data: {
          name: dto.name,
          version: (latestVersion._max.version ?? 0) + 1,
          fediafDogScenario: dto.scenario,
          nutritionStandard: 'FEDIAF_2025',
          targetHealthTags: dto.targetHealthTags ?? [],
          applicableLifeStages: dto.applicableLifeStages ?? [],
          notes: dto.notes ?? null,
          createdBy: context.userId,
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });
  }

  async updateDraft(
    id: string,
    dto: UpdateRecipeDesignDraftDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const currentDraft = await this.assertDraftEditableByUser(id, context);
    const selectedSeriesLifeStage =
      dto.scenario !== undefined && currentDraft?.seriesId
        ? mapScenarioToSeriesLifeStage(dto.scenario)
        : null;

    return this.prisma.designRecipe.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.scenario !== undefined
          ? {
              fediafDogScenario: dto.scenario,
              contentRevision: { increment: 1 },
            }
          : {}),
        ...(dto.targetHealthTags !== undefined
          ? { targetHealthTags: dto.targetHealthTags }
          : {}),
        ...(dto.applicableLifeStages !== undefined
          ? { applicableLifeStages: dto.applicableLifeStages }
          : {}),
        ...(selectedSeriesLifeStage
          ? {
              seriesLifeStage: selectedSeriesLifeStage,
              applicableLifeStages: [selectedSeriesLifeStage],
            }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async deleteDraft(id: string, access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      select: {
        id: true,
        createdBy: true,
        status: true,
        publishedRecipeId: true,
        publishedAt: true,
      },
    });

    if (!draft || draft.createdBy !== context.userId) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    if (
      draft.status === DesignRecipeStatus.PUBLISHED ||
      draft.publishedRecipeId ||
      draft.publishedAt
    ) {
      throw new BadRequestException('已发布草稿不能删除');
    }

    return this.prisma.designRecipe.delete({
      where: { id },
    });
  }

  async createRevisionDraft(id: string, access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('只有员工可以修订正式食谱');
    }

    const source = await this.loadDraft(id);

    if (!(await this.isInternalRecipeDesignerCreatorId(source.createdBy))) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    if (source.createdBy !== context.userId && !this.isPublishedDraft(source)) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    if (!this.isPublishedDraft(source) || !source.publishedRecipeId) {
      throw new BadRequestException('只有已发布食谱可以创建修订草稿');
    }

    const existingRevision = await this.prisma.designRecipe.findFirst({
      where: {
        createdBy: context.userId,
        revisionBaseRecipeId: source.publishedRecipeId,
        status: { not: DesignRecipeStatus.PUBLISHED },
        publishedRecipeId: null,
        publishedAt: null,
      },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    if (existingRevision) {
      return existingRevision;
    }

    // 合并命名模型：修订草稿沿用系列名（无系列时才带“修订”后缀区分）
    const seriesName = source.series?.name?.trim() || '';
    const revisionName = seriesName || this.buildRevisionDraftName(source.name);
    const latestVersion = await this.prisma.designRecipe.aggregate({
      where: { name: revisionName },
      _max: { version: true },
    });
    const revisionProductionSteps = this.readDraftProductionSteps(
      source.productionStepsJson,
    );

    return this.prisma.designRecipe.create({
      data: {
        name: revisionName,
        version: (latestVersion._max.version ?? 0) + 1,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: source.fediafDogScenario,
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: source.targetHealthTags,
        applicableLifeStages: source.applicableLifeStages,
        notes: source.notes,
        ...(revisionProductionSteps.length > 0
          ? { productionStepsJson: this.toJsonValue(revisionProductionSteps) }
          : {}),
        createdBy: context.userId,
        totalWeightG: source.totalWeightG ?? 0,
        energyDensityKcalPerKg: null,
        calculatedNutrition: {},
        complianceStatus: {},
        assessmentSummary: {},
        missingDataReport: [],
        isCompliant: false,
        reviewStatus: DesignRecipeReviewStatus.NONE,
        reviewNote: null,
        reviewedBy: null,
        reviewedAt: null,
        publishedAt: null,
        publishedRecipeId: null,
        publishedRecipeVersion: null,
        revisionOfDesignRecipeId: source.id,
        revisionBaseRecipeId: source.publishedRecipeId,
        seriesId: source.seriesId,
        seriesLifeStage: source.seriesLifeStage,
        items: {
          create: source.items.map((item) => {
            const supplementTargets =
              this.normalizeCopiedDesignSupplementTargets(item);
            return {
              ingredientId: item.ingredientId,
              nutritionFoodId: item.nutritionFoodId,
              weightG: item.weightG,
              includeInAssessment: item.includeInAssessment,
              ratioPercent: item.ratioPercent,
              preparationMethod: item.preparationMethod,
              preparationNote: this.normalizeStoredPreparationNote(
                item.preparationNote,
              ),
              preparationSource: this.normalizeStoredPreparationSource(
                item.preparationSource,
              ),
              nutrientTargetKey: item.nutrientTargetKey,
              nutrientTargetValue: item.nutrientTargetValue,
              ...(supplementTargets.length > 0
                ? { supplementTargets: this.toJsonValue(supplementTargets) }
                : {}),
              sortOrder: item.sortOrder,
            };
          }),
        },
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async revertDraftToLatestOfficial(
    id: string,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.loadDraft(id);

    if (!draft.seriesId || !draft.seriesLifeStage) {
      throw new BadRequestException('只有系列生命阶段草稿可以撤回修改');
    }
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: draft.seriesId },
      select: {
        id: true,
        status: true,
        deletedAt: true,
        createdBy: true,
      },
    });
    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt ||
      !(await this.isSeriesAccessibleByContext(series, context))
    ) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    if (this.isPublishedDraft(draft)) {
      throw new BadRequestException('正式版本无需撤回修改');
    }
    if (draft.status === DesignRecipeStatus.ARCHIVED) {
      throw new BadRequestException('归档草稿不能撤回修改');
    }

    const baseline = (await this.prisma.designRecipe.findFirst({
      where: {
        id: { not: draft.id },
        seriesId: draft.seriesId,
        seriesLifeStage: draft.seriesLifeStage,
        OR: [
          { status: DesignRecipeStatus.PUBLISHED },
          { publishedRecipeId: { not: null } },
          { publishedAt: { not: null } },
        ],
      },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: [
        { publishedRecipeVersion: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
    })) as DesignRecipeWithItems | null;

    if (!baseline) {
      throw new BadRequestException('没有可撤回到的正式版本');
    }
    const baselineProductionSteps = this.readDraftProductionSteps(
      baseline.productionStepsJson,
    );

    const reverted = await this.prisma.$transaction(async (tx) => {
      await tx.designRecipeItem.deleteMany({
        where: { designRecipeId: draft.id },
      });

      return tx.designRecipe.update({
        where: { id: draft.id },
        data: {
          contentRevision: { increment: 1 },
          status: DesignRecipeStatus.DRAFT,
          name: baseline.name,
          fediafDogScenario: baseline.fediafDogScenario,
          nutritionStandard: baseline.nutritionStandard ?? 'FEDIAF_2025',
          targetHealthTags: baseline.targetHealthTags,
          applicableLifeStages: baseline.applicableLifeStages,
          notes: baseline.notes,
          productionStepsJson:
            baselineProductionSteps.length > 0
              ? this.toJsonValue(baselineProductionSteps)
              : Prisma.DbNull,
          totalWeightG: baseline.totalWeightG,
          energyDensityKcalPerKg: baseline.energyDensityKcalPerKg,
          calculatedNutrition: this.toJsonValue(baseline.calculatedNutrition),
          complianceStatus: this.toJsonValue(baseline.complianceStatus),
          assessmentSummary: this.toJsonValue(baseline.assessmentSummary),
          missingDataReport: this.toJsonValue(baseline.missingDataReport),
          complianceScore: baseline.complianceScore ?? 0,
          isCompliant: baseline.isCompliant,
          reviewStatus: DesignRecipeReviewStatus.NONE,
          reviewNote: null,
          reviewedBy: null,
          reviewedAt: null,
          publishedAt: null,
          publishedRecipeId: null,
          publishedRecipeVersion: null,
          revisionOfDesignRecipeId: baseline.id,
          revisionBaseRecipeId: baseline.publishedRecipeId,
          items: {
            create: baseline.items.map((item) =>
              this.toCopiedDesignRecipeItemData(item),
            ),
          },
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });

    return this.withPreparationMethodLabels(reverted);
  }

  async addItem(
    designRecipeId: string,
    dto: AddRecipeDesignItemDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.assertDraftEditableByUser(designRecipeId, context);
    const ingredientId = await this.resolveDesignItemIngredientId(dto);
    const resolvedPreparationMethod =
      await this.resolveDesignItemPreparationMethod(
        dto.preparationMethod,
        ingredientId,
        dto.nutritionFoodId,
      );
    const preparationData = this.buildPreparationCreateData({
      explicitMethod: dto.preparationMethod,
      explicitNote: dto.preparationNote,
      explicitSource: this.parsePreparationSourceInput(dto.preparationSource),
      resolvedMethod: resolvedPreparationMethod,
    });
    const shouldPersistNutrientTarget =
      await this.isIngredientIdSupplement(ingredientId);
    /**
     * 补剂必须显式给出目标营养素（或由营养档案默认目标带出）。
     * 没有任何目标时直接 400，绝不按「移除后缺口」反向推断 ——
     * 纤维素粉这类功能性补剂永远不会造成缺口。
     */
    const supplementTargets = shouldPersistNutrientTarget
      ? await this.resolveDesignSupplementTargetsForWrite({
          nutritionFoodId: dto.nutritionFoodId,
          explicitTargets: dto.supplementTargets,
          legacyTargetKey: dto.nutrientTargetKey,
          legacyTargetValue: dto.nutrientTargetValue,
          weightG: dto.weightG,
          includeInAssessment: dto.includeInAssessment ?? true,
          baseTotalWeightG: draft?.totalWeightG,
        })
      : [];

    // 未显式指定排序时，自动排到当前草稿明细末尾，避免新增项 sort_order 全部为 0 导致顺序冲突
    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const agg = await this.prisma.designRecipeItem.aggregate({
        where: { designRecipeId },
        _max: { sortOrder: true },
      });
      sortOrder = (agg._max.sortOrder ?? -1) + 1;
    }

    const data: Prisma.DesignRecipeItemUncheckedCreateInput = {
      designRecipeId,
      ingredientId,
      nutritionFoodId: dto.nutritionFoodId,
      weightG: dto.weightG,
      ...preparationData,
      ...(shouldPersistNutrientTarget
        ? {
            nutrientTargetKey: supplementTargets[0]?.nutrientTargetKey ?? null,
            nutrientTargetValue: supplementTargets[0]?.targetValue ?? null,
            supplementTargets: this.toJsonValue(supplementTargets),
          }
        : {}),
      sortOrder,
      includeInAssessment: dto.includeInAssessment ?? true,
    } as Prisma.DesignRecipeItemUncheckedCreateInput & {
      supplementTargets?: Prisma.InputJsonValue;
    };

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.designRecipeItem.create({
        data,
        select: DESIGN_RECIPE_ITEM_CLIENT_SELECT,
      });
      await tx.designRecipe.update({
        where: { id: designRecipeId },
        data: { contentRevision: { increment: 1 } },
      });
      return created;
    });
  }

  async updateItem(
    itemId: string,
    dto: UpdateRecipeDesignItemDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.assertItemEditableByUser(itemId, context);
    const changesSupplementTargets =
      dto.supplementTargets !== undefined ||
      dto.nutrientTargetKey !== undefined;
    let supplementTargets: DesignSupplementTarget[] | undefined;
    let supplementTargetData: {
      nutrientTargetKey?: string | null;
      nutrientTargetValue?: number | null;
      supplementTargets?: Prisma.InputJsonValue;
    } = {};

    if (changesSupplementTargets) {
      const item = await this.prisma.designRecipeItem.findUnique({
        where: { id: itemId },
        select: {
          id: true,
          ingredientId: true,
          nutritionFoodId: true,
          weightG: true,
          includeInAssessment: true,
          ingredient: { select: { type: true } },
          nutritionFood: {
            select: {
              id: true,
              name: true,
              nutritionData: true,
              mappings: {
                select: {
                  ingredientId: true,
                  isPrimary: true,
                  ingredient: { select: { type: true } },
                },
              },
            },
          },
        },
      });
      if (!item) {
        throw new NotFoundException(`Design recipe item ${itemId} not found`);
      }

      const isSupplementItem =
        item.ingredient?.type === IngredientType.SUPPLEMENT ||
        (item.ingredient?.type !== IngredientType.FOOD &&
          this.resolveIngredientType(
            item as unknown as DesignRecipeItemWithFood,
          ) === IngredientType.SUPPLEMENT);

      if (isSupplementItem) {
        /**
         * 补剂目标允许改，但不允许「改成空」或塞进未知字段：
         * 空数组 / null / 未知 fieldPath / 档案里为 0 的字段一律 400，
         * 不能静默丢弃后让补剂变成无目标状态。
         */
        const explicitTargets =
          dto.supplementTargets !== undefined
            ? dto.supplementTargets
            : this.buildLegacySupplementTargetPayload(
                dto.nutrientTargetKey,
                dto.nutrientTargetValue,
              );
        if (
          explicitTargets === null ||
          (Array.isArray(explicitTargets) && explicitTargets.length === 0)
        ) {
          throw new BadRequestException(
            '补剂必须至少保留一个目标营养素，不能清空目标',
          );
        }

        supplementTargets = await this.resolveDesignSupplementTargetsForWrite({
          nutritionFoodId: item.nutritionFoodId ?? '',
          explicitTargets,
          weightG: dto.weightG ?? item.weightG,
          includeInAssessment:
            dto.includeInAssessment ?? item.includeInAssessment,
          baseTotalWeightG: draft?.totalWeightG,
        });
        supplementTargetData = {
          nutrientTargetKey: supplementTargets[0]?.nutrientTargetKey ?? null,
          nutrientTargetValue: supplementTargets[0]?.targetValue ?? null,
          supplementTargets: this.toJsonValue(supplementTargets),
        };
      }
    }

    const changesPreparation =
      dto.preparationMethod !== undefined ||
      dto.preparationNote !== undefined ||
      dto.preparationSource !== undefined;
    const preparationData = changesPreparation
      ? this.buildPreparationUpdateData({
          explicitMethod: dto.preparationMethod,
          explicitNote: dto.preparationNote,
          explicitSource: this.parsePreparationSourceInput(
            dto.preparationSource,
          ),
          currentMethod: draft.preparationMethod,
          currentNote: draft.preparationNote,
          currentSource: draft.preparationSource,
        })
      : {};

    const data = {
      ...(dto.weightG !== undefined ? { weightG: dto.weightG } : {}),
      ...preparationData,
      ...(dto.nutrientTargetKey !== undefined
        ? { nutrientTargetKey: dto.nutrientTargetKey }
        : {}),
      ...(dto.nutrientTargetValue !== undefined
        ? { nutrientTargetValue: dto.nutrientTargetValue }
        : {}),
      // 补剂目标定义与计算值一起写回（覆盖上面的 legacy 单目标字段）
      ...supplementTargetData,
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.includeInAssessment !== undefined
        ? { includeInAssessment: dto.includeInAssessment }
        : {}),
    } as Prisma.DesignRecipeItemUncheckedUpdateInput & {
      supplementTargets?: Prisma.InputJsonValue | null;
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.designRecipeItem.update({
        where: { id: itemId },
        data,
        select: DESIGN_RECIPE_ITEM_CLIENT_SELECT,
      });
      await tx.designRecipe.update({
        where: { id: draft.id },
        data: { contentRevision: { increment: 1 } },
      });
      return updated;
    });
  }

  async reorderItems(
    designRecipeId: string,
    dto: ReorderRecipeDesignItemsDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    await this.assertDraftEditableByUser(designRecipeId, context);
    const items = dto.items ?? [];
    if (items.length === 0) throw new BadRequestException('排序项不能为空');
    const seenItemIds = new Set<string>();
    const normalizedItems = items.map((item) => {
      const itemId = String(item.id || '').trim();
      const sortOrder = Number(item.sortOrder);
      if (!itemId || !Number.isFinite(sortOrder) || sortOrder < 0)
        throw new BadRequestException('排序项格式不正确');
      if (seenItemIds.has(itemId))
        throw new BadRequestException('排序项不能重复');
      seenItemIds.add(itemId);
      return { id: itemId, sortOrder };
    });
    return this.prisma.$transaction(async (tx) => {
      let updatedCount = 0;
      for (const item of normalizedItems) {
        const result = await tx.designRecipeItem.updateMany({
          where: { id: item.id, designRecipeId },
          data: { sortOrder: item.sortOrder },
        });
        if (result.count !== 1)
          throw new NotFoundException(
            `Design recipe item ${item.id} not found`,
          );
        updatedCount += result.count;
      }
      await tx.designRecipe.update({
        where: { id: designRecipeId },
        data: { contentRevision: { increment: 1 } },
      });
      return { updatedCount };
    });
  }

  async updateItemOrder(
    designRecipeId: string,
    itemIds: string[],
    access: RecipeDesignerAccessInput,
  ): Promise<Array<{ id: string; sortOrder: number }>> {
    const context = normalizeRecipeDesignerAccessContext(access);

    for (
      let attempt = 1;
      attempt <= DESIGN_RECIPE_ITEM_ORDER_MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const draft = await tx.designRecipe.findUnique({
              where: { id: designRecipeId },
              select: {
                id: true,
                createdBy: true,
                status: true,
                publishedRecipeId: true,
                publishedAt: true,
                seriesId: true,
                seriesLifeStage: true,
              },
            });
            await this.assertEditableDraft(draft, designRecipeId, context);

            if (new Set(itemIds).size !== itemIds.length) {
              throw new BadRequestException('原料排序包含重复项');
            }

            const items = await tx.designRecipeItem.findMany({
              where: { designRecipeId },
              select: { id: true, sortOrder: true },
            });
            const existingIds = new Set(items.map((item) => item.id));

            if (
              items.length !== itemIds.length ||
              itemIds.some((itemId) => !existingIds.has(itemId))
            ) {
              throw new BadRequestException(
                '原料排序必须包含当前草稿的全部原料',
              );
            }

            const currentOrderById = new Map(
              items.map((item) => [item.id, item.sortOrder]),
            );
            const changedItems = itemIds
              .map((id, sortOrder) => ({ id, sortOrder }))
              .filter(
                ({ id, sortOrder }) => currentOrderById.get(id) !== sortOrder,
              );

            await Promise.all(
              changedItems.map(({ id, sortOrder }) =>
                tx.designRecipeItem.update({
                  where: { id },
                  data: { sortOrder },
                  select: { id: true, sortOrder: true },
                }),
              ),
            );

            await tx.designRecipe.update({
              where: { id: designRecipeId },
              data: { contentRevision: { increment: 1 } },
            });
            return itemIds.map((id, sortOrder) => ({ id, sortOrder }));
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_ITEM_ORDER_MAX_ATTEMPTS &&
          this.isTransactionConflict(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('原料排序失败，请重试');
  }

  async removeItem(itemId: string, access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);

    // 幂等：这条原料已经不存在时（重复提交、或上一次请求成功但响应丢失后的重试）
    // 直接按「已删除」返回，不报错。否则前端的重试会把这个已经完成的删除反复打成失败，
    // 把整个保存队列卡住。
    const existing = await this.prisma.designRecipeItem.findUnique({
      where: { id: itemId },
      select: { id: true },
    });
    if (!existing) {
      return { id: itemId, alreadyRemoved: true };
    }

    const draft = await this.assertItemEditableByUser(itemId, context);

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.designRecipeItem.delete({
        where: { id: itemId },
      });
      await tx.designRecipe.update({
        where: { id: draft.id },
        data: { contentRevision: { increment: 1 } },
      });
      return deleted;
    });
  }

  /**
   * 按**当前编辑内容**评估（2026-10-16 批次 5.3）。
   *
   * ## 为什么需要单独一个接口
   *
   * 现有的 `assessDraft(id)` 是**按草稿 id 从库里读**的 ——
   * 而后台编辑器算的是**屏幕上还没保存的内容**。
   * 直接用它，评估的会是"上一次保存的版本"，不是用户看到的那份。
   *
   * ## 目标值由后端按场景取
   *
   * 客户端不用传 `targets` —— 那是 FEDIAF 标准表里的东西，
   * 客户端不该知道、也省得它缓存一份可能过期的。
   */
  async assessItems(input: {
    scenario: string;
    items: Array<{
      id: string;
      name: string;
      ingredientType?: string | null;
      weightG: number;
      nutritionProfile?: unknown;
    }>;
  }): Promise<
    ClientDesignRecipeAssessmentResult & { dataGaps: AssessmentDataGap[] }
  > {
    const scenario = String(input.scenario || '').trim();
    if (!scenario) {
      throw new BadRequestException('缺少 fediafDogScenario');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      /**
       * 空配方不给评估 —— 返回一堆"缺数据"没有意义，页面上也会变成一片红。
       * 客户端据此显示"还没有原料"。
       */
      throw new BadRequestException('配方里还没有原料，暂时无法评估');
    }

    const targets = await this.targetProvider.getTargets(scenario as never);

    const result = assessRecipeDraft({
      scenario: scenario as never,
      items: input.items as never,
      targets,
    } as never);

    /**
     * 走 `toClientAssessmentResult`：它会**删掉 `entries`**（逐条明细）。
     *
     * 后台那几个面板只用 `dataGaps` / `groupedEntries` / `macroMetrics`，
     * 而 `entries` 是最大的一块 —— 每次编辑都传一遍不值得。
     *
     * ⚠️ 但 `dataGaps` 必须留下：它是「哪个原料缺哪个字段」，
     * 丢了用户就只看到一片"缺数据"、不知道该补什么。
     */
    return this.toClientAssessmentResult(result) as never;
  }

  /**
   * 点开某个营养素时才取原料贡献明细（2026-10-22）。
   *
   * `/assess-items` 不再返回全部 contributors；否则 20 个原料 × 几十项
   * 会让每次编辑的响应达到数百 KB。这里只重算一次并返回被点开的那一项。
   */
  async assessContributors(input: {
    scenario: string;
    nutrientKey: string;
    items: Array<{
      id: string;
      name: string;
      ingredientType?: string | null;
      weightG: number;
      nutritionProfile?: unknown;
    }>;
  }): Promise<{
    nutrientKey: string;
    contributors: NonNullable<
      DesignRecipeAssessmentResult['groupedEntries'][number]['contributors']
    >;
  }> {
    const scenario = String(input.scenario || '').trim();
    const nutrientKey = String(input.nutrientKey || '').trim();
    if (!scenario || !nutrientKey) {
      throw new BadRequestException('缺少 scenario 或 nutrientKey');
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BadRequestException('配方里还没有原料，暂时无法评估');
    }
    const targets = await this.targetProvider.getTargets(scenario as never);
    const result = assessRecipeDraft({
      scenario: scenario as never,
      items: input.items as never,
      targets,
    } as never);
    const group = result.groupedEntries.find(
      (entry) => entry.nutrientKey === nutrientKey,
    );
    return {
      nutrientKey,
      contributors: group?.contributors ?? [],
    };
  }

  async assessDraft(
    id: string,
    access: RecipeDesignerAccessInput,
  ): Promise<ClientDesignRecipeAssessmentResult> {
    const draft = await this.getDraft(id, access);
    const targets = await this.targetProvider.getTargets(
      draft.fediafDogScenario,
    );
    const result = await this.assessLoadedDraft(draft, targets);
    const removableSupplementWarnings = this.buildRemovableSupplementWarnings(
      draft,
      targets,
    );
    const allergenWarnings = await this.buildDraftAllergenWarnings(draft);

    if (this.isPublishedDraft(draft)) {
      return this.toClientAssessmentResult(
        result,
        removableSupplementWarnings,
        allergenWarnings,
      );
    }

    const assessmentData = this.buildAssessmentUpdateData(result);
    await this.prisma.designRecipe.updateMany({
      where: { id, contentRevision: draft.contentRevision },
      data: assessmentData,
    });

    return this.toClientAssessmentResult(
      result,
      removableSupplementWarnings,
      allergenWarnings,
    );
  }

  /**
   * 配方里有没有这只狗过敏的食材（2026-10-04 第一期）。
   *
   * 改造前营养评估**完全不读过敏** —— 一份含鸡肉的配方
   * 在系统里可以被判"完全合格"，营养师只能自己肉眼看。
   *
   * 现在评估会带上这一项。注意它是**提示、不拦保存**：
   * 过敏信息可能过期，营养师也可能有正当理由（顾客已确认可以吃），
   * 硬拦只会逼员工绕过系统。这与"系统自动推荐时确诊过敏一律拒绝"
   * 是两个不同的场景 —— 前者是人做判断，后者是机器做判断。
   *
   * 只对有 customerDogId 的定制草稿生效：通用食谱没有"某只狗"。
   */
  private async buildDraftAllergenWarnings(
    draft: DesignRecipeWithItems,
  ): Promise<DraftAllergenWarning[]> {
    const dogId = (draft as { customerDogId?: string | null }).customerDogId;
    if (!dogId || !this.allergenVocabulary) {
      return [];
    }

    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: {
        allergyFoods: true,
        allergyRecords: { select: { allergen: true, certainty: true } },
      },
    });
    if (!dog) {
      return [];
    }

    const blocking: string[] = [];
    const warning: string[] = [];
    for (const record of dog.allergyRecords ?? []) {
      const certainty = String(record.certainty || 'SUSPECTED').toUpperCase();
      if (certainty === 'RULED_OUT') continue;
      const terms = splitAllergyKeywords(record.allergen);
      if (certainty === 'CONFIRMED') {
        blocking.push(...terms);
      } else {
        warning.push(...terms);
      }
    }
    warning.push(...splitAllergyKeywords(dog.allergyFoods));

    const blockingSet = new Set(blocking);
    const blockingTerms = Array.from(new Set(blocking.filter(Boolean)));
    const warningTerms = Array.from(
      new Set(warning.filter((term) => term && !blockingSet.has(term))),
    );

    if (blockingTerms.length === 0 && warningTerms.length === 0) {
      return [];
    }

    const warnings: DraftAllergenWarning[] = [];

    for (const item of draft.items) {
      const itemName = this.resolveIngredientDisplayName(item);
      if (!itemName) continue;

      for (const [level, terms] of [
        ['CONFIRMED', blockingTerms],
        ['WARNING', warningTerms],
      ] as const) {
        const hits = await this.allergenVocabulary.matchIngredients({
          dogAllergens: terms,
          ingredientNames: [itemName],
        });
        for (const hit of hits) {
          warnings.push({
            itemId: item.id,
            itemName,
            allergen: hit.allergen,
            level,
            message:
              level === 'CONFIRMED'
                ? `「${itemName}」含确诊过敏原「${hit.allergen}」，请确认是否保留`
                : `「${itemName}」含需注意的过敏原「${hit.allergen}」（可疑/待排查），请与顾客确认`,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * 找出这只狗**正在等食谱**的定制单（2026-10-04）。
   *
   * 背景（后台最大的效率黑洞）：设计器发布私有定制食谱时**不写定制单号**，
   * 全后端只有后台那个手工表单会写（admin-custom-recipe.controller 的
   * create-recipe）。于是员工在设计器里做完的食谱挂不到订单上 ——
   * 必须回订单页把数值、食材、步骤**手工重抄一遍**，而且两处表单字段结构不同，
   * 抄错就得重来；抄完订单的 recipeId 仍是空，顾客那边看不到、也不会收到通知。
   *
   * 现在发布时就自动挂上订单，后台订单页可以直接「一键交付」。
   *
   * 只认 PAID / IN_PROGRESS：这两种状态才代表"钱已收、食谱还没交"。
   * 已交付的单要走后台的「重新交付」显式指定，避免把新版食谱悄悄挂到老单上。
   */
  private async resolveCustomRecipeOrderIdForDog(
    customerDogId: string | null | undefined,
  ): Promise<string | null> {
    if (!customerDogId) return null;

    const order = await this.prisma.customRecipeOrder.findFirst({
      where: {
        dogId: customerDogId,
        status: {
          in: [CustomRecipeStatus.PAID, CustomRecipeStatus.IN_PROGRESS],
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return order?.id ?? null;
  }

  async createPrivateRecipeSnapshot(
    id: string,
    dto: CreatePrivateRecipeSnapshotDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.loadDraft(id);

    if (
      !isInternalRecipeDesignerRole(context) &&
      !this.isDraftOwnedByContext(draft, context)
    ) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    const readiness = this.getCustomerDraftSnapshotReadiness(draft);
    if (!readiness.canCreateSnapshot) {
      throw new BadRequestException(readiness.disabledReason);
    }

    const customerOwnerId = isInternalRecipeDesignerRole(context)
      ? draft.createdBy
      : getRecipeDesignerCustomerOwnerId(context);
    /**
     * 2026-10-04：发布时就把这只狗"正在等食谱"的定制单挂上，
     * 后台订单页因此能直接一键交付 —— 员工不用再手工重抄一遍。
     */
    const customOrderId = await this.resolveCustomRecipeOrderIdForDog(
      draft.customerDogId,
    );
    const recipe = await this.createOrUpdatePrivateRecipeSnapshot(draft, {
      customerOwnerId,
      customOrderId,
    });

    const page =
      dto.target === 'DIY'
        ? '/pages/recipe-diy/index'
        : '/pages/recipe-order/index';
    const response = {
      recipeId: recipe.recipeId,
      dogId: draft.customerDogId,
      targetUrl: `${page}?recipeId=${recipe.recipeId}&dogId=${draft.customerDogId}`,
    };
    return readiness.nutritionWarning
      ? { ...response, nutritionWarning: readiness.nutritionWarning }
      : response;
  }

  /**
   * 订单绑定设计 · 加入待提交时生成私密食谱快照（2026-10-22 · Task 3）。
   *
   * 复用与 `createPrivateRecipeSnapshot` 完全相同的快照构建逻辑（营养数据、
   * 原料明细、比例、制备方式都走同一套），差异只有三点：
   *  · 归属人固定为订单顾客（不是操作员工），狗狗固定为订单狗狗；
   *  · **不写 `customOrderId`** —— 一张订单有 N 份，最终批量交付时统一挂接；
   *  · 只生成私密食谱，不交付、不发通知。
   */
  async publishOrderDesignSlot(input: {
    draftId: string;
    customerId: string;
    dogId: string;
    /** 操作人（管理员），仅留痕；本方法不写操作人字段 */
    operatorId: string;
  }): Promise<{ recipeRowId: string; recipeId: string }> {
    const draft = await this.loadDraft(input.draftId);
    if (draft.customerDogId && draft.customerDogId !== input.dogId) {
      throw new BadRequestException('设计草稿与订单狗狗不一致');
    }

    /**
     * 与产品线发布共用同一套门槛：报告能不能生成、补剂目标、
     * 预处理方式、制作步骤等都在这里统一判断。
     */
    const { readiness: launchReadiness, assessment } =
      await this.evaluateDraftLaunchReadiness(draft);
    this.assertLaunchReadinessReady(launchReadiness);
    if (!assessment) {
      throw new BadRequestException('配方评估未完成，无法进入下一步');
    }

    /**
     * 模板复制出来的草稿 `energyDensityKcalPerKg` 初始为 null；编辑器里的评估
     * 是异步回写的，保存队列又可能改 contentRevision，导致回写被跳过。
     * 加入待提交是服务端动作，不能相信这个可能为空的缓存值：
     * 缺失时用当前评估结果补上，并写回草稿。
     */
    let publishableDraft = draft;
    if (!(Number(draft.energyDensityKcalPerKg) > 0)) {
      const energyDensityKcalPerKg = assessment.energyDensityKcalPerKg;
      if (!(Number(energyDensityKcalPerKg) > 0)) {
        throw new BadRequestException('缺少能量数据，暂时无法进入下一步');
      }
      const totalWeightG = assessment.totalWeightG;
      publishableDraft = {
        ...draft,
        energyDensityKcalPerKg,
        totalWeightG,
      };
      await this.prisma.designRecipe.update({
        where: { id: draft.id },
        data: { energyDensityKcalPerKg, totalWeightG },
      });
    }

    // 保持原有顾客 / 狗狗校验：门槛不替代「草稿必须已绑定这只狗」等业务规则。
    const snapshotReadiness = this.getCustomerDraftSnapshotReadiness({
      ...publishableDraft,
      customerDogId: publishableDraft.customerDogId ?? input.dogId,
    });
    if (!snapshotReadiness.canCreateSnapshot) {
      throw new BadRequestException(snapshotReadiness.disabledReason);
    }

    const recipe = await this.createOrUpdatePrivateRecipeSnapshot(
      publishableDraft,
      {
        customerOwnerId: input.customerId,
        customOrderId: null,
        displayName: publishableDraft.name,
      },
    );

    return { recipeRowId: recipe.id, recipeId: recipe.recipeId };
  }

  private async createOrUpdatePrivateRecipeSnapshot(
    draft: DesignRecipeWithItems,
    options: {
      customerOwnerId: string | null;
      customOrderId: string | null;
      displayName?: string | null;
    },
  ) {
    const privateSupplementTargetMap =
      await this.buildPrivateSnapshotSupplementTargetMap(draft);
    const itemCreates = this.buildPrivateRecipeSnapshotItemCreateData(
      draft,
      privateSupplementTargetMap,
    );
    const customOrderId = options.customOrderId;
    /**
     * 私密食谱同样持久化结构化步骤；legacy `Recipe.productionSteps` 不动，
     * 以免把新结构写进旧字符串字段（交付快照 v2 也不在本任务范围）。
     */
    const productionStepsData = this.buildProductionStepsSnapshotData(
      draft.productionStepsJson,
    );
    const baseData = {
      name: this.resolvePrivateRecipeSnapshotDisplayName(
        draft,
        options.displayName,
      ),
      status: RecipeStatus.PRIVATE_CUSTOM,
      energyDensityKcalPerKg: Number(draft.energyDensityKcalPerKg),
      productionLossRate: await this.resolveProductionLossRate(),
      batchLaborHours: PUBLISHED_RECIPE_BATCH_LABOR_HOURS,
      applicableLifeStages: this.resolvePublishedLifeStages(draft),
      targetHealthTags: draft.targetHealthTags,
      /**
       * 私密定制食谱也要带完整 `report`。
       * 此前只写 legacy nutrients，导致小程序营养报告页只读
       * `nutritionDetailedData.report`，除能量密度外整页算不出来。
       */
      nutritionDetailedData: this.toJsonValue(
        await this.buildPrivateSnapshotNutritionData(draft),
      ),
      nutritionStandard: draft.nutritionStandard ?? 'FEDIAF_2025',
      description: draft.notes,
      ...productionStepsData,
      designSource: RECIPE_DESIGNER_PUBLISHED_SOURCE,
      isCustomRecipe: true,
      // 挂不上订单就不写，保留原有链路（老食谱的挂单关系也不会被清掉）
      ...(customOrderId ? { customOrderId } : {}),
      ...(draft.seriesId ? { seriesId: draft.seriesId } : {}),
      ...(draft.seriesLifeStage
        ? { seriesLifeStage: draft.seriesLifeStage }
        : {}),
      customerOwnerId: options.customerOwnerId,
      customerDogId: draft.customerDogId,
      sourceDesignRecipeId: draft.id,
      items: {
        create: itemCreates,
      },
    };

    const existing = await this.prisma.recipe.findFirst({
      where: { sourceDesignRecipeId: draft.id },
      select: { id: true, recipeId: true, version: true },
    });
    return existing
      ? await this.prisma.recipe.update({
          where: { id: existing.id },
          data: {
            ...baseData,
            items: {
              deleteMany: {},
              create: itemCreates,
            },
          },
        })
      : await this.prisma.recipe.create({
          data: {
            recipeId: draft.id,
            version: 1,
            ...baseData,
          },
        });
  }

  private resolvePrivateRecipeSnapshotDisplayName(
    draft: DesignRecipeWithItems,
    preferredName?: string | null,
  ): string {
    const preferred = preferredName?.trim();
    if (preferred) {
      return preferred;
    }
    const seriesName = draft.series?.name?.trim();
    const draftName = draft.name?.trim();
    return seriesName || draftName || '私属食谱';
  }

  async publishDraft(
    id: string,
    dto: PublishRecipeDesignDraftDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (context.role !== UserRole.ADMIN) {
      throw new BadRequestException('只有管理员可以发布正式食谱');
    }

    const draft = await this.loadDraft(id);
    if (!(await this.isInternalRecipeDesignerCreatorId(draft.createdBy))) {
      throw new BadRequestException('用户私有草稿不能发布为正式食谱');
    }

    const requestedRecipeName = dto.name?.trim() || '';
    const seriesName = draft.series?.name?.trim() || '';
    const recipeName = this.stripRevisionSuffix(
      seriesName || requestedRecipeName,
    );
    const reviewNote = dto.reviewNote?.trim() || null;

    if (!recipeName) {
      throw new BadRequestException('请填写食谱名称');
    }

    await this.assertRevisionHasPublishableChanges(draft, recipeName);

    /**
     * 统一发布门槛（与订单「加入待提交」共用）：
     * 名称 / 参与评估的原料 / 总重量 / 能量密度 / 完整报告 /
     * 补剂目标 / 预处理方式 / 制作步骤。
     * 评估未完全合规只是 warning，审核说明仍由下面单独强制。
     */
    const assessment = await this.assertDraftLaunchReady(draft, {
      name: recipeName,
    });

    if (assessment.energyDensityKcalPerKg === null) {
      throw new BadRequestException('缺少能量数据，无法发布正式食谱');
    }
    const energyDensityKcalPerKg = Math.round(
      assessment.energyDensityKcalPerKg,
    );

    if (assessment.overallStatus !== 'COMPLIANT' && !reviewNote) {
      throw new BadRequestException('需审核配方必须填写审核说明');
    }

    const ingredientItems = draft.items
      .filter((item) => this.isItemIncludedInAssessment(item))
      .map((item) => ({
        item,
        ingredientId: this.resolveIngredientId(item),
      }));
    const publishedFoodRatioMap =
      this.buildPublishedFoodRatioMap(ingredientItems);
    const defaultPreparationMethods =
      await this.loadDefaultPreparationMethodMap(
        ingredientItems.map(({ ingredientId }) => ingredientId),
      );
    const supplementTargetMap = await this.buildPublishedSupplementTargetMap(
      draft,
      assessment,
    );
    const healthTagAssignments = this.buildPublishedHealthTagAssignments(
      draft.targetHealthTags,
    );
    const publishTarget = await this.resolvePublishTarget(draft);
    const inheritance = await this.resolvePublishedRecipeInheritance(
      draft,
      publishTarget,
    );
    const publishedSeriesLifeStage = this.resolveDraftSeriesLifeStage(draft);
    /**
     * 结构化制作步骤随发布一起落库；legacy `Recipe.productionSteps` 字符串
     * 保持原样（这里既不读也不写它），避免把新结构硬塞进旧字段。
     */
    const productionStepsData = this.buildProductionStepsSnapshotData(
      draft.productionStepsJson,
    );

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          recipeId: publishTarget.recipeId,
          version: publishTarget.version,
          name: recipeName,
          status: RecipeStatus.DRAFT,
          energyDensityKcalPerKg,
          productionLossRate: await this.resolveProductionLossRate(),
          batchLaborHours: PUBLISHED_RECIPE_BATCH_LABOR_HOURS,
          applicableLifeStages: this.resolvePublishedLifeStages(draft),
          targetHealthTags: draft.targetHealthTags,
          nutritionDetailedData: this.toJsonValue(
            this.buildPublishedNutritionDetailedData(draft, assessment),
          ),
          nutritionStandard: 'FEDIAF_2025',
          description: draft.notes,
          ...productionStepsData,
          designSource: RECIPE_DESIGNER_PUBLISHED_SOURCE,
          isCustomRecipe: false,
          ...(draft.series?.referenceDogId
            ? { referenceDogId: draft.series.referenceDogId }
            : {}),
          ...this.buildPublishedRecipePresentationMediaCreateData(
            inheritance.media,
          ),
          ...this.buildPublishedRecipeOperationalCreateData(
            inheritance.previousVersion,
          ),
          ...(draft.seriesId ? { seriesId: draft.seriesId } : {}),
          ...(publishedSeriesLifeStage
            ? { seriesLifeStage: publishedSeriesLifeStage }
            : {}),
          ...(healthTagAssignments ? { healthTagAssignments } : {}),
          items: {
            create: ingredientItems.map(({ item, ingredientId }) =>
              this.buildPublishedRecipeItemCreateData(
                item,
                ingredientId,
                assessment,
                publishedFoodRatioMap,
                supplementTargetMap.get(item.id) ?? [],
                defaultPreparationMethods.get(ingredientId) ?? null,
              ),
            ),
          },
        },
      });

      if (inheritance.previousVersion) {
        await tx.favoriteRecipe.updateMany({
          where: { recipeId: inheritance.previousVersion.id },
          data: { recipeId: recipe.id },
        });
      }

      const reviewStatus =
        assessment.overallStatus === 'COMPLIANT'
          ? DesignRecipeReviewStatus.NONE
          : DesignRecipeReviewStatus.APPROVED;
      const {
        status: _assessedStatus,
        reviewStatus: _assessedReviewStatus,
        ...assessmentUpdateData
      } = this.buildAssessmentUpdateData(assessment);

      await tx.designRecipePublishSnapshot.create({
        data: {
          designRecipeId: draft.id,
          recipeId: recipe.recipeId,
          recipeVersion: recipe.version,
          reviewStatus,
          reviewNote,
          publishedBy: context.userId,
          snapshotData: this.toJsonValue({
            designRecipe: { ...draft, name: recipeName },
            assessment,
            ingredientItems,
          }),
        },
      });

      const publishedDesignIdentity =
        await this.resolvePublishedDesignRecipeIdentity(tx, draft, recipeName);

      return tx.designRecipe.update({
        where: { id: draft.id },
        data: {
          ...assessmentUpdateData,
          ...publishedDesignIdentity,
          status: DesignRecipeStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedRecipeId: recipe.recipeId,
          publishedRecipeVersion: recipe.version,
          reviewStatus,
          reviewNote,
          reviewedBy:
            reviewStatus === DesignRecipeReviewStatus.APPROVED
              ? context.userId
              : null,
          reviewedAt:
            reviewStatus === DesignRecipeReviewStatus.APPROVED
              ? new Date()
              : null,
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });
  }

  private async resolvePublishedDesignRecipeIdentity(
    tx: Pick<PrismaService, 'designRecipe'>,
    draft: DesignRecipeWithItems,
    recipeName: string,
  ) {
    if (this.isActiveRevisionDraft(draft)) {
      return {};
    }

    if ((draft.name ?? '').trim() === recipeName) {
      return { name: recipeName };
    }

    return {
      name: recipeName,
      version: await this.allocateNextDesignRecipeVersion(tx, recipeName),
    };
  }

  private async assertRevisionHasPublishableChanges(
    draft: DesignRecipeWithItems,
    recipeName: string,
  ) {
    if (!this.isActiveRevisionDraft(draft)) {
      return;
    }

    const baseline = await this.loadRevisionBaselineDraft(draft);
    if (
      baseline &&
      this.hasSamePublishableRecipeInputs(draft, baseline, recipeName)
    ) {
      throw new BadRequestException('当前修订与已发布版本一致，无需发布新版本');
    }
  }

  private async loadRevisionBaselineDraft(draft: DesignRecipeWithItems) {
    if (draft.revisionOfDesignRecipeId) {
      return (await this.prisma.designRecipe.findFirst({
        where: { id: draft.revisionOfDesignRecipeId },
        include: DESIGN_RECIPE_INCLUDE,
      })) as DesignRecipeWithItems | null;
    }

    if (!draft.revisionBaseRecipeId) {
      return null;
    }

    return (await this.prisma.designRecipe.findFirst({
      where: {
        publishedRecipeId: draft.revisionBaseRecipeId,
        status: DesignRecipeStatus.PUBLISHED,
      },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: [{ publishedRecipeVersion: 'desc' }, { updatedAt: 'desc' }],
    })) as DesignRecipeWithItems | null;
  }

  private hasSamePublishableRecipeInputs(
    draft: DesignRecipeWithItems,
    baseline: DesignRecipeWithItems,
    effectiveName?: string,
  ) {
    return (
      JSON.stringify(
        this.buildPublishableRecipeInputSignature(
          draft,
          baseline.name,
          effectiveName,
        ),
      ) ===
      JSON.stringify(
        this.buildPublishableRecipeInputSignature(baseline, baseline.name),
      )
    );
  }

  private buildPublishableRecipeInputSignature(
    draft: DesignRecipeWithItems,
    baselineName?: string,
    effectiveName?: string,
  ) {
    return {
      name: this.normalizeComparableRecipeName(
        effectiveName ?? draft.name,
        baselineName,
      ),
      fediafDogScenario: draft.fediafDogScenario,
      targetHealthTags: this.normalizeComparableStringList(
        draft.targetHealthTags,
      ),
      applicableLifeStages: this.normalizeComparableStringList(
        draft.applicableLifeStages,
      ),
      notes: this.normalizeComparableText(draft.notes),
      productionStepsJson: JSON.stringify(
        this.readDraftProductionSteps(draft.productionStepsJson),
      ),
      items: this.buildPublishableItemSignature(draft),
    };
  }

  private buildPublishableItemSignature(draft: DesignRecipeWithItems) {
    return draft.items
      .filter((item) => this.isItemIncludedInAssessment(item))
      .map((item) => ({
        ingredientId: this.normalizeComparableText(item.ingredientId),
        nutritionFoodId: item.nutritionFoodId,
        weightG: this.normalizeComparableNumber(item.weightG),
        preparationMethod: this.normalizeComparableText(item.preparationMethod),
        preparationNote: this.normalizeComparableText(item.preparationNote),
        preparationSource: this.normalizeComparableText(item.preparationSource),
        nutrientTargetKey: this.normalizeComparableText(item.nutrientTargetKey),
        nutrientTargetValue: this.normalizeComparableNumber(
          item.nutrientTargetValue,
        ),
        supplementTargets: this.buildEffectiveSupplementTargetSignature(
          item.supplementTargets,
        ),
        sortOrder: item.sortOrder ?? 0,
      }))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return (
          [
            left.ingredientId.localeCompare(right.ingredientId),
            left.nutritionFoodId.localeCompare(right.nutritionFoodId),
            left.preparationMethod.localeCompare(right.preparationMethod),
            left.preparationNote.localeCompare(right.preparationNote),
            left.preparationSource.localeCompare(right.preparationSource),
            left.nutrientTargetKey.localeCompare(right.nutrientTargetKey),
            left.supplementTargets.localeCompare(right.supplementTargets),
          ].find((result) => result !== 0) ?? 0
        );
      });
  }

  /**
   * 补剂目标里「只有字段提示、没有目标值」的条目（targetValue 为空）不会进入发布结果，
   * 只是编辑器用来提示该补剂对应哪种营养素（例如从名称推断出的「铁」「碘」）。
   *
   * 比较「修订是否有变化」时必须忽略这类空条目：
   * 复制/修订草稿时会给没有显式目标的补剂补上这种占位条目，
   * 如果参与比较，就会把「内容其实没改」的修订误判成有变更，
   * 从而绕过「当前修订与已发布版本一致，无需发布新版本」的拦截，
   * 发布出一个内容完全相同的重复正式版本。
   */
  private buildEffectiveSupplementTargetSignature(value: unknown): string {
    const effectiveTargets = this.normalizeDesignSupplementTargets(
      value,
    ).filter((target) => {
      const targetValue = target.targetValue;
      return (
        typeof targetValue === 'number' &&
        Number.isFinite(targetValue) &&
        targetValue > 0
      );
    });

    return JSON.stringify(effectiveTargets);
  }

  private normalizeComparableRecipeName(value: string, baselineName?: string) {
    const normalized = this.normalizeComparableText(value) ?? '';
    const normalizedBaseline = this.normalizeComparableText(baselineName);
    if (
      normalizedBaseline &&
      this.stripRevisionSuffix(normalized) ===
        this.stripRevisionSuffix(normalizedBaseline)
    ) {
      return this.stripRevisionSuffix(normalizedBaseline);
    }
    return normalized;
  }

  private buildRevisionDraftName(name: string) {
    return `${this.stripRevisionSuffix(name)} 修订`;
  }

  private stripRevisionSuffix(value: string) {
    const normalized = this.normalizeComparableText(value);
    const stripped = normalized.replace(/(?:\s*修订)+$/u, '').trim();
    return stripped || normalized;
  }

  private normalizeComparableStringList(values: string[]) {
    return values
      .map((value) => this.normalizeComparableText(value))
      .filter((value): value is string => Boolean(value))
      .sort();
  }

  private normalizeComparableText(value?: string | null) {
    const normalized = value?.trim() ?? '';
    return normalized || '';
  }

  private normalizeComparableNumber(value?: number | null) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return null;
    }
    return Math.round(value * 10000) / 10000;
  }

  private async resolvePublishTarget(draft: DesignRecipeWithItems) {
    const baseRecipeId = draft.revisionBaseRecipeId?.trim();

    if (baseRecipeId) {
      const latestRecipe = await this.prisma.recipe.findFirst({
        where: { recipeId: baseRecipeId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      if (!latestRecipe) {
        throw new BadRequestException('原正式食谱不存在，无法发布修订版本');
      }

      return {
        recipeId: baseRecipeId,
        version: latestRecipe.version + 1,
      };
    }

    const seriesId = draft.seriesId?.trim();
    if (seriesId) {
      const seriesLifeStage =
        draft.seriesLifeStage ??
        mapScenarioToSeriesLifeStage(draft.fediafDogScenario);
      const latestStageRecipe = await this.prisma.recipe.findFirst({
        where: {
          seriesId,
          seriesLifeStage,
        },
        orderBy: { version: 'desc' },
        select: { recipeId: true, version: true },
      });

      if (latestStageRecipe) {
        return {
          recipeId: latestStageRecipe.recipeId,
          version: latestStageRecipe.version + 1,
        };
      }

      return {
        recipeId: draft.id,
        version: 1,
      };
    }

    return {
      recipeId: draft.id,
      version: draft.version,
    };
  }

  private async resolvePublishedRecipeInheritance(
    draft: DesignRecipeWithItems,
    publishTarget: { recipeId: string; version: number },
  ): Promise<{
    media: PublishedRecipePresentationMedia | null;
    previousVersion: PublishedRecipeVersionInheritance | null;
  }> {
    const previousVersion =
      publishTarget.version > 1
        ? ((await this.prisma.recipe.findFirst({
            where: {
              recipeId: publishTarget.recipeId,
              version: publishTarget.version - 1,
            },
            select: RECIPE_VERSION_INHERITANCE_SELECT,
          })) as PublishedRecipeVersionInheritance | null)
        : null;

    const seriesFallbackMedia =
      draft.seriesId && !previousVersion?.coverImageUrl
        ? ((await this.prisma.recipe.findFirst({
            where: {
              seriesId: draft.seriesId,
              coverImageUrl: { not: null },
            },
            orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
            select: RECIPE_PRESENTATION_MEDIA_SELECT,
          })) as PublishedRecipePresentationMedia | null)
        : null;

    return {
      media: this.mergePublishedRecipePresentationMedia(
        previousVersion,
        seriesFallbackMedia,
      ),
      previousVersion: previousVersion?.id ? previousVersion : null,
    };
  }

  private mergePublishedRecipePresentationMedia(
    primary: PublishedRecipePresentationMedia | null,
    fallback: PublishedRecipePresentationMedia | null,
  ): PublishedRecipePresentationMedia | null {
    const merged = {
      coverImageUrl:
        normalizeOptionalText(primary?.coverImageUrl) ??
        normalizeOptionalText(fallback?.coverImageUrl),
      coverTitle:
        normalizeOptionalText(primary?.coverTitle) ??
        normalizeOptionalText(fallback?.coverTitle),
      detailImages: primary?.detailImages ?? fallback?.detailImages ?? null,
      videoUrl:
        normalizeOptionalText(primary?.videoUrl) ??
        normalizeOptionalText(fallback?.videoUrl),
    };

    if (
      !merged.coverImageUrl &&
      !merged.coverTitle &&
      merged.detailImages === null &&
      !merged.videoUrl
    ) {
      return null;
    }

    return merged;
  }

  private buildPublishedRecipePresentationMediaCreateData(
    media: PublishedRecipePresentationMedia | null,
  ): Pick<
    Prisma.RecipeCreateInput,
    'coverImageUrl' | 'coverTitle' | 'detailImages' | 'videoUrl'
  > {
    return {
      ...(media?.coverImageUrl ? { coverImageUrl: media.coverImageUrl } : {}),
      ...(media?.coverTitle ? { coverTitle: media.coverTitle } : {}),
      ...(media?.detailImages !== null && media?.detailImages !== undefined
        ? { detailImages: media.detailImages as Prisma.InputJsonValue }
        : {}),
      ...(media?.videoUrl ? { videoUrl: media.videoUrl } : {}),
    };
  }

  private buildPublishedRecipeOperationalCreateData(
    previousVersion: PublishedRecipeVersionInheritance | null,
  ): Pick<
    Prisma.RecipeUncheckedCreateInput,
    'viewCount' | 'favoriteCount' | 'diyGenCount' | 'likeCount' | 'salesCount'
  > {
    if (!previousVersion) {
      return {};
    }

    return {
      viewCount: previousVersion.viewCount ?? 0,
      favoriteCount: previousVersion.favoriteCount ?? 0,
      diyGenCount: previousVersion.diyGenCount ?? 0,
      likeCount: previousVersion.likeCount ?? 0,
      salesCount: previousVersion.salesCount ?? 0,
    };
  }

  private resolvePublishedLifeStages(draft: DesignRecipeWithItems) {
    const seriesLifeStage = this.resolveDraftSeriesLifeStage(draft);
    if (seriesLifeStage) {
      return [seriesLifeStage];
    }

    const normalizedLifeStages = this.normalizePublishedRecipeLifeStages(
      draft.applicableLifeStages,
    );
    if (normalizedLifeStages.length > 0) {
      return normalizedLifeStages;
    }

    return PUBLISHED_RECIPE_LIFE_STAGES_BY_SCENARIO[draft.fediafDogScenario];
  }

  private resolveDraftSeriesLifeStage(
    draft: Pick<
      DesignRecipeWithItems,
      'seriesId' | 'seriesLifeStage' | 'fediafDogScenario'
    >,
  ) {
    if (!draft.seriesId) {
      return null;
    }

    return (
      draft.seriesLifeStage ??
      mapScenarioToSeriesLifeStage(draft.fediafDogScenario)
    );
  }

  private normalizePublishedRecipeLifeStages(stages: string[]) {
    const normalized = new Set<string>();
    const validStages = new Set(Object.values(RecipeLifeStage));

    for (const rawStage of stages) {
      const stage = rawStage.trim().toUpperCase();
      if (!stage) continue;

      if (validStages.has(stage as RecipeLifeStage)) {
        normalized.add(stage);
        continue;
      }

      for (const mappedStage of LEGACY_RECIPE_LIFE_STAGE_MAPPINGS[stage] ??
        []) {
        normalized.add(mappedStage);
      }
    }

    return [...normalized];
  }

  private isDraftOwnedByContext(
    draft: Pick<DesignRecipeWithItems, 'createdBy'>,
    context: RecipeDesignerAccessContext,
  ) {
    return (
      draft.createdBy === context.userId ||
      draft.createdBy === getRecipeDesignerCustomerOwnerId(context)
    );
  }

  private buildPrivateRecipeSnapshotItemCreateData(
    draft: DesignRecipeWithItems,
    privateSupplementTargetMap: Map<
      string,
      PublishedSupplementNutrientTarget[]
    >,
  ) {
    return draft.items
      .filter((item) => this.isItemIncludedInAssessment(item))
      .map((item) => {
        const isSupplement =
          this.resolveIngredientType(item) === IngredientType.SUPPLEMENT;
        const publishedTargets = privateSupplementTargetMap.get(item.id) ?? [];
        if (isSupplement && publishedTargets.length === 0) {
          // 私密快照同样硬阻断：没有目标就不允许生成，避免小程序详情页静默显示 `-`
          throw new BadRequestException(
            this.buildMissingSupplementTargetMessage(item),
          );
        }
        const primaryTarget = publishedTargets[0];
        const supplementTargets =
          this.buildPublishedSupplementTargets(publishedTargets);
        return {
          ingredientId: this.resolveIngredientId(item),
          nutritionFoodId: item.nutritionFoodId,
          preparationMethod: this.normalizePreparationMethod(
            item.preparationMethod,
          ),
          ...this.resolveSnapshotPreparation({
            note: item.preparationNote,
            source: item.preparationSource,
            usedAutomaticFallback: false,
          }),
          ratioPercent: this.resolvePrivateRecipeItemRatio(
            item,
            draft.totalWeightG,
          ),
          nutrientTargetKey: isSupplement
            ? (primaryTarget?.nutrientTargetKey ?? null)
            : item.nutrientTargetKey,
          nutrientTargetValue: isSupplement
            ? (primaryTarget?.nutrientTargetValue ?? null)
            : item.nutrientTargetValue,
          ...(supplementTargets
            ? { supplementTargets: this.toJsonValue(supplementTargets) }
            : {}),
          sortOrder: item.sortOrder,
          exampleWeight: item.weightG,
        };
      });
  }

  /**
   * 私密快照的补剂目标（2026-10-22 · Task 3）。
   *
   * 只认显式目标 / 营养档案默认目标，并按当前配方总重量重算每 kg 添加浓度。
   * 不再按「档案里第一个有值的营养字段」兜底 —— 那会把功能性补剂的目标
   * 悄悄换成别的营养素；没有目标时直接 400 阻断。
   */
  private async buildPrivateSnapshotSupplementTargetMap(
    draft: DesignRecipeWithItems,
  ): Promise<Map<string, PublishedSupplementNutrientTarget[]>> {
    const result = new Map<string, PublishedSupplementNutrientTarget[]>();
    if (draft.totalWeightG <= 0) return result;

    for (const item of draft.items) {
      if (
        !this.isItemIncludedInAssessment(item) ||
        this.resolveIngredientType(item) !== IngredientType.SUPPLEMENT
      ) {
        continue;
      }

      const definitions =
        await this.resolveDesignSupplementTargetDefinitions(item);
      if (definitions.length === 0) {
        throw new BadRequestException(
          this.buildMissingSupplementTargetMessage(item),
        );
      }

      const computed = this.requireSupplementTargetService().computeTargets(
        this.toAssessmentNutritionProfile(item),
        definitions,
        item.weightG,
        draft.totalWeightG,
      );
      result.set(
        item.id,
        computed.map((target) => this.toPublishedSupplementTarget(target)),
      );
    }
    return result;
  }

  private resolvePrivateRecipeItemRatio(
    item: DesignRecipeItemWithFood,
    totalWeightG: number,
  ) {
    const existingRatio = Number(item.ratioPercent);
    if (Number.isFinite(existingRatio) && existingRatio > 0) {
      return existingRatio;
    }
    const total = Number(totalWeightG);
    const weight = Number(item.weightG);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(weight)) {
      return null;
    }
    return Math.round((weight / total) * 10000) / 100;
  }

  /**
   * 私密快照优先写完整报告；目标表临时不可用/测试桩缺数据时回退旧结构，
   * 保证加入待提交不会因为报告生成失败而整体失败。
   */
  private async buildPrivateSnapshotNutritionData(
    draft: DesignRecipeWithItems,
  ) {
    try {
      return await this.buildPublishedNutritionDetailedDataForDraft(draft);
    } catch (error) {
      this.logger.warn(
        '私密食谱营养报告生成失败，回退 legacy nutritionDetailedData',
        error instanceof Error ? error.message : String(error),
      );
      return this.buildPrivateRecipeSnapshotNutritionData(draft);
    }
  }

  private buildPrivateRecipeSnapshotNutritionData(
    draft: DesignRecipeWithItems,
  ) {
    return {
      source: 'SETAR_RECIPE_DESIGNER_PRIVATE',
      schemaVersion: 1,
      standard: draft.nutritionStandard ?? 'FEDIAF_2025',
      scenario: draft.fediafDogScenario,
      generatedAt: new Date().toISOString(),
      energy_density_kcal_per_kg: draft.energyDensityKcalPerKg,
      total_weight_g: draft.totalWeightG,
      nutrients: draft.calculatedNutrition ?? {},
      complianceStatus: draft.complianceStatus ?? {},
      assessmentSummary: draft.assessmentSummary ?? {},
      missingDataReport: draft.missingDataReport ?? [],
    };
  }

  private buildPublishedRecipeItemCreateData(
    item: DesignRecipeItemWithFood,
    ingredientId: string,
    assessment: DesignRecipeAssessmentResult,
    publishedFoodRatioMap: Map<string, number>,
    supplementTargets: PublishedSupplementNutrientTarget[],
    defaultPreparationMethod: string | null,
  ) {
    const primarySupplementTarget = supplementTargets[0] ?? null;
    const supplementTargetPayload =
      this.buildPublishedSupplementTargets(supplementTargets);
    const isSupplement =
      this.resolveIngredientType(item) === IngredientType.SUPPLEMENT;
    const nutrientTargetData = isSupplement
      ? {
          nutrientTargetKey:
            primarySupplementTarget?.nutrientTargetKey ??
            item.nutrientTargetKey,
          nutrientTargetValue:
            primarySupplementTarget?.nutrientTargetValue ??
            item.nutrientTargetValue,
          ...(supplementTargetPayload
            ? { supplementTargets: this.toJsonValue(supplementTargetPayload) }
            : {}),
        }
      : {};
    const explicitPreparationMethod = this.normalizePreparationMethod(
      item.preparationMethod,
    );
    const preparationMethod =
      explicitPreparationMethod ??
      alignPreparationMethodBasis(
        defaultPreparationMethod,
        item.nutritionFood?.preparationState ?? null,
      );

    return {
      ingredientId,
      // 设计器里选定的营养档案（决定生/熟等状态）必须随发布一起落库，
      // 否则正式食谱只能靠后台保存时回填默认档案，导致生熟状态被改写。
      nutritionFoodId: this.resolvePublishedNutritionFoodId(item, ingredientId),
      preparationMethod,
      ...this.resolveSnapshotPreparation({
        note: item.preparationNote,
        source: item.preparationSource,
        usedAutomaticFallback:
          !explicitPreparationMethod && Boolean(preparationMethod),
      }),
      ratioPercent: isSupplement
        ? null
        : (publishedFoodRatioMap.get(item.id) ??
          this.findAssessedRatio(assessment, item.id)),
      ...nutrientTargetData,
      sortOrder: item.sortOrder,
      exampleWeight: item.weightG,
    };
  }

  /**
   * 发布时解析原料项的营养档案：
   * - 设计器中已选定且确实映射到该原料 → 原样带入正式食谱；
   * - 档案与原料不匹配（历史脏数据）→ 明确报错，避免发布出无法计算的食谱。
   */
  private resolvePublishedNutritionFoodId(
    item: DesignRecipeItemWithFood,
    ingredientId: string,
  ): string | null {
    const nutritionFoodId = item.nutritionFoodId?.trim();
    if (!nutritionFoodId) {
      return null;
    }

    const mappings = item.nutritionFood?.mappings ?? [];
    if (
      mappings.length > 0 &&
      !mappings.some((mapping) => mapping.ingredientId === ingredientId)
    ) {
      const ingredientLabel =
        item.ingredient?.name ?? item.nutritionFood?.name ?? ingredientId;
      throw new BadRequestException(
        `原料「${ingredientLabel}」选择的营养档案与原料不匹配，无法发布正式食谱，请在设计器中重新选择营养档案`,
      );
    }

    return nutritionFoodId;
  }

  private buildPublishedFoodRatioMap(
    ingredientItems: Array<{ item: DesignRecipeWithItems['items'][number] }>,
  ) {
    return buildFoodWeightRatioMap(
      ingredientItems.map(({ item }) => ({
        id: item.id,
        type: this.resolveIngredientType(item),
        effectiveWeightG: getProfileEffectiveWeightG(
          this.toAssessmentNutritionProfile(item),
          item.weightG,
        ),
      })),
    );
  }

  private buildPublishedSupplementTargets(
    resolvedTargets: PublishedSupplementNutrientTarget[],
  ) {
    if (resolvedTargets.length === 0) {
      return null;
    }

    return resolvedTargets.map((target) => {
      const targetField = this.resolveAnySupplementTargetField(
        target.fieldPath ?? target.nutrientTargetKey ?? '',
      );
      if (!targetField) {
        throw new BadRequestException(
          `补剂目标营养素 ${target.fieldPath ?? target.nutrientTargetKey ?? ''} 不在营养字段目录中，无法生成发布数据`,
        );
      }

      const targetValue = Number(target.nutrientTargetValue);
      if (!Number.isFinite(targetValue) || targetValue <= 0) {
        throw new BadRequestException(
          `补剂目标「${targetField.label}」的添加浓度无效，无法生成发布数据`,
        );
      }

      return {
        fieldPath: targetField.fieldPath,
        label: targetField.label,
        targetValuePerKg: targetValue,
        unit: targetField.unit,
      };
    });
  }

  /**
   * TODO(2026-10-22 · historical supplement targets): 历史已发布
   * `RecipeItem.supplementTargets` 的重算与差异清单不在本次接线范围，
   * 这里只负责把新发布的补剂目标按当前公式算对；历史重算走单独任务。
   */
  private async buildPublishedSupplementTargetMap(
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
  ) {
    const result = new Map<string, PublishedSupplementNutrientTarget[]>();

    for (const item of draft.items) {
      if (
        !this.isItemIncludedInAssessment(item) ||
        this.resolveIngredientType(item) !== IngredientType.SUPPLEMENT
      ) {
        continue;
      }

      result.set(
        item.id,
        await this.resolvePublishedSupplementTargetsForItem(item, assessment),
      );
    }

    return result;
  }

  /**
   * 发布时的补剂目标：显式定义优先，其次营养档案默认目标，最后硬阻断。
   * 不再按「移除补剂后是否出现营养缺口」反向推断。
   */
  private async resolvePublishedSupplementTargetsForItem(
    item: DesignRecipeItemWithFood,
    assessment: DesignRecipeAssessmentResult,
  ): Promise<PublishedSupplementNutrientTarget[]> {
    if (assessment.totalWeightG <= 0) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」无法在总重量为 0 的配方中生成营养目标`,
      );
    }

    const definitions =
      await this.resolveDesignSupplementTargetDefinitions(item);
    if (definitions.length === 0) {
      throw new BadRequestException(
        this.buildMissingSupplementTargetMessage(item),
      );
    }

    const computed = this.requireSupplementTargetService().computeTargets(
      this.toAssessmentNutritionProfile(item),
      definitions,
      item.weightG,
      assessment.totalWeightG,
    );

    return computed
      .map((target) => this.toPublishedSupplementTarget(target))
      .sort((left, right) => {
        if (right.nutrientTargetValue !== left.nutrientTargetValue) {
          return right.nutrientTargetValue - left.nutrientTargetValue;
        }
        return (left.fieldPath ?? '').localeCompare(right.fieldPath ?? '');
      });
  }

  /**
   * 读取一条设计项上的补剂目标定义（不含计算值）：
   * - 已保存的显式目标（含历史 legacy 单目标字段）；
   * - 没有显式目标时，回落到营养档案默认目标；
   * - 都没有时返回空数组，由调用方决定报错文案。
   *
   * 显式数组里出现未知/重复字段时直接 400，不静默丢掉再改用默认值。
   */
  private async resolveDesignSupplementTargetDefinitions(item: {
    supplementTargets?: unknown;
    nutrientTargetKey?: string | null;
    nutrientTargetValue?: number | null;
    nutritionFoodId?: string | null;
    nutritionFood?: { name?: string | null } | null;
    ingredient?: { name?: string | null } | null;
  }): Promise<DesignSupplementTarget[]> {
    const rawTargets = Array.isArray(item.supplementTargets)
      ? item.supplementTargets
      : [];
    const normalized = this.normalizeDesignSupplementTargets(
      item.supplementTargets,
      item.nutrientTargetKey,
      item.nutrientTargetValue,
    );

    if (rawTargets.length > 0) {
      if (normalized.length !== rawTargets.length) {
        throw new BadRequestException(
          `补剂原料「${this.resolveSupplementItemLabel(item)}」的营养目标包含无法识别的字段或重复项，请重新选择目标营养素`,
        );
      }
      return normalized;
    }

    if (normalized.length > 0) {
      return normalized;
    }

    const nutritionFoodId = item.nutritionFoodId?.trim();
    if (!nutritionFoodId) {
      return [];
    }

    const defaults =
      await this.requireSupplementTargetService().resolveDefaultTargets(
        nutritionFoodId,
      );
    return defaults.map((definition) =>
      this.toDesignSupplementTarget(definition, null),
    );
  }

  /**
   * 新增/修改补剂项时解析并校验目标定义，总重量已知时一并算出每 kg 添加浓度。
   *
   * 这里对**新写入**的目标更严格：
   * - `fieldPath` 必须精确命中营养字段目录（或派生字段目录）；
   * - 空字段、未知字段、档案里为 0 的字段、重复字段全部 400；
   * - 不传显式目标时只认营养档案默认目标，绝不做缺口推断。
   */
  private async resolveDesignSupplementTargetsForWrite(input: {
    nutritionFoodId: string | null | undefined;
    explicitTargets?: unknown;
    legacyTargetKey?: string | null;
    legacyTargetValue?: number | null;
    weightG: number;
    includeInAssessment: boolean;
    /**
     * 草稿当前已知的配方总重量（上一次评估结果）。
     * 未知时只落目标定义，不写计算值。
     */
    baseTotalWeightG?: number | null;
  }): Promise<DesignSupplementTarget[]> {
    const nutritionFoodId = input.nutritionFoodId?.trim();
    if (!nutritionFoodId) {
      throw new BadRequestException('补剂缺少营养档案，无法校验目标营养素');
    }

    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id: nutritionFoodId },
      select: {
        id: true,
        name: true,
        nutritionData: true,
        defaultSupplementTargets: true,
      },
    });
    if (!nutritionFood) {
      throw new BadRequestException(
        `营养档案 ${nutritionFoodId} 不存在，无法校验补剂目标`,
      );
    }

    const profile = this.toNutritionProfile(nutritionFood.nutritionData);
    const targetService = this.requireSupplementTargetService();

    let definitions: SupplementTargetDefinition[];
    if (input.explicitTargets !== undefined) {
      if (input.explicitTargets === null) {
        throw new BadRequestException(
          '补剂必须至少保留一个目标营养素，不能清空目标',
        );
      }
      definitions = targetService.validateTargets(
        profile,
        input.explicitTargets,
      );
    } else if (
      input.legacyTargetKey !== undefined &&
      input.legacyTargetKey !== null
    ) {
      const legacyField = this.resolveSupplementTargetField(
        input.legacyTargetKey,
      );
      if (!legacyField) {
        throw new BadRequestException(
          `补剂目标营养素 ${input.legacyTargetKey} 不在营养字段目录中`,
        );
      }
      definitions = targetService.validateTargets(profile, [
        { fieldPath: legacyField.fieldPath },
      ]);
    } else {
      const defaults =
        await targetService.resolveDefaultTargets(nutritionFoodId);
      definitions = targetService.validateTargets(profile, defaults);
    }

    if (definitions.length === 0) {
      throw new BadRequestException(
        this.buildMissingSupplementTargetMessage({
          ingredient: null,
          nutritionFood,
        }),
      );
    }

    const totalWeightG = this.resolveSupplementTargetTotalWeightG(input);
    if (
      totalWeightG === null ||
      !(totalWeightG > 0) ||
      !(Number(input.weightG) > 0)
    ) {
      // 总重量还未知（新建草稿/尚未评估）时只落目标定义，浓度等评估后再算
      return definitions.map((definition) =>
        this.toDesignSupplementTarget(definition, null),
      );
    }

    const computed = targetService.computeTargets(
      profile,
      definitions,
      input.weightG,
      totalWeightG,
    );
    return computed.map((target) =>
      this.toDesignSupplementTarget(target, target.targetValuePerKg),
    );
  }

  private resolveSupplementTargetTotalWeightG(input: {
    includeInAssessment: boolean;
    baseTotalWeightG?: number | null;
  }): number | null {
    if (!input.includeInAssessment) {
      return null;
    }

    /**
     * 分母使用草稿当前已知的配方总重量（上一次评估结果）。
     * 新增/改重量后前端会再评估一次并刷新缓存；这里不自行叠加重量，
     * 避免把「已知总重」误当成「尚未包含新原料的总重」重复计数。
     */
    const baseTotalWeightG = Number(input.baseTotalWeightG);
    if (!Number.isFinite(baseTotalWeightG) || baseTotalWeightG <= 0) {
      return null;
    }

    return baseTotalWeightG;
  }

  private toDesignSupplementTarget(
    definition: SupplementTargetDefinition,
    targetValue: number | null,
  ): DesignSupplementTarget {
    return {
      nutrientTargetKey: this.resolveFieldKeyFromPath(definition.fieldPath),
      fieldPath: definition.fieldPath,
      label: definition.label,
      unit: definition.unit,
      targetValue,
      expressionBasis: null,
    };
  }

  private toPublishedSupplementTarget(
    target: SupplementTarget,
  ): PublishedSupplementNutrientTarget {
    const targetField = this.resolveAnySupplementTargetField(target.fieldPath);
    if (!targetField) {
      throw new BadRequestException(
        `补剂目标营养素 ${target.fieldPath} 不在营养字段目录中，无法生成发布数据`,
      );
    }

    return {
      nutrientTargetKey: targetField.fieldKey,
      nutrientTargetValue: target.targetValuePerKg,
      fieldPath: targetField.fieldPath,
      label: targetField.label,
      unit: targetField.unit,
    };
  }

  private requireSupplementTargetService(): SupplementTargetService {
    if (!this.supplementTargetService) {
      throw new BadRequestException(
        '补剂目标服务未配置，无法保存或发布补剂目标',
      );
    }
    return this.supplementTargetService;
  }

  private buildMissingSupplementTargetMessage(item: {
    ingredient?: { name?: string | null } | null;
    nutritionFood?: { name?: string | null } | null;
    nutritionFoodId?: string | null;
  }): string {
    return `补剂原料「${this.resolveSupplementItemLabel(item)}」缺少营养目标：请在添加时选择目标营养素，或为该补剂的营养档案配置默认目标`;
  }

  private resolveSupplementItemLabel(item: {
    ingredient?: { name?: string | null } | null;
    nutritionFood?: { name?: string | null } | null;
    nutritionFoodId?: string | null;
  }): string {
    return (
      this.normalizeOptionalTargetText(item.ingredient?.name) ??
      this.normalizeOptionalTargetText(item.nutritionFood?.name) ??
      this.normalizeOptionalTargetText(item.nutritionFoodId) ??
      '未知补剂'
    );
  }

  private buildLegacySupplementTargetPayload(
    targetKey: string | null | undefined,
    targetValue: number | null | undefined,
  ): Array<Record<string, unknown>> | null {
    if (targetKey === undefined || targetKey === null) {
      return null;
    }
    const normalizedKey = this.normalizeOptionalTargetText(targetKey);
    if (!normalizedKey) {
      throw new BadRequestException('补剂目标的营养素字段不能为空');
    }
    return [
      {
        fieldPath: this.resolveSupplementTargetField(normalizedKey)?.fieldPath,
        nutrientTargetKey: normalizedKey,
        targetValuePerKg:
          typeof targetValue === 'number' && Number.isFinite(targetValue)
            ? targetValue
            : undefined,
      },
    ];
  }

  private buildRemovableSupplementWarnings(
    draft: DesignRecipeWithItems,
    targets: FediafAssessmentTarget[],
  ): RemovableSupplementWarning[] {
    const warnings: RemovableSupplementWarning[] = [];

    for (const item of draft.items) {
      if (
        !this.isItemIncludedInAssessment(item) ||
        this.resolveIngredientType(item) !== IngredientType.SUPPLEMENT
      ) {
        continue;
      }

      const designTargets = this.normalizeDesignSupplementTargets(
        item.supplementTargets,
      );
      if (designTargets.length === 0) {
        continue;
      }

      const assessmentWithoutItem = assessRecipeDraft({
        scenario: draft.fediafDogScenario,
        targets,
        items: this.buildAssessmentItems(draft, item.id),
      });
      if (
        !designTargets.every((target) =>
          this.isSupplementTargetStillSufficientWithoutItem(
            assessmentWithoutItem,
            target,
          ),
        )
      ) {
        continue;
      }

      const targetLabels = designTargets.map((target) => target.label);
      warnings.push({
        itemId: item.id,
        itemName: this.resolveIngredientDisplayName(item),
        targetLabels,
        message: `移除该补剂后，${targetLabels.join('、')}仍然满足最低充足性；是否保留由管理员按配方意图决定。`,
      });
    }

    return warnings;
  }

  private isSupplementTargetStillSufficientWithoutItem(
    assessmentWithoutItem: DesignRecipeAssessmentResult,
    target: DesignSupplementTarget,
  ) {
    const entry = this.findAssessmentEntryBySupplementTargetField(
      assessmentWithoutItem,
      target.fieldPath,
    );
    if (!entry) {
      return false;
    }

    return entry.status !== 'DEFICIENT' && entry.status !== 'MISSING_DATA';
  }

  private findAssessmentEntryBySupplementTargetField(
    assessment: DesignRecipeAssessmentResult,
    fieldPath: string,
  ): AssessmentEntry | undefined {
    return assessment.entries.find((entry) => {
      if (this.isAssessmentRatioEntry(entry)) {
        return false;
      }
      const targetField = this.resolveSupplementTargetField(entry.nutrientKey);
      return targetField?.fieldPath === fieldPath;
    });
  }

  private normalizeDesignSupplementTargets(
    value: unknown,
    legacyTargetKey?: string | null,
    legacyTargetValue?: number | null,
  ): DesignSupplementTarget[] {
    const rawTargets = Array.isArray(value) ? value : [];
    const normalizedTargets: DesignSupplementTarget[] = [];

    for (const rawTarget of rawTargets) {
      const targetRecord = this.asRecord(rawTarget);
      if (!targetRecord) {
        continue;
      }
      const targetKey = this.normalizeOptionalTargetText(
        targetRecord.fieldPath ??
          targetRecord.nutrientTargetKey ??
          targetRecord.nutrientKey ??
          targetRecord.fieldKey,
      );
      if (!targetKey) {
        continue;
      }
      const targetField = this.resolveAnySupplementTargetField(targetKey);
      if (!targetField) {
        continue;
      }
      normalizedTargets.push({
        nutrientTargetKey: targetField.fieldKey,
        fieldPath: targetField.fieldPath,
        label:
          this.normalizeOptionalTargetText(targetRecord.label) ??
          targetField.label,
        unit:
          this.normalizeOptionalTargetText(targetRecord.unit) ??
          targetField.unit,
        targetValue: this.readOptionalFiniteNumber(
          targetRecord.targetValue ?? targetRecord.targetValuePerKg,
        ),
        expressionBasis: this.normalizeOptionalTargetText(
          targetRecord.expressionBasis,
        ),
      });
    }

    if (normalizedTargets.length === 0 && legacyTargetKey) {
      const targetField = this.resolveAnySupplementTargetField(legacyTargetKey);
      if (targetField) {
        normalizedTargets.push({
          nutrientTargetKey: targetField.fieldKey,
          fieldPath: targetField.fieldPath,
          label: targetField.label,
          unit: targetField.unit,
          targetValue: this.readOptionalFiniteNumber(legacyTargetValue),
          expressionBasis: null,
        });
      }
    }

    return [
      ...new Map(
        normalizedTargets.map((target) => [target.fieldPath, target]),
      ).values(),
    ];
  }

  private normalizeCopiedDesignSupplementTargets(item: {
    supplementTargets?: unknown;
    nutrientTargetKey?: string | null;
    nutrientTargetValue?: number | null;
    ingredient?: {
      id?: string | null;
      name?: string | null;
    } | null;
    nutritionFood?: {
      name?: string | null;
      displayNameZh?: string | null;
      mappings?: Array<{
        ingredientId?: string | null;
        isPrimary?: boolean | null;
        ingredient?: { name?: string | null } | null;
      }>;
    } | null;
  }): DesignSupplementTarget[] {
    const targets = this.normalizeDesignSupplementTargets(
      item.supplementTargets,
      item.nutrientTargetKey,
      item.nutrientTargetValue,
    );
    if (targets.length > 0) {
      return targets;
    }

    const displayName =
      item.ingredient?.name ??
      item.nutritionFood?.mappings?.find(
        (mapping) => mapping.ingredientId === item.ingredient?.id,
      )?.ingredient?.name ??
      item.nutritionFood?.mappings?.find((mapping) => mapping.isPrimary)
        ?.ingredient?.name ??
      item.nutritionFood?.mappings?.[0]?.ingredient?.name ??
      item.nutritionFood?.displayNameZh ??
      item.nutritionFood?.name;
    const inferredField =
      inferSupplementTargetFieldFromIngredientName(displayName);
    return inferredField
      ? [toDesignSupplementTargetReference(inferredField, null)]
      : [];
  }

  private normalizeOptionalTargetText(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized || null;
  }

  private readOptionalFiniteNumber(value: unknown): number | null {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private isAssessmentRatioEntry(entry: {
    category?: string;
    expressionBasis?: string;
    calculation?: string;
  }) {
    return (
      entry.category === 'RATIO' ||
      entry.expressionBasis === 'RATIO' ||
      entry.calculation === 'RATIO'
    );
  }

  private resolveSupplementTargetField(targetKey: string) {
    return resolveSupplementTargetFieldReference(targetKey);
  }

  /**
   * 先按完整营养字段目录（含 `derived.*`）解析 fieldPath，
   * 再回落到历史遗留的短 key / 中文别名（`calcium`、`钙` 等）。
   */
  private resolveAnySupplementTargetField(targetKey: string): {
    fieldPath: string;
    fieldKey: string;
    label: string;
    unit: string;
  } | null {
    const normalizedKey = this.normalizeOptionalTargetText(targetKey);
    if (!normalizedKey) {
      return null;
    }

    const direct = findAnyNutritionField(normalizedKey);
    if (direct) {
      return {
        fieldPath: direct.fieldPath,
        fieldKey: this.resolveFieldKeyFromPath(direct.fieldPath),
        label: direct.label,
        unit: direct.unit,
      };
    }

    return this.resolveSupplementTargetField(normalizedKey) ?? null;
  }

  private resolveFieldKeyFromPath(fieldPath: string): string {
    const separatorIndex = fieldPath.indexOf('.');
    return separatorIndex >= 0
      ? fieldPath.slice(separatorIndex + 1)
      : fieldPath;
  }

  private buildPublishedHealthTagAssignments(targetHealthTags: string[]) {
    const healthTagIds = [
      ...new Set(targetHealthTags.map((tag) => tag.trim()).filter(Boolean)),
    ];

    if (healthTagIds.length === 0) {
      return undefined;
    }

    return {
      create: healthTagIds.map((healthTagId) => ({ healthTagId })),
    };
  }

  private buildPublishedNutritionDetailedData(
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
  ) {
    const summary = {
      moisture_pct: this.roundNullable(
        this.calculatePublishedMoisturePercent(assessment),
        2,
      ),
      protein_dm_pct: this.roundNullable(
        assessment.macroMetrics.crudeProtein.dryMatterPercent,
        2,
      ),
      fat_dm_pct: this.roundNullable(
        assessment.macroMetrics.crudeFat.dryMatterPercent,
        2,
      ),
      fiber_dm_pct: this.roundNullable(
        assessment.macroMetrics.fiber.dryMatterPercent,
        2,
      ),
      ash_dm_pct: this.roundNullable(
        assessment.macroMetrics.ash.dryMatterPercent,
        2,
      ),
      carbs_dm_pct: this.roundNullable(
        assessment.macroMetrics.carbohydrate.dryMatterPercent,
        2,
      ),
      ca_p_ratio: this.roundNullable(
        this.calculatePublishedCalciumPhosphorusRatio(assessment),
        2,
      ),
      energy_density_kcal_per_kg: this.roundNullable(
        assessment.energyDensityKcalPerKg,
        0,
      ),
    };

    return {
      ...summary,
      source: 'SETAR_RECIPE_DESIGNER',
      schemaVersion: 1,
      standard: 'FEDIAF_2025',
      scenario: assessment.scenario,
      generatedAt: new Date().toISOString(),
      summary,
      report: this.buildPublishedNutritionReport(draft, assessment),
    };
  }

  /**
   * 构建完整营养报告。
   *
   * `assessment` 可选：发布门槛在同一次请求里已经算过评估时直接传进来，
   * 避免为了检查「报告能不能生成」再跑一遍评估。**不跨请求缓存**，
   * 因此草稿修改后不会拿到旧报告。
   */
  async buildPublishedNutritionDetailedDataForDraft(
    draft: DesignRecipeWithItems,
    assessment?: DesignRecipeAssessmentResult,
  ) {
    const resolvedAssessment =
      assessment ?? (await this.assessLoadedDraft(draft));

    if (resolvedAssessment.energyDensityKcalPerKg === null) {
      throw new BadRequestException('缺少能量数据，无法生成营养报告');
    }

    return this.buildPublishedNutritionDetailedData(
      draft,
      resolvedAssessment,
    );
  }

  /**
   * 计算「发布正式食谱 / 加入订单待提交」的统一门槛。
   *
   * 返回 readiness 和本次使用的评估结果：发布逻辑可以直接复用 assessment，
   * 避免重复计算；报告构建也用同一份评估（仅本次调用内复用，不跨请求缓存）。
   */
  async evaluateDraftLaunchReadiness(
    draft: DesignRecipeWithItems,
    options: { name?: string | null } = {},
  ): Promise<{
    readiness: DraftLaunchReadiness;
    assessment: DesignRecipeAssessmentResult | null;
  }> {
    let assessment: DesignRecipeAssessmentResult | null = null;
    let assessmentError: string | null = null;
    try {
      assessment = await this.assessLoadedDraft(draft);
    } catch (error) {
      assessmentError = this.resolveLaunchReadinessErrorMessage(error);
      this.logger.warn(
        `草稿 ${draft.id} 评估失败，发布门槛按未评估处理：${assessmentError}`,
      );
    }

    /**
     * 报告能不能建出来是硬条件；构建失败只记成 blocker，
     * 绝不让 GET 预览接口 500。评估都失败时不再重复尝试报告。
     */
    let reportAvailable = false;
    let reportError: string | null = null;
    if (assessment) {
      try {
        await this.buildPublishedNutritionDetailedDataForDraft(
          draft,
          assessment,
        );
        reportAvailable = true;
      } catch (error) {
        reportError = this.resolveLaunchReadinessErrorMessage(error);
        this.logger.warn(
          `草稿 ${draft.id} 完整营养报告生成失败：${reportError}`,
        );
      }
    }

    const launchItems: Array<{
      id: string;
      ingredientId?: string | null;
      name: string;
      included: boolean;
      isSupplement: boolean;
      preparationMethod?: string | null;
      preparationNote?: string | null;
      supplementTargets?: unknown;
    }> = [];
    for (const item of draft.items) {
      const isSupplement =
        this.resolveIngredientType(item) === IngredientType.SUPPLEMENT;
      let supplementTargets: unknown = item.supplementTargets;
      if (isSupplement && assessment && assessment.totalWeightG > 0) {
        try {
          const definitions =
            this.requireSupplementTargetService().validateTargets(
              this.toAssessmentNutritionProfile(item),
              item.supplementTargets,
            );
          if (definitions.length > 0) {
            supplementTargets =
              this.requireSupplementTargetService().computeTargets(
                this.toAssessmentNutritionProfile(item),
                definitions,
                item.weightG,
                assessment.totalWeightG,
              );
          }
        } catch (error) {
          this.logger.warn(`launch-readiness supplement target compute failed for ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
          // 保留原值，让共享门槛按缺失/无效目标给出明确阻断。
        }
      }
      launchItems.push({
        id: item.id,
        ingredientId: item.ingredientId,
        name: this.resolveIngredientDisplayName(item),
        included: this.isItemIncludedInAssessment(item),
        isSupplement,
        preparationMethod: item.preparationMethod,
        preparationNote: item.preparationNote,
        supplementTargets,
      });
    }

    // 已保存报告只读取、不自动生成；revision 与当前 contentRevision 不一致即过期。
    const reportGenerated =
      draft.nutritionReportJson !== null &&
      draft.nutritionReportJson !== undefined;
    const reportStale =
      reportGenerated &&
      (draft.nutritionReportRevision ?? null) !== draft.contentRevision;

    const readiness = buildDraftLaunchReadiness({
      draftId: draft.id,
      designMode: draft.series?.designMode ?? RecipeDesignMode.CATALOG,
      name: options.name ?? draft.series?.name ?? draft.name,
      items: launchItems,
      productionStepCount: this.readDraftProductionSteps(
        draft.productionStepsJson,
      ).length,
      assessment: assessment
        ? this.toLaunchReadinessAssessmentSnapshot(assessment)
        : null,
      assessmentError,
      reportAvailable,
      reportGenerated,
      reportStale,
      reportError,
    });

    return { readiness, assessment };
  }

  /**
   * 强制门槛：有阻断项时抛 BadRequest（消息用「；」拼接所有 blockers）。
   * 返回本次评估结果，发布逻辑直接复用。
   */
  async assertDraftLaunchReady(
    draft: DesignRecipeWithItems,
    options: { name?: string | null } = {},
  ): Promise<DesignRecipeAssessmentResult> {
    const { readiness, assessment } =
      await this.evaluateDraftLaunchReadiness(draft, options);
    this.assertLaunchReadinessReady(readiness);
    if (!assessment) {
      // ready=true 时不会出现；防御性兜底，避免调用方拿到 null 继续写库。
      throw new BadRequestException('配方评估未完成，无法继续');
    }
    return assessment;
  }

  private assertLaunchReadinessReady(readiness: DraftLaunchReadiness): void {
    if (readiness.ready) {
      return;
    }
    throw new BadRequestException(
      readiness.blockers.map((blocker) => blocker.message).join('；'),
    );
  }

  private toLaunchReadinessAssessmentSnapshot(
    assessment: DesignRecipeAssessmentResult,
  ): LaunchReadinessAssessmentSnapshot {
    return {
      totalWeightG: assessment.totalWeightG,
      energyDensityKcalPerKg: assessment.energyDensityKcalPerKg,
      dryMatterEnergyDensityKcalPerKg:
        assessment.dryMatterEnergyKcalPer100g !== null
          ? assessment.dryMatterEnergyKcalPer100g * 10
          : null,
      overallStatus: assessment.overallStatus,
      deficientCount: assessment.summary.deficient,
      excessCount: assessment.summary.excess,
      missingDataCount: assessment.summary.missingData,
      dataGaps: assessment.dataGaps.map((gap) => ({
        itemId: gap.itemId,
        itemName: gap.itemName,
        fieldPath: gap.fieldPath,
        fieldLabel: gap.fieldLabel,
      })),
    };
  }

  private resolveLaunchReadinessErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private buildPublishedNutritionReport(
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
  ) {
    return {
      ingredientRows: this.buildPublishedIngredientReportRows(
        draft,
        assessment,
      ),
      macroRows: this.buildPublishedMacroReportRows(assessment),
      energyDensityRows: this.buildPublishedEnergyDensityRows(assessment),
      nutrientSections: this.buildPublishedNutrientSections(assessment),
    };
  }

  private buildPublishedIngredientReportRows(
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
  ) {
    const draftItemById = new Map(
      draft.items.map((item) => [String(item.id), item]),
    );

    return assessment.items.map((assessedItem) => {
      const draftItem = draftItemById.get(String(assessedItem.id));
      const isSupplement =
        draftItem &&
        this.resolveIngredientType(draftItem) === IngredientType.SUPPLEMENT;

      return {
        ingredientName: this.formatPublishedIngredientReportName(
          draftItem,
          draftItem?.nutritionFood.displayNameZh?.trim() ||
            draftItem?.nutritionFood.name ||
            assessedItem.name ||
            '未命名原料',
          Boolean(isSupplement),
        ),
        // 2026-10-14 改版：食材只给重量占比、补剂只给浓度，不再混用同一列「用量」。
        // 原因：食材是克、补剂是粒/片，同一列里没法比较。
        // 小程序食谱详情页本来就是这个口径（见 miniapp formatSupplementTargets）。
        concentrationLabel: isSupplement
          ? this.formatPublishedSupplementConcentration(draftItem)
          : '-',
        weightPercentLabel: isSupplement
          ? '-'
          : this.formatPublishedReportPercent(assessedItem.ratioPercent),
      };
    });
  }

  /**
   * 补剂浓度文案：每kg食材添加{值}{单位}{名称}，多项用「、」连接。
   *
   * 与小程序 `formatSupplementTargets` 同一口径。
   * 优先读 supplementTargets（可多项）；老数据只有 nutrientTargetKey/Value 时退化为单项。
   */
  private formatPublishedSupplementConcentration(
    item: DesignRecipeItemWithFood | undefined,
  ): string {
    const raw = (item as { supplementTargets?: unknown } | undefined)
      ?.supplementTargets;
    if (Array.isArray(raw) && raw.length > 0) {
      const parts = raw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return '';
          const target = entry as Record<string, unknown>;
          // 存量数据里字段名是 targetValue，早期类型定义写的是 targetValuePerKg，两者都认
          const value = this.readFiniteNumber(
            target.targetValue ?? target.targetValuePerKg,
          );
          const unit = String(target.unit ?? '').trim();
          const label = String(target.label ?? '').trim();
          if (value === null || !label) return '';
          return `每kg食材添加${value}${unit}${label}`;
        })
        .filter((text) => text.length > 0);
      if (parts.length > 0) return parts.join('、');
    }

    const key = String(
      (item as { nutrientTargetKey?: unknown } | undefined)
        ?.nutrientTargetKey ?? '',
    ).trim();
    const value = this.readFiniteNumber(
      (item as { nutrientTargetValue?: unknown } | undefined)
        ?.nutrientTargetValue,
    );
    if (key && value !== null) {
      return `每kg食材添加${value}${key}`;
    }
    return '-';
  }

  private readFiniteNumber(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private formatPublishedIngredientReportName(
    item: DesignRecipeItemWithFood | undefined,
    baseName: string,
    isSupplement: boolean,
  ) {
    if (!isSupplement) return baseName;

    const detailLabel = this.resolvePublishedSupplementBrandSpecLabel(item);
    if (detailLabel && baseName.includes(detailLabel)) return baseName;
    return detailLabel ? `${baseName}（${detailLabel}）` : baseName;
  }

  private resolvePublishedSupplementBrandSpecLabel(
    item?: DesignRecipeItemWithFood,
  ) {
    const ingredient = item ? this.resolveItemIngredient(item) : null;
    const parts = [
      normalizeOptionalText(ingredient?.brand),
      normalizeOptionalText(ingredient?.productModel),
    ].filter((part): part is string => Boolean(part));
    return [...new Set(parts)].join(' · ');
  }

  private resolvePublishedSupplementUnit(item?: DesignRecipeItemWithFood) {
    if (!item) return 'g';

    const ingredient = this.resolveItemIngredient(item);
    return (
      normalizeOptionalText(ingredient?.unitDisplayLabel) ||
      readSupplementDisplayUnit(ingredient?.properties) ||
      normalizeOptionalText(ingredient?.purchaseUnit) ||
      'g'
    );
  }

  private buildPublishedMacroReportRows(
    assessment: DesignRecipeAssessmentResult,
  ) {
    const definitions = [
      { key: 'crudeProtein', name: '蛋白质', energyFactor: 3.5 },
      { key: 'crudeFat', name: '脂肪', energyFactor: 8.5 },
      { key: 'ash', name: '灰分', energyFactor: 0 },
      { key: 'moisture', name: '水分', energyFactor: 0 },
      { key: 'fiber', name: '膳食纤维', energyFactor: 0 },
      { key: 'carbohydrate', name: '碳水', energyFactor: 3.5 },
    ] as const;

    return definitions.map((definition) => {
      const metric = assessment.macroMetrics[definition.key];
      const total = metric?.total ?? null;
      const energyPercent =
        total !== null &&
        Number.isFinite(total) &&
        assessment.totalEnergyKcal !== null &&
        assessment.totalEnergyKcal > 0 &&
        definition.energyFactor > 0
          ? (total * definition.energyFactor * 100) / assessment.totalEnergyKcal
          : null;

      return {
        key: definition.key,
        name: definition.name,
        weightPercentLabel:
          total !== null &&
          Number.isFinite(total) &&
          assessment.totalWeightG > 0
            ? this.formatPublishedReportPercent(
                (total * 100) / assessment.totalWeightG,
              )
            : '-',
        dryMatterLabel: this.formatPublishedReportPercent(
          metric?.dryMatterPercent ?? null,
        ),
        energyPercentLabel: this.formatPublishedReportPercent(energyPercent),
      };
    });
  }

  private buildPublishedEnergyDensityRows(
    assessment: DesignRecipeAssessmentResult,
  ) {
    const dryMatterEnergyDensity =
      assessment.dryMatterEnergyKcalPer100g !== null
        ? assessment.dryMatterEnergyKcalPer100g * 10
        : assessment.totalEnergyKcal !== null &&
            assessment.dryMatterG !== null &&
            assessment.dryMatterG > 0
          ? (assessment.totalEnergyKcal / assessment.dryMatterG) * 1000
          : null;

    return [
      {
        label: '每公斤配方',
        value: this.formatPublishedEnergyDensity(
          assessment.energyDensityKcalPerKg,
          'kcal/kg',
        ),
      },
      {
        label: '每公斤干物质',
        value: this.formatPublishedEnergyDensity(
          dryMatterEnergyDensity,
          'kcal/kg DM',
        ),
      },
    ];
  }

  private buildPublishedNutrientSections(
    assessment: DesignRecipeAssessmentResult,
  ) {
    const definitions = [
      { key: 'minerals', title: '微量元素' },
      { key: 'vitamins', title: '维生素' },
      { key: 'aminoAcids', title: '氨基酸' },
      { key: 'fattyAcids', title: '脂肪酸' },
    ] as const;

    return definitions.reduce(
      (sections, definition) => {
        sections[definition.key] = {
          key: definition.key,
          title: definition.title,
          dryMatterHeader: '/100gDM',
          rows: assessment.groupedEntries
            .filter(
              (entry) =>
                this.resolvePublishedNutrientSectionKey(entry) ===
                definition.key,
            )
            .map((entry) => this.buildPublishedNutrientReportRow(entry)),
        };
        return sections;
      },
      {} as Record<
        (typeof definitions)[number]['key'],
        {
          key: string;
          title: string;
          dryMatterHeader: string;
          rows: Array<Record<string, unknown>>;
        }
      >,
    );
  }

  private resolvePublishedNutrientSectionKey(
    entry: AssessmentEntry,
  ): 'minerals' | 'vitamins' | 'aminoAcids' | 'fattyAcids' | null {
    if (entry.category === 'MINERAL' || entry.category === 'RATIO') {
      return 'minerals';
    }
    if (entry.category === 'VITAMIN') return 'vitamins';
    if (entry.category === 'AMINO_ACID') return 'aminoAcids';
    if (entry.category === 'FATTY_ACID') return 'fattyAcids';

    const signature =
      `${entry.nutrientKey ?? ''} ${entry.label ?? ''}`.toLowerCase();
    if (
      /epa|dha|omega|linoleic|linolenic|arachidonic|脂肪酸|亚油酸|花生四烯酸/.test(
        signature,
      )
    ) {
      return 'fattyAcids';
    }
    if (
      /arginine|histidine|isoleucine|leucine|lysine|methionine|cystine|phenylalanine|tyrosine|threonine|tryptophan|valine|氨酸|赖氨酸|精氨酸|组氨酸|蛋氨酸|胱氨酸|苯丙氨酸|酪氨酸/.test(
        signature,
      )
    ) {
      return 'aminoAcids';
    }
    if (
      /calcium|phosphorus|potassium|sodium|chloride|magnesium|zinc|copper|manganese|selenium|iodine|iron|钙|磷|钾|钠|氯|镁|锌|铜|锰|硒|碘|铁/.test(
        signature,
      )
    ) {
      return 'minerals';
    }
    if (/vitamin|维生素/.test(signature)) return 'vitamins';

    return null;
  }

  private buildPublishedNutrientReportRow(
    entry: AssessmentEntry & { details?: AssessmentEntry[] },
  ) {
    const ratio = this.isAssessmentRatioEntry(entry);
    const dryMatterEntry =
      entry.details?.find(
        (detail) => detail.expressionBasis === 'PER_100G_DRY_MATTER',
      ) ?? (entry.expressionBasis === 'PER_100G_DRY_MATTER' ? entry : null);

    return {
      key: entry.nutrientKey,
      name: entry.label,
      unit: ratio ? '比例' : entry.unit,
      minLabel: this.formatPublishedNutrientValue(entry.minValue, ratio),
      maxLabel: this.formatPublishedNutrientValue(entry.maxValue, ratio),
      currentLabel: this.formatPublishedNutrientValue(
        entry.currentValue,
        ratio,
      ),
      dryMatterLabel: ratio
        ? ''
        : this.formatPublishedReportNumber(
            dryMatterEntry?.currentValue ?? null,
          ),
      status: entry.status,
    };
  }

  private formatPublishedReportAmount(value: number | null, unit: string) {
    if (value === null || !Number.isFinite(value)) return '-';
    return `${this.formatPublishedReportNumber(value)}${unit}`;
  }

  private formatPublishedEnergyDensity(value: number | null, unit: string) {
    if (value === null || !Number.isFinite(value)) return '-';
    return `${Math.round(value)} ${unit}`;
  }

  private formatPublishedReportPercent(value: number | null) {
    if (value === null || !Number.isFinite(value)) return '-';
    return `${this.formatPublishedReportNumber(value)}%`;
  }

  private formatPublishedNutrientValue(value: number | null, ratio: boolean) {
    if (value === null || !Number.isFinite(value)) return '-';
    const formatted = this.formatPublishedReportNumber(value);
    return ratio ? `${formatted}:1` : formatted;
  }

  private formatPublishedReportNumber(value: number | null) {
    if (value === null) return '-';
    if (!Number.isFinite(value)) return '-';
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded)
      ? String(rounded)
      : String(rounded).replace(/0+$/, '').replace(/\.$/, '');
  }

  private calculatePublishedCalciumPhosphorusRatio(
    assessment: DesignRecipeAssessmentResult,
  ) {
    const explicitRatio = this.findAssessmentCurrentValue(
      assessment,
      'ca_p_ratio',
    );
    const fallbackRatio =
      this.calculateRatioFromAssessmentNutrientTotals(
        assessment,
        'calcium',
        'phosphorus',
      ) ??
      this.calculateRatioFromAssessmentCurrentValues(
        assessment,
        'calcium',
        'phosphorus',
      );

    if (
      fallbackRatio !== null &&
      Number.isFinite(fallbackRatio) &&
      (explicitRatio === null || explicitRatio <= 0)
    ) {
      return fallbackRatio;
    }

    return explicitRatio;
  }

  private calculateRatioFromAssessmentNutrientTotals(
    assessment: DesignRecipeAssessmentResult,
    numeratorKey: string,
    denominatorKey: string,
  ) {
    const numerator = assessment.nutrients[numeratorKey]?.total ?? null;
    const denominator = assessment.nutrients[denominatorKey]?.total ?? null;

    return this.dividePositiveRatio(numerator, denominator);
  }

  private calculateRatioFromAssessmentCurrentValues(
    assessment: DesignRecipeAssessmentResult,
    numeratorKey: string,
    denominatorKey: string,
  ) {
    return this.dividePositiveRatio(
      this.findAssessmentCurrentValue(assessment, numeratorKey),
      this.findAssessmentCurrentValue(assessment, denominatorKey),
    );
  }

  private dividePositiveRatio(
    numerator: number | null,
    denominator: number | null,
  ) {
    if (
      numerator === null ||
      denominator === null ||
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator <= 0
    ) {
      return null;
    }

    return numerator / denominator;
  }

  private calculatePublishedMoisturePercent(
    assessment: DesignRecipeAssessmentResult,
  ) {
    const moistureTotal = assessment.macroMetrics.moisture.total;
    if (
      moistureTotal !== null &&
      Number.isFinite(moistureTotal) &&
      assessment.totalWeightG > 0
    ) {
      return (moistureTotal / assessment.totalWeightG) * 100;
    }

    if (
      assessment.dryMatterG !== null &&
      Number.isFinite(assessment.dryMatterG) &&
      assessment.totalWeightG > 0
    ) {
      return (
        ((assessment.totalWeightG - assessment.dryMatterG) /
          assessment.totalWeightG) *
        100
      );
    }

    return null;
  }

  private findAssessmentCurrentValue(
    assessment: DesignRecipeAssessmentResult,
    nutrientKey: string,
  ) {
    return (
      assessment.groupedEntries.find(
        (entry) => entry.nutrientKey === nutrientKey,
      )?.currentValue ??
      assessment.entries.find((entry) => entry.nutrientKey === nutrientKey)
        ?.currentValue ??
      null
    );
  }

  private roundNullable(value: number | null, precision: number) {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    const scale = 10 ** precision;
    return Math.round(value * scale) / scale;
  }

  private async loadDraft(id: string): Promise<DesignRecipeWithItems> {
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      include: DESIGN_RECIPE_INCLUDE,
    });

    if (!draft) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    return draft as DesignRecipeWithItems;
  }

  /**
   * 谁可以编辑一条草稿：
   * - 草稿作者本人；
   * - 内部员工（STAFF / ADMIN）可以编辑其他内部员工创建的草稿。
   *
   * 为什么内部员工之间要互相可编辑：同一系列的「阶段草稿」在团队里是共享的——
   * createSeriesStageDraft 会直接复用该阶段已存在的草稿（不区分作者），
   * getDraft 也允许内部员工查看任意内部草稿。如果写入仍然只认作者，
   * 后进入编辑器的同事就会「能打开、一保存就报 not found」，把保存队列卡死。
   * 读取权限与写入权限必须一致。
   *
   * 顾客仍然只能编辑自己的草稿，且不能碰内部员工的草稿。
   */
  private async canContextEditDraft(
    draft: { createdBy?: string | null },
    context: RecipeDesignerAccessContext,
  ): Promise<boolean> {
    if (draft.createdBy === context.userId) {
      return true;
    }

    if (!isInternalRecipeDesignerRole(context)) {
      return false;
    }

    return this.isInternalRecipeDesignerCreatorId(draft.createdBy);
  }

  private async assertDraftEditableByUser(
    id: string,
    context: RecipeDesignerAccessContext,
  ) {
    const draft = await this.prisma.designRecipe.findUnique({
      where: { id },
      select: {
        id: true,
        createdBy: true,
        status: true,
        publishedRecipeId: true,
        publishedAt: true,
        seriesId: true,
        seriesLifeStage: true,
        // 补剂目标浓度缓存需要知道当前配方总重量（未知时留空）
        totalWeightG: true,
      },
    });

    if (!draft) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    await this.assertEditableDraft(draft, id, context);
    return draft;
  }

  private async assertItemEditableByUser(
    itemId: string,
    context: RecipeDesignerAccessContext,
  ) {
    const item = await this.prisma.designRecipeItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        // 预处理更新需要在同一次查询里带回当前值，避免再把 AUTO 误翻成 MANUAL
        preparationMethod: true,
        preparationNote: true,
        preparationSource: true,
        designRecipe: {
          select: {
            id: true,
            createdBy: true,
            status: true,
            publishedRecipeId: true,
            publishedAt: true,
            totalWeightG: true,
          },
        },
      },
    });

    if (!item?.designRecipe) {
      throw new NotFoundException(`Design recipe item ${itemId} not found`);
    }

    await this.assertEditableDraft(item.designRecipe, item.designRecipe.id, {
      ...context,
      notFoundMessage: `Design recipe item ${itemId} not found`,
    });

    return {
      ...item.designRecipe,
      preparationMethod: item.preparationMethod,
      preparationNote: item.preparationNote,
      preparationSource: item.preparationSource,
    };
  }

  private async assertEditableDraft(
    draft: EditableDesignRecipeRecord | null,
    id: string,
    context: RecipeDesignerAccessContext & { notFoundMessage?: string },
  ) {
    const notFoundMessage =
      context.notFoundMessage ?? `Design recipe ${id} not found`;

    if (!draft || !(await this.canContextEditDraft(draft, context))) {
      throw new NotFoundException(notFoundMessage);
    }

    if (this.isPublishedDraft(draft)) {
      throw new BadRequestException('已发布草稿不能编辑');
    }
  }

  private isPublishedDraft(draft: {
    status?: string;
    publishedRecipeId?: string | null;
    publishedAt?: Date | null;
  }) {
    return (
      draft.status === DesignRecipeStatus.PUBLISHED ||
      Boolean(draft.publishedRecipeId || draft.publishedAt)
    );
  }

  private async assessLoadedDraft(
    draft: DesignRecipeWithItems,
    targets?: FediafAssessmentTarget[],
  ): Promise<DesignRecipeAssessmentResult> {
    const resolvedTargets =
      targets ??
      (await this.targetProvider.getTargets(draft.fediafDogScenario));

    return assessRecipeDraft({
      scenario: draft.fediafDogScenario,
      targets: resolvedTargets,
      items: this.buildAssessmentItems(draft),
    });
  }

  private buildAssessmentItems(
    draft: DesignRecipeWithItems,
    omittedItemId?: string,
  ) {
    return draft.items
      .filter((item) => this.isItemIncludedInAssessment(item))
      .filter((item) => item.id !== omittedItemId)
      .map((item) => ({
        id: item.id,
        name: this.resolveIngredientDisplayName(item),
        ingredientType: this.resolveIngredientType(item),
        weightG: item.weightG,
        nutritionProfile: this.toAssessmentNutritionProfile(item),
      }));
  }

  private isItemIncludedInAssessment(item: DesignRecipeItemWithFood) {
    return item.includeInAssessment !== false;
  }

  private toAssessmentNutritionProfile(
    item: DesignRecipeItemWithFood,
  ): NutritionProfile | null {
    const profile = this.toNutritionProfile(item.nutritionFood.nutritionData);

    return this.withSupplementServingUnit(profile, item);
  }

  private withSupplementServingUnit(
    profile: NutritionProfile | null,
    item: DesignRecipeItemWithFood,
  ): NutritionProfile | null {
    if (
      !profile ||
      this.resolveIngredientType(item) !== IngredientType.SUPPLEMENT
    ) {
      return profile;
    }

    const meta = (profile as any).meta ?? {};
    if (
      meta.rawBasisType !== 'PER_SERVING' ||
      meta.servingUnitLabel ||
      meta.amountUnitLabel ||
      meta.usageUnit
    ) {
      return profile;
    }

    const servingUnitLabel = this.resolveSupplementServingUnitLabel(item);
    if (!servingUnitLabel) {
      return profile;
    }

    return {
      ...profile,
      meta: {
        ...meta,
        amountUnitLabel: servingUnitLabel,
        servingUnitLabel,
        usageUnit: servingUnitLabel,
      },
    };
  }

  private toNutritionProfile(nutritionData: unknown): NutritionProfile | null {
    if (!nutritionData || typeof nutritionData !== 'object') {
      return null;
    }

    if (this.isGroupedNutritionProfile(nutritionData)) {
      return normalizeNutritionProfile(nutritionData as NutritionProfile);
    }

    return nutritionDataToNutritionProfile(
      nutritionData as Record<string, unknown>,
    );
  }

  private isGroupedNutritionProfile(value: object): boolean {
    return (
      'meta' in value ||
      'macros' in value ||
      'minerals' in value ||
      'vitamins' in value ||
      'fattyAcids' in value ||
      'aminoAcids' in value ||
      'items' in value
    );
  }

  private buildAssessmentUpdateData(result: DesignRecipeAssessmentResult) {
    const missingDataReport = result.groupedEntries
      .filter((entry) => entry.status === 'MISSING_DATA')
      .map((entry) => ({
        nutrientKey: entry.nutrientKey,
        label: entry.label,
        fieldStatus: entry.status,
      }));
    const hasAssessmentItems = result.items.length > 0;
    const isCompliant = result.overallStatus === 'COMPLIANT';

    return {
      totalWeightG: result.totalWeightG,
      energyDensityKcalPerKg: result.energyDensityKcalPerKg,
      calculatedNutrition: this.toJsonValue(result.nutrients),
      complianceStatus: this.toJsonValue(result.groupedEntries),
      assessmentSummary: this.toJsonValue({
        overallStatus: result.overallStatus,
        summary: result.summary,
        rawSummary: result.rawSummary,
        rawEntryCount: result.entries.length,
      }),
      missingDataReport: this.toJsonValue(missingDataReport),
      isCompliant,
      status: !hasAssessmentItems
        ? DesignRecipeStatus.DRAFT
        : isCompliant
          ? DesignRecipeStatus.COMPLIANT
          : DesignRecipeStatus.NEEDS_REVIEW,
      reviewStatus:
        !hasAssessmentItems || isCompliant
          ? DesignRecipeReviewStatus.NONE
          : DesignRecipeReviewStatus.REQUIRED,
    };
  }

  private toClientAssessmentResult(
    result: DesignRecipeAssessmentResult,
    removableSupplementWarnings: RemovableSupplementWarning[] = [],
    allergenWarnings: DraftAllergenWarning[] = [],
  ): ClientDesignRecipeAssessmentResult {
    const clientResult: Partial<DesignRecipeAssessmentResult> = { ...result };
    delete clientResult.entries;
    /**
     * 列表只需要每个营养素一行；contributors（每项最多 20 个原料）
     * 和 details（每种口径的完整副本）会让一次响应膨胀到数百 KB。
     * 点击某一行时再通过 assessContributors 单独取。
     */
    clientResult.groupedEntries = result.groupedEntries.map(
      ({ contributors: _contributors, details: _details, ...entry }) => entry,
    ) as DesignRecipeAssessmentResult['groupedEntries'];
    return {
      ...clientResult,
      removableSupplementWarnings,
      allergenWarnings,
    } as ClientDesignRecipeAssessmentResult;
  }

  private resolveIngredientId(item: DesignRecipeItemWithFood): string {
    if (item.ingredientId) {
      return item.ingredientId;
    }

    const mappings = item.nutritionFood.mappings ?? [];
    const mapping =
      mappings.find((candidate) => candidate.isPrimary) ?? mappings[0];

    if (!mapping?.ingredientId) {
      throw new BadRequestException(
        `营养原料 ${item.nutritionFood.name} 未映射采购原料，无法发布正式食谱`,
      );
    }

    return mapping.ingredientId;
  }

  private async resolveDesignItemIngredientId(dto: AddRecipeDesignItemDto) {
    if (!dto.ingredientId) {
      return null;
    }

    const mapping = await this.prisma.nutritionFoodMapping.findFirst({
      where: {
        ingredientId: dto.ingredientId,
        nutritionFoodId: dto.nutritionFoodId,
      },
      select: { id: true },
    });

    if (!mapping) {
      throw new BadRequestException('所选标准原料和营养档案未建立映射');
    }

    return dto.ingredientId;
  }

  private async isIngredientIdSupplement(ingredientId: string | null) {
    if (!ingredientId) {
      return false;
    }

    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: ingredientId },
      select: { id: true, type: true },
      take: 1,
    });

    return (
      Array.isArray(ingredients) &&
      ingredients[0]?.type === IngredientType.SUPPLEMENT
    );
  }

  private async resolveDesignItemPreparationMethod(
    explicitPreparationMethod: string | null | undefined,
    ingredientId: string | null,
    nutritionFoodId?: string | null,
  ) {
    const normalizedExplicit = this.normalizePreparationMethod(
      explicitPreparationMethod,
    );
    if (normalizedExplicit) {
      // 人工显式填写的内容不做改写
      return normalizedExplicit;
    }

    if (!ingredientId) {
      return null;
    }

    const fallback =
      await this.resolveDefaultPreparationMethodForIngredient(ingredientId);

    // 自动生成的默认文案必须与所选营养档案的称重口径一致，
    // 否则会出现「档案是熟、文案却写生重」这类矛盾。
    return alignPreparationMethodBasis(
      fallback,
      await this.resolveNutritionFoodPreparationState(nutritionFoodId),
    );
  }

  /** 读取营养档案的制备状态（决定称重口径：生/熟/干…） */
  private async resolveNutritionFoodPreparationState(
    nutritionFoodId?: string | null,
  ): Promise<string | null> {
    const id = nutritionFoodId?.trim();
    if (!id) {
      return null;
    }

    const nutritionFood = await this.prisma.nutritionFood.findUnique({
      where: { id },
      select: { preparationState: true },
    });

    return nutritionFood?.preparationState ?? null;
  }

  private normalizePreparationMethod(value: string | null | undefined) {
    return normalizePreparationMethodHistoryText(value) ?? null;
  }

  /**
   * 预处理补充说明（2026-10-22 · Task 4）。
   *
   * 写入路径严格限制 500 字符（DTO 也会拦一次，服务层保证内部调用不越界）；
   * 存量数据读取/复制用 `normalizeStoredPreparationNote`，只截断不抛错。
   */
  private normalizePreparationNote(value: string | null | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > RECIPE_PREPARATION_NOTE_MAX_LENGTH) {
      throw new BadRequestException(
        `原料预处理补充说明不能超过 ${RECIPE_PREPARATION_NOTE_MAX_LENGTH} 个字符`,
      );
    }
    return trimmed;
  }

  private normalizeStoredPreparationNote(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed
      ? trimmed.slice(0, RECIPE_PREPARATION_NOTE_MAX_LENGTH)
      : null;
  }

  private parsePreparationSourceInput(
    value: RecipePreparationSource | null | undefined,
  ): RecipePreparationSource | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (value === 'AUTO' || value === 'MANUAL') {
      return value;
    }
    throw new BadRequestException('原料预处理来源只能是 AUTO 或 MANUAL');
  }

  private normalizeStoredPreparationSource(
    value: unknown,
  ): RecipePreparationSource | null {
    return value === 'AUTO' || value === 'MANUAL' ? value : null;
  }

  /**
   * 新增原料时的预处理默认来源：
   * - 显式填写了 method 或补充说明 → MANUAL（调用方显式传 AUTO 时尊重调用方）；
   * - 只有系统按原料历史/档案自动解析出的 method → AUTO；
   * - 什么都没有 → null。
   */
  private buildPreparationCreateData(input: {
    explicitMethod: string | null | undefined;
    explicitNote: string | null | undefined;
    explicitSource: RecipePreparationSource | null | undefined;
    resolvedMethod: string | null;
  }) {
    const explicitMethod = this.normalizePreparationMethod(
      input.explicitMethod,
    );
    const method = this.normalizePreparationMethod(input.resolvedMethod);
    const note = this.normalizePreparationNote(input.explicitNote);
    const hasExplicitContent = Boolean(explicitMethod) || Boolean(note);
    const preparationSource = hasExplicitContent
      ? (input.explicitSource ?? 'MANUAL')
      : method
        ? (input.explicitSource ?? 'AUTO')
        : null;

    return {
      preparationMethod: method,
      preparationNote: note,
      preparationSource,
    };
  }

  /**
   * 修改原料时的预处理字段（2026-10-22 · Task 4）。
   *
   * 只有传了 method / note / source 才写这几列；保存队列回传未修改的旧值时
   * 不把 AUTO 误翻成 MANUAL（内容没变就保留原来源）。
   */
  private buildPreparationUpdateData(input: {
    explicitMethod: string | null | undefined;
    explicitNote: string | null | undefined;
    explicitSource: RecipePreparationSource | null | undefined;
    currentMethod: string | null | undefined;
    currentNote: string | null | undefined;
    currentSource: string | null | undefined;
  }) {
    const currentMethod = this.normalizePreparationMethod(input.currentMethod);
    const currentNote = this.normalizeStoredPreparationNote(input.currentNote);
    const nextMethod =
      input.explicitMethod !== undefined
        ? this.normalizePreparationMethod(input.explicitMethod)
        : currentMethod;
    const nextNote =
      input.explicitNote !== undefined
        ? this.normalizePreparationNote(input.explicitNote)
        : currentNote;
    const contentChanged =
      nextMethod !== currentMethod || nextNote !== currentNote;

    let preparationSource: RecipePreparationSource | null;
    if (input.explicitSource !== undefined) {
      preparationSource = input.explicitSource;
    } else if (contentChanged) {
      preparationSource = nextMethod || nextNote ? 'MANUAL' : null;
    } else {
      preparationSource = this.normalizeStoredPreparationSource(
        input.currentSource,
      );
    }

    return {
      preparationMethod: nextMethod,
      preparationNote: nextNote,
      preparationSource,
    };
  }

  /** 发布/私密快照写库前的预处理字段（保留显式来源，自动兜底标 AUTO）。 */
  private resolveSnapshotPreparation(input: {
    note: string | null | undefined;
    source: string | null | undefined;
    usedAutomaticFallback: boolean;
  }) {
    return {
      preparationNote: this.normalizeStoredPreparationNote(input.note),
      preparationSource:
        this.normalizeStoredPreparationSource(input.source) ??
        (input.usedAutomaticFallback ? 'AUTO' : null),
    };
  }

  /** 制作步骤读取（GET / 私有快照展示）：坏条目丢弃，避免脏数据锁死编辑器。 */
  private readDraftProductionSteps(value: unknown): ProductionStep[] {
    return readProductionSteps(value);
  }

  /** 制作步骤写入（PATCH / 发布 / 私密快照）：任何一条不合法都 400。 */
  private validateDraftProductionSteps(
    value: unknown,
    options: { allowEmpty?: boolean } = {},
  ): ProductionStep[] {
    if (options.allowEmpty && (value === null || value === undefined)) {
      return [];
    }
    const result = validateProductionSteps(value);
    if (!result.ok) {
      throw new BadRequestException(result.error);
    }
    return result.steps;
  }

  private buildProductionStepsSnapshotData(value: unknown): {
    productionStepsJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
  } {
    const steps = this.validateDraftProductionSteps(value, {
      allowEmpty: true,
    });
    return {
      productionStepsJson:
        steps.length > 0 ? this.toJsonValue(steps) : Prisma.DbNull,
    };
  }

  private async resolveDefaultPreparationMethodForIngredient(
    ingredientId: string,
  ) {
    const defaults = await this.loadDefaultPreparationMethodMap([ingredientId]);
    return defaults.get(ingredientId) ?? null;
  }

  private async loadDefaultPreparationMethodMap(ingredientIds: string[]) {
    const uniqueIngredientIds = [...new Set(ingredientIds.filter(Boolean))];
    const defaults = new Map<string, string>();
    if (uniqueIngredientIds.length === 0) {
      return defaults;
    }

    const rows = await this.prisma.recipeItem.findMany({
      where: {
        ingredientId: { in: uniqueIngredientIds },
        preparationMethod: { not: null },
        recipe: { isCustomRecipe: false },
      },
      select: {
        ingredientId: true,
        preparationMethod: true,
        recipe: { select: { updatedAt: true } },
      },
      orderBy: {
        recipe: { updatedAt: 'desc' },
      },
    });
    const methodMap = await this.loadPreparationMethodNameMap(
      rows.map((row) => row.preparationMethod),
    );

    for (const row of rows) {
      if (defaults.has(row.ingredientId)) {
        continue;
      }

      const readable = resolvePreparationMethodText(
        row.preparationMethod,
        methodMap,
        { preserveUnresolvedLegacy: false },
      );
      const normalized = this.normalizePreparationMethod(readable);
      if (normalized) {
        defaults.set(row.ingredientId, normalized);
      }
    }

    return defaults;
  }

  private async loadPreparationMethodNameMap(
    values: Array<string | null | undefined>,
  ) {
    const ids = extractLegacyPreparationMethodIds(values);
    if (ids.length === 0) {
      return new Map<string, string>();
    }

    const methods = await this.prisma.preparationMethod.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });

    return new Map(methods.map((method) => [method.id, method.name] as const));
  }

  private async loadPreparationMethodOptions() {
    const methods = await this.prisma.preparationMethod.findMany({
      select: { id: true, name: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    });
    return methods.map((method) => ({ id: method.id, name: method.name }));
  }

  /**
   * 为草稿明细补充展示用字段（不改变原始存储值，小程序兼容）：
   * - items[].preparationMethodLabel：烹饪方式文字名（UUID 解析为名称，旧文本原样保留）
   * - preparationMethodOptions：全部可选烹饪方式（供编辑器下拉使用）
   */
  private async withPreparationMethodLabels<T extends DesignRecipeWithItems>(
    draft: T,
  ): Promise<T> {
    const methodMap = await this.loadPreparationMethodNameMap(
      (draft.items ?? []).map((item) => item.preparationMethod),
    );
    const preparationMethodOptions = await this.loadPreparationMethodOptions();
    return {
      ...draft,
      preparationMethodOptions,
      items: (draft.items ?? []).map((item) => ({
        ...item,
        preparationMethodLabel:
          resolvePreparationMethodText(item.preparationMethod, methodMap) ??
          null,
      })),
    } as T;
  }

  /**
   * 用代码核对 AI 推荐的食材里有没有这只狗的过敏原（2026-10-04 第一期）。
   *
   * 提示词里那句「过敏食材必须硬性避开」只是**请求**，不是**保证**。
   * 这里把它变成保证：命中的食材从 recommendations 里摘掉，
   * 改记到 avoidIngredients，并写一条 warning 让人看得见发生过什么。
   *
   * 保守方向：命中的一律摘掉（不分确诊/可疑）——
   * 这是**机器在自动推荐**，宁可少推一个，也不能推错一个。
   * 营养师手动加食材是另一条路（那边是提示 + 人工确认，不硬拦）。
   */
  private async screenAiRecommendationsAgainstAllergens(
    result: IngredientRecommendationResult,
    profile: AiWizardDogProfile,
  ): Promise<IngredientRecommendationResult> {
    const dogAllergens = splitAllergyKeywords(profile.allergyFoods);
    if (dogAllergens.length === 0 || !this.allergenVocabulary) {
      return result;
    }

    const kept: typeof result.recommendations = [];
    const blocked: Array<{ name: string; reason: string }> = [];

    for (const recommendation of result.recommendations) {
      const hits = await this.allergenVocabulary.matchIngredients({
        dogAllergens,
        ingredientNames: [recommendation.name],
      });

      if (hits.length === 0) {
        kept.push(recommendation);
        continue;
      }

      const names = Array.from(new Set(hits.map((hit) => hit.allergen)));
      blocked.push({
        name: recommendation.name,
        reason: `命中档案里的过敏原：${names.join('、')}`,
      });
    }

    if (blocked.length === 0) {
      return result;
    }

    // 已经因为别的原因（疾病禁忌、挑食）被列进 avoidIngredients 的不要重复
    const existingAvoid = new Set(
      result.avoidIngredients.map((item) => item.name),
    );
    const mergedAvoid = [
      ...result.avoidIngredients,
      ...blocked.filter((item) => !existingAvoid.has(item.name)),
    ];

    return {
      ...result,
      recommendations: kept,
      avoidIngredients: mergedAvoid,
      warnings: [
        ...result.warnings,
        `系统已拦下 ${blocked.length} 项含过敏原的 AI 推荐：${blocked
          .map((item) => item.name)
          .join('、')}`,
      ],
    };
  }

  private resolveIngredientDisplayName(item: DesignRecipeItemWithFood) {
    if (item.ingredient?.name) {
      return item.ingredient.name;
    }

    const mappings = item.nutritionFood.mappings ?? [];
    const mapping =
      mappings.find(
        (candidate) => candidate.ingredientId === item.ingredientId,
      ) ??
      mappings.find((candidate) => candidate.isPrimary) ??
      mappings[0];

    return mapping?.ingredient?.name ?? item.nutritionFood.name;
  }

  private resolveIngredientType(item: DesignRecipeItemWithFood) {
    if (item.ingredient?.type) {
      return item.ingredient.type;
    }

    const mappings = item.nutritionFood.mappings ?? [];
    const mapping =
      mappings.find(
        (candidate) => candidate.ingredientId === item.ingredientId,
      ) ??
      mappings.find((candidate) => candidate.isPrimary) ??
      mappings[0];

    return mapping?.ingredient?.type ?? null;
  }

  private resolveSupplementServingUnitLabel(item: DesignRecipeItemWithFood) {
    const ingredient = this.resolveItemIngredient(item);

    return (
      normalizeOptionalText(ingredient?.unitDisplayLabel) ??
      readSupplementDisplayUnit(ingredient?.properties) ??
      normalizeOptionalText(ingredient?.purchaseUnit)
    );
  }

  private resolveItemIngredient(
    item: DesignRecipeItemWithFood,
  ): DesignRecipeItemIngredient | null {
    if (item.ingredient) {
      return item.ingredient;
    }

    const mappings = item.nutritionFood.mappings ?? [];
    const mapping =
      mappings.find(
        (candidate) => candidate.ingredientId === item.ingredientId,
      ) ??
      mappings.find((candidate) => candidate.isPrimary) ??
      mappings[0];

    return mapping?.ingredient ?? null;
  }

  private toIngredientOption(
    ingredient: IngredientOptionRecord,
    nutrientTarget?: IngredientNutrientSearchTarget | null,
  ) {
    const nutritionProfiles = ingredient.nutritionFoodMappings
      .map((mapping) => {
        const nutrientMatch = nutrientTarget
          ? this.calculateIngredientNutrientMatch(
              mapping.nutritionFood.nutritionData,
              nutrientTarget,
              ingredient.type,
              mapping.nutritionFood.category,
              this.resolveIngredientDisplayUnit(ingredient),
            )
          : null;

        return {
          mappingId: mapping.id,
          nutritionFoodId: mapping.nutritionFoodId,
          name: resolveNutritionProfileDisplayName(
            ingredient.name,
            mapping.nutritionFood,
          ),
          nameEn: getNutritionProfileSourceName(mapping.nutritionFood),
          category: mapping.nutritionFood.category,
          dataSource: mapping.nutritionFood.dataSource,
          status: mapping.nutritionFood.status,
          yieldRate: mapping.yieldRate,
          isPrimary: mapping.isPrimary,
          notes: mapping.notes,
          ...(nutrientMatch ? { nutrientMatch } : {}),
        };
      })
      .sort((left, right) => {
        if (nutrientTarget && ingredient.type !== IngredientType.SUPPLEMENT) {
          const leftScore = left.nutrientMatch?.score ?? -1;
          const rightScore = right.nutrientMatch?.score ?? -1;
          if (leftScore !== rightScore) {
            return rightScore - leftScore;
          }
        }

        if (left.isPrimary !== right.isPrimary) {
          return left.isPrimary ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
    const defaultProfile = nutrientTarget
      ? (nutritionProfiles.find(
          (profile) => profile.isPrimary && profile.nutrientMatch,
        ) ??
        nutritionProfiles.find((profile) => profile.nutrientMatch) ??
        nutritionProfiles.find((profile) => profile.isPrimary) ??
        nutritionProfiles[0] ??
        null)
      : (nutritionProfiles.find((profile) => profile.isPrimary) ??
        nutritionProfiles[0] ??
        null);

    return {
      id: ingredient.id,
      name: ingredient.name,
      type: ingredient.type,
      purchaseUnit: resolveRecipeDesignerIngredientUnit(ingredient),
      brand: ingredient.brand,
      productModel: ingredient.productModel,
      defaultNutritionFoodId: defaultProfile?.nutritionFoodId ?? null,
      nutritionProfiles,
      ...(defaultProfile?.nutrientMatch
        ? { nutrientMatch: defaultProfile.nutrientMatch }
        : {}),
    };
  }

  private buildIngredientOptionSelect(includeNutritionData: boolean) {
    return {
      id: true,
      name: true,
      type: true,
      unitDisplayLabel: true,
      purchaseUnit: true,
      properties: true,
      brand: true,
      productModel: true,
      nutritionFoodMappings: {
        where: { nutritionFood: { status: NutritionFoodStatus.VERIFIED } },
        select: {
          id: true,
          nutritionFoodId: true,
          yieldRate: true,
          isPrimary: true,
          notes: true,
          nutritionFood: {
            select: {
              id: true,
              name: true,
              nameEn: true,
              displayNameZh: true,
              category: true,
              dataSource: true,
              status: true,
              ...(includeNutritionData ? { nutritionData: true } : {}),
            },
          },
        },
      },
    };
  }

  private async resolveIngredientNutrientSearchTarget(
    dto: ListRecipeDesignerIngredientOptionsDto,
  ): Promise<IngredientNutrientSearchTarget | null> {
    const nutrientKey = dto.nutrientKey?.trim();
    if (!nutrientKey) {
      return null;
    }

    const scenario = (dto.scenario ?? 'ADULT_MER_110') as FediafDogScenarioCode;
    const targets = await this.targetProvider.getTargets(scenario);
    const target =
      targets.find(
        (candidate) =>
          candidate.nutrientKey === nutrientKey &&
          candidate.expressionBasis === dto.expressionBasis,
      ) ??
      targets.find(
        (candidate) =>
          candidate.nutrientKey === nutrientKey &&
          candidate.expressionBasis === 'PER_1000_KCAL_ME',
      ) ??
      targets.find((candidate) => candidate.nutrientKey === nutrientKey);

    if (!target || this.isRatioTarget(target)) {
      return null;
    }

    return {
      nutrientKey: target.nutrientKey,
      label: target.label,
      fieldPaths: target.fieldPaths,
      unit: target.unit,
      expressionBasis: target.expressionBasis,
    };
  }

  private isRatioTarget(target: FediafAssessmentTarget) {
    return (
      target.category === 'RATIO' ||
      target.expressionBasis === 'RATIO' ||
      target.calculation === 'RATIO'
    );
  }

  private calculateIngredientNutrientMatch(
    nutritionData: unknown,
    target: IngredientNutrientSearchTarget,
    ingredientType: IngredientType,
    nutritionFoodCategory: NutritionFoodCategory,
    ingredientUnit?: string | null,
  ): IngredientNutrientMatch | null {
    if (
      ingredientType === IngredientType.SUPPLEMENT ||
      nutritionFoodCategory === NutritionFoodCategory.SUPPLEMENT
    ) {
      return this.calculateSupplementNutrientMatch(
        nutritionData,
        target,
        ingredientUnit,
      );
    }

    return this.calculateNutritionFoodNutrientMatch(nutritionData, target);
  }

  private calculateSupplementNutrientMatch(
    nutritionData: unknown,
    target: IngredientNutrientSearchTarget,
    ingredientUnit?: string | null,
  ): IngredientNutrientMatch | null {
    const profile = this.toNutritionProfile(nutritionData);
    const amount = this.getCombinedRawAmount(profile, target);

    if (amount === null || amount <= 0) {
      return null;
    }

    const basis = this.getSupplementNutrientMatchBasis(profile);
    if (!basis) {
      return null;
    }

    const basisLabel = this.getSupplementNutrientMatchBasisLabel(
      profile,
      ingredientUnit,
    );

    return {
      nutrientKey: target.nutrientKey,
      label: target.label,
      amount,
      unit: target.unit,
      basis,
      basisLabel,
      displayText: `${formatNutrientMatchAmount(amount)}${target.unit}${basisLabel}`,
      score: amount,
    };
  }

  private calculateNutritionFoodNutrientMatch(
    nutritionData: unknown,
    target: IngredientNutrientSearchTarget,
  ): IngredientNutrientMatch | null {
    const profile = this.toNutritionProfile(nutritionData);
    const amountPer100g = this.getCombinedAmountPer100g(profile, target);

    if (amountPer100g === null || amountPer100g <= 0) {
      return null;
    }

    const basis = 'PER_100_G';
    const basisLabel = '/100g';

    return {
      nutrientKey: target.nutrientKey,
      label: target.label,
      amount: amountPer100g,
      unit: target.unit,
      basis,
      basisLabel,
      displayText: `${formatNutrientMatchAmount(amountPer100g)}${target.unit}${basisLabel}`,
      score: amountPer100g,
    };
  }

  private getCombinedRawAmount(
    profile: NutritionProfile | null,
    target: IngredientNutrientSearchTarget,
  ): number | null {
    const sourceUnit = getCompatibleSourceUnit(target.fieldPaths, target.unit);
    if (!sourceUnit) {
      return null;
    }

    let total = 0;
    for (const fieldPath of target.fieldPaths) {
      const value = getNutritionProfileFieldValue(profile, fieldPath);
      if (value === undefined) {
        return null;
      }
      total += value;
    }

    return total > 0 ? convertUnitValue(total, sourceUnit, target.unit) : null;
  }

  private getCombinedAmountPer100g(
    profile: NutritionProfile | null,
    target: IngredientNutrientSearchTarget,
  ): number | null {
    const sourceUnit = getCompatibleSourceUnit(target.fieldPaths, target.unit);
    if (!sourceUnit) {
      return null;
    }

    let total = 0;
    for (const fieldPath of target.fieldPaths) {
      const read = readProfileValuePer100g(profile, fieldPath);
      if (read.missing || read.valuePer100g === null) {
        return null;
      }
      total += read.valuePer100g;
    }

    return convertUnitValue(total, sourceUnit, target.unit);
  }

  private getNutrientMatchBasisLabel(
    expressionBasis: AssessmentExpressionBasis,
  ) {
    switch (expressionBasis) {
      case 'PER_1000_KCAL_ME':
        return '/1000kcal ME';
      case 'PER_MJ_ME':
        return '/MJ ME';
      case 'PER_100G_DRY_MATTER':
        return '/100g干物质';
      default:
        return '/100g';
    }
  }

  private getSupplementNutrientMatchBasis(
    profile: NutritionProfile | null,
  ): string | null {
    const rawBasisType = (profile as any)?.meta?.rawBasisType;
    return typeof rawBasisType === 'string' ? rawBasisType : null;
  }

  private getSupplementNutrientMatchBasisLabel(
    profile: NutritionProfile | null,
    ingredientUnit?: string | null,
  ) {
    const meta = ((profile as any)?.meta ?? {}) as Record<string, unknown>;
    switch (meta.rawBasisType) {
      case 'PER_1_G':
        return '/g';
      case 'PER_100_G':
        return '/100g';
      case 'PER_1_ML':
        return '/ml';
      case 'PER_100_ML':
        return '/100ml';
      case 'PER_SERVING': {
        const servingUnit =
          meta.servingUnitLabel ??
          meta.amountUnitLabel ??
          meta.usageUnit ??
          ingredientUnit;
        return `/${typeof servingUnit === 'string' && servingUnit.trim() ? servingUnit.trim() : '份'}`;
      }
      default:
        return '';
    }
  }

  /** 补剂规格单位：优先展示单位，其次档案单位，最后采购单位 */
  private resolveIngredientDisplayUnit(
    ingredient: IngredientOptionRecord,
  ): string | null {
    const display = String(ingredient.unitDisplayLabel ?? '').trim();
    if (display) return display;
    const properties = ingredient.properties as Record<string, unknown> | null;
    const propsUnit = String(properties?.['display_unit'] ?? '').trim();
    if (propsUnit) return propsUnit;
    const purchase = String(ingredient.purchaseUnit ?? '').trim();
    return purchase || null;
  }

  // ============ Web 食谱设计器配套：本地评估输入 ============

  async getDraftAssessmentInputs(
    id: string,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    const draft = await this.getDraft(id, context);
    const targets = await this.targetProvider.getTargets(
      draft.fediafDogScenario,
    );
    return {
      draftId: draft.id,
      name: draft.name,
      scenario: draft.fediafDogScenario,
      nutritionStandard: draft.nutritionStandard ?? 'FEDIAF_2025',
      targets: this.toJsonValue(targets),
      items: this.toJsonValue(this.buildAssessmentItems(draft)),
    };
  }

  // ============ Web 食谱设计器配套：爱犬设计洞察 ============

  async getDogDesignInsight(
    dogId: string,
    access: RecipeDesignerAccessInput,
    recentDays?: string,
    draftId?: string,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用爱犬设计洞察');
    }
    // 「最近吃过的食材」时间窗口（天）：支持前端选择，默认 90，范围 7~365
    const windowDays = this.resolveRecentEatenWindowDays(recentDays);

    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      // 结构化过敏记录：顾客在健康档案 / 定制单里填的那一份。
      // 设计面板与 AI 过去只看旧文本字段 allergyFoods（顾客端没有入口），
      // 于是顾客填的过敏在设计环节完全不可见 —— 2026-09-27 起一并读入。
      include: {
        // certainty / source 一并取出（2026-10-04 第四期）：
        // 营养师要能分清"报告确诊"与"顾客随手记的"。
        allergyRecords: {
          select: { allergen: true, certainty: true, source: true },
        },
      },
    });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }
    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: {
            name: true,
            sizeCategory: true,
            adultAgeMonths: true,
            seniorAgeYears: true,
          },
        })
      : null;
    const dogForLifeStage = { ...dog, breed };

    const seriesList = await this.prisma.recipeSeries.findMany({
      where: {
        status: RecipeSeriesStatus.ACTIVE,
        deletedAt: null,
        OR: [{ referenceDogId: dogId }, { customerDogId: dogId }],
      },
      include: {
        designs: {
          select: {
            id: true,
            name: true,
            seriesLifeStage: true,
            updatedAt: true,
            items: {
              select: {
                id: true,
                weightG: true,
                ingredient: { select: { name: true, type: true } },
                nutritionFood: { select: { name: true, displayNameZh: true } },
              },
            },
          },
        },
      },
    });

    const orderItems = await this.prisma.orderItem.findMany({
      where: { dogId },
      select: {
        id: true,
        recipeSnapshot: true,
        dogId: true,
        order: {
          select: {
            status: true,
            freezingSince: true,
            shippedAt: true,
            completedAt: true,
            paidAt: true,
            createdAt: true,
          },
        },
      },
    });

    /**
     * 历史食谱清单里的定制单（2026-10-22）。
     *
     * 只取**已关联正式食谱**（`recipeId` 非空）且未取消的定制单：
     * 没有关联食谱的单一律没有食谱可展示。除身份字段外，
     * 一并取营养报告与食谱项（名称/示例重量），供 builder 归一化明细；
     * 问卷答案/附件等整单内容不进入洞察。
     */
    const customRecipeHistoryOrders =
      await this.prisma.customRecipeOrder.findMany({
        where: {
          dogId,
          status: { not: CustomRecipeStatus.CANCELLED },
          recipeId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          deliveredAt: true,
          recipe: {
            select: {
              id: true,
              name: true,
              nutritionDetailedData: true,
              items: {
                select: {
                  exampleWeight: true,
                  ingredient: { select: { name: true } },
                },
              },
            },
          },
        },
      });

    // 「最近吃过的食材」：订单至少推进到冷冻中（FREEZING），且最近 N 天内实际食用
    const recentWindowStart = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000,
    );
    const recentEatenOrderItems = orderItems.filter((orderItem) => {
      const order = orderItem.order;
      if (!order?.status || !RECENT_EATEN_ORDER_STATUSES.has(order.status)) {
        return false;
      }
      const eatenAt =
        order.freezingSince ??
        order.shippedAt ??
        order.completedAt ??
        order.paidAt ??
        order.createdAt;
      return eatenAt != null && eatenAt >= recentWindowStart;
    });

    const lifeStage = mapDogProfileToSeriesLifeStage(dogForLifeStage);
    const lifeStageLabel = SERIES_LIFE_STAGE_LABELS[lifeStage] ?? null;

    /**
     * 顾客最近一笔「食谱定制」订单（老板确认的第 4 条）。
     *
     * 设计器此前完全看不到它：顾客要减重还是增重、勾没勾健康管理、
     * 备注说了什么、订单里填的过敏/疾病/喜好，营养师与 AI 一个都读不到。
     * 已取消的订单不算（顾客都撤了，不该再指导设计）。
     */
    const customOrder = await this.prisma.customRecipeOrder.findFirst({
      where: {
        dogId,
        status: { not: CustomRecipeStatus.CANCELLED },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        orderId: true,
        status: true,
        targetGoal: true,
        needsHealthManagement: true,
        additionalNotes: true,
        allergies: true,
        allergyText: true,
        medicalConditions: true,
        preferredIngredients: true,
        dislikedIngredients: true,
        currentFoodMain: true,
        currentFoodOther: true,
        changeReasons: true,
        changeReasonOther: true,
        stomachConditions: true,
        stomachOther: true,
        allergyStatus: true,
        /** 多份购买 / 主蛋白偏好（2026-10-21）：设计器要按份数与顾客选的蛋白来设计 */
        recipeQuantity: true,
        requestedProteinCodes: true,
        /** 顾客在本单上传的附件（2026-10-22）：只读，服务层换签名 URL */
        attachments: true,
        createdAt: true,
      },
    });

    /**
     * 最近一次就诊 / 体检（2026-10-21）。
     *
     * 只取一条、只选结论字段：设计器不需要全部记录，更不该把
     * `lab_values` 这类原始化验数值带到前端。按日期倒序取第一条即最新。
     */
    const [medicalRecords, checkupRecords] = await Promise.all([
      this.prisma.medicalRecord.findMany({
        where: { dogId },
        orderBy: { visitDate: 'desc' },
        take: 1,
        select: {
          visitDate: true,
          diagnosis: true,
          status: true,
          chiefComplaint: true,
          exams: true,
          /** 附件（2026-10-22）：只取最新一条的附件，化验原始数值仍不查询 */
          attachments: true,
        },
      }),
      this.prisma.checkupRecord.findMany({
        where: { dogId },
        orderBy: { checkupDate: 'desc' },
        take: 1,
        select: {
          checkupDate: true,
          checkupType: true,
          findings: true,
          /** 附件（2026-10-22）：只取最新一条的附件，labValues 仍不查询 */
          attachments: true,
        },
      }),
    ]);

    /**
     * 本单其他食谱（2026-10-22）。
     *
     * 只有从编辑器带上 draftId 时才查：先定位当前草稿所属订单，
     * 再取该订单内其他 EDITING / READY 槽位。这样第二份设计时
     * 不用回工作台就能看到第一份的原料与宏量。
     * 不查顾客信息、订单备注等无关字段。
     */
    let sameOrderRecipes: Array<{
      id: string;
      name: string;
      status: string;
      updatedAt: Date | null;
      recipe: {
        name: string | null;
        nutritionDetailedData: unknown;
        items: Array<{
          exampleWeight: number | null;
          ingredient: { name: string | null } | null;
        }>;
      } | null;
      designItems: Array<{ name: string; weightG: number }>;
    }> | null = null;
    if (draftId) {
      const currentDraft = await this.prisma.designRecipe.findUnique({
        where: { id: draftId },
        select: {
          series: { select: { orderId: true } },
        },
      });
      const currentOrderId = currentDraft?.series?.orderId ?? null;
      if (currentOrderId) {
        const slots = await this.prisma.orderRecipeDesign.findMany({
          where: {
            orderId: currentOrderId,
            designDraftId: { not: draftId },
            status: {
              in: [
                OrderRecipeDesignStatus.EDITING,
                OrderRecipeDesignStatus.READY,
              ],
            },
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            status: true,
            updatedAt: true,
            designDraft: {
              select: {
                name: true,
                updatedAt: true,
                items: {
                  select: {
                    weightG: true,
                    ingredient: { select: { name: true } },
                    nutritionFood: {
                      select: { name: true, displayNameZh: true },
                    },
                  },
                },
              },
            },
            recipe: {
              select: {
                name: true,
                nutritionDetailedData: true,
                items: {
                  select: {
                    exampleWeight: true,
                    ingredient: { select: { name: true } },
                  },
                },
              },
            },
          },
        });
        sameOrderRecipes = slots.map((slot) => ({
          id: slot.id,
          name:
            slot.recipe?.name?.trim() ||
            slot.designDraft?.name?.trim() ||
            '本单食谱',
          status: slot.status,
          updatedAt: slot.designDraft?.updatedAt ?? slot.updatedAt,
          recipe: slot.recipe
            ? {
                name: slot.recipe.name,
                nutritionDetailedData: slot.recipe.nutritionDetailedData,
                items: slot.recipe.items,
              }
            : null,
          designItems: (slot.designDraft?.items ?? [])
            .map((item) => ({
              name:
                item.ingredient?.name?.trim() ||
                item.nutritionFood?.displayNameZh?.trim() ||
                item.nutritionFood?.name?.trim() ||
                '',
              weightG: Number(item.weightG ?? 0),
            }))
            .filter((item) => Boolean(item.name)),
        }));
      }
    }

    const insight = buildDogDesignInsight({
      dog: dogForLifeStage,
      seriesList,
      orderItems,
      recentEatenOrderItems,
      lifeStageLabel,
      medicalRecords,
      checkupRecords,
      customRecipeOrders: customRecipeHistoryOrders,
      sameOrderRecipes,
      customRecipeOrder: customOrder
        ? {
            orderId: customOrder.orderId,
            status: customOrder.status,
            targetGoal: customOrder.targetGoal,
            needsHealthManagement: Boolean(customOrder.needsHealthManagement),
            additionalNotes: customOrder.additionalNotes ?? null,
            allergies: customOrder.allergies ?? [],
            allergyText: customOrder.allergyText ?? null,
            medicalConditions: customOrder.medicalConditions ?? [],
            preferredIngredients: customOrder.preferredIngredients ?? [],
            dislikedIngredients: customOrder.dislikedIngredients ?? [],
            currentFoodMain: customOrder.currentFoodMain ?? null,
            currentFoodOther: customOrder.currentFoodOther ?? null,
            changeReasons: customOrder.changeReasons ?? [],
            changeReasonOther: customOrder.changeReasonOther ?? null,
            stomachConditions: customOrder.stomachConditions ?? [],
            stomachOther: customOrder.stomachOther ?? null,
            allergyStatus: customOrder.allergyStatus ?? null,
            recipeQuantity: customOrder.recipeQuantity ?? 1,
            requestedProteinCodes: customOrder.requestedProteinCodes ?? [],
            attachments: normalizeInsightAttachments(customOrder.attachments),
            createdAt: customOrder.createdAt
              ? customOrder.createdAt.toISOString()
              : null,
          }
        : null,
    });

    const aiEnabled =
      ((await this.aiDesignSuggestionService?.isAvailable()) ?? false) === true;

    return { ...this.signInsightAttachments(insight), aiEnabled };
  }

  /**
   * 设计洞察里的附件 → 短时签名 URL（2026-10-22）。
   *
   * 库里存的是 COS key（老数据可能是公开 URL）。就诊/体检/定制单附件
   * 属于敏感资料，前端不能拿 key 去拼公共地址，所以统一由服务端签发。
   *
   * 未注入 COS（本地/测试/未配置）时**原样返回**；签发失败（返回空串）
   * 也回退原值 —— 旧公开 URL 至少还能直接打开，不能因为签名失败把附件弄丢。
   * 只处理**最新一条**就诊/体检与最近一笔定制单，不动其它字段。
   */
  private signInsightAttachments(insight: DogDesignInsight): DogDesignInsight {
    const cosService = this.cosService;
    if (!cosService || typeof cosService.getSensitiveMediaUrl !== 'function') {
      return insight;
    }
    const sign = (value: string) =>
      cosService.getSensitiveMediaUrl(value) || value;
    const signList = (values: string[]) => values.map(sign);

    return {
      ...insight,
      latestMedicalRecord: insight.latestMedicalRecord
        ? {
            ...insight.latestMedicalRecord,
            attachments: signList(insight.latestMedicalRecord.attachments),
          }
        : null,
      latestCheckupRecord: insight.latestCheckupRecord
        ? {
            ...insight.latestCheckupRecord,
            attachments: signList(insight.latestCheckupRecord.attachments),
          }
        : null,
      customRecipeOrder: insight.customRecipeOrder
        ? {
            ...insight.customRecipeOrder,
            attachments: signList(insight.customRecipeOrder.attachments),
          }
        : null,
    };
  }

  async updateDogDesignNotes(
    dogId: string,
    dto: UpdateDogDesignNotesDto,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可维护爱犬设计备注');
    }

    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      select: { id: true },
    });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }

    return this.prisma.dog.update({
      where: { id: dogId },
      data: {
        ...(dto.allergyFoods !== undefined
          ? { allergyFoods: dto.allergyFoods ?? null }
          : {}),
        ...(dto.pickyFoods !== undefined
          ? { pickyFoods: dto.pickyFoods ?? null }
          : {}),
        ...(dto.preferredFoods !== undefined
          ? { preferredFoods: dto.preferredFoods ?? null }
          : {}),
        ...(dto.medicalHistory !== undefined
          ? { medicalHistory: dto.medicalHistory ?? null }
          : {}),
      },
    });
  }

  async setSeriesReferenceDog(
    seriesId: string,
    referenceDogId: string | null | undefined,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可设置参考爱犬');
    }

    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      select: { id: true, createdBy: true, designMode: true },
    });
    if (!series || series.createdBy === null) {
      throw new NotFoundException('食谱系列不存在');
    }
    if (!(await this.isSeriesAccessibleByContext(series, context))) {
      throw new NotFoundException('食谱系列不存在');
    }
    // 2026-10-22：订单绑定系列的参考爱犬 = 订单狗狗，从创建那一刻就锁定。
    if (series.designMode === RecipeDesignMode.ORDER) {
      throw new BadRequestException('本单已绑定爱犬，不能更换参考爱犬');
    }

    if (referenceDogId) {
      const dog = await this.prisma.dog.findUnique({
        where: { id: referenceDogId },
        select: { id: true },
      });
      if (!dog) {
        throw new BadRequestException('参考爱犬不存在，请重新选择');
      }
    }

    return this.prisma.recipeSeries.update({
      where: { id: seriesId },
      data: { referenceDogId: referenceDogId ?? null },
    });
  }

  async batchUpdateItemOrder(
    order: Array<{ id: string; sortOrder: number }>,
    access: RecipeDesignerAccessInput,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!Array.isArray(order) || order.length === 0) {
      throw new BadRequestException('排序数据不能为空');
    }

    const itemIds = order.map((entry) => entry.id);
    const items = await this.prisma.designRecipeItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, designRecipeId: true },
    });
    if (items.length !== itemIds.length) {
      throw new BadRequestException('部分原料不存在，无法保存排序');
    }

    const draftIds = Array.from(
      new Set(items.map((item) => item.designRecipeId)),
    );
    for (const draftId of draftIds) {
      await this.getDraft(draftId, context);
    }

    await this.prisma.$transaction(
      order.map((entry) =>
        this.prisma.designRecipeItem.update({
          where: { id: entry.id },
          data: { sortOrder: entry.sortOrder },
        }),
      ),
    );

    return { updated: order.length };
  }

  /**
   * 这位客户名下还有没有活跃的食谱系列 —— 也就是"用没用过设计器"。
   *
   * W2 用它同时决定两件事：**「我的」页面要不要显示设计器入口**、
   * **能不能继续新建系列**。判定口径必须一致，否则会出现
   * "看得到入口但建不了"或"看不到入口却能建"。
   */
  private async hasCustomerDesignHistory(
    context: ReturnType<typeof normalizeRecipeDesignerAccessContext>,
  ): Promise<boolean> {
    const seriesCount = await this.prisma.recipeSeries.count({
      where: {
        status: RecipeSeriesStatus.ACTIVE,
        deletedAt: null,
        createdBy: context.userId,
      },
    });
    return seriesCount > 0;
  }

  async getCustomerDesignerAccess(access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (isInternalRecipeDesignerRole(context)) {
      return { isCustomer: false, hasDesignHistory: true };
    }

    return {
      isCustomer: true,
      hasDesignHistory: await this.hasCustomerDesignHistory(context),
    };
  }

  async generateAiDesignSuggestions(
    dogId: string,
    access: RecipeDesignerAccessInput,
    draftId?: string,
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用 AI 设计建议');
    }
    if (!this.aiDesignSuggestionService) {
      throw new BadRequestException('AI 设计建议服务不可用');
    }

    const insight = await this.getDogDesignInsight(dogId, context);

    let currentDraft: AiDesignSuggestionInput['currentDraft'] = null;
    if (draftId) {
      const draft = await this.getDraft(draftId, context);
      currentDraft = {
        name: draft.name,
        scenario: draft.fediafDogScenario,
        items: (draft.items ?? [])
          .filter((item) => item.includeInAssessment !== false)
          .map((item) => ({
            name: this.resolveIngredientDisplayName(item),
            weightG: item.weightG,
            isSupplement:
              this.resolveIngredientType(item) === IngredientType.SUPPLEMENT,
          })),
        assessmentSummary: this.buildAiAssessmentSummaryText(draft),
      };
    }

    return this.aiDesignSuggestionService.generate({
      dog: {
        name: insight.dog.name,
        breedName: insight.dog.breedName,
        lifeStageLabel: insight.dog.lifeStageLabel,
        currentWeightKg: insight.dog.currentWeightKg,
        // 过敏：旧文本备注 + 顾客在健康档案里填的结构化记录，两边都送给 AI。
        // 只送旧字段的话，顾客明确声明的过敏在配方生成里会被忽略。
        allergyFoods: formatAllergyKeywordsForAi(
          collectAllergyKeywords({
            allergyFoods: insight.dog.allergyFoods,
            allergens: insight.dog.structuredAllergies,
          }),
        ),
        pickyFoods: insight.dog.pickyFoods,
        preferredFoods: insight.dog.preferredFoods,
        medicalHistory: insight.dog.medicalHistory,
      },
      designHistory: insight.designHistory,
      orderSummary: insight.orderSummary,
      currentDraft,
    });
  }

  private buildAiAssessmentSummaryText(draft: DesignRecipeWithItems): string {
    const summary = draft.assessmentSummary as
      | Record<string, unknown>
      | null
      | undefined;
    if (!summary || typeof summary !== 'object') {
      return '';
    }
    const overallStatus = summary.overallStatus ?? summary.status ?? '';
    const raw = (summary.summary ?? summary.rawSummary ?? {}) as Record<
      string,
      unknown
    >;
    const parts: string[] = [];
    if (overallStatus) parts.push(`总体状态: ${String(overallStatus)}`);
    for (const key of ['deficient', 'excess', 'missingData', 'compliant']) {
      const value = raw[key];
      if (typeof value === 'number' && value > 0) {
        parts.push(`${key}: ${value}`);
      }
    }
    return parts.join('，');
  }

  private findAssessedRatio(
    assessment: DesignRecipeAssessmentResult,
    itemId: string,
  ): number {
    const item = assessment.items.find((candidate) => candidate.id === itemId);

    if (!item) {
      throw new BadRequestException(
        `配方明细 ${itemId} 未出现在评估结果中，无法发布正式食谱`,
      );
    }

    return item.ratioPercent;
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  // ---------- AI 设计建议四步向导 ----------

  /** 步骤一：生成营养方案 */
  async generateAiNutritionPlan(
    dogId: string,
    draftId: string | undefined,
    access: RecipeDesignerAccessInput,
    userNotes?: string | null,
  ): Promise<NutritionPlanResult> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用 AI 设计建议');
    }
    if (!this.recipeAiWizardService) {
      throw new BadRequestException('AI 设计建议服务不可用');
    }

    const profile = await this.buildAiWizardDogProfile(dogId);
    const { tags, keywords } = deriveKnowledgeTags(profile);
    const currentDraft = draftId
      ? await this.buildAiWizardDraftSummary(draftId, access)
      : null;

    const result = await this.recipeAiWizardService.generateNutritionPlan({
      dog: profile,
      knowledgeTags: tags,
      extraKeywords: keywords,
      currentDraft,
      userNotes: userNotes ?? null,
    });

    if (draftId) {
      await this.persistAiNutritionPlan(draftId, access, result, {
        accepted: false,
        note: null,
      });
    }

    return result;
  }

  /** 步骤一（共识）：认可/修改营养方案 */
  async acceptAiNutritionPlan(
    draftId: string,
    dto: {
      accepted: boolean;
      note?: string | null;
      plan?: unknown;
    },
    access: RecipeDesignerAccessInput,
  ): Promise<NutritionPlanResult> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可确认营养方案');
    }
    const data = await this.getOrCreateAiDesignData(draftId, access);
    const current = (data.nutritionPlan ?? {}) as Record<string, unknown>;
    const history = Array.isArray(data.nutritionPlanHistory)
      ? (data.nutritionPlanHistory as Array<Record<string, unknown>>)
      : [];

    const plan =
      (dto.plan as NutritionPlanResult | null | undefined) ??
      (current.result as NutritionPlanResult | null);
    if (!plan) {
      throw new BadRequestException('尚无营养方案可确认，请先生成');
    }

    if (dto.accepted) {
      // 认可：写入当前方案 + 历史留痕
      const now = new Date().toISOString();
      await this.prisma.designRecipeAiDesignData.upsert({
        where: { designRecipeId: draftId },
        create: {
          designRecipeId: draftId,
          nutritionPlan: this.toJsonValue({
            result: plan,
            accepted: true,
            acceptedAt: new Date().toISOString(),
            note: dto.note ?? null,
          }),
          nutritionPlanAccepted: true,
          nutritionPlanAcceptedAt: new Date(),
          nutritionPlanNote: dto.note ?? null,
          nutritionPlanHistory: this.toJsonValue([
            ...history,
            { result: plan, note: dto.note ?? '认可', createdAt: now },
          ]),
        },
        update: {
          nutritionPlan: this.toJsonValue({
            result: plan,
            accepted: true,
            acceptedAt: new Date().toISOString(),
            note: dto.note ?? null,
          }),
          nutritionPlanAccepted: true,
          nutritionPlanAcceptedAt: new Date(),
          nutritionPlanNote: dto.note ?? null,
          nutritionPlanHistory: this.toJsonValue([
            ...history,
            { result: plan, note: dto.note ?? '认可', createdAt: now },
          ]),
        },
      });
    } else {
      // 拒绝：仅留痕，不置为已认可
      const now = new Date().toISOString();
      await this.prisma.designRecipeAiDesignData.upsert({
        where: { designRecipeId: draftId },
        create: {
          designRecipeId: draftId,
          nutritionPlan: this.toJsonValue({
            result: plan,
            accepted: false,
            acceptedAt: null,
            note: dto.note ?? null,
          }),
          nutritionPlanHistory: this.toJsonValue([
            ...history,
            {
              result: plan,
              note: dto.note ?? '未认可（修改中）',
              createdAt: now,
            },
          ]),
        },
        update: {
          nutritionPlan: this.toJsonValue({
            result: plan,
            accepted: false,
            acceptedAt: null,
            note: dto.note ?? null,
          }),
          nutritionPlanHistory: this.toJsonValue([
            ...history,
            {
              result: plan,
              note: dto.note ?? '未认可（修改中）',
              createdAt: now,
            },
          ]),
        },
      });
    }

    return plan;
  }

  /** 步骤二：食材推荐 */
  async generateAiIngredientRecommendation(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<IngredientRecommendationResult> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用 AI 设计建议');
    }
    if (!this.recipeAiWizardService) {
      throw new BadRequestException('AI 设计建议服务不可用');
    }

    const draft = await this.getDraft(draftId, access);
    const dogId = await this.resolveDraftReferenceDogId(draft, context);
    if (!dogId) {
      throw new BadRequestException('请先为该配方设置参考爱犬');
    }

    const profile = await this.buildAiWizardDogProfile(dogId);
    const { tags } = deriveKnowledgeTags(profile);
    const insight = await this.getDogDesignInsight(dogId, access);
    const aiData = await this.getOrCreateAiDesignData(draftId, access);
    // 食材推荐需在营养方案达成共识（认可）后进行
    if (!aiData.nutritionPlan || !aiData.nutritionPlan.accepted) {
      throw new BadRequestException(
        '请先在「营养方案」步骤生成并认可方案，再进行食材推荐',
      );
    }
    const nutritionPlan = aiData.nutritionPlan
      ? ((aiData.nutritionPlan as Record<string, unknown>)
          .result as NutritionPlanResult)
      : null;

    const result =
      await this.recipeAiWizardService.generateIngredientRecommendation({
        dog: profile,
        nutritionPlan,
        knowledgeTags: tags,
        designHistory: insight.designHistory,
        orderSummary: insight.orderSummary,
        frameworkTemplateName: deriveFrameworkTemplateName(tags),
        currentDraft: await this.buildAiWizardDraftSummary(draftId, access),
      });

    // ── 代码复核 AI 的产出（2026-10-04 第一期）──────────────────
    //
    // 改造前：提示词里写了"过敏食材必须硬性避开"，但 AI 返回的食材清单
    // **代码从不校验**。它到底避没避开，系统不知道，也没人能查。
    // 大模型有可能凭常识避开，但那是"有可能"，不是"一定"，
    // 而且不可验证、不可追责 —— 安全底线不能建立在大模型的常识上。
    //
    // 现在：拿这只狗的过敏原把 AI 推荐的食材**再核一遍**，
    // 命中的直接从推荐里摘掉、改记到 avoidIngredients 里。
    const screened = await this.screenAiRecommendationsAgainstAllergens(
      result,
      profile,
    );

    // 把 AI 推荐的食材名称与原料库/营养食材库匹配，填充 ID 以便一键添加
    const enriched = await this.enrichRecommendationWithLibrary(screened);

    await this.prisma.designRecipeAiDesignData.upsert({
      where: { designRecipeId: draftId },
      create: {
        designRecipeId: draftId,
        ingredientRecommendations: this.toJsonValue([
          { result: enriched, createdAt: new Date().toISOString() },
        ]),
      },
      update: {
        ingredientRecommendations: this.toJsonValue([
          ...(Array.isArray(aiData.ingredientRecommendations)
            ? (aiData.ingredientRecommendations as Array<
                Record<string, unknown>
              >)
            : []),
          { result: enriched, createdAt: new Date().toISOString() },
        ]),
      },
    });

    return enriched;
  }

  /** 步骤三：食谱审核 */
  async reviewAiRecipe(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<RecipeReviewResult> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用 AI 设计建议');
    }
    if (!this.recipeAiWizardService) {
      throw new BadRequestException('AI 设计建议服务不可用');
    }

    const draft = await this.getDraft(draftId, access);
    const dogId = await this.resolveDraftReferenceDogId(draft, context);
    const aiData = await this.getOrCreateAiDesignData(draftId, access);
    const nutritionPlan = aiData.nutritionPlan
      ? ((aiData.nutritionPlan as Record<string, unknown>)
          .result as NutritionPlanResult)
      : null;

    let tags: string[] = [];
    if (dogId) {
      const profile = await this.buildAiWizardDogProfile(dogId);
      tags = deriveKnowledgeTags(profile).tags;
    }

    const result = await this.recipeAiWizardService.reviewRecipe({
      nutritionPlan,
      knowledgeTags: tags,
      frameworkTemplateName: deriveFrameworkTemplateName(tags),
      draft: await this.buildAiWizardDraftSummary(draftId, access),
    });

    await this.prisma.designRecipeAiDesignData.upsert({
      where: { designRecipeId: draftId },
      create: {
        designRecipeId: draftId,
        reviewResults: this.toJsonValue([
          { result, createdAt: new Date().toISOString() },
        ]),
      },
      update: {
        reviewResults: this.toJsonValue([
          ...(Array.isArray(aiData.reviewResults)
            ? (aiData.reviewResults as Array<Record<string, unknown>>)
            : []),
          { result, createdAt: new Date().toISOString() },
        ]),
      },
    });

    return result;
  }

  /** 步骤四：生成制作 SOP */
  async generateAiSop(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<SopResult> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用 AI 设计建议');
    }
    if (!this.recipeAiWizardService) {
      throw new BadRequestException('AI 设计建议服务不可用');
    }

    const result = await this.recipeAiWizardService.generateSop({
      draft: await this.buildAiWizardDraftSummary(draftId, access),
      audience: 'both',
    });

    await this.prisma.designRecipeAiDesignData.upsert({
      where: { designRecipeId: draftId },
      create: {
        designRecipeId: draftId,
        sop: this.toJsonValue({ result, accepted: false }),
      },
      update: {
        sop: this.toJsonValue({ result, accepted: false }),
      },
    });

    return result;
  }

  /** 读取配方草稿上的 AI 设计数据 */
  async getAiDesignData(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<RecipeAiDesignData> {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可查看 AI 设计数据');
    }
    return this.getOrCreateAiDesignData(draftId, access);
  }

  /** 构建完整犬档案（含体检/病历/体重趋势）供 AI 使用 */
  private async buildAiWizardDogProfile(
    dogId: string,
  ): Promise<AiWizardDogProfile> {
    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
      include: {
        // 结构化过敏记录：顾客在健康档案 / 定制单里填的那一份。
        // 这份 AI 档案过去只带 checkup/medical/weight，漏了过敏记录，
        // 导致顾客明确声明的过敏进不了配方生成 —— 2026-09-27 起一并带上。
        allergyRecords: {
          orderBy: { createdAt: 'desc' },
          select: { allergen: true, notes: true },
        },
        checkupRecords: {
          orderBy: { checkupDate: 'desc' },
          take: 8,
          select: {
            checkupType: true,
            checkupDate: true,
            findings: true,
            // 化验数据独立成栏之后，标签派生也要读它 ——
            // 肾病之类的关键词（肌酐/蛋白尿/SDMA）本来就藏在化验数值里
            labValues: true,
            recommendations: true,
          },
        },
        medicalRecords: {
          orderBy: { visitDate: 'desc' },
          take: 8,
          select: {
            visitDate: true,
            chiefComplaint: true,
            diagnosis: true,
            // 这次就诊做的化验（2026-10-02 新增）
            labValues: true,
            treatment: true,
            medications: true,
            status: true,
          },
        },
        weightRecords: {
          orderBy: { recordDate: 'desc' },
          take: 6,
          select: { recordDate: true, weightKg: true },
        },
      },
    });
    if (!dog) {
      throw new NotFoundException('爱犬不存在');
    }

    const breed = dog.breedId
      ? await this.prisma.dogBreed.findUnique({
          where: { id: dog.breedId },
          select: {
            name: true,
            sizeCategory: true,
            adultAgeMonths: true,
            seniorAgeYears: true,
          },
        })
      : null;
    const dogForLifeStage = { ...dog, breed };

    const lifeStage = mapDogProfileToSeriesLifeStage(dogForLifeStage);
    const lifeStageLabel = SERIES_LIFE_STAGE_LABELS[lifeStage] ?? null;

    /**
     * 顾客最近一笔定制订单（未取消），一并交给 AI。
     * 否则 AI 不知道顾客要减重还是增重、备注里写了什么。
     */
    const customerOrder = await this.prisma.customRecipeOrder.findFirst({
      where: { dogId, status: { not: CustomRecipeStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
      select: {
        orderId: true,
        targetGoal: true,
        needsHealthManagement: true,
        additionalNotes: true,
        preferredIngredients: true,
        dislikedIngredients: true,
        currentFoodMain: true,
        currentFoodOther: true,
        changeReasons: true,
        changeReasonOther: true,
        stomachConditions: true,
        stomachOther: true,
        allergyStatus: true,
      },
    });

    return {
      name: dog.name,
      customOrder: customerOrder
        ? {
            orderId: customerOrder.orderId,
            targetGoal: customerOrder.targetGoal,
            needsHealthManagement: Boolean(customerOrder.needsHealthManagement),
            additionalNotes: customerOrder.additionalNotes ?? null,
            preferredIngredients: customerOrder.preferredIngredients ?? [],
            dislikedIngredients: customerOrder.dislikedIngredients ?? [],
            currentFoodMain: customerOrder.currentFoodMain ?? null,
            currentFoodOther: customerOrder.currentFoodOther ?? null,
            changeReasons: customerOrder.changeReasons ?? [],
            changeReasonOther: customerOrder.changeReasonOther ?? null,
            stomachConditions: customerOrder.stomachConditions ?? [],
            stomachOther: customerOrder.stomachOther ?? null,
            allergyStatus: customerOrder.allergyStatus ?? null,
          }
        : null,
      breedName: breed?.name ?? dog.customBreedName ?? null,
      gender: dog.gender,
      ageMonths: dog.birthday
        ? calcMonthsBetween(dog.birthday, new Date())
        : null,
      isNeutered: dog.isNeutered,
      bcsScore: dog.bcsScore,
      currentWeightKg: dog.currentWeightKg,
      lifeStageLabel,
      activityLevel: dog.activityLevel,
      mealsPerDay: dog.mealsPerDay,
      treatLevel: dog.treatLevel,
      manualTreatKcal: dog.manualTreatKcal,
      targetFoodKcal: dog.cachedTargetFoodKcal,
      // 过敏：旧文本备注 + 顾客填的结构化记录合并后再交给 AI，
      // 避免「顾客在健康档案里写了过敏、配方却照样用」。
      allergyFoods: formatAllergyKeywordsForAi(
        collectAllergyKeywords({
          allergyFoods: dog.allergyFoods,
          allergens: dog.allergyRecords.map((record) => record.allergen),
        }),
      ),
      /**
       * 口味偏好：档案里的 + **顾客在定制单里单独填的**，合并后交给 AI。
       *
       * 定制单里的喜好/忌口不写回档案（知情同意的范围只有过敏与疾病，
       * 不能顺手把口味也写进去），但 AI 与设计器必须看得到 ——
       * 否则顾客在订单里写的"不吃鸡胸"会被彻底忽略。
       */
      pickyFoods: mergeFoodText(
        dog.pickyFoods,
        customerOrder?.dislikedIngredients ?? [],
      ),
      preferredFoods: mergeFoodText(
        dog.preferredFoods,
        customerOrder?.preferredIngredients ?? [],
      ),
      medicalHistory: dog.medicalHistory,
      healthTagOverrides: parseHealthTagOverrides(dog.healthTagOverrides),
      weightTrend: dog.weightRecords
        .slice()
        .reverse()
        .map((record) => ({
          date: record.recordDate.toISOString().slice(0, 10),
          weightKg: record.weightKg,
        })),
      checkups: dog.checkupRecords.map((record) => ({
        type: record.checkupType,
        date: record.checkupDate.toISOString().slice(0, 10),
        findings: record.findings,
        labValues: record.labValues,
        recommendations: record.recommendations,
      })),
      medicalRecords: dog.medicalRecords.map((record) => ({
        date: record.visitDate.toISOString().slice(0, 10),
        chiefComplaint: record.chiefComplaint,
        diagnosis: record.diagnosis,
        labValues: record.labValues,
        treatment: record.treatment,
        medications: record.medications,
        status: record.status,
      })),
    };
  }

  /** 构建配方草稿摘要供 AI 使用 */
  private async buildAiWizardDraftSummary(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<AiWizardDraftSummary> {
    const draft = await this.getDraft(draftId, access);
    const items = (draft.items ?? [])
      .filter((item) => item.includeInAssessment !== false)
      .map((item) => ({
        name: this.resolveIngredientDisplayName(item),
        category: this.resolveIngredientType(item),
        weightG: item.weightG,
        ratioPercent: item.ratioPercent,
        isSupplement:
          this.resolveIngredientType(item) === IngredientType.SUPPLEMENT,
        preparationMethod: item.preparationMethod ?? null,
        nutritionProfileSummary: this.buildAiItemNutritionProfileSummary(item),
      }));
    return {
      name: draft.name,
      scenario: draft.fediafDogScenario,
      items,
      totalWeightG: draft.totalWeightG,
      energyDensityKcalPerKg: draft.energyDensityKcalPerKg,
      assessmentSummaryText: this.buildAiAssessmentSummaryText(draft),
    };
  }

  private buildAiItemNutritionProfileSummary(
    item: DesignRecipeItemWithFood,
  ): string | null {
    const profile = item.nutritionFood?.nutritionData as
      | Record<string, unknown>
      | null
      | undefined;
    if (!profile || typeof profile !== 'object') return null;
    const parts: string[] = [];
    const macro = profile.macros as Record<string, unknown> | null;
    if (macro && typeof macro === 'object') {
      const energy =
        macro.energyKcalPer100g ?? macro.energyKcal ?? macro.energy;
      if (typeof energy === 'number') parts.push(`能量${energy}kcal/100g`);
      const protein = macro.proteinG ?? macro.protein;
      if (typeof protein === 'number') parts.push(`蛋白${protein}g/100g`);
      const fat = macro.fatG ?? macro.fat;
      if (typeof fat === 'number') parts.push(`脂肪${fat}g/100g`);
      const carb = macro.carbohydrateG ?? macro.carbohydrate;
      if (typeof carb === 'number') parts.push(`碳水${carb}g/100g`);
    }
    return parts.length > 0 ? parts.join('，') : null;
  }

  /** 把 AI 推荐的食材名称与原料库/营养食材库匹配，填充 inLibrary 与 ID 供一键添加 */
  private async enrichRecommendationWithLibrary(
    result: IngredientRecommendationResult,
  ): Promise<IngredientRecommendationResult> {
    const names = result.recommendations
      .map((rec) => rec.name)
      .filter((name) => Boolean(name) && name !== '未命名');
    if (names.length === 0) return result;

    // 营养食材库全量加载（数量有限，便于做名称包含匹配）
    const foods = await this.prisma.nutritionFood.findMany({
      select: {
        id: true,
        name: true,
        displayNameZh: true,
        mappings: {
          select: {
            ingredientId: true,
            isPrimary: true,
            ingredient: { select: { id: true, name: true } },
          },
        },
      },
    });
    // 原料库全量名称（数量有限），做包含匹配
    const allIngredients = await this.prisma.ingredient.findMany({
      select: { id: true, name: true, type: true },
    });

    // 营养食材 → 主原料映射（供“按原料反查营养食材”用）
    const foodByIngredientId = new Map<string, (typeof foods)[number]>();
    for (const food of foods) {
      for (const mapping of food.mappings ?? []) {
        if (!foodByIngredientId.has(mapping.ingredientId)) {
          foodByIngredientId.set(mapping.ingredientId, food);
        }
      }
    }

    // 去掉括号内容与空格，便于名称匹配（如「鸭胸肉（去皮）」→「鸭胸肉」）
    const normalizeName = (value: string): string =>
      value
        .replace(/[（(][^（()）]*[）)]/g, '')
        .replace(/\s+/g, '')
        .trim();

    /** 在营养食材库中按名称找最贴合的一项（先精确，再包含，取名称最短者） */
    const resolveFood = (recName: string) => {
      const normalized = normalizeName(recName);
      const exact = foods.find(
        (food) =>
          normalizeName(food.name) === normalized ||
          (food.displayNameZh &&
            normalizeName(food.displayNameZh) === normalized),
      );
      if (exact) return exact;
      const contains = foods
        .filter((food) => {
          const zhName = food.displayNameZh ?? '';
          const foodNames = [normalizeName(food.name)];
          if (zhName) foodNames.push(normalizeName(zhName));
          return foodNames.some(
            (candidate) =>
              (candidate.length >= 2 &&
                (normalized.includes(candidate) ||
                  candidate.includes(normalized))) ||
              (normalized.length >= 2 &&
                (food.name.includes(normalized) ||
                  zhName.includes(normalized))),
          );
        })
        .sort(
          (a, b) =>
            (a.displayNameZh ?? a.name).length -
            (b.displayNameZh ?? b.name).length,
        )[0];
      return contains;
    };

    /** 在原料库中按名称找（先精确，再包含） */
    const resolveIngredient = (recName: string) => {
      const normalized = normalizeName(recName);
      const exact = allIngredients.find(
        (ingredient) => normalizeName(ingredient.name) === normalized,
      );
      if (exact) return exact;
      if (normalized.length >= 2) {
        const candidate = allIngredients
          .filter((ingredient) => {
            const candidateName = normalizeName(ingredient.name);
            return (
              candidateName.length >= 2 &&
              (normalized.includes(candidateName) ||
                candidateName.includes(normalized))
            );
          })
          .sort(
            (a, b) =>
              normalizeName(a.name).length - normalizeName(b.name).length,
          )[0];
        if (candidate) return candidate;
      }
      return undefined;
    };

    return {
      ...result,
      recommendations: result.recommendations.map((rec) => {
        const food = resolveFood(rec.name);
        const ingredient = resolveIngredient(rec.name);
        const primaryMapping =
          food?.mappings?.find((mapping) => mapping.isPrimary) ??
          food?.mappings?.[0];
        const resolvedIngredientId =
          ingredient?.id ?? primaryMapping?.ingredientId ?? undefined;
        // 若按原料名匹配到营养食材（AI 名称与原料名一致但营养食材名不同），补上 food
        const resolvedFood =
          food ??
          (resolvedIngredientId
            ? foodByIngredientId.get(resolvedIngredientId)
            : undefined);
        return {
          ...rec,
          inLibrary: Boolean(resolvedFood || ingredient),
          nutritionFoodId: resolvedFood?.id ?? undefined,
          ingredientId: resolvedIngredientId,
        };
      }),
    };
  }

  /** 获取（或初始化）配方草稿的 AI 设计数据 */
  private async getOrCreateAiDesignData(
    draftId: string,
    access: RecipeDesignerAccessInput,
  ): Promise<RecipeAiDesignData> {
    await this.getDraft(draftId, access);
    const record = await this.prisma.designRecipeAiDesignData.findUnique({
      where: { designRecipeId: draftId },
    });
    if (!record) {
      return {
        nutritionPlan: null,
        nutritionPlanHistory: [],
        ingredientRecommendations: [],
        reviewResults: [],
        sop: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return normalizeAiDesignDataRecord(record);
  }

  /** 保存营养方案（生成后写入，未认可状态） */
  private async persistAiNutritionPlan(
    draftId: string,
    access: RecipeDesignerAccessInput,
    result: NutritionPlanResult,
    meta: { accepted: boolean; note: string | null },
  ): Promise<void> {
    const aiData = await this.getOrCreateAiDesignData(draftId, access);
    const history = aiData.nutritionPlanHistory;
    const now = new Date().toISOString();
    const wrapped = {
      result,
      accepted: meta.accepted,
      acceptedAt: meta.accepted ? new Date().toISOString() : null,
      note: meta.note,
    };
    await this.prisma.designRecipeAiDesignData.upsert({
      where: { designRecipeId: draftId },
      create: {
        designRecipeId: draftId,
        nutritionPlan: this.toJsonValue(wrapped),
        nutritionPlanAccepted: meta.accepted,
        nutritionPlanNote: meta.note,
        nutritionPlanHistory: this.toJsonValue([
          ...history,
          { result, note: meta.note ?? '生成', createdAt: now },
        ]),
      },
      update: {
        nutritionPlan: this.toJsonValue(wrapped),
        nutritionPlanAccepted: meta.accepted,
        nutritionPlanNote: meta.note,
        nutritionPlanHistory: this.toJsonValue([
          ...history,
          { result, note: meta.note ?? '生成', createdAt: now },
        ]),
      },
    });
  }

  /** 解析草稿的参考犬 ID */
  private async resolveDraftReferenceDogId(
    draft: { seriesId?: string | null; customerDogId?: string | null },
    context: RecipeDesignerAccessContext,
  ): Promise<string | null> {
    if (draft.customerDogId) return draft.customerDogId;
    if (draft.seriesId) {
      const series = await this.prisma.recipeSeries.findUnique({
        where: { id: draft.seriesId },
        select: { referenceDogId: true, customerDogId: true },
      });
      return series?.referenceDogId ?? series?.customerDogId ?? null;
    }
    return null;
  }
}

/** 把档案口味文本与订单里填的食材合并成一段逗号分隔文本（去重、保序） */
function mergeFoodText(
  archiveText: string | null | undefined,
  orderItems: string[],
): string | null {
  const merged: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !merged.includes(trimmed)) {
      merged.push(trimmed);
    }
  };

  String(archiveText || '')
    .split(/[,，、;；\n\r]/)
    .forEach(push);
  orderItems.forEach(push);

  return merged.length > 0 ? merged.join('、') : null;
}

// ---------- AI 四步向导辅助函数 ----------

/** 由犬档案推导知识检索标签与关键词 */
export function deriveKnowledgeTags(profile: {
  lifeStageLabel: string | null;
  ageMonths: number | null;
  bcsScore: number | null;
  currentWeightKg: number;
  weightTrend: Array<{ date: string; weightKg: number }>;
  medicalHistory: string | null;
  /**
   * 过敏原（2026-10-04 第四期补）。
   *
   * 改造前这里**完全没有读过敏** —— historyText 只拼了
   * medicalHistory + checkups + medicalRecords 三样。
   * 后果：一只**只有**"对鸡肉过敏"这一条健康信息的狗，
   * 在配方生成时不会产生 food-allergy 标签，
   * 于是知识库里那三条最关键的过敏知识永远不会被引用：
   *   skin-003 饮食排除试验：诊断食物不良反应的金标准方法
   *   skin-004 排除试验期间的严格管理：零食、药物与饮食日记
   *   skin-005 犬猫常见致敏食物成分
   *
   * 对照：AI 健康分析（第七期）早就读了过敏
   * （health-analysis.service.ts 的 408-409 行），只有配方这一路漏了。
   */
  allergyFoods?: string | null;
  /** 健康标签的人工修正（第八期） */
  healthTagOverrides?: { added?: string[]; removed?: string[] };
  checkups: Array<{
    findings: string | null;
    /** 化验数据（2026-10-02 独立成栏）：肌酐/蛋白尿这类关键词在里面 */
    labValues?: string | null;
    recommendations: string | null;
  }>;
  medicalRecords: Array<{
    diagnosis: string | null;
    chiefComplaint: string | null;
    /** 这次就诊做的化验（2026-10-02 新增）：肌酐/蛋白尿这类关键词在里面 */
    labValues?: string | null;
  }>;
}): { tags: string[]; keywords: string[] } {
  const tags = new Set<string>();
  const keywords: string[] = [];

  // 生命阶段
  const stageText = profile.lifeStageLabel ?? '';
  if (/幼犬|14 周/.test(stageText)) {
    tags.add('puppy');
    tags.add('growth');
  }
  if (profile.ageMonths !== null && profile.ageMonths >= 84) {
    tags.add('senior');
    tags.add('geriatric');
  }

  // 体况
  if (profile.bcsScore !== null) {
    if (profile.bcsScore >= 7) {
      tags.add('overweight');
      tags.add('obese');
      keywords.push('减重', '体重管理');
    } else if (profile.bcsScore <= 3) {
      tags.add('underweight');
      keywords.push('增重', '体重管理');
    }
  }
  if (profile.weightTrend.length >= 2) {
    const first = profile.weightTrend[0].weightKg;
    const last = profile.weightTrend[profile.weightTrend.length - 1].weightKg;
    if (first > 0 && last > 0) {
      const changeRatio = (last - first) / first;
      if (changeRatio <= -0.05) {
        tags.add('weight-loss');
        keywords.push('体重下降');
      } else if (changeRatio >= 0.05) {
        tags.add('weight-gain');
        keywords.push('体重上升');
      }
    }
  }

  // ── 过敏原 → food-allergy 标签（2026-10-04 第四期补）──────────
  //
  // 必须**单独判**，不能塞进下面的 historyText 正则里：
  // 那只狗的健康信息可能只有"对鸡肉过敏"这一条，
  // 而 historyText 里根本没有它。
  //
  // 有了这个标签，知识库的 skin-003 / skin-004 / skin-005
  // （排除性饮食试验、试验期严格管理、常见致敏成分）才会被 AI 引用。
  const allergyTerms = splitAllergyKeywords(profile.allergyFoods);
  if (allergyTerms.length > 0) {
    tags.add('food-allergy');
    tags.add('skin');
    // 把过敏原本身也作为检索关键词，让知识库能按具体食材命中
    keywords.push('食物过敏', '排除性饮食试验', ...allergyTerms.slice(0, 8));
  }

  // 病史 / 体检 / 病历关键词
  const historyText = [
    profile.medicalHistory ?? '',
    ...profile.checkups.map(
      (item) =>
        `${item.findings ?? ''} ${item.labValues ?? ''} ${item.recommendations ?? ''}`,
    ),
    ...profile.medicalRecords.map(
      (item) =>
        `${item.diagnosis ?? ''} ${item.chiefComplaint ?? ''} ${item.labValues ?? ''}`,
    ),
  ].join(' ');

  if (/肾|蛋白尿|肾衰|creatinine|肌酐/i.test(historyText)) {
    tags.add('ckd');
    tags.add('renal');
    tags.add('kidney');
    keywords.push('肾病', '磷');
  }
  if (/胰腺|胰炎|高脂|甘油三酯|血脂/i.test(historyText)) {
    tags.add('pancreatitis');
    tags.add('hyperlipidemia');
    tags.add('low-fat');
    keywords.push('低脂', '胰腺炎');
  }
  if (/肠|IBD|炎症性肠病|腹泻|便血|结肠炎|呕吐/i.test(historyText)) {
    tags.add('ibd');
    tags.add('cie');
    tags.add('gi');
    keywords.push('肠道', '消化');
  }
  if (/皮肤|瘙痒|过敏|掉毛|被毛|脱毛|湿疹/i.test(historyText)) {
    tags.add('skin');
    tags.add('food-allergy');
    tags.add('coat');
    keywords.push('皮肤', '过敏');
  }
  if (/结石|尿石|膀胱|尿路|结晶/i.test(historyText)) {
    tags.add('urolith');
    tags.add('urinary');
    keywords.push('结石', '泌尿');
  }
  if (/糖尿|血糖|胰岛素/i.test(historyText)) {
    tags.add('diabetes');
    tags.add('diabetic');
    tags.add('endocrine');
    keywords.push('糖尿病', '血糖', '降糖');
  }
  if (/甲减|甲状腺功能减退|甲状腺|甲亢|甲状腺功能亢进/i.test(historyText)) {
    tags.add('thyroid');
    tags.add('endocrine');
    keywords.push('甲减', '甲亢', '甲状腺');
  }
  if (
    /肝|肝硬化|肝炎|肝硬化|门体分流|肝衰|肝性脑病|肝脂质|脂肪肝|铜中毒|胆管炎/i.test(
      historyText,
    )
  ) {
    tags.add('hepatic');
    tags.add('liver');
    keywords.push('肝脏', '肝病', '肝');
  }
  if (
    /心|心脏|心衰|充血性心衰|心肌病|瓣膜|心血管|心功能不全/i.test(historyText)
  ) {
    tags.add('cardio');
    tags.add('cardiac');
    tags.add('heart');
    keywords.push('心脏', '心衰', '心血管');
  }
  if (
    /关节|骨关节炎|关节炎|骨科|髌骨|十字韧带|髋关节|退行性关节/i.test(
      historyText,
    )
  ) {
    tags.add('ortho');
    tags.add('arthritis');
    tags.add('joint');
    keywords.push('骨关节炎', '关节', '骨科');
  }
  if (/癌|肿瘤|淋巴瘤|肉瘤|癌症|恶性/i.test(historyText)) {
    tags.add('onco');
    tags.add('cancer');
    tags.add('tumor');
    keywords.push('癌症', '肿瘤', '癌');
  }
  if (/认知|痴呆|脑老化|脑衰弱|记忆|认知功能障碍/i.test(historyText)) {
    tags.add('neuro');
    tags.add('cognitive');
    tags.add('cds');
    keywords.push('认知', '脑老化', '记忆');
  }
  if (/牙|牙周|牙龈|口腔|牙齿|牙结石|口炎/i.test(historyText)) {
    tags.add('dental');
    tags.add('periodontal');
    tags.add('oral');
    keywords.push('口腔', '牙周', '牙龈');
  }
  if (/妊娠|怀孕|哺乳|产仔|发情|配种|待产|繁殖/i.test(historyText)) {
    tags.add('repro');
    tags.add('pregnant');
    tags.add('lactating');
    keywords.push('妊娠', '哺乳', '繁殖');
  }
  if (/贫血|缺铁|血细胞|红细胞|造血|血液学/i.test(historyText)) {
    tags.add('hemo');
    tags.add('anemia');
    tags.add('blood');
    keywords.push('贫血', '造血', '血液');
  }

  // 危重症/营养支持：作为支持性领域，可与疾病领域叠加，不加入下方兜底排除
  if (/危重|重症|病危|住院|恶病质|严重营养不良/i.test(historyText)) {
    tags.add('critical');
    tags.add('hospitalized');
    keywords.push('危重症', '营养支持', '住院');
  }

  // 食品安全：自制鲜食对每一只狗都适用（存放、复热、生食、霉变），
  // 因此无条件命中，不做疾病/阶段判断。
  //
  // 2026-09-30 修复：此前 SAFE 领域的 7 条知识标签为 safe / food-safety /
  // foodborne / all，而本函数从不产出这些标签，关键词路径也全部落空——
  // 结果这 7 条从未进入过任何一次 AI 提示词。现在补上。
  tags.add('safe');
  tags.add('food-safety');

  // 健康管理三个新领域的检索标签（2026-10-01）。
  //
  // 疫苗、分诊、就医时机对**每一只狗**都成立，所以无条件产出；
  // 化验解读只在真的有检查记录时才需要。
  //
  // 这些标签会让免疫/化验/就医时机三个领域的条目进入检索结果，
  // 但**食谱设计侧看不到它们** —— buildPromptContext 的 purpose 会把这三个
  // 领域整体排除（它们对配方没有输入价值，放进去只会占名额）。
  tags.add('vaccine');
  tags.add('immune');
  tags.add('prevention');
  tags.add('clinical');
  tags.add('red-flag');
  if (profile.checkups.length > 0 || profile.medicalRecords.length > 0) {
    tags.add('lab');
  }

  // 通用成年犬营养维护：无疾病/特殊阶段标签时兜底命中，保证健康成犬也有权威条目可引用
  if (
    ![
      'ckd',
      'pancreatitis',
      'ibd',
      'skin',
      'urolith',
      'diabetes',
      'thyroid',
      'endocrine',
      'hepatic',
      'liver',
      'cardio',
      'cardiac',
      'heart',
      'ortho',
      'arthritis',
      'joint',
      'onco',
      'cancer',
      'tumor',
      'neuro',
      'cognitive',
      'cds',
      'dental',
      'periodontal',
      'oral',
      'repro',
      'pregnant',
      'lactating',
      'hemo',
      'anemia',
      'blood',
    ].some((tag) => tags.has(tag)) &&
    !tags.has('puppy') &&
    !tags.has('growth') &&
    !tags.has('senior') &&
    !tags.has('geriatric') &&
    profile.ageMonths !== null &&
    profile.ageMonths >= 12
  ) {
    tags.add('general');
    tags.add('adult');
    keywords.push('成年犬', '维持期');
  }

  // 人工修正（第八期）：营养师发现系统猜错了，可以在后台改。
  // 放在最后一步，保证"人工改的"覆盖"系统猜的"。
  const overrides = profile.healthTagOverrides || {};
  for (const tag of overrides.removed || []) {
    tags.delete(String(tag).trim().toLowerCase());
  }
  for (const tag of overrides.added || []) {
    const normalized = String(tag).trim().toLowerCase();
    if (normalized) {
      tags.add(normalized);
    }
  }

  return { tags: [...tags], keywords };
}

/**
 * 解析数据库里的人工修正 JSON。
 *
 * 容错：字段缺失、类型不对、混进非字符串，一律忽略而不是抛错 ——
 * 这是纠错用的辅助数据，不该因为它长得不对就让配方设计整个失败。
 */
export function parseHealthTagOverrides(value: unknown): {
  added: string[];
  removed: string[];
} {
  const source = (value && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >;
  const toStringList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    return Array.from(
      new Set(
        input
          .map((item) =>
            String(item ?? '')
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    ).slice(0, 40);
  };
  return {
    added: toStringList(source.added),
    removed: toStringList(source.removed),
  };
}

/** 由标签推导食谱结构框架模板名 */
function deriveFrameworkTemplateName(tags: string[]): string {
  const set = new Set(tags);
  if (set.has('ckd') || set.has('renal')) return '肾脏病低磷模板';
  if (set.has('pancreatitis') || set.has('hyperlipidemia'))
    return '胰腺炎/低脂模板';
  if (set.has('urolith')) return '泌尿结石模板（需先明确结石类型）';
  return '默认模板';
}

/** 计算两个日期之间的完整月数 */
function calcMonthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  );
}

/** 将 Prisma 记录归一化为 RecipeAiDesignData */
function normalizeAiDesignDataRecord(record: {
  nutritionPlan: unknown;
  nutritionPlanAccepted: boolean;
  nutritionPlanAcceptedAt: Date | null;
  nutritionPlanNote: string | null;
  nutritionPlanHistory: unknown;
  ingredientRecommendations: unknown;
  reviewResults: unknown;
  sop: unknown;
  sopAccepted: boolean;
  sopAcceptedAt: Date | null;
  updatedAt: Date;
}): RecipeAiDesignData {
  return {
    nutritionPlan:
      record.nutritionPlan &&
      typeof record.nutritionPlan === 'object' &&
      !Array.isArray(record.nutritionPlan)
        ? {
            result: (record.nutritionPlan as Record<string, unknown>)
              .result as NutritionPlanResult,
            accepted: record.nutritionPlanAccepted,
            acceptedAt: record.nutritionPlanAcceptedAt
              ? record.nutritionPlanAcceptedAt.toISOString()
              : undefined,
            note: record.nutritionPlanNote ?? undefined,
          }
        : null,
    nutritionPlanHistory: Array.isArray(record.nutritionPlanHistory)
      ? (record.nutritionPlanHistory as Array<{
          result: NutritionPlanResult;
          note?: string;
          createdAt: string;
        }>)
      : [],
    ingredientRecommendations: Array.isArray(record.ingredientRecommendations)
      ? (record.ingredientRecommendations as Array<{
          result: IngredientRecommendationResult;
          createdAt: string;
        }>)
      : [],
    reviewResults: Array.isArray(record.reviewResults)
      ? (record.reviewResults as Array<{
          result: RecipeReviewResult;
          createdAt: string;
        }>)
      : [],
    sop:
      record.sop && typeof record.sop === 'object' && !Array.isArray(record.sop)
        ? {
            result: (record.sop as Record<string, unknown>).result as SopResult,
            accepted: record.sopAccepted,
            acceptedAt: record.sopAcceptedAt
              ? record.sopAcceptedAt.toISOString()
              : undefined,
          }
        : null,
    updatedAt: record.updatedAt.toISOString(),
  };
}
