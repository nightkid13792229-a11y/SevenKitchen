import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

export interface RecipeSupplementAlternativeGroup {
  legacyIngredientId: string;
  defaultIngredientId: string;
  alternativeIngredientIds: string[];
}

export interface RecipeSupplementAlternativeLink {
  recipeItemId: string;
  alternativeIngredientId: string;
  sortOrder: number;
}

export interface RecipeSupplementAlternativesPlanInput {
  recipeItems: Array<{ id: string; ingredientId: string }>;
  groupedIngredients: RecipeSupplementAlternativeGroup[];
  existingAlternatives: Array<{
    recipeItemId: string;
    alternativeIngredientId: string;
  }>;
}

export function planRecipeSupplementAlternativesBackfill(
  input: RecipeSupplementAlternativesPlanInput,
): {
  createLinks: RecipeSupplementAlternativeLink[];
  skip: number;
} {
  const existing = new Set(
    input.existingAlternatives.map(
      (item) => `${item.recipeItemId}:${item.alternativeIngredientId}`,
    ),
  );
  const grouped = new Map(
    input.groupedIngredients.map((item) => [item.legacyIngredientId, item]),
  );

  const createLinks: RecipeSupplementAlternativeLink[] = [];
  let skip = 0;

  input.recipeItems.forEach((recipeItem) => {
    const group = grouped.get(recipeItem.ingredientId);
    if (!group || group.alternativeIngredientIds.length === 0) {
      return;
    }

    let sortOrder = 0;
    group.alternativeIngredientIds.forEach((alternativeIngredientId) => {
      const key = `${recipeItem.id}:${alternativeIngredientId}`;
      if (existing.has(key)) {
        skip += 1;
        sortOrder += 1;
        return;
      }

      createLinks.push({
        recipeItemId: recipeItem.id,
        alternativeIngredientId,
        sortOrder,
      });
      sortOrder += 1;
    });
  });

  return {
    createLinks,
    skip,
  };
}

type Logger = {
  info: (message: string) => void;
  error: (message: string) => void;
};

export async function runRecipeSupplementAlternativesBackfill(options?: {
  prisma?: PrismaClient;
  apply?: boolean;
  logger?: Logger;
}) {
  const client = options?.prisma || prisma;
  const apply = options?.apply ?? shouldApply;
  const logger = options?.logger || console;

  const ingredients = await client.ingredient.findMany({
    where: {
      type: 'SUPPLEMENT',
    },
    select: {
      id: true,
      properties: true,
      recipeItems: {
        select: {
          id: true,
          ingredientId: true,
        },
      },
    },
  });

  const groupedIngredients = Array.from(
    ingredients.reduce((map, ingredient) => {
      const properties =
        ingredient.properties &&
        typeof ingredient.properties === 'object' &&
        !Array.isArray(ingredient.properties)
          ? (ingredient.properties as Record<string, any>)
          : {};
      const legacyIngredientId =
        properties.single_layer_origin?.legacy_ingredient_id;
      if (!legacyIngredientId) {
        return map;
      }

      const group = map.get(legacyIngredientId) || {
        legacyIngredientId,
        defaultIngredientId: legacyIngredientId,
        alternativeIngredientIds: [] as string[],
      };

      if (ingredient.id !== legacyIngredientId) {
        group.alternativeIngredientIds.push(ingredient.id);
      }

      map.set(legacyIngredientId, group);
      return map;
    }, new Map<string, RecipeSupplementAlternativeGroup>()).values(),
  );

  const recipeItems = ingredients.flatMap((ingredient) => ingredient.recipeItems);

  const existingAlternatives = await client.recipeSupplementAlternative.findMany({
    select: {
      recipeItemId: true,
      alternativeIngredientId: true,
    },
  });

  const plan = planRecipeSupplementAlternativesBackfill({
    recipeItems,
    groupedIngredients,
    existingAlternatives,
  });

  if (!apply) {
    logger.info(
      `Dry run summary: createLinks=${plan.createLinks.length}, skip=${plan.skip}`,
    );
    return {
      apply: 0,
      create: plan.createLinks.length,
      skip: plan.skip,
      plan,
    };
  }

  if (plan.createLinks.length > 0) {
    await client.recipeSupplementAlternative.createMany({
      data: plan.createLinks,
      skipDuplicates: true,
    });
  }

  logger.info(
    `Applied recipe supplement alternatives backfill: createLinks=${plan.createLinks.length}`,
  );

  return {
    apply: plan.createLinks.length,
    create: plan.createLinks.length,
    skip: plan.skip,
  };
}

async function main() {
  const result = await runRecipeSupplementAlternativesBackfill();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Failed to backfill recipe supplement alternatives:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
