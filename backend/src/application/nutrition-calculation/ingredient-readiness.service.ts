import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { getNutritionProfileFieldValue } from '../../domain/ingredient/nutrition-field-catalog';
import { normalizeNutritionProfile } from '../../domain/ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../../domain/ingredient/types';
import { PrismaService } from '../../infrastructure/prisma.service';
import type {
  IngredientReadinessItem,
  IngredientReadinessLevel,
  IngredientReadinessResult,
  MissingNutrientRankingItem,
} from './nutrition-calculation.types';

const FEDIAF_2025_DOG_CODE = 'FEDIAF_2025_DOG';

type NutrientExpression = {
  op?: unknown;
  fields?: unknown;
  numerator?: unknown;
  denominator?: unknown;
};

type NutrientLike = {
  code: string;
  fieldPath: string | null;
  expression: Prisma.JsonValue | null;
};

type EntryLike = {
  nutrient: NutrientLike;
};

type RequiredNutrient = {
  nutrientCode: string;
  fieldPaths: string[];
};

type IngredientLike = {
  id: string;
  name: string;
  type: string;
  nutritionProfile: Prisma.JsonValue | null;
  nutritionFoodMappings?: Array<{ id: string }>;
};

@Injectable()
export class IngredientReadinessService {
  constructor(private readonly prisma: PrismaService) {}

  async listIngredientReadiness(): Promise<IngredientReadinessResult> {
    const version = await this.prisma.nutritionStandardVersion.findUnique({
      where: { code: FEDIAF_2025_DOG_CODE },
      include: {
        entries: {
          include: {
            nutrient: true,
          },
          orderBy: [
            { sourceTable: 'asc' },
            { sortOrder: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });

    if (!version) {
      throw new NotFoundException(
        'FEDIAF 2025 dog standard has not been imported',
      );
    }

    const requiredNutrients = this.getRequiredNutrients(
      version.entries as EntryLike[],
    );
    const ingredients = (await this.prisma.ingredient.findMany({
      where: {
        type: { in: ['FOOD', 'SUPPLEMENT'] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        nutritionProfile: true,
        nutritionFoodMappings: {
          select: { id: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    })) as IngredientLike[];

    const missingCounts = new Map<string, number>();
    const items = ingredients.map((ingredient) =>
      this.evaluateIngredient(ingredient, requiredNutrients, missingCounts),
    );
    items.sort((a, b) => this.compareReadinessItems(a, b));

    return {
      versionCode: FEDIAF_2025_DOG_CODE,
      summary: {
        totalIngredients: items.length,
        readyFull: items.filter((item) => item.readinessLevel === 'READY_FULL')
          .length,
        readyBasic: items.filter(
          (item) => item.readinessLevel === 'READY_BASIC',
        ).length,
        partial: items.filter((item) => item.readinessLevel === 'PARTIAL')
          .length,
        notReady: items.filter((item) => item.readinessLevel === 'NOT_READY')
          .length,
      },
      items,
      missingNutrientRanking: this.getMissingNutrientRanking(missingCounts),
    };
  }

  private getRequiredNutrients(entries: EntryLike[]): RequiredNutrient[] {
    const nutrientsByCode = new Map<string, RequiredNutrient>();

    for (const entry of entries) {
      const nutrientCode = entry.nutrient.code;
      if (nutrientsByCode.has(nutrientCode)) {
        continue;
      }

      nutrientsByCode.set(nutrientCode, {
        nutrientCode,
        fieldPaths: this.getRequiredFieldPaths(entry.nutrient),
      });
    }

    return [...nutrientsByCode.values()];
  }

  private getRequiredFieldPaths(nutrient: NutrientLike): string[] {
    if (nutrient.fieldPath) {
      return [nutrient.fieldPath];
    }

    const expression = this.toExpression(nutrient.expression);
    const fields =
      Array.isArray(expression?.fields) &&
      expression.fields.filter(
        (fieldPath): fieldPath is string => typeof fieldPath === 'string',
      );

    if (fields) {
      return this.unique(fields);
    }

    return this.unique([expression?.numerator, expression?.denominator]).filter(
      (fieldPath): fieldPath is string => typeof fieldPath === 'string',
    );
  }

  private evaluateIngredient(
    ingredient: IngredientLike,
    requiredNutrients: RequiredNutrient[],
    missingCounts: Map<string, number>,
  ): IngredientReadinessItem {
    const nutritionProfile = normalizeNutritionProfile(
      ingredient.nutritionProfile as NutritionProfile | null,
    );
    const resolvedNutrients: string[] = [];
    const missingNutrients: string[] = [];

    for (const nutrient of requiredNutrients) {
      const isResolved =
        nutrient.fieldPaths.length > 0 &&
        nutrient.fieldPaths.every((fieldPath) =>
          this.hasNumericField(nutritionProfile, fieldPath),
        );

      if (isResolved) {
        resolvedNutrients.push(nutrient.nutrientCode);
      } else {
        missingNutrients.push(nutrient.nutrientCode);
        missingCounts.set(
          nutrient.nutrientCode,
          (missingCounts.get(nutrient.nutrientCode) ?? 0) + 1,
        );
      }
    }

    const hasEnergy = this.hasNumericField(
      nutritionProfile,
      'macros.energyKcal',
    );
    const hasMoisture = this.hasNumericField(
      nutritionProfile,
      'macros.moisture',
    );
    const coverageRatio =
      requiredNutrients.length === 0
        ? 0
        : resolvedNutrients.length / requiredNutrients.length;

    return {
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientType: ingredient.type,
      readinessLevel: this.getReadinessLevel(
        coverageRatio,
        hasEnergy,
        hasMoisture,
      ),
      coverageRatio,
      hasEnergy,
      hasMoisture,
      hasNutritionFoodMapping: Boolean(
        ingredient.nutritionFoodMappings?.length,
      ),
      resolvedNutrients,
      missingNutrients,
    };
  }

  private getReadinessLevel(
    coverageRatio: number,
    hasEnergy: boolean,
    hasMoisture: boolean,
  ): IngredientReadinessLevel {
    if (coverageRatio >= 0.95 && hasEnergy && hasMoisture) {
      return 'READY_FULL';
    }

    if (coverageRatio >= 0.5 && hasEnergy && hasMoisture) {
      return 'READY_BASIC';
    }

    if (coverageRatio > 0) {
      return 'PARTIAL';
    }

    return 'NOT_READY';
  }

  private hasNumericField(
    nutritionProfile: NutritionProfile | null,
    fieldPath: string,
  ): boolean {
    return (
      getNutritionProfileFieldValue(nutritionProfile, fieldPath) !== undefined
    );
  }

  private getMissingNutrientRanking(
    missingCounts: Map<string, number>,
  ): MissingNutrientRankingItem[] {
    return [...missingCounts.entries()]
      .map(([nutrientCode, count]) => ({ nutrientCode, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.nutrientCode.localeCompare(b.nutrientCode),
      );
  }

  private compareReadinessItems(
    a: IngredientReadinessItem,
    b: IngredientReadinessItem,
  ): number {
    const levelOrder: Record<IngredientReadinessLevel, number> = {
      READY_FULL: 0,
      READY_BASIC: 1,
      PARTIAL: 2,
      NOT_READY: 3,
    };

    return (
      levelOrder[a.readinessLevel] - levelOrder[b.readinessLevel] ||
      a.ingredientName.localeCompare(b.ingredientName) ||
      a.ingredientId.localeCompare(b.ingredientId)
    );
  }

  private toExpression(
    value: Prisma.JsonValue | null,
  ): NutrientExpression | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as NutrientExpression;
  }

  private unique<T>(values: T[]): T[] {
    return [...new Set(values)];
  }
}
