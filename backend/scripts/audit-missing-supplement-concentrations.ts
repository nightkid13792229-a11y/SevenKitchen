import { PrismaClient } from '@prisma/client';
import { auditMissingSupplementConcentrations } from '../src/domain/ingredient/supplement-concentration-audit';

const prisma = new PrismaClient();

async function main() {
  const recipeStatus = (process.env.RECIPE_STATUS || 'PUBLIC').trim();
  const where =
    recipeStatus.toUpperCase() === 'ALL'
      ? {}
      : { status: recipeStatus.toUpperCase() as any };

  const recipes = await prisma.recipe.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      items: {
        select: {
          id: true,
          ingredientId: true,
          supplementTargets: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              nutritionProfile: true,
            },
          },
          supplementAlternatives: {
            where: { isActive: true },
            select: {
              alternativeIngredient: {
                select: {
                  id: true,
                  name: true,
                  nutritionProfile: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const findings = auditMissingSupplementConcentrations(
    recipes.flatMap((recipe) =>
      recipe.items.map((item) => ({
        recipeId: recipe.id,
        recipeName: recipe.name,
        recipeItemId: item.id,
        ingredientId: item.ingredient.id,
        ingredientName: item.ingredient.name,
        supplementTargets: (item.supplementTargets as any) || [],
        nutritionProfile: item.ingredient.nutritionProfile as any,
        alternativeIngredients: item.supplementAlternatives.map(
          (alternative) => ({
            ingredientId: alternative.alternativeIngredient.id,
            ingredientName: alternative.alternativeIngredient.name,
            nutritionProfile:
              alternative.alternativeIngredient.nutritionProfile as any,
          }),
        ),
      })),
    ),
  );

  console.log(
    `[audit] Checked ${recipes.length} recipes (status=${recipeStatus.toUpperCase()})`,
  );

  if (findings.length === 0) {
    console.log(
      '[audit] No missing supplement target concentrations found for the selected recipes.',
    );
    return;
  }

  const printable = findings.map((finding) => ({
    recipeName: finding.recipeName,
    recipeId: finding.recipeId,
    recipeItemId: finding.recipeItemId,
    candidateType: finding.candidateType,
    ingredientName: finding.ingredientName,
    ingredientId: finding.ingredientId || '',
    fieldPath: finding.fieldPath,
    label: finding.label,
    unit: finding.unit,
  }));

  console.table(printable);
  console.log(`[audit] Missing concentration findings: ${findings.length}`);
}

main()
  .catch((error) => {
    console.error('[audit] Failed to audit supplement concentrations:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
