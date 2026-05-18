import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const readProjectFile = (...segments: string[]) =>
  readFileSync(join(__dirname, '../..', ...segments), 'utf8');

const readProjectFileIfExists = (...segments: string[]) => {
  const path = join(__dirname, '../..', ...segments);

  return existsSync(path) ? readFileSync(path, 'utf8') : '';
};

const modelBlock = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

describe('recipe item nutrition food state Prisma schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('adds state metadata to concrete nutrition foods', () => {
    const block = modelBlock(schema, 'NutritionFood');

    expect(block).toMatch(
      /preparationState\s+String\?\s+@map\("preparation_state"\)\s+@db\.VarChar\(50\)/,
    );
    expect(block).toMatch(
      /preparationStateLabel\s+String\?\s+@map\("preparation_state_label"\)\s+@db\.VarChar\(100\)/,
    );
    expect(block).toMatch(/recipeItems\s+RecipeItem\[\]/);
  });

  it('lets recipe items reference the selected concrete nutrition food', () => {
    const block = modelBlock(schema, 'RecipeItem');

    expect(block).toMatch(
      /nutritionFoodId\s+String\?\s+@map\("nutrition_food_id"\)/,
    );
    expect(block).toMatch(
      /nutritionFood\s+NutritionFood\?\s+@relation\(fields: \[nutritionFoodId\], references: \[id\]\)/,
    );
    expect(block).toMatch(/@@index\(\[nutritionFoodId\]\)/);
  });

  it('adds a migration for recipe nutrition state fields', () => {
    const migration = readProjectFileIfExists(
      'prisma/migrations/202605120001_add_recipe_item_nutrition_food_state/migration.sql',
    );

    expect(migration).toContain(
      'ALTER TABLE "nutrition_food" ADD COLUMN "preparation_state"',
    );
    expect(migration).toContain(
      'ALTER TABLE "nutrition_food" ADD COLUMN "preparation_state_label"',
    );
    expect(migration).toContain(
      'ALTER TABLE "recipe_item" ADD COLUMN "nutrition_food_id"',
    );
    expect(migration).toContain(
      'CREATE INDEX "recipe_item_nutrition_food_id_idx"',
    );
    expect(migration).toContain(
      'ADD CONSTRAINT "recipe_item_nutrition_food_id_fkey"',
    );
  });
});
