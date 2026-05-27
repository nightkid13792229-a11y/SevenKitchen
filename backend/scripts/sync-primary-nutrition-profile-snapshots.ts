import { IngredientType, PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

export interface IngredientSnapshotSyncInput {
  id: string;
  name: string;
  type: string;
  nutritionProfile: unknown;
  nutritionFoodMappings: Array<{
    isPrimary: boolean;
    nutritionFood: {
      id: string;
      displayNameZh: string | null;
      name: string;
      nutritionData: unknown;
    };
  }>;
}

export interface IngredientSnapshotSyncPlan {
  ingredientId: string;
  ingredientName: string;
  ingredientType: string;
  nutritionFoodId: string;
  nutritionFoodName: string;
  reason: 'EMPTY_INGREDIENT_PROFILE_WITH_PRIMARY_MAPPING';
  nutritionData: unknown;
}

export function hasNutritionProfileValues(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return false;
  }

  for (const groupKey of [
    'macros',
    'minerals',
    'vitamins',
    'fattyAcids',
    'aminoAcids',
  ]) {
    const group = (profile as Record<string, unknown>)[groupKey];
    if (!group || typeof group !== 'object' || Array.isArray(group)) {
      continue;
    }
    if (
      Object.values(group).some(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      return true;
    }
  }

  const customItems = (profile as { customItems?: unknown }).customItems;
  return Array.isArray(customItems) && customItems.length > 0;
}

export function buildIngredientSnapshotSyncPlans(
  ingredients: IngredientSnapshotSyncInput[],
): IngredientSnapshotSyncPlan[] {
  return ingredients.flatMap((ingredient) => {
    if (hasNutritionProfileValues(ingredient.nutritionProfile)) {
      return [];
    }

    const primaryMapping = ingredient.nutritionFoodMappings.find(
      (mapping) => mapping.isPrimary,
    );
    if (!primaryMapping) {
      return [];
    }
    if (
      !hasNutritionProfileValues(primaryMapping.nutritionFood.nutritionData)
    ) {
      return [];
    }

    return [
      {
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        ingredientType: ingredient.type,
        nutritionFoodId: primaryMapping.nutritionFood.id,
        nutritionFoodName:
          primaryMapping.nutritionFood.displayNameZh ??
          primaryMapping.nutritionFood.name,
        reason: 'EMPTY_INGREDIENT_PROFILE_WITH_PRIMARY_MAPPING',
        nutritionData: primaryMapping.nutritionFood.nutritionData,
      },
    ];
  });
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const ingredients = await prisma.ingredient.findMany({
      where: {
        type: { in: [IngredientType.FOOD, IngredientType.SUPPLEMENT] },
      },
      select: {
        id: true,
        name: true,
        type: true,
        nutritionProfile: true,
        nutritionFoodMappings: {
          select: {
            isPrimary: true,
            nutritionFood: {
              select: {
                id: true,
                displayNameZh: true,
                name: true,
                nutritionData: true,
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { nutritionFood: { name: 'asc' } }],
        },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    const plans = buildIngredientSnapshotSyncPlans(ingredients);

    console.log(
      `${APPLY ? 'Applying' : 'Dry run'} primary nutrition profile snapshot sync`,
    );
    console.log(`Planned updates: ${plans.length}`);
    for (const plan of plans) {
      console.log(
        `- ${plan.ingredientName} (${plan.ingredientType}) <= ${plan.nutritionFoodName}`,
      );
    }

    if (!APPLY || plans.length === 0) {
      return;
    }

    for (const plan of plans) {
      await prisma.ingredient.update({
        where: { id: plan.ingredientId },
        data: { nutritionProfile: plan.nutritionData as any },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to sync nutrition profile snapshots:', error);
    process.exit(1);
  });
}
