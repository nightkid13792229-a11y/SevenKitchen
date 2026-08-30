import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DesignRecipeReviewStatus,
  DesignRecipeStatus,
  BaseUnit,
  IngredientProcurementStrategy,
  IngredientType,
  NutritionFoodCategory,
  NutritionFoodStatus,
  Prisma,
  RecipeSeriesBusinessStatus,
  RecipeStatus,
  RecipeSeriesStatus,
  UserRole,
} from '@prisma/client';
import { nutritionDataToNutritionProfile } from '../nutrition-standard/nutrient-value-resolver';
import {
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
import type { NutritionProfile } from '../../domain/ingredient/types';
import {
  getProfileEffectiveWeightG,
  readProfileFieldAmount,
  readProfileValuePer100g,
} from '../../domain/recipe-designer/nutrition-profile-reader';
import { buildFoodWeightRatioMap } from '../../domain/recipe/food-ratio-normalization';
import {
  assessRecipeDraft,
  type DesignRecipeAssessmentResult,
} from '../../domain/recipe-designer/recipe-assessment';
import { inferSupplementTargetsByRemoval } from '../../domain/recipe-designer/supplement-target-inference';
import type {
  AssessmentEntry,
  AssessmentExpressionBasis,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import { PrismaService } from '../../infrastructure/prisma.service';
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
  ListRecipeDesignerIngredientOptionsDto,
  ListRecipeDesignerSeriesDto,
  PublishRecipeDesignDraftDto,
  RenameRecipeSeriesDto,
  ReorderRecipeDesignItemsDto,
  UpdateDogDesignNotesDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
} from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  FEDIAF_TARGET_PROVIDER,
  type FediafTargetProvider,
} from './fediaf-target-provider';
import { buildDogDesignInsight } from '../../domain/recipe-designer/dog-design-insight';
import {
  AiDesignSuggestionService,
  type AiDesignSuggestionInput,
} from './ai-design-suggestion.service';
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
  seriesId: true,
  seriesLifeStage: true,
};

const RECIPE_SERIES_WORKBENCH_RECIPE_SELECT = {
  recipeId: true,
  seriesLifeStage: true,
  status: true,
  updatedAt: true,
};

const RECIPE_DESIGNER_PUBLISHED_SOURCE = 'Setar';
const RECIPE_DESIGNER_BACKFILL_USER_ID = 'recipe-designer-backfill';
const RECIPE_SERIES_BACKFILL_USER_ID = 'recipe-series-backfill';
const INTERNAL_RECIPE_DESIGNER_CREATOR_IDS = [
  RECIPE_DESIGNER_BACKFILL_USER_ID,
  RECIPE_SERIES_BACKFILL_USER_ID,
];
const PUBLISHED_RECIPE_PRODUCTION_LOSS_RATE = 1.05;
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

type DesignRecipeItemWithFood = {
  id: string;
  ingredientId: string | null;
  nutritionFoodId: string;
  weightG: number;
  includeInAssessment: boolean;
  ratioPercent: number | null;
  preparationMethod: string | null;
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
};

type RecipeSeriesWorkbenchRecord = {
  id: string;
  name: string;
  status: string;
  businessStatus?: RecipeSeriesBusinessStatus | string | null;
  createdBy?: string | null;
  customerDogId?: string | null;
  referenceDogId?: string | null;
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

  for (const macroKey of Object.keys(profile.macros)) {
    profile.macros[macroKey as keyof typeof profile.macros] = 0;
  }

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
  ) {}

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
      const pagedFoodOptions = foodOptions.slice(skip, skip + effectivePageSize);
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
      const pagedIngredients = rankedIngredients.slice(skip, skip + effectivePageSize);
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
      const orderA = idxA === -1 ? this.SUPPLEMENT_CATEGORY_ORDER.length - 1 : idxA;
      const orderB = idxB === -1 ? this.SUPPLEMENT_CATEGORY_ORDER.length - 1 : idxB;
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
    const usePagination = query.page !== undefined || query.pageSize !== undefined;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const series = (await this.prisma.recipeSeries.findMany({
      where: {
        ...(await this.buildSeriesVisibilityWhere(context)),
        ...(query.status ? { businessStatus: query.status } : {}),
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

    if (!isInternalRecipeDesignerRole(context)) {
      const dogNameById = await this.loadCustomerDogNameMapForSeries(
        visibleSeries,
        context,
      );
      const items = visibleSeries.map((record) =>
        this.buildCustomerSeriesCard(record, dogNameById),
      );
      return usePagination ? { items, page, pageSize, hasMore } : items;
    }

    const cards = visibleSeries.map((record) =>
      this.buildSeriesWorkbenchCard(record, context.userId),
    );
    const items = this.filterSeriesWorkbenchCards(cards, query.status);
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
              return this.buildCustomerSeriesCard({
                ...copiedSeries,
                customerDogId: copiedCustomerDogId,
                designs: copiedDesigns,
                recipes: [],
              } as RecipeSeriesWorkbenchRecord);
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
                    const updated =
                      await tx.designRecipe.findUnique({
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
                fediafDogScenario: mapSeriesLifeStageToScenario(targetLifeStage),
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

      const supplementTargets = this.normalizeCopiedDesignSupplementTargets(
        item,
      );
      return {
        ingredientId: item.ingredientId,
        nutritionFoodId,
        weightG: this.resolveRecipeItemDesignWeight(item),
        includeInAssessment: true,
        ratioPercent: item.ratioPercent ?? null,
        preparationMethod: this.sanitizeCopiedPreparationMethod(
          item.preparationMethod,
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
    const firstSegment = trimmed.split(',').map((s) => s.trim()).find(Boolean);
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

    return this.prisma.recipeSeries.update({
      where: { id: seriesId },
      data: { name },
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
      updatedAt: series.updatedAt,
      publishedStageCount,
      stages,
    };
  }

  private buildCustomerSeriesCard(
    record: RecipeSeriesWorkbenchRecord,
    dogNameById: Map<string, string> = new Map(),
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
        canOrder: readiness.canCreateSnapshot,
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

  private hasDesignRecipeItems(
    design: {
      items?: unknown[];
      _count?: { items: number };
    },
  ): boolean {
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
    const currentDraft = await this.assertDraftEditableByUser(
      id,
      context.userId,
    );
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

    const revisionName = this.buildRevisionDraftName(source.name);
    const latestVersion = await this.prisma.designRecipe.aggregate({
      where: { name: revisionName },
      _max: { version: true },
    });

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
    await this.assertDraftEditableByUser(designRecipeId, context.userId);
    const ingredientId = await this.resolveDesignItemIngredientId(dto);
    const preparationMethod = await this.resolveDesignItemPreparationMethod(
      dto.preparationMethod,
      ingredientId,
    );
    const shouldPersistNutrientTarget =
      await this.isIngredientIdSupplement(ingredientId);
    const supplementTargets = shouldPersistNutrientTarget
      ? this.normalizeDesignSupplementTargets(
          dto.supplementTargets,
          dto.nutrientTargetKey,
          dto.nutrientTargetValue,
        )
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
      preparationMethod,
      ...(shouldPersistNutrientTarget
        ? {
            nutrientTargetKey: dto.nutrientTargetKey ?? null,
            nutrientTargetValue: dto.nutrientTargetValue ?? null,
            ...(supplementTargets.length > 0
              ? { supplementTargets: this.toJsonValue(supplementTargets) }
              : {}),
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
    const draft = await this.assertItemEditableByUser(itemId, context.userId);
    const supplementTargets =
      dto.supplementTargets !== undefined
        ? this.normalizeDesignSupplementTargets(dto.supplementTargets)
        : dto.nutrientTargetKey !== undefined
          ? this.normalizeDesignSupplementTargets(
              undefined,
              dto.nutrientTargetKey,
              dto.nutrientTargetValue,
            )
          : undefined;

    const data = {
      ...(dto.weightG !== undefined ? { weightG: dto.weightG } : {}),
      ...(dto.preparationMethod !== undefined
        ? { preparationMethod: dto.preparationMethod }
        : {}),
      ...(dto.nutrientTargetKey !== undefined
        ? { nutrientTargetKey: dto.nutrientTargetKey }
        : {}),
      ...(dto.nutrientTargetValue !== undefined
        ? { nutrientTargetValue: dto.nutrientTargetValue }
        : {}),
      ...(supplementTargets !== undefined
        ? {
            supplementTargets:
              supplementTargets.length > 0
                ? this.toJsonValue(supplementTargets)
                : null,
          }
        : {}),
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
    await this.assertDraftEditableByUser(designRecipeId, context.userId);
    const items = dto.items ?? [];
    if (items.length === 0) throw new BadRequestException('排序项不能为空');
    const seenItemIds = new Set<string>();
    const normalizedItems = items.map((item) => {
      const itemId = String(item.id || '').trim();
      const sortOrder = Number(item.sortOrder);
      if (!itemId || !Number.isFinite(sortOrder) || sortOrder < 0) throw new BadRequestException('排序项格式不正确');
      if (seenItemIds.has(itemId)) throw new BadRequestException('排序项不能重复');
      seenItemIds.add(itemId);
      return { id: itemId, sortOrder };
    });
    return this.prisma.$transaction(async (tx) => {
      let updatedCount = 0;
      for (const item of normalizedItems) {
        const result = await tx.designRecipeItem.updateMany({ where: { id: item.id, designRecipeId }, data: { sortOrder: item.sortOrder } });
        if (result.count !== 1) throw new NotFoundException(`Design recipe item ${item.id} not found`);
        updatedCount += result.count;
      }
      await tx.designRecipe.update({ where: { id: designRecipeId }, data: { contentRevision: { increment: 1 } } });
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
            this.assertEditableDraft(draft, designRecipeId, context.userId);

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
    const draft = await this.assertItemEditableByUser(itemId, context.userId);

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

    if (this.isPublishedDraft(draft)) {
      return this.toClientAssessmentResult(result, removableSupplementWarnings);
    }

    const assessmentData = this.buildAssessmentUpdateData(result);
    await this.prisma.designRecipe.updateMany({
      where: { id, contentRevision: draft.contentRevision },
      data: assessmentData,
    });

    return this.toClientAssessmentResult(result, removableSupplementWarnings);
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

    const itemCreates = this.buildPrivateRecipeSnapshotItemCreateData(draft);
    const customerOwnerId = isInternalRecipeDesignerRole(context)
      ? draft.createdBy
      : getRecipeDesignerCustomerOwnerId(context);
    const baseData = {
      name: this.resolvePrivateRecipeSnapshotDisplayName(draft),
      status: RecipeStatus.PRIVATE_CUSTOM,
      energyDensityKcalPerKg: Number(draft.energyDensityKcalPerKg),
      productionLossRate: PUBLISHED_RECIPE_PRODUCTION_LOSS_RATE,
      batchLaborHours: PUBLISHED_RECIPE_BATCH_LABOR_HOURS,
      applicableLifeStages: this.resolvePublishedLifeStages(draft),
      targetHealthTags: draft.targetHealthTags,
      nutritionDetailedData: this.toJsonValue(
        this.buildPrivateRecipeSnapshotNutritionData(draft),
      ),
      nutritionStandard: draft.nutritionStandard ?? 'FEDIAF_2025',
      description: draft.notes,
      designSource: RECIPE_DESIGNER_PUBLISHED_SOURCE,
      isCustomRecipe: true,
      ...(draft.seriesId ? { seriesId: draft.seriesId } : {}),
      ...(draft.seriesLifeStage
        ? { seriesLifeStage: draft.seriesLifeStage }
        : {}),
      customerOwnerId,
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
    const recipe = existing
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

  private resolvePrivateRecipeSnapshotDisplayName(
    draft: DesignRecipeWithItems,
  ): string {
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

    const requestedRecipeName = dto.name?.trim() || '';
    const recipeName = this.stripRevisionSuffix(requestedRecipeName);
    const reviewNote = dto.reviewNote?.trim() || null;

    if (!recipeName) {
      throw new BadRequestException('请填写食谱名称');
    }

    const draft = await this.loadDraft(id);
    if (!(await this.isInternalRecipeDesignerCreatorId(draft.createdBy))) {
      throw new BadRequestException('用户私有草稿不能发布为正式食谱');
    }

    await this.assertRevisionHasPublishableChanges(draft, recipeName);

    const targets = await this.targetProvider.getTargets(
      draft.fediafDogScenario,
    );
    const assessment = await this.assessLoadedDraft(draft, targets);

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
    const supplementTargetMap = this.buildPublishedSupplementTargetMap(
      draft,
      assessment,
      targets,
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

    return this.prisma.$transaction(async (tx) => {
      const recipe = await tx.recipe.create({
        data: {
          recipeId: publishTarget.recipeId,
          version: publishTarget.version,
          name: recipeName,
          status: RecipeStatus.DRAFT,
          energyDensityKcalPerKg,
          productionLossRate: PUBLISHED_RECIPE_PRODUCTION_LOSS_RATE,
          batchLaborHours: PUBLISHED_RECIPE_BATCH_LABOR_HOURS,
          applicableLifeStages: this.resolvePublishedLifeStages(draft),
          targetHealthTags: draft.targetHealthTags,
          nutritionDetailedData: this.toJsonValue(
            this.buildPublishedNutritionDetailedData(draft, assessment),
          ),
          nutritionStandard: 'FEDIAF_2025',
          description: draft.notes,
          designSource: RECIPE_DESIGNER_PUBLISHED_SOURCE,
          isCustomRecipe: false,
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
        nutrientTargetKey: this.normalizeComparableText(item.nutrientTargetKey),
        nutrientTargetValue: this.normalizeComparableNumber(
          item.nutrientTargetValue,
        ),
        supplementTargets: JSON.stringify(
          this.normalizeDesignSupplementTargets(item.supplementTargets),
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
            left.nutrientTargetKey.localeCompare(right.nutrientTargetKey),
            left.supplementTargets.localeCompare(right.supplementTargets),
          ].find((result) => result !== 0) ?? 0
        );
      });
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
  ) {
    return draft.items
      .filter((item) => this.isItemIncludedInAssessment(item))
      .map((item) => {
        const supplementTargets = this.normalizeDesignSupplementTargets(
          item.supplementTargets,
        );
        return {
          ingredientId: this.resolveIngredientId(item),
          nutritionFoodId: item.nutritionFoodId,
          preparationMethod: this.normalizePreparationMethod(
            item.preparationMethod,
          ),
          ratioPercent: this.resolvePrivateRecipeItemRatio(
            item,
            draft.totalWeightG,
          ),
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
          ...(supplementTargets.length > 0
            ? { supplementTargets: this.toJsonValue(supplementTargets) }
            : {}),
          sortOrder: item.sortOrder,
          exampleWeight: item.weightG,
        };
      });
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

    return {
      ingredientId,
      preparationMethod:
        this.normalizePreparationMethod(item.preparationMethod) ??
        defaultPreparationMethod,
      ratioPercent: isSupplement
        ? null
        : (publishedFoodRatioMap.get(item.id) ??
          this.findAssessedRatio(assessment, item.id)),
      ...nutrientTargetData,
      sortOrder: item.sortOrder,
      exampleWeight: item.weightG,
    };
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

    return resolvedTargets
      .map((target) => {
        const targetKey = target.nutrientTargetKey?.trim();
        const targetValue = Number(target.nutrientTargetValue);
        if (!targetKey || !Number.isFinite(targetValue) || targetValue <= 0) {
          return null;
        }

        const targetField =
          target.fieldPath && target.label && target.unit
            ? {
                fieldPath: target.fieldPath,
                label: target.label,
                unit: target.unit,
              }
            : this.resolveSupplementTargetField(targetKey);
        if (!targetField) {
          return null;
        }

        return {
          fieldPath: targetField.fieldPath,
          label: targetField.label,
          targetValuePerKg: targetValue,
          unit: targetField.unit,
        };
      })
      .filter(
        (target): target is NonNullable<typeof target> => target !== null,
      );
  }

  private buildPublishedSupplementTargetMap(
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
    targets: FediafAssessmentTarget[],
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
        this.resolveExplicitPublishedSupplementTargets(
          item,
          draft,
          assessment,
          targets,
        ),
      );
    }

    return result;
  }

  private resolveExplicitPublishedSupplementTargets(
    item: DesignRecipeItemWithFood,
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
    targets: FediafAssessmentTarget[],
  ): PublishedSupplementNutrientTarget[] {
    if (assessment.totalWeightG <= 0) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」无法在总重量为 0 的配方中生成营养目标`,
      );
    }

    let designTargets = this.normalizeDesignSupplementTargets(
      item.supplementTargets,
    );
    if (designTargets.length === 0) {
      designTargets = this.inferDesignSupplementTargetsByRemoval(
        item,
        draft,
        assessment,
        targets,
      );
    }
    if (designTargets.length === 0) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」缺少营养目标，请在食谱编辑器中从营养评估项添加补剂后再发布`,
      );
    }

    return designTargets
      .map((target) =>
        this.resolveExplicitPublishedSupplementTarget(item, target, assessment),
      )
      .sort((left, right) => {
        if (right.nutrientTargetValue !== left.nutrientTargetValue) {
          return right.nutrientTargetValue - left.nutrientTargetValue;
        }
        return (left.fieldPath ?? '').localeCompare(right.fieldPath ?? '');
      });
  }

  private inferDesignSupplementTargetsByRemoval(
    item: DesignRecipeItemWithFood,
    draft: DesignRecipeWithItems,
    assessment: DesignRecipeAssessmentResult,
    targets: FediafAssessmentTarget[],
  ): DesignSupplementTarget[] {
    return inferSupplementTargetsByRemoval({
      itemId: item.id,
      itemName: this.resolveIngredientDisplayName(item),
      itemNutritionProfile: this.toAssessmentNutritionProfile(item),
      itemWeightG: item.weightG,
      totalRecipeWeightG: assessment.totalWeightG,
      fullAssessment: assessment,
      assessmentWithoutItem: assessRecipeDraft({
        scenario: draft.fediafDogScenario,
        targets,
        items: this.buildAssessmentItems(draft, item.id),
      }),
    }).map((target) => ({
      nutrientTargetKey: target.fieldKey,
      fieldPath: target.fieldPath,
      label: target.label,
      unit: target.unit,
      targetValue: null,
      expressionBasis: null,
    }));
  }

  private resolveExplicitPublishedSupplementTarget(
    item: DesignRecipeItemWithFood,
    target: DesignSupplementTarget,
    assessment: DesignRecipeAssessmentResult,
  ): PublishedSupplementNutrientTarget {
    const targetField = this.resolveSupplementTargetField(target.fieldPath);
    if (!targetField) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」的营养目标 ${target.fieldPath} 不在可发布字段中`,
      );
    }

    const amountRead = readProfileFieldAmount(
      this.toAssessmentNutritionProfile(item),
      targetField.fieldPath,
      item.weightG,
    );
    const contributionAmount = Number(amountRead.amount);
    if (amountRead.missing || !Number.isFinite(contributionAmount)) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」的营养档案缺少${targetField.label}数据，无法生成营养目标`,
      );
    }
    if (contributionAmount <= 0) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」的营养档案中${targetField.label}含量为 0，无法生成营养目标`,
      );
    }

    const nutrientTargetValue = this.roundPublishedSupplementTargetValue(
      (contributionAmount / assessment.totalWeightG) * 1000,
    );
    if (!Number.isFinite(nutrientTargetValue) || nutrientTargetValue <= 0) {
      throw new BadRequestException(
        `补剂原料「${this.resolveIngredientDisplayName(item)}」的${targetField.label}目标值无效，无法发布`,
      );
    }

    return {
      nutrientTargetKey: target.nutrientTargetKey || targetField.fieldKey,
      nutrientTargetValue,
      fieldPath: targetField.fieldPath,
      label: targetField.label,
      unit: targetField.unit,
    };
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
      const targetField = this.resolveSupplementTargetField(targetKey);
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
      const targetField = this.resolveSupplementTargetField(legacyTargetKey);
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

  private normalizeCopiedDesignSupplementTargets(
    item: {
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
    },
  ): DesignSupplementTarget[] {
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

  private roundPublishedSupplementTargetValue(value: number) {
    return Math.round(value);
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

  async buildPublishedNutritionDetailedDataForDraft(
    draft: DesignRecipeWithItems,
  ) {
    const targets = await this.targetProvider.getTargets(
      draft.fediafDogScenario,
    );
    const assessment = await this.assessLoadedDraft(draft, targets);

    if (assessment.energyDensityKcalPerKg === null) {
      throw new BadRequestException('缺少能量数据，无法生成营养报告');
    }

    return this.buildPublishedNutritionDetailedData(draft, assessment);
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
        amountLabel: this.formatPublishedReportAmount(
          assessedItem.weightG,
          isSupplement ? this.resolvePublishedSupplementUnit(draftItem) : 'g',
        ),
        weightPercentLabel: isSupplement
          ? '-'
          : this.formatPublishedReportPercent(assessedItem.ratioPercent),
      };
    });
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

  private async assertDraftEditableByUser(id: string, userId: string) {
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
      },
    });

    this.assertEditableDraft(draft, id, userId);
    return draft;
  }

  private async assertItemEditableByUser(itemId: string, userId: string) {
    const item = await this.prisma.designRecipeItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        designRecipe: {
          select: {
            id: true,
            createdBy: true,
            status: true,
            publishedRecipeId: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!item?.designRecipe || item.designRecipe.createdBy !== userId) {
      throw new NotFoundException(`Design recipe item ${itemId} not found`);
    }

    this.assertEditableDraft(item.designRecipe, item.designRecipe.id, userId);
    return item.designRecipe;
  }

  private assertEditableDraft(
    draft: EditableDesignRecipeRecord | null,
    id: string,
    userId: string,
  ) {
    if (!draft || draft.createdBy !== userId) {
      throw new NotFoundException(`Design recipe ${id} not found`);
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
  ): ClientDesignRecipeAssessmentResult {
    const clientResult: Partial<DesignRecipeAssessmentResult> = { ...result };
    delete clientResult.entries;
    return {
      ...clientResult,
      removableSupplementWarnings,
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
  ) {
    const normalizedExplicit = this.normalizePreparationMethod(
      explicitPreparationMethod,
    );
    if (normalizedExplicit) {
      return normalizedExplicit;
    }

    if (!ingredientId) {
      return null;
    }

    return this.resolveDefaultPreparationMethodForIngredient(ingredientId);
  }

  private normalizePreparationMethod(value: string | null | undefined) {
    return normalizePreparationMethodHistoryText(value) ?? null;
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
  ) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (!isInternalRecipeDesignerRole(context)) {
      throw new BadRequestException('仅内部角色可使用爱犬设计洞察');
    }
    // 「最近吃过的食材」时间窗口（天）：支持前端选择，默认 90，范围 7~365
    const windowDays = this.resolveRecentEatenWindowDays(recentDays);

    const dog = await this.prisma.dog.findUnique({
      where: { id: dogId },
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

    const insight = buildDogDesignInsight({
      dog: dogForLifeStage,
      seriesList,
      orderItems,
      recentEatenOrderItems,
      lifeStageLabel,
    });

    const aiEnabled =
      ((await this.aiDesignSuggestionService?.isAvailable()) ?? false) === true;

    return { ...insight, aiEnabled };
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
      select: { id: true, createdBy: true },
    });
    if (!series || series.createdBy === null) {
      throw new NotFoundException('食谱系列不存在');
    }
    if (!(await this.isSeriesAccessibleByContext(series, context))) {
      throw new NotFoundException('食谱系列不存在');
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

  async getCustomerDesignerAccess(access: RecipeDesignerAccessInput) {
    const context = normalizeRecipeDesignerAccessContext(access);
    if (isInternalRecipeDesignerRole(context)) {
      return { isCustomer: false, hasDesignHistory: true };
    }

    const seriesCount = await this.prisma.recipeSeries.count({
      where: {
        status: RecipeSeriesStatus.ACTIVE,
        deletedAt: null,
        createdBy: context.userId,
      },
    });
    return { isCustomer: true, hasDesignHistory: seriesCount > 0 };
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
        allergyFoods: insight.dog.allergyFoods,
        pickyFoods: insight.dog.pickyFoods,
        preferredFoods: insight.dog.preferredFoods,
        medicalHistory: insight.dog.medicalHistory,
      },
      designHistory: insight.designHistory,
      orderSummary: insight.orderSummary,
      currentDraft,
    });
  }

  private buildAiAssessmentSummaryText(
    draft: DesignRecipeWithItems,
  ): string {
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
}
