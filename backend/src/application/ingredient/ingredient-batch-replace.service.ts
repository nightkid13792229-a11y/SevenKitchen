import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IngredientType, Prisma } from '@prisma/client';
import { FEDIAF_TARGET_PROVIDER } from '../recipe-designer/fediaf-target-provider';
import type { FediafTargetProvider } from '../recipe-designer/fediaf-target-provider';
import { PrismaService } from '../../infrastructure/prisma.service';
import { assessRecipeDraft } from '../../domain/recipe-designer/recipe-assessment';
import type { DesignRecipeAssessmentResult } from '../../domain/recipe-designer/recipe-assessment';
import type {
  DesignRecipeAssessmentItemInput,
  FediafDogScenarioCode,
} from '../../domain/recipe-designer/types';
import {
  buildPublishedNutritionDetailedData,
  type PublishedReportItemInput,
} from '../../domain/recipe-designer/published-nutrition-report';
import { calculateSupplementDose } from '../../domain/ingredient/supplement-targets';
import { resolveSupplementTargetField } from '../../domain/ingredient/supplement-target-mapping';
import {
  listDerivedNutritionFields,
} from '../../domain/ingredient/nutrition-field-catalog';
import { readProfileFieldAmount } from '../../domain/recipe-designer/nutrition-profile-reader';
import { mapSeriesLifeStageToScenario } from '../../domain/recipe/recipe-series';
import type { NutritionProfile, SupplementTarget } from '../../domain/ingredient/types';
import type { NutritionDetailedData } from '../../domain/recipe/types';

const REPLACE_REPORT_SOURCE = 'BATCH_INGREDIENT_REPLACE';
const REPORT_STANDARD = 'FEDIAF_2025';

const VALID_SCENARIOS = new Set<FediafDogScenarioCode>([
  'EARLY_GROWTH_REPRODUCTION',
  'REPRODUCTION',
  'LATE_GROWTH',
  'ADULT_MER_110',
  'ADULT_MER_95',
]);

const LEGACY_LIFE_STAGE_TO_SCENARIO: Record<string, FediafDogScenarioCode> = {
  PUPPY_UNDER_14_WEEKS: 'EARLY_GROWTH_REPRODUCTION',
  PUPPY_14_WEEKS_PLUS: 'LATE_GROWTH',
  HIGH_ACTIVITY_ADULT: 'ADULT_MER_110',
  LOW_ACTIVITY_ADULT_OR_SENIOR: 'ADULT_MER_95',
  REPRODUCTION: 'REPRODUCTION',
};

export interface AffectedRecipeItem {
  recipeItemId: string;
  sortOrder: number;
  ratioPercent: number | null;
  exampleWeight: number | null;
  nutrientTargetKey: string | null;
  nutrientTargetValue: number | null;
  supplementTargets: SupplementTarget[] | null;
}

export interface AffectedRecipeInfo {
  recipeId: string;
  recipeName: string;
  version: number;
  status: string;
  seriesName: string | null;
  seriesLifeStage: string | null;
  nutritionStandard: string;
  hasNutritionReport: boolean;
  reportScenario: string | null;
  items: AffectedRecipeItem[];
}

export interface BatchReplaceItemOverride {
  recipeItemId: string;
  /** 食材类：每份食谱克数（优先） */
  exampleWeight?: number;
  /** 食材类：比例百分比（exampleWeight 未提供时使用） */
  ratioPercent?: number;
  /** 补剂类：营养目标值 */
  nutrientTargetValue?: number;
}

export interface BatchReplacePreviewRecipeResult {
  recipeId: string;
  recipeName: string;
  ok: boolean;
  warnings: string[];
  scenario: string;
  before: Record<string, number | null> | null;
  after: Record<string, number | null> | null;
  afterEnergyDensityKcalPerKg: number | null;
  supplementDoses: Array<{
    recipeItemId: string;
    amount: number;
    unit: string;
  }>;
}

export interface BatchReplaceExecuteRecipeResult {
  recipeId: string;
  recipeName: string;
  ok: boolean;
  versionBefore: number;
  versionAfter: number;
  warnings: string[];
}

interface LoadedRecipe {
  id: string;
  recipeId: string;
  name: string;
  version: number;
  status: string;
  nutritionStandard: string;
  energyDensityKcalPerKg: number;
  seriesLifeStage: string | null;
  applicableLifeStages: Prisma.JsonValue;
  nutritionDetailedData: Prisma.JsonValue;
  series: { name: string } | null;
  items: Array<{
    id: string;
    recipeVersion: number;
    ingredientId: string;
    nutritionFoodId: string | null;
    preparationMethod: string | null;
    ratioPercent: number | null;
    nutrientTargetKey: string | null;
    nutrientTargetValue: number | null;
    supplementTargets: Prisma.JsonValue;
    sortOrder: number;
    exampleWeight: number | null;
    ingredient: {
      id: string;
      name: string;
      type: IngredientType;
      brand: string | null;
      productModel: string | null;
      unitDisplayLabel: string | null;
      purchaseUnit: string;
      nutritionProfile: Prisma.JsonValue;
      properties: Prisma.JsonValue;
    };
    nutritionFood: {
      id: string;
      name: string;
      displayNameZh: string | null;
    } | null;
    supplementAlternatives: Array<{
      id: string;
      alternativeIngredientId: string;
      sortOrder: number;
      isActive: boolean;
    }>;
  }>;
}

interface IngredientOption {
  id: string;
  name: string;
  type: IngredientType;
  brand: string | null;
  productModel: string | null;
  unitDisplayLabel: string | null;
  purchaseUnit: string;
  nutritionProfile: Prisma.JsonValue;
  properties: Prisma.JsonValue;
  primaryNutritionFoodId: string | null;
  primaryNutritionFoodName: string | null;
}

@Injectable()
export class IngredientBatchReplaceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(FEDIAF_TARGET_PROVIDER)
    private readonly targetProvider: FediafTargetProvider,
  ) {}

  async getAffectedRecipes(ingredientId: string): Promise<AffectedRecipeInfo[]> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true, name: true },
    });
    if (!ingredient) {
      throw new NotFoundException(`原料不存在: ${ingredientId}`);
    }

    const recipes = await this.prisma.recipe.findMany({
      where: {
        items: { some: { ingredientId } },
      },
      include: {
        series: { select: { name: true } },
        items: {
          where: { ingredientId },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    return recipes.map((recipe) => ({
      recipeId: recipe.id,
      recipeName: recipe.name,
      version: recipe.version,
      status: recipe.status,
      seriesName: recipe.series?.name ?? null,
      seriesLifeStage: recipe.seriesLifeStage,
      nutritionStandard: recipe.nutritionStandard,
      hasNutritionReport: isNonNullJson(recipe.nutritionDetailedData),
      reportScenario: this.readReportScenario(recipe.nutritionDetailedData),
      items: recipe.items.map((item) => ({
        recipeItemId: item.id,
        sortOrder: item.sortOrder,
        ratioPercent: item.ratioPercent,
        exampleWeight: item.exampleWeight,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue,
        supplementTargets: parseSupplementTargets(item.supplementTargets),
      })),
    }));
  }

  async previewReplace(input: {
    fromIngredientId: string;
    toIngredientId: string;
    recipeIds: string[];
    itemOverrides?: BatchReplaceItemOverride[];
  }): Promise<BatchReplacePreviewRecipeResult[]> {
    const context = await this.loadReplaceContext(
      input.fromIngredientId,
      input.toIngredientId,
      input.recipeIds,
    );
    const overrideById = new Map(
      (input.itemOverrides ?? []).map((override) => [
        override.recipeItemId,
        override,
      ]),
    );
    const targetsCache = new Map<
      FediafDogScenarioCode,
      Awaited<ReturnType<FediafTargetProvider['getTargets']>>
    >();

    const results: BatchReplacePreviewRecipeResult[] = [];
    for (const recipe of context.recipes) {
      const scenario = this.resolveScenario(recipe);
      const warnings: string[] = [];
      this.appendStandardWarning(recipe, warnings);

      const targets = await this.getTargetsCached(scenario, targetsCache);
      const build = this.buildAssessmentItems(
        recipe,
        context.fromIngredient.id,
        context.toIngredient,
        overrideById,
        warnings,
      );

      if (build.items.length === 0) {
        results.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          ok: false,
          warnings: [...warnings, '替换后没有可参与营养计算的原料项'],
          scenario,
          before: extractSummary(recipe.nutritionDetailedData),
          after: null,
          afterEnergyDensityKcalPerKg: null,
          supplementDoses: build.supplementDoses,
        });
        continue;
      }

      let assessment: DesignRecipeAssessmentResult;
      try {
        assessment = assessRecipeDraft({
          scenario,
          targets,
          items: build.items,
        });
      } catch (error) {
        warnings.push(`营养评估失败：${errorMessage(error)}`);
        results.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          ok: false,
          warnings,
          scenario,
          before: extractSummary(recipe.nutritionDetailedData),
          after: null,
          afterEnergyDensityKcalPerKg: null,
          supplementDoses: build.supplementDoses,
        });
        continue;
      }

      const report = buildPublishedNutritionDetailedData({
        items: build.reportItems,
        assessment,
        scenario,
        standard: REPORT_STANDARD,
        source: REPLACE_REPORT_SOURCE,
      });

      results.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        ok: true,
        warnings,
        scenario,
        before: extractSummary(recipe.nutritionDetailedData),
        after: summaryFromReport(report),
        afterEnergyDensityKcalPerKg:
          assessment.energyDensityKcalPerKg ?? null,
        supplementDoses: build.supplementDoses,
      });
    }

    return results;
  }

  async executeReplace(input: {
    fromIngredientId: string;
    toIngredientId: string;
    recipeIds: string[];
    itemOverrides?: BatchReplaceItemOverride[];
  }): Promise<BatchReplaceExecuteRecipeResult[]> {
    const context = await this.loadReplaceContext(
      input.fromIngredientId,
      input.toIngredientId,
      input.recipeIds,
    );
    const overrideById = new Map(
      (input.itemOverrides ?? []).map((override) => [
        override.recipeItemId,
        override,
      ]),
    );
    const targetsCache = new Map<
      FediafDogScenarioCode,
      Awaited<ReturnType<FediafTargetProvider['getTargets']>>
    >();

    return this.prisma.$transaction(async (tx) => {
      const results: BatchReplaceExecuteRecipeResult[] = [];

      for (const recipe of context.recipes) {
        const warnings: string[] = [];
        this.appendStandardWarning(recipe, warnings);
        const scenario = this.resolveScenario(recipe);
        const targets = await this.getTargetsCached(scenario, targetsCache);

        // 计算替换后的评估项（含补剂新剂量），为报告重算做准备
        const build = this.buildAssessmentItems(
          recipe,
          context.fromIngredient.id,
          context.toIngredient,
          overrideById,
          warnings,
        );

        let report: NutritionDetailedData | null = null;
        let newEnergyDensity: number | null = null;

        if (build.items.length > 0) {
          try {
            const assessment = assessRecipeDraft({
              scenario,
              targets,
              items: build.items,
            });
            report = buildPublishedNutritionDetailedData({
              items: build.reportItems,
              assessment,
              scenario,
              standard: REPORT_STANDARD,
              source: REPLACE_REPORT_SOURCE,
            });
            newEnergyDensity = assessment.energyDensityKcalPerKg ?? null;
          } catch (error) {
            throw new BadRequestException(
              `食谱「${recipe.name}」营养报告重算失败，本次替换已回滚：${errorMessage(error)}`,
            );
          }
        } else {
          throw new BadRequestException(
            `食谱「${recipe.name}」替换后没有可参与营养计算的原料项，本次替换已回滚。`,
          );
        }

        const newVersion = recipe.version + 1;

        // 1. 删除旧版本原料项（替代补剂配置随原料项级联删除，
        //    执行重建时过滤掉引用旧原料的替代品）
        await tx.recipeItem.deleteMany({
          where: {
            recipeId: recipe.recipeId,
            recipeVersion: recipe.version,
          },
        });

        // 2. 升版本 + 写回营养报告
        await tx.recipe.update({
          where: { id: recipe.id },
          data: {
            version: newVersion,
            ...(report !== null
              ? {
                  nutritionDetailedData:
                    report as unknown as Prisma.InputJsonValue,
                }
              : {}),
            ...(newEnergyDensity !== null
              ? { energyDensityKcalPerKg: newEnergyDensity }
              : {}),
          },
        });

        // 3. 重建原料项（替换原料引用 + 可选用量覆盖；替代品过滤旧原料）
        const rebuildItems = recipe.items.map((item) => {
          const override = overrideById.get(item.id);
          const replaced = item.ingredientId === context.fromIngredient.id;
          const isSupplement =
            item.ingredient.type === IngredientType.SUPPLEMENT;

          const exampleWeight =
            replaced && override?.exampleWeight !== undefined
              ? override.exampleWeight
              : item.exampleWeight;
          const ratioPercent =
            replaced && isSupplement
              ? null
              : replaced && override
                ? resolveOverrideRatio(
                    override,
                    recipe,
                    context.fromIngredient.id,
                  )
                : item.ratioPercent;
          const nutrientTargetValue =
            replaced && override?.nutrientTargetValue !== undefined
              ? override.nutrientTargetValue
              : item.nutrientTargetValue;

          return {
            id: item.id,
            recipeId: recipe.recipeId,
            recipeVersion: newVersion,
            ingredientId: replaced
              ? context.toIngredient.id
              : item.ingredientId,
            nutritionFoodId: replaced
              ? (context.toIngredient.primaryNutritionFoodId ??
                item.nutritionFoodId)
              : item.nutritionFoodId,
            preparationMethod: item.preparationMethod,
            ratioPercent,
            nutrientTargetKey: item.nutrientTargetKey,
            nutrientTargetValue,
            supplementTargets: item.supplementTargets as
              | Prisma.InputJsonValue
              | undefined,
            sortOrder: item.sortOrder,
            exampleWeight,
          };
        });

        await tx.recipeItem.createMany({ data: rebuildItems });

        // 4. 重建替代补剂（排除引用旧原料的配置）
        const rebuildAlternatives: Array<{
          id: string;
          recipeItemId: string;
          alternativeIngredientId: string;
          sortOrder: number;
          isActive: boolean;
        }> = [];
        for (const item of recipe.items) {
          for (const alternative of item.supplementAlternatives ?? []) {
            if (alternative.alternativeIngredientId === context.fromIngredient.id) {
              continue;
            }
            rebuildAlternatives.push({
              id: alternative.id,
              recipeItemId: item.id,
              alternativeIngredientId: alternative.alternativeIngredientId,
              sortOrder: alternative.sortOrder,
              isActive: alternative.isActive,
            });
          }
        }
        if (rebuildAlternatives.length > 0) {
          await tx.recipeSupplementAlternative.createMany({
            data: rebuildAlternatives,
          });
        }

        results.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          ok: true,
          versionBefore: recipe.version,
          versionAfter: newVersion,
          warnings,
        });
      }

      return results;
    });
  }

  // ---------------------------------------------------------------
  // 内部实现
  // ---------------------------------------------------------------

  private async loadReplaceContext(
    fromIngredientId: string,
    toIngredientId: string,
    recipeIds: string[],
  ) {
    const [fromIngredient, toIngredient] = await Promise.all([
      this.prisma.ingredient.findUnique({
        where: { id: fromIngredientId },
        select: { id: true, name: true, type: true },
      }),
      this.loadIngredientOption(toIngredientId),
    ]);

    if (!fromIngredient) {
      throw new NotFoundException(`被替换原料不存在: ${fromIngredientId}`);
    }
    if (!toIngredient) {
      throw new NotFoundException(`替换目标原料不存在: ${toIngredientId}`);
    }
    if (fromIngredient.id === toIngredient.id) {
      throw new BadRequestException('替换目标原料不能与被替换原料相同');
    }
    if (fromIngredient.type !== toIngredient.type) {
      throw new BadRequestException(
        `原料类型不一致：被替换原料为 ${typeLabel(fromIngredient.type)}，替换目标为 ${typeLabel(toIngredient.type)}，只能同类型替换`,
      );
    }

    if (recipeIds.length === 0) {
      throw new BadRequestException('请至少选择一个食谱');
    }

    const recipes = await this.prisma.recipe.findMany({
      where: { id: { in: recipeIds } },
      include: {
        series: { select: { name: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            ingredient: {
              select: {
                id: true,
                name: true,
                type: true,
                brand: true,
                productModel: true,
                unitDisplayLabel: true,
                purchaseUnit: true,
                nutritionProfile: true,
                properties: true,
              },
            },
            nutritionFood: {
              select: { id: true, name: true, displayNameZh: true },
            },
            supplementAlternatives: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                alternativeIngredientId: true,
                sortOrder: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    const foundIds = new Set(recipes.map((recipe) => recipe.id));
    const missingIds = recipeIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new NotFoundException(`食谱不存在: ${missingIds.join(', ')}`);
    }

    return { fromIngredient, toIngredient, recipes };
  }

  private async loadIngredientOption(
    ingredientId: string,
  ): Promise<IngredientOption | null> {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: {
        id: true,
        name: true,
        type: true,
        brand: true,
        productModel: true,
        unitDisplayLabel: true,
        purchaseUnit: true,
        nutritionProfile: true,
        properties: true,
      },
    });
    if (!ingredient) {
      return null;
    }

    const primaryMapping = await this.prisma.nutritionFoodMapping.findFirst({
      where: { ingredientId, isPrimary: true },
      select: {
        nutritionFoodId: true,
        nutritionFood: {
          select: { name: true, displayNameZh: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...ingredient,
      primaryNutritionFoodId: primaryMapping?.nutritionFoodId ?? null,
      primaryNutritionFoodName:
        primaryMapping?.nutritionFood?.displayNameZh?.trim() ||
        primaryMapping?.nutritionFood?.name ||
        null,
    };
  }

  private async getTargetsCached(
    scenario: FediafDogScenarioCode,
    cache: Map<
      FediafDogScenarioCode,
      Awaited<ReturnType<FediafTargetProvider['getTargets']>>
    >,
  ) {
    const cached = cache.get(scenario);
    if (cached) {
      return cached;
    }
    const targets = await this.targetProvider.getTargets(scenario);
    cache.set(scenario, targets);
    return targets;
  }

  private resolveScenario(recipe: LoadedRecipe): FediafDogScenarioCode {
    const reportScenario = this.readReportScenario(
      recipe.nutritionDetailedData,
    );
    if (
      reportScenario &&
      VALID_SCENARIOS.has(reportScenario as FediafDogScenarioCode)
    ) {
      return reportScenario as FediafDogScenarioCode;
    }

    if (recipe.seriesLifeStage) {
      const mapped = LEGACY_LIFE_STAGE_TO_SCENARIO[recipe.seriesLifeStage];
      if (mapped) {
        return mapped;
      }
      try {
        return mapSeriesLifeStageToScenario(recipe.seriesLifeStage as never);
      } catch {
        // 忽略并继续尝试
      }
    }

    const stages = Array.isArray(recipe.applicableLifeStages)
      ? (recipe.applicableLifeStages as string[])
      : [];
    for (const stage of stages) {
      const mapped = LEGACY_LIFE_STAGE_TO_SCENARIO[stage];
      if (mapped) {
        return mapped;
      }
    }

    return 'ADULT_MER_110';
  }

  private readReportScenario(
    nutritionDetailedData: Prisma.JsonValue,
  ): string | null {
    if (!isNonNullJson(nutritionDetailedData)) {
      return null;
    }
    const data = asRecord(nutritionDetailedData);
    const scenario = data?.scenario;
    return typeof scenario === 'string' && scenario.trim()
      ? scenario
      : null;
  }

  private appendStandardWarning(
    recipe: LoadedRecipe,
    warnings: string[],
  ): void {
    if (recipe.nutritionStandard !== REPORT_STANDARD) {
      warnings.push(
        `该食谱原标注营养标准为 ${recipe.nutritionStandard ?? '未知'}，重算报告按 ${REPORT_STANDARD} 目标对比`,
      );
    }
  }

  private buildAssessmentItems(
    recipe: LoadedRecipe,
    fromIngredientId: string,
    toIngredient: IngredientOption,
    overrideById: Map<string, BatchReplaceItemOverride>,
    warnings: string[],
  ): {
    items: DesignRecipeAssessmentItemInput[];
    reportItems: PublishedReportItemInput[];
    supplementDoses: Array<{
      recipeItemId: string;
      amount: number;
      unit: string;
    }>;
  } {
    const items: DesignRecipeAssessmentItemInput[] = [];
    const reportItems: PublishedReportItemInput[] = [];
    const supplementDoses: Array<{
      recipeItemId: string;
      amount: number;
      unit: string;
    }> = [];

    const isReplaced = (item: LoadedRecipe['items'][number]) =>
      item.ingredientId === fromIngredientId;

    // 基准重量：替换后的食材总克数（用于补剂剂量与比例归一）
    const foodItems = recipe.items.filter(
      (item) => item.ingredient.type !== IngredientType.SUPPLEMENT,
    );
    const totalFoodWeight = foodItems.reduce((sum, item) => {
      const override = overrideById.get(item.id);
      const weight = override?.exampleWeight ?? item.exampleWeight;
      return sum + (Number.isFinite(weight) && weight !== null ? weight : 0);
    }, 0);
    const basisWeightG = totalFoodWeight > 0 ? totalFoodWeight : 100;

    for (const item of recipe.items) {
      const isSupplement =
        item.ingredient.type === IngredientType.SUPPLEMENT;
      const override = overrideById.get(item.id);

      if (!isSupplement) {
        const overrideWeight =
          override?.exampleWeight !== undefined
            ? override.exampleWeight
            : null;
        let weightG: number =
          overrideWeight !== null && Number.isFinite(overrideWeight)
            ? overrideWeight
            : item.exampleWeight !== null && item.exampleWeight !== undefined
              ? item.exampleWeight
              : 0;
        // 旧数据兜底：无每份克数时按比例折算到每 100g 配方基准
        if (weightG <= 0 && item.ratioPercent && item.ratioPercent > 0) {
          weightG = Math.round(item.ratioPercent * 100) / 100;
        }
        const ratioPercent =
          overrideWeight !== null && Number.isFinite(overrideWeight)
            ? basisWeightG > 0
              ? roundPercent((overrideWeight / basisWeightG) * 100)
              : null
            : item.ratioPercent;

        const replaced = isReplaced(item);
        const profile = replaced
          ? (toIngredient.nutritionProfile as NutritionProfile | null)
          : (item.ingredient.nutritionProfile as NutritionProfile | null);
        const name = replaced
          ? (toIngredient.primaryNutritionFoodName ||
              toIngredient.name)
          : item.nutritionFood?.displayNameZh?.trim() ||
            item.nutritionFood?.name ||
            item.ingredient.name;
        items.push({
          id: item.id,
          name,
          ingredientType: 'FOOD',
          weightG: weightG > 0 ? weightG : 0,
          nutritionProfile: profile,
        });
        reportItems.push({
          id: item.id,
          name,
          isSupplement: false,
          weightG,
          ratioPercent,
          brand: replaced ? toIngredient.brand : item.ingredient.brand,
          productModel: replaced
            ? toIngredient.productModel
            : item.ingredient.productModel,
          unitDisplayLabel: replaced
            ? toIngredient.unitDisplayLabel
            : item.ingredient.unitDisplayLabel,
          purchaseUnit: replaced
            ? toIngredient.purchaseUnit
            : item.ingredient.purchaseUnit,
          properties: replaced
            ? toIngredient.properties
            : item.ingredient.properties,
        });
        continue;
      }

      // 补剂项
      const replaced = isReplaced(item);
      const replacedIngredient = replaced ? toIngredient : null;
      const profile = replaced
        ? (toIngredient.nutritionProfile as NutritionProfile | null)
        : (item.ingredient.nutritionProfile as NutritionProfile | null);
      const goal = this.resolveItemSupplementGoal(item, warnings, recipe.name);

      let amount: number | null = null;
      let doseUnit = normalizeText(toIngredient.unitDisplayLabel) || 'g';

      if (replacedIngredient) {
        if (goal !== null) {
          const dose = this.calculateSupplementAmount(
            goal,
            profile,
            basisWeightG,
            toIngredient,
          );
          if (dose !== null) {
            amount = dose.amount;
            doseUnit =
              normalizeText(toIngredient.unitDisplayLabel) ||
              dose.unit ||
              doseUnit;
            supplementDoses.push({
              recipeItemId: item.id,
              amount,
              unit: doseUnit,
            });
          }
        } else {
          warnings.push(
            `食谱「${recipe.name}」补剂「${item.ingredient.name}」缺少可解析的营养目标，替换后无法自动换算用量，报告按不含该补剂计算`,
          );
        }
      } else if (goal !== null) {
        const dose = this.calculateSupplementAmount(
          goal,
          profile,
          basisWeightG,
          {
            unitDisplayLabel: item.ingredient.unitDisplayLabel,
            properties: item.ingredient.properties,
          },
        );
        if (dose !== null) {
          amount = dose.amount;
          doseUnit =
            normalizeText(item.ingredient.unitDisplayLabel) ||
            dose.unit ||
            doseUnit;
        }
      }

      if (amount === null || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }

      const name =
        item.nutritionFood?.displayNameZh?.trim() ||
        item.nutritionFood?.name ||
        item.ingredient.name;
      items.push({
        id: item.id,
        name,
        ingredientType: 'SUPPLEMENT',
        weightG: amount,
        nutritionProfile: replacedIngredient
          ? withSupplementServingUnit(profile, toIngredient)
          : withSupplementServingUnit(profile, item.ingredient),
      });
      reportItems.push({
        id: item.id,
        name,
        isSupplement: true,
        weightG: amount,
        ratioPercent: null,
        brand: replacedIngredient?.brand ?? item.ingredient.brand,
        productModel:
          replacedIngredient?.productModel ?? item.ingredient.productModel,
        unitDisplayLabel:
          replacedIngredient?.unitDisplayLabel ??
          item.ingredient.unitDisplayLabel,
        purchaseUnit:
          replacedIngredient?.purchaseUnit ?? item.ingredient.purchaseUnit,
        properties:
          replacedIngredient?.properties ?? item.ingredient.properties,
      });
    }

    return { items, reportItems, supplementDoses };
  }

  private resolveItemSupplementGoal(
    item: LoadedRecipe['items'][number],
    warnings: string[],
    recipeName: string,
  ): ResolvedSupplementGoal {
    const stored = parseSupplementTargets(item.supplementTargets);
    if (stored && stored.length > 0) {
      return { kind: 'standard', targets: stored };
    }

    if (!item.nutrientTargetKey) {
      return null;
    }
    if (
      item.nutrientTargetValue === null ||
      item.nutrientTargetValue === undefined ||
      !(item.nutrientTargetValue > 0)
    ) {
      warnings.push(
        `食谱「${recipeName}」补剂「${item.nutrientTargetKey}」缺少有效目标值，替换后按不含该补剂计算`,
      );
      return null;
    }

    const field = resolveSupplementTargetField(item.nutrientTargetKey);
    if (field) {
      return {
        kind: 'standard',
        targets: [
          {
            fieldPath: field.fieldPath,
            label: field.label,
            targetValuePerKg: item.nutrientTargetValue,
            unit: field.unit,
          },
        ],
      };
    }

    const derived = resolveDerivedSupplementField(item.nutrientTargetKey);
    if (derived) {
      return {
        kind: 'derived',
        fieldPath: derived.fieldPath,
        label: derived.label,
        unit: derived.unit,
        sourceFieldPaths: [...derived.sourceFieldPaths],
        targetValuePerKg: item.nutrientTargetValue,
      };
    }

    warnings.push(
      `食谱「${recipeName}」补剂营养目标「${item.nutrientTargetKey}」无法解析到营养字段，替换后按不含该补剂计算`,
    );
    return null;
  }

  private calculateSupplementAmount(
    goal: Exclude<ResolvedSupplementGoal, null>,
    profile: NutritionProfile | null,
    basisWeightG: number,
    ingredient: {
      unitDisplayLabel?: string | null;
      properties?: Prisma.JsonValue;
    },
  ): { amount: number; unit: string } | null {
    const effectiveProfile = withSupplementServingUnit(profile, ingredient);
    const displayUnit =
      normalizeText(ingredient.unitDisplayLabel) ||
      readSupplementDisplayUnit(ingredient.properties);

    try {
      if (goal.kind === 'standard') {
        const dose = calculateSupplementDose({
          nutritionProfile: effectiveProfile,
          targets: goal.targets,
          basisWeightG,
          displayUnit,
          lossRate: 1,
        });
        return { amount: dose.amount, unit: dose.unit ?? displayUnit ?? 'g' };
      }

      return calculateDerivedSupplementDose({
        profile: effectiveProfile,
        goal,
        basisWeightG,
        displayUnit,
      });
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------
// 补剂组合目标（如 EPA+DHA）
// ---------------------------------------------------------------

type ResolvedSupplementGoal =
  | { kind: 'standard'; targets: SupplementTarget[] }
  | {
      kind: 'derived';
      fieldPath: string;
      label: string;
      unit: string;
      sourceFieldPaths: string[];
      targetValuePerKg: number;
    }
  | null;

interface DerivedFieldReference {
  fieldPath: string;
  label: string;
  unit: string;
  sourceFieldPaths: string[];
}

const MASS_UNIT_FACTORS: Record<string, number> = {
  g: 1,
  mg: 1 / 1000,
  ug: 1 / 1_000_000,
  μg: 1 / 1_000_000,
};

function resolveDerivedSupplementField(
  targetKey: string,
): DerivedFieldReference | null {
  const normalized = targetKey.replace(/[\s_-]+/g, '').toLowerCase();
  const derived = listDerivedNutritionFields().find((field) => {
    const label = field.label.replace(/[\s_-]+/g, '').toLowerCase();
    const key = field.fieldPath.replace(/[\s_.-]+/g, '').toLowerCase();
    return label === normalized || key === normalized;
  });
  if (!derived) {
    return null;
  }
  return {
    fieldPath: derived.fieldPath,
    label: derived.label,
    unit: derived.unit,
    sourceFieldPaths: [...derived.sourceFieldPaths],
  };
}

function calculateDerivedSupplementDose(input: {
  profile: NutritionProfile | null;
  goal: {
    sourceFieldPaths: string[];
    unit: string;
    targetValuePerKg: number;
  };
  basisWeightG: number;
  displayUnit?: string | null;
}): { amount: number; unit: string } | null {
  const { profile, goal, basisWeightG } = input;
  if (!profile) {
    return null;
  }

  // 每 1 份（PER_SERVING）或每 1g（PER_100_G 等）的组合营养素含量
  let perUnitAmount = 0;
  let perUnitMissing = 0;
  for (const fieldPath of goal.sourceFieldPaths) {
    const read = readProfileFieldAmount(profile, fieldPath, 1);
    if (read.missing || read.amount === null || !Number.isFinite(read.amount)) {
      perUnitMissing += 1;
      continue;
    }
    perUnitAmount += read.amount;
  }
  if (perUnitMissing > 0 || perUnitAmount <= 0) {
    return null;
  }

  // 字段值单位（以 mg 计的换算因子）。readProfileFieldAmount 返回的
  // 数值以字段目录单位为准（如 EPA/DHA 为 mg）。
  const fieldUnitFactor = MASS_UNIT_FACTORS['mg'] ?? 1;
  const targetUnitFactor = MASS_UNIT_FACTORS[normalizeMassUnit(goal.unit)];
  if (fieldUnitFactor === undefined || targetUnitFactor === undefined) {
    return null;
  }

  const totalNeededInFieldUnit =
    goal.targetValuePerKg * (basisWeightG / 1000) *
    (targetUnitFactor / fieldUnitFactor);
  const amount = totalNeededInFieldUnit / perUnitAmount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return {
    amount,
    unit: normalizeText(input.displayUnit) || goal.unit,
  };
}

function normalizeMassUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'μg' || normalized === 'mcg') {
    return 'ug';
  }
  return normalized;
}

// ---------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------

function withSupplementServingUnit(
  profile: NutritionProfile | null,
  ingredient: {
    unitDisplayLabel?: string | null;
    properties?: Prisma.JsonValue;
  },
): NutritionProfile | null {
  if (!profile) {
    return null;
  }
  const meta = (profile as { meta?: Record<string, unknown> }).meta ?? {};
  if (
    meta.rawBasisType !== 'PER_SERVING' ||
    meta.servingUnitLabel ||
    meta.amountUnitLabel ||
    meta.usageUnit
  ) {
    return profile;
  }

  const servingUnitLabel =
    normalizeText(ingredient.unitDisplayLabel) ||
    readSupplementDisplayUnit(ingredient.properties);
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
  } as unknown as NutritionProfile;
}

function parseSupplementTargets(value: Prisma.JsonValue): SupplementTarget[] | null {
  if (!isNonNullJson(value)) {
    return null;
  }
  const raw = Array.isArray(value) ? value : null;
  if (!raw || raw.length === 0) {
    return null;
  }

  const targets: SupplementTarget[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const fieldPath =
      typeof record.fieldPath === 'string' ? record.fieldPath : '';
    const targetValuePerKg = Number(record.targetValuePerKg);
    if (!fieldPath || !Number.isFinite(targetValuePerKg) || targetValuePerKg <= 0) {
      continue;
    }
    targets.push({
      fieldPath,
      label:
        typeof record.label === 'string' && record.label.trim()
          ? record.label
          : fieldPath,
      targetValuePerKg,
      unit:
        typeof record.unit === 'string' && record.unit.trim()
          ? record.unit
          : 'g',
    });
  }
  return targets.length > 0 ? targets : null;
}

function extractSummary(
  nutritionDetailedData: Prisma.JsonValue,
): Record<string, number | null> | null {
  if (!isNonNullJson(nutritionDetailedData)) {
    return null;
  }
  const data = asRecord(nutritionDetailedData);
  if (!data) {
    return null;
  }
  const summary = asRecord(data.summary) ?? data;
  return summaryFromRecord(summary);
}

function summaryFromReport(
  report: NutritionDetailedData,
): Record<string, number | null> | null {
  const record = report as unknown as Record<string, unknown>;
  const summary = asRecord(record.summary) ?? record;
  return summaryFromRecord(summary);
}

function summaryFromRecord(
  record: Record<string, unknown>,
): Record<string, number | null> | null {
  const keys = [
    'moisture_pct',
    'protein_dm_pct',
    'fat_dm_pct',
    'fiber_dm_pct',
    'ash_dm_pct',
    'carbs_dm_pct',
    'ca_p_ratio',
    'energy_density_kcal_per_kg',
  ] as const;
  const summary: Record<string, number | null> = {};
  let hasValue = false;
  for (const key of keys) {
    const value = record[key];
    const numeric =
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (numeric !== null) {
      hasValue = true;
    }
    summary[key] = numeric;
  }
  return hasValue ? summary : null;
}

function resolveOverrideRatio(
  override: BatchReplaceItemOverride,
  recipe: LoadedRecipe,
  fromIngredientId: string,
): number | null {
  if (override.ratioPercent !== undefined) {
    return Number.isFinite(override.ratioPercent) ? override.ratioPercent : null;
  }
  if (override.exampleWeight === undefined) {
    return null;
  }
  const foodItems = recipe.items.filter(
    (item) => item.ingredient.type !== IngredientType.SUPPLEMENT,
  );
  const total = foodItems.reduce((sum, item) => {
    const weight =
      item.ingredientId === fromIngredientId
        ? override.exampleWeight
        : item.exampleWeight;
    return sum + (Number.isFinite(weight) ? (weight as number) : 0);
  }, 0);
  return total > 0 ? roundPercent((override.exampleWeight / total) * 100) : null;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function isNonNullJson(value: Prisma.JsonValue): boolean {
  return value !== null && value !== undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function readSupplementDisplayUnit(
  properties: Prisma.JsonValue | undefined,
): string | null {
  const record = asRecord(properties);
  if (!record) {
    return null;
  }
  return normalizeText(record.display_unit);
}

function typeLabel(type: IngredientType): string {
  return type === IngredientType.SUPPLEMENT ? '补剂' : '食材';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
