import { RecipeService } from '../src/application/recipe/recipe.service';
import { RecipeStatus } from '../src/domain/recipe/enums';
import { AdminRecipeManagementCategory } from '../src/interfaces/dto/recipes/admin-recipe.dto';

describe('RecipeService multi-stage publish summaries', () => {
  const service = new RecipeService({} as any);

  const baseRecipe = {
    recipeId: 'recipe-base',
    name: '牛肉南瓜',
    applicableLifeStages: [],
    managementCategory: AdminRecipeManagementCategory.STANDARD,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('returns a pending draft version for every submitted series life stage', () => {
    const summaries = (service as any).buildRecipeSeriesStageSummaries([
      {
        ...baseRecipe,
        id: 'adult-public-v1',
        recipeId: 'adult-recipe',
        version: 1,
        status: RecipeStatus.PUBLIC,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
      },
      {
        ...baseRecipe,
        id: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        status: RecipeStatus.DRAFT,
        seriesLifeStage: 'HIGH_ACTIVITY_ADULT',
        updatedAt: new Date('2026-06-02T00:00:00.000Z'),
      },
      {
        ...baseRecipe,
        id: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        status: RecipeStatus.DRAFT,
        seriesLifeStage: 'LOW_ACTIVITY_ADULT_OR_SENIOR',
      },
      {
        ...baseRecipe,
        id: 'reproduction-public-v1',
        recipeId: 'reproduction-recipe',
        version: 1,
        status: RecipeStatus.PUBLIC,
        seriesLifeStage: 'REPRODUCTION',
      },
    ]);

    const adult = summaries.find(
      (stage: any) => stage.lifeStage === 'HIGH_ACTIVITY_ADULT',
    );
    const senior = summaries.find(
      (stage: any) => stage.lifeStage === 'LOW_ACTIVITY_ADULT_OR_SENIOR',
    );
    const reproduction = summaries.find(
      (stage: any) => stage.lifeStage === 'REPRODUCTION',
    );

    expect(adult).toMatchObject({
      status: 'SUBMITTED',
      recipeVersionId: 'adult-draft-v2',
      pendingDraftVersion: {
        id: 'adult-draft-v2',
        recipeId: 'adult-recipe',
        version: 2,
        status: RecipeStatus.DRAFT,
      },
    });
    expect(senior).toMatchObject({
      status: 'SUBMITTED',
      recipeVersionId: 'senior-draft-v1',
      pendingDraftVersion: {
        id: 'senior-draft-v1',
        recipeId: 'senior-recipe',
        version: 1,
        status: RecipeStatus.DRAFT,
      },
    });
    expect(reproduction?.status).toBe('PUBLISHED');
    expect(reproduction?.pendingDraftVersion).toBeUndefined();
  });
});
