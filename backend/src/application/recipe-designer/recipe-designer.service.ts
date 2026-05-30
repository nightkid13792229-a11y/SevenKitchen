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
  RecipeStatus,
  RecipeSeriesStatus,
} from '@prisma/client';
import { nutritionDataToNutritionProfile } from '../nutrition-standard/nutrient-value-resolver';
import {
  findNutritionField,
  getNutritionProfileFieldValue,
  listSupplementTargetFields,
} from '../../domain/ingredient/nutrition-field-catalog';
import {
  createEmptyNutritionProfile,
  normalizeNutritionProfile,
} from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../domain/ingredient/types';
import { readProfileValuePer100g } from '../../domain/recipe-designer/nutrition-profile-reader';
import { calculateDogAtwaterEnergyPer100g } from '../../domain/recipe-designer/dog-atwater-energy';
import {
  assessRecipeDraft,
  type DesignRecipeAssessmentResult,
} from '../../domain/recipe-designer/recipe-assessment';
import type {
  AssessmentEntry,
  AssessmentExpressionBasis,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  AddRecipeDesignItemDto,
  CreateRecipeDesignerSupplementOptionDto,
  CreateRecipeDesignDraftDto,
  CreateRecipeSeriesDto,
  CreateRecipeSeriesStageDraftDto,
  DeleteRecipeSeriesDto,
  ListRecipeDesignerIngredientOptionsDto,
  PublishRecipeDesignDraftDto,
  RenameRecipeSeriesDto,
  UpdateRecipeDesignDraftDto,
  UpdateRecipeDesignItemDto,
} from '../../interfaces/dto/recipe-designer/recipe-designer.dto';
import {
  FEDIAF_TARGET_PROVIDER,
  type FediafTargetProvider,
} from './fediaf-target-provider';
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
  SERIES_LIFE_STAGE_LABELS,
  mapScenarioToSeriesLifeStage,
  mapSeriesLifeStageToScenario,
  type RecipeSeriesLifeStage,
  type RecipeSeriesStageStatus,
} from '../../domain/recipe/recipe-series';

const DESIGN_RECIPE_INCLUDE = {
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
                },
              },
            },
          },
        },
      },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
};

const RECIPE_DESIGNER_PUBLISHED_SOURCE = 'Setar';
const PUBLISHED_RECIPE_PRODUCTION_LOSS_RATE = 1.05;
const PUBLISHED_RECIPE_BATCH_LABOR_HOURS = 2;
const DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS = 3;

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

const normalizeNutritionTargetKey = (value: string) =>
  value.replace(/\s+/g, '').toLowerCase();

type DesignRecipeWithItems = {
  id: string;
  name: string;
  version: number;
  status: string;
  fediafDogScenario: FediafDogScenarioCode;
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
  isCompliant: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  calculatedNutrition: unknown;
  complianceStatus: unknown;
  assessmentSummary: unknown;
  missingDataReport: unknown;
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
  sortOrder: number;
  ingredient?: {
    id: string;
    name: string;
    type: IngredientType;
    unitDisplayLabel?: string | null;
    purchaseUnit?: string | null;
    properties?: unknown;
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

type RevisionChangeState = 'NOT_REVISION' | 'UNCHANGED' | 'CHANGED';

type DesignRecipeWorkbenchCard = DesignRecipeWithItems & {
  revisionChangeState: RevisionChangeState;
  versionHistory?: DesignRecipeWorkbenchCard[];
};

type RecipeSeriesWorkbenchRecord = {
  id: string;
  name: string;
  status: string;
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
  }>;
  recipes: Array<{
    recipeId: string;
    seriesLifeStage?: string | null;
    status: string;
    version?: number;
    updatedAt?: Date | string | null;
  }>;
};

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

const KCAL_TO_MJ = 0.004184;
const MAX_SEARCH_EXPANSION_TERMS = 8;
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
  return String(value ?? '').trim().toLowerCase();
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

  if (
    !firstUnit ||
    !fieldUnits.every((fieldUnit) => fieldUnit === firstUnit)
  ) {
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
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return null;
  }
  return normalizeOptionalText((properties as Record<string, unknown>).display_unit);
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
  basisType: 'PER_1_G' | 'PER_100_G' | 'PER_1_ML' | 'PER_100_ML' | 'PER_SERVING',
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
    servingUnitLabel: basisType === 'PER_SERVING' ? options.usageUnit : undefined,
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
  ) {}

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
    const skip = (page - 1) * pageSize;
    const searchTerms = await this.expandIngredientSearchTerms(dto.search);
    const nutrientTarget = await this.resolveIngredientNutrientSearchTarget(dto);
    const verifiedMappingWhere = {
      nutritionFood: { status: NutritionFoodStatus.VERIFIED },
    };
    const searchFilter: Prisma.IngredientWhereInput | undefined =
      searchTerms.length
        ? {
            OR: buildIngredientSearchConditions(searchTerms),
          }
        : undefined;
    const where: Prisma.IngredientWhereInput = {
      type: { in: [IngredientType.FOOD, IngredientType.SUPPLEMENT] },
      nutritionFoodMappings: { some: verifiedMappingWhere },
      ...(searchFilter ?? {}),
    };
    const select = this.buildIngredientOptionSelect(!!nutrientTarget);

    if (nutrientTarget) {
      const ingredients = await this.prisma.ingredient.findMany({
        where,
        orderBy: { name: 'asc' },
        select,
      });
      const options = ingredients
        .map((ingredient) =>
          this.toIngredientOption(
            ingredient as IngredientOptionRecord,
            nutrientTarget,
          ),
        );
      const supplementOptions = options.filter(
        (option) =>
          option.type === IngredientType.SUPPLEMENT && option.nutrientMatch,
      );
      const foodOptions = options
        .filter(
          (option) =>
            option.type !== IngredientType.SUPPLEMENT && option.nutrientMatch,
        )
        .sort(compareIngredientOptionsByNutrientMatch);
      const pagedFoodOptions = foodOptions.slice(skip, skip + pageSize);
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
        pageSize,
        hasMore: skip + pageSize < foodOptions.length,
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
      const pagedIngredients = rankedIngredients.slice(skip, skip + pageSize);
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
        pageSize,
        hasMore: skip + pageSize < rankedIngredients.length,
      };
    }

    const [total, ingredients] = await Promise.all([
      this.prisma.ingredient.count({ where }),
      this.prisma.ingredient.findMany({
        where,
        skip,
        take: pageSize,
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
      pageSize,
      hasMore: skip + pageSize < total,
    };
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
    if (requiresSupplementServingWeight(usageUnit, basisType) && !servingWeightG) {
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

  async listDrafts(createdBy: string) {
    const drafts = (await this.prisma.designRecipe.findMany({
      where: {
        OR: [
          { createdBy },
          {
            status: DesignRecipeStatus.PUBLISHED,
            publishedRecipeId: { not: null },
          },
        ],
      },
      include: DESIGN_RECIPE_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    })) as DesignRecipeWithItems[];

    return this.buildDesignRecipeWorkbenchCards(drafts);
  }

  async listSeries(userId: string) {
    const series = (await this.prisma.recipeSeries.findMany({
      where: {
        status: RecipeSeriesStatus.ACTIVE,
        deletedAt: null,
      },
      include: {
        designs: {
          orderBy: { updatedAt: 'desc' },
        },
        recipes: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })) as RecipeSeriesWorkbenchRecord[];

    return series.map((record) => this.buildSeriesWorkbenchCard(record, userId));
  }

  async createSeries(dto: CreateRecipeSeriesDto, userId: string) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请填写系列名称');
    }

    const scenario = dto.scenario ?? 'ADULT_MER_110';
    const lifeStage = mapScenarioToSeriesLifeStage(scenario);

    for (let attempt = 1; attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const series = await tx.recipeSeries.create({
            data: {
              name,
              status: RecipeSeriesStatus.ACTIVE,
              createdBy: userId,
            },
          });

          const version = await this.allocateNextDesignRecipeVersion(tx, name);
          const design = await tx.designRecipe.create({
            data: {
              name,
              version,
              status: DesignRecipeStatus.DRAFT,
              fediafDogScenario: scenario,
              nutritionStandard: 'FEDIAF_2025',
              targetHealthTags: [],
              applicableLifeStages: [lifeStage],
              createdBy: userId,
              seriesId: series.id,
              seriesLifeStage: lifeStage,
            },
            include: DESIGN_RECIPE_INCLUDE,
          });

          return this.buildSeriesWorkbenchCard(
            {
              ...series,
              designs: [design],
              recipes: [],
            } as RecipeSeriesWorkbenchRecord,
            userId,
          );
        });
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isDesignRecipeNameVersionCollision(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('配方系列创建失败，请重试');
  }

  async createSeriesStageDraft(
    seriesId: string,
    dto: CreateRecipeSeriesStageDraftDto,
    userId: string,
  ) {
    const lifeStage = mapScenarioToSeriesLifeStage(dto.scenario);
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      include: {
        designs: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }

    const existingDraft = series.designs.find(
      (design) =>
        design.seriesLifeStage === lifeStage &&
        !this.isPublishedDraft(design),
    );
    if (existingDraft) {
      return existingDraft;
    }

    return this.createDesignRecipeWithAllocatedVersion(
      this.prisma,
      series.name,
      (version) => ({
        name: series.name,
        version,
        status: DesignRecipeStatus.DRAFT,
        fediafDogScenario: dto.scenario,
        nutritionStandard: 'FEDIAF_2025',
        targetHealthTags: [],
        applicableLifeStages: [lifeStage],
        createdBy: userId,
        seriesId,
        seriesLifeStage: lifeStage,
      }),
    );
  }

  async renameSeries(
    seriesId: string,
    dto: RenameRecipeSeriesDto,
    _userId: string,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('请填写系列名称');
    }

    return this.prisma.recipeSeries.update({
      where: { id: seriesId },
      data: { name },
    });
  }

  async deleteSeries(
    seriesId: string,
    dto: DeleteRecipeSeriesDto,
    userId: string,
  ) {
    const series = await this.prisma.recipeSeries.findUnique({
      where: { id: seriesId },
      include: {
        designs: true,
      },
    });

    if (
      !series ||
      series.status !== RecipeSeriesStatus.ACTIVE ||
      series.deletedAt
    ) {
      throw new NotFoundException(`Recipe series ${seriesId} not found`);
    }
    if (dto.confirmName !== series.name) {
      throw new BadRequestException('系列名称确认不一致');
    }
    if (!dto.confirmUserVisibleRemoval) {
      throw new BadRequestException('请确认下架用户可见食谱');
    }
    if (
      series.designs.some(
        (design) => design.reviewStatus === DesignRecipeReviewStatus.REQUIRED,
      )
    ) {
      throw new BadRequestException('仍有待审核草稿，不能删除系列');
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
          deletedBy: userId,
        },
      });
    });
  }

  private buildSeriesWorkbenchCard(
    series: RecipeSeriesWorkbenchRecord,
    _userId: string,
  ) {
    const stages = ORDERED_RECIPE_SERIES_LIFE_STAGES.map((lifeStage) => {
      const designs = series.designs.filter(
        (design) => design.seriesLifeStage === lifeStage,
      );
      const recipes = series.recipes.filter(
        (recipe) => recipe.seriesLifeStage === lifeStage,
      );
      const status = this.resolveSeriesStageStatus(designs, recipes);
      const latestDesign = this.pickLatestByUpdatedAt(designs);
      const latestPublicRecipe = this.pickLatestByUpdatedAt(
        recipes.filter((recipe) => recipe.status === RecipeStatus.PUBLIC),
      );
      const latestRecord = this.pickLatestByUpdatedAt([
        ...designs,
        ...recipes,
      ]);

      return {
        lifeStage,
        label: SERIES_LIFE_STAGE_LABELS[lifeStage],
        scenario: mapSeriesLifeStageToScenario(lifeStage),
        status,
        draftId: latestDesign?.id ?? null,
        recipeId: latestPublicRecipe?.recipeId ?? null,
        updatedAt: latestRecord?.updatedAt ?? null,
      };
    });

    return {
      id: series.id,
      name: series.name,
      updatedAt: series.updatedAt,
      publishedStageCount: stages.filter((stage) => stage.status === 'PUBLISHED')
        .length,
      stages,
    };
  }

  private resolveSeriesStageStatus(
    designs: RecipeSeriesWorkbenchRecord['designs'],
    recipes: RecipeSeriesWorkbenchRecord['recipes'],
  ): RecipeSeriesStageStatus {
    if (recipes.some((recipe) => recipe.status === RecipeStatus.PUBLIC)) {
      return 'PUBLISHED';
    }
    if (
      designs.some(
        (design) => design.reviewStatus === DesignRecipeReviewStatus.REQUIRED,
      )
    ) {
      return 'IN_REVIEW';
    }
    if (designs.some((design) => design.status === DesignRecipeStatus.NEEDS_REVIEW)) {
      return 'NEEDS_CHANGES';
    }
    if (designs.some((design) => !this.isPublishedDraft(design))) {
      return 'DRAFT';
    }
    return 'NOT_DESIGNED';
  }

  private pickLatestByUpdatedAt<T extends { updatedAt?: Date | string | null }>(
    records: T[],
  ): T | null {
    return [...records].sort(
      (left, right) => this.getUpdatedTime(right) - this.getUpdatedTime(left),
    )[0] ?? null;
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

  private async createDesignRecipeWithAllocatedVersion(
    tx: Pick<PrismaService, 'designRecipe'>,
    name: string,
    buildData: (version: number) => Prisma.DesignRecipeUncheckedCreateInput,
  ) {
    for (let attempt = 1; attempt <= DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS; attempt++) {
      const version = await this.allocateNextDesignRecipeVersion(tx, name);

      try {
        return await tx.designRecipe.create({
          data: buildData(version),
          include: DESIGN_RECIPE_INCLUDE,
        });
      } catch (error) {
        if (
          attempt < DESIGN_RECIPE_VERSION_CREATE_MAX_ATTEMPTS &&
          this.isDesignRecipeNameVersionCollision(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new BadRequestException('配方版本创建失败，请重试');
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
    return typeof target === 'string' && target.includes('name') && target.includes('version');
  }

  async getDraft(id: string, userId: string) {
    const draft = await this.loadDraft(id);

    if (draft.createdBy !== userId && !this.isPublishedDraft(draft)) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }

    return draft;
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
      .sort((left, right) => this.getUpdatedTime(right) - this.getUpdatedTime(left));
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

  private buildCurrentDesignRecipeWorkbenchCard(group: DesignRecipeWithItems[]) {
    const current = this.pickCurrentDesignRecipeCard(group);
    if (!current) return null;

    const versionHistory = [...group].sort((left, right) => {
      if (this.isActiveRevisionDraft(left) !== this.isActiveRevisionDraft(right)) {
        return this.isActiveRevisionDraft(left) ? -1 : 1;
      }

      const leftPublishedVersion = left.publishedRecipeVersion ?? 0;
      const rightPublishedVersion = right.publishedRecipeVersion ?? 0;
      if (leftPublishedVersion !== rightPublishedVersion) {
        return rightPublishedVersion - leftPublishedVersion;
      }

      return this.getUpdatedTime(right) - this.getUpdatedTime(left);
    }).map((draft) => this.withRevisionChangeState(draft, group));

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

    return [...group]
      .filter((candidate) => candidate.id !== draft.id)
      .filter((candidate) => this.isPublishedDraft(candidate))
      .sort((left, right) => {
        const leftVersion = left.publishedRecipeVersion ?? 0;
        const rightVersion = right.publishedRecipeVersion ?? 0;
        if (leftVersion !== rightVersion) {
          return rightVersion - leftVersion;
        }
        return this.getUpdatedTime(right) - this.getUpdatedTime(left);
      })[0] ?? null;
  }

  private getUpdatedTime(draft: { updatedAt?: Date | string | null }) {
    const rawValue = draft.updatedAt;
    if (!rawValue) return 0;
    const value = rawValue instanceof Date ? rawValue.getTime() : new Date(rawValue).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  async createDraft(dto: CreateRecipeDesignDraftDto, userId: string) {
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
          createdBy: userId,
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });
  }

  async updateDraft(
    id: string,
    dto: UpdateRecipeDesignDraftDto,
    userId: string,
  ) {
    await this.assertDraftEditableByUser(id, userId);

    return this.prisma.designRecipe.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.scenario !== undefined
          ? { fediafDogScenario: dto.scenario }
          : {}),
        ...(dto.targetHealthTags !== undefined
          ? { targetHealthTags: dto.targetHealthTags }
          : {}),
        ...(dto.applicableLifeStages !== undefined
          ? { applicableLifeStages: dto.applicableLifeStages }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async deleteDraft(id: string, userId: string) {
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

    if (!draft || draft.createdBy !== userId) {
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

  async createRevisionDraft(id: string, userId: string) {
    const source = await this.loadDraft(id);

    if (source.createdBy !== userId && !this.isPublishedDraft(source)) {
      throw new NotFoundException(`Design recipe ${id} not found`);
    }
    if (!this.isPublishedDraft(source) || !source.publishedRecipeId) {
      throw new BadRequestException('只有已发布食谱可以创建修订草稿');
    }

    const existingRevision = await this.prisma.designRecipe.findFirst({
      where: {
        createdBy: userId,
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
        createdBy: userId,
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
        items: {
          create: source.items.map((item) => ({
            ingredientId: item.ingredientId,
            nutritionFoodId: item.nutritionFoodId,
            weightG: item.weightG,
            includeInAssessment: item.includeInAssessment,
            ratioPercent: item.ratioPercent,
            preparationMethod: item.preparationMethod,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue: item.nutrientTargetValue,
            sortOrder: item.sortOrder,
          })),
        },
      } as Prisma.DesignRecipeUncheckedCreateInput,
      include: DESIGN_RECIPE_INCLUDE,
    });
  }

  async addItem(
    designRecipeId: string,
    dto: AddRecipeDesignItemDto,
    userId: string,
  ) {
    await this.assertDraftEditableByUser(designRecipeId, userId);
    const ingredientId = await this.resolveDesignItemIngredientId(dto);
    const preparationMethod = await this.resolveDesignItemPreparationMethod(
      dto.preparationMethod,
      ingredientId,
    );

    const data: Prisma.DesignRecipeItemUncheckedCreateInput = {
      designRecipeId,
      ingredientId,
      nutritionFoodId: dto.nutritionFoodId,
      weightG: dto.weightG,
      preparationMethod,
      nutrientTargetKey: dto.nutrientTargetKey ?? null,
      nutrientTargetValue: dto.nutrientTargetValue ?? null,
      sortOrder: dto.sortOrder ?? 0,
      includeInAssessment: dto.includeInAssessment ?? true,
    };

    return this.prisma.designRecipeItem.create({
      data,
      include: {
        ingredient: true,
        nutritionFood: {
          include: {
            mappings: true,
          },
        },
      },
    });
  }

  async updateItem(
    itemId: string,
    dto: UpdateRecipeDesignItemDto,
    userId: string,
  ) {
    await this.assertItemEditableByUser(itemId, userId);

    const data: Prisma.DesignRecipeItemUncheckedUpdateInput = {
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
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.includeInAssessment !== undefined
        ? { includeInAssessment: dto.includeInAssessment }
        : {}),
    };

    return this.prisma.designRecipeItem.update({
      where: { id: itemId },
      data,
      include: {
        nutritionFood: true,
      },
    });
  }

  async removeItem(itemId: string, userId: string) {
    await this.assertItemEditableByUser(itemId, userId);

    return this.prisma.designRecipeItem.delete({
      where: { id: itemId },
    });
  }

  async assessDraft(id: string): Promise<DesignRecipeAssessmentResult> {
    const draft = await this.loadDraft(id);
    const result = await this.assessLoadedDraft(draft);

    if (this.isPublishedDraft(draft)) {
      return result;
    }

    await this.prisma.designRecipe.update({
      where: { id },
      data: this.buildAssessmentUpdateData(result),
    });

    return result;
  }

  async publishDraft(
    id: string,
    dto: PublishRecipeDesignDraftDto,
    userId: string,
  ) {
    const recipeName = dto.name?.trim() || '';
    const reviewNote = dto.reviewNote?.trim() || null;

    if (!recipeName) {
      throw new BadRequestException('请填写食谱名称');
    }

    const draft = await this.loadDraft(id);
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
    const defaultPreparationMethods =
      await this.loadDefaultPreparationMethodMap(
        ingredientItems.map(({ ingredientId }) => ingredientId),
      );
    const supplementTargetMap = this.buildPublishedSupplementTargetMap(
      draft,
      targets,
      assessment,
    );
    const healthTagAssignments = this.buildPublishedHealthTagAssignments(
      draft.targetHealthTags,
    );
    const publishTarget = await this.resolvePublishTarget(draft);

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
          ...(healthTagAssignments ? { healthTagAssignments } : {}),
          items: {
            create: ingredientItems.map(({ item, ingredientId }) =>
              this.buildPublishedRecipeItemCreateData(
                item,
                ingredientId,
                assessment,
                supplementTargetMap.get(item.id) ?? [],
                defaultPreparationMethods.get(ingredientId) ?? null,
              ),
            ),
          },
        },
      });

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
          publishedBy: userId,
          snapshotData: this.toJsonValue({
            designRecipe: { ...draft, name: recipeName },
            assessment,
            ingredientItems,
          }),
        },
      });

      return tx.designRecipe.update({
        where: { id: draft.id },
        data: {
          ...assessmentUpdateData,
          name: recipeName,
          status: DesignRecipeStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedRecipeId: recipe.recipeId,
          publishedRecipeVersion: recipe.version,
          reviewStatus,
          reviewNote,
          reviewedBy:
            reviewStatus === DesignRecipeReviewStatus.APPROVED ? userId : null,
          reviewedAt:
            reviewStatus === DesignRecipeReviewStatus.APPROVED
              ? new Date()
              : null,
        },
        include: DESIGN_RECIPE_INCLUDE,
      });
    });
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
      throw new BadRequestException(
        '当前修订与已发布版本一致，无需发布新版本',
      );
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
      orderBy: [
        { publishedRecipeVersion: 'desc' },
        { updatedAt: 'desc' },
      ],
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
        sortOrder: item.sortOrder ?? 0,
      }))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder;
        }
        return [
          left.ingredientId.localeCompare(right.ingredientId),
          left.nutritionFoodId.localeCompare(right.nutritionFoodId),
          left.preparationMethod.localeCompare(right.preparationMethod),
          left.nutrientTargetKey.localeCompare(right.nutrientTargetKey),
        ].find((result) => result !== 0) ?? 0;
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

    if (!baseRecipeId) {
      return {
        recipeId: draft.id,
        version: draft.version,
      };
    }

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

  private resolvePublishedLifeStages(draft: DesignRecipeWithItems) {
    const normalizedLifeStages = this.normalizePublishedRecipeLifeStages(
      draft.applicableLifeStages,
    );
    if (normalizedLifeStages.length > 0) {
      return normalizedLifeStages;
    }

    return PUBLISHED_RECIPE_LIFE_STAGES_BY_SCENARIO[draft.fediafDogScenario];
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

      for (const mappedStage of LEGACY_RECIPE_LIFE_STAGE_MAPPINGS[stage] ?? []) {
        normalized.add(mappedStage);
      }
    }

    return [...normalized];
  }

  private buildPublishedRecipeItemCreateData(
    item: DesignRecipeItemWithFood,
    ingredientId: string,
    assessment: DesignRecipeAssessmentResult,
    supplementTargets: PublishedSupplementNutrientTarget[],
    defaultPreparationMethod: string | null,
  ) {
    const primarySupplementTarget = supplementTargets[0] ?? null;
    const supplementTargetPayload = this.buildPublishedSupplementTargets(
      supplementTargets,
    );
    const isSupplement =
      this.resolveIngredientType(item) === IngredientType.SUPPLEMENT;

    return {
      ingredientId,
      preparationMethod:
        this.normalizePreparationMethod(item.preparationMethod) ??
        defaultPreparationMethod,
      ratioPercent: isSupplement
        ? null
        : this.findAssessedRatio(assessment, item.id),
      nutrientTargetKey:
        primarySupplementTarget?.nutrientTargetKey ?? item.nutrientTargetKey,
      nutrientTargetValue:
        primarySupplementTarget?.nutrientTargetValue ??
        item.nutrientTargetValue,
      ...(supplementTargetPayload
        ? { supplementTargets: this.toJsonValue(supplementTargetPayload) }
        : {}),
      sortOrder: item.sortOrder,
      ...(isSupplement ? {} : { exampleWeight: item.weightG }),
    };
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
      .filter((target): target is NonNullable<typeof target> => target !== null);
  }

  private buildPublishedSupplementTargetMap(
    draft: DesignRecipeWithItems,
    targets: FediafAssessmentTarget[],
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

      const assessmentWithoutItem = assessRecipeDraft({
        scenario: draft.fediafDogScenario,
        targets,
        items: this.buildAssessmentItems(draft, item.id),
      });
      const itemTargets = this.resolveSupplementTargetsFromRemovedAssessment(
        item,
        assessment,
        assessmentWithoutItem,
      );

      if (itemTargets.length > 0) {
        result.set(item.id, itemTargets);
      }
    }

    return result;
  }

  private resolveSupplementTargetsFromRemovedAssessment(
    item: DesignRecipeItemWithFood,
    assessment: DesignRecipeAssessmentResult,
    assessmentWithoutItem: DesignRecipeAssessmentResult,
  ): PublishedSupplementNutrientTarget[] {
    if (assessment.totalWeightG <= 0) {
      return [];
    }

    const targetsByFieldPath = new Map<
      string,
      PublishedSupplementNutrientTarget
    >();

    for (const entry of assessment.entries) {
      if (this.isAssessmentRatioEntry(entry)) {
        continue;
      }

      const targetField = this.resolveSupplementTargetField(entry.nutrientKey);
      if (!targetField) {
        continue;
      }

      const entryWithoutItem = this.findMatchingAssessmentEntry(
        assessmentWithoutItem,
        entry,
      );
      if (entryWithoutItem?.status !== 'DEFICIENT') {
        continue;
      }

      const contributor = (entry.contributors ?? []).find(
        (candidate) => candidate.itemId === item.id,
      );
      const contributorAmount = Number(contributor?.amount);
      if (
        !contributor ||
        !Number.isFinite(contributorAmount) ||
        contributorAmount <= 0 ||
        contributor.missing
      ) {
        continue;
      }

      const contributionInTargetUnit = convertUnitValue(
        contributorAmount,
        contributor.unit || entry.unit,
        targetField.unit,
      );
      if (
        contributionInTargetUnit === null ||
        !Number.isFinite(contributionInTargetUnit) ||
        contributionInTargetUnit <= 0
      ) {
        continue;
      }

      const nutrientTargetValue = this.roundPublishedSupplementTargetValue(
        (contributionInTargetUnit / assessment.totalWeightG) * 1000,
      );
      if (!Number.isFinite(nutrientTargetValue) || nutrientTargetValue <= 0) {
        continue;
      }

      const existing = targetsByFieldPath.get(targetField.fieldPath);
      const nextTarget = {
        nutrientTargetKey: entry.nutrientKey,
        nutrientTargetValue,
        fieldPath: targetField.fieldPath,
        label: targetField.label,
        unit: targetField.unit,
      };
      if (
        !existing ||
        nutrientTargetValue > existing.nutrientTargetValue
      ) {
        targetsByFieldPath.set(targetField.fieldPath, nextTarget);
      }
    }

    return [...targetsByFieldPath.values()];
  }

  private findMatchingAssessmentEntry(
    assessment: DesignRecipeAssessmentResult,
    sourceEntry: AssessmentEntry,
  ) {
    return assessment.entries.find(
      (entry) =>
        entry.nutrientKey === sourceEntry.nutrientKey &&
        entry.expressionBasis === sourceEntry.expressionBasis &&
        !this.isAssessmentRatioEntry(entry),
    );
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
    const normalizedTargetKey = normalizeNutritionTargetKey(targetKey);

    return listSupplementTargetFields().find((field) => {
      return (
        field.fieldPath === targetKey ||
        field.fieldKey === targetKey ||
        normalizeNutritionTargetKey(field.label) === normalizedTargetKey ||
        normalizeNutritionTargetKey(field.fieldKey) === normalizedTargetKey
      );
    });
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
        draftItem && this.resolveIngredientType(draftItem) === IngredientType.SUPPLEMENT;

      return {
        ingredientName:
          draftItem?.nutritionFood.displayNameZh?.trim() ||
          draftItem?.nutritionFood.name ||
          assessedItem.name ||
          '未命名原料',
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

  private resolvePublishedSupplementUnit(item?: DesignRecipeItemWithFood) {
    if (!item) return 'g';

    const ingredient =
      item.ingredient ??
      item.nutritionFood.mappings?.find((mapping) => mapping.isPrimary)
        ?.ingredient ??
      item.nutritionFood.mappings?.[0]?.ingredient;
    return (
      ingredient?.unitDisplayLabel?.trim() ||
      ingredient?.purchaseUnit?.trim() ||
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
          ? (total * definition.energyFactor * 100) /
            assessment.totalEnergyKcal
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
          dryMatterHeader: '干物质/100g',
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

    const signature = `${entry.nutrientKey ?? ''} ${entry.label ?? ''}`.toLowerCase();
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
        : this.formatPublishedReportNumber(dryMatterEntry?.currentValue ?? null),
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
      },
    });

    this.assertEditableDraft(draft, id, userId);
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
      targets ?? (await this.targetProvider.getTargets(draft.fediafDogScenario));

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
    if (!profile || this.resolveIngredientType(item) !== IngredientType.SUPPLEMENT) {
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
      status: isCompliant
        ? DesignRecipeStatus.COMPLIANT
        : DesignRecipeStatus.NEEDS_REVIEW,
      reviewStatus: isCompliant
        ? DesignRecipeReviewStatus.NONE
        : DesignRecipeReviewStatus.REQUIRED,
    };
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

    return new Map(
      methods.map((method) => [method.id, method.name] as const),
    );
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
  ): IngredientNutrientMatch | null {
    if (
      ingredientType === IngredientType.SUPPLEMENT ||
      nutritionFoodCategory === NutritionFoodCategory.SUPPLEMENT
    ) {
      return this.calculateSupplementNutrientMatch(nutritionData, target);
    }

    return this.calculateNutritionFoodNutrientMatch(
      nutritionData,
      target,
      ingredientType,
      nutritionFoodCategory,
    );
  }

  private calculateSupplementNutrientMatch(
    nutritionData: unknown,
    target: IngredientNutrientSearchTarget,
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

    const basisLabel = this.getSupplementNutrientMatchBasisLabel(profile);

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
    ingredientType: IngredientType,
    nutritionFoodCategory: NutritionFoodCategory,
  ): IngredientNutrientMatch | null {
    const profile = this.toNutritionProfile(nutritionData);
    const amountPer100g = this.getCombinedAmountPer100g(profile, target);

    if (amountPer100g === null || amountPer100g <= 0) {
      return null;
    }

    const amount = this.convertAmountToExpressionBasis(
      amountPer100g,
      profile,
      target.expressionBasis,
      {
        useDogAtwaterEnergy:
          ingredientType !== IngredientType.SUPPLEMENT &&
          nutritionFoodCategory !== NutritionFoodCategory.SUPPLEMENT,
      },
    );

    if (amount === null || amount <= 0) {
      return null;
    }

    const basisLabel = this.getNutrientMatchBasisLabel(target.expressionBasis);

    return {
      nutrientKey: target.nutrientKey,
      label: target.label,
      amount,
      unit: target.unit,
      basis: target.expressionBasis,
      basisLabel,
      displayText: `${formatNutrientMatchAmount(amount)}${target.unit}${basisLabel}`,
      score: amount,
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

  private convertAmountToExpressionBasis(
    amountPer100g: number,
    profile: NutritionProfile | null,
    expressionBasis: AssessmentExpressionBasis,
    options: { useDogAtwaterEnergy?: boolean } = {},
  ): number | null {
    switch (expressionBasis) {
      case 'PER_1000_KCAL_ME': {
        const energyKcalPer100g =
          this.getEnergyKcalPer100g(profile, options);
        return energyKcalPer100g !== null && energyKcalPer100g > 0
          ? finiteOrNull((amountPer100g / energyKcalPer100g) * 1000)
          : null;
      }
      case 'PER_MJ_ME': {
        const energyKcalPer100g =
          this.getEnergyKcalPer100g(profile, options);
        return energyKcalPer100g !== null && energyKcalPer100g > 0
          ? finiteOrNull(amountPer100g / (energyKcalPer100g * KCAL_TO_MJ))
          : null;
      }
      case 'PER_100G_DRY_MATTER': {
        const moisture = readProfileValuePer100g(profile, 'macros.moisture');
        if (moisture.missing || moisture.valuePer100g === null) {
          return null;
        }
        const dryMatterG = 100 - moisture.valuePer100g;
        return dryMatterG > 0
          ? finiteOrNull((amountPer100g / dryMatterG) * 100)
          : null;
      }
      case 'RATIO':
        return null;
      default:
        return amountPer100g;
    }
  }

  private getEnergyKcalPer100g(
    profile: NutritionProfile | null,
    options: { useDogAtwaterEnergy?: boolean },
  ): number | null {
    if (options.useDogAtwaterEnergy) {
      return calculateDogAtwaterEnergyPer100g(profile).energyKcalPer100g;
    }

    const energy = readProfileValuePer100g(profile, 'macros.energyKcal');
    return !energy.missing && energy.valuePer100g !== null
      ? energy.valuePer100g
      : null;
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
          meta.servingUnitLabel ?? meta.amountUnitLabel ?? meta.usageUnit;
        return `/${typeof servingUnit === 'string' && servingUnit.trim() ? servingUnit.trim() : '份'}`;
      }
      default:
        return '';
    }
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
