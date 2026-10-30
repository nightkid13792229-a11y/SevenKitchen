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

const MIGRATION_DIR =
  'prisma/migrations/20261022120000_supplement_target_preparation';

const migrationSql = () =>
  readProjectFileIfExists(MIGRATION_DIR, 'migration.sql');

// Prisma's `migrate diff` pads `ADD COLUMN` with extra spaces; normalize so the
// guards track column definitions instead of generator formatting.
const normalizedMigrationSql = () => migrationSql().replace(/\s+/g, ' ').trim();

const migrationStatementFor = (table: string) => {
  const statement = normalizedMigrationSql()
    .split('-- AlterTable ')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`ALTER TABLE "${table}"`));

  expect(statement).toBeDefined();

  return statement ?? '';
};

describe('supplement target and preparation Prisma schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  describe('nutrition food default supplement targets', () => {
    it('stores default supplement target definitions on the nutrition profile', () => {
      const block = modelBlock(schema, 'NutritionFood');

      expect(block).toMatch(
        /defaultSupplementTargets\s+Json\?\s+@map\("default_supplement_targets"\)/,
      );
    });

    it('keeps nutrition data and existing profile fields untouched', () => {
      const block = modelBlock(schema, 'NutritionFood');

      expect(block).toMatch(/nutritionData\s+Json\s+@map\("nutrition_data"\)/);
      expect(block).toMatch(
        /preparationState\s+String\?\s+@map\("preparation_state"\)\s+@db\.VarChar\(50\)/,
      );
    });
  });

  describe('design recipe item preparation metadata', () => {
    it('removes the legacy preparation note and source', () => {
      const block = modelBlock(schema, 'DesignRecipeItem');

      expect(block).not.toMatch(/preparationNote/);
      expect(block).not.toMatch(/preparationSource/);
    });

    it('keeps the existing preparation method column', () => {
      const block = modelBlock(schema, 'DesignRecipeItem');

      expect(block).toMatch(
        /preparationMethod\s+String\?\s+@map\("preparation_method"\)\s+@db\.VarChar\(100\)/,
      );
    });
  });

  describe('published recipe item preparation metadata', () => {
    it('removes the legacy preparation note and source', () => {
      const block = modelBlock(schema, 'RecipeItem');

      expect(block).not.toMatch(/preparationNote/);
      expect(block).not.toMatch(/preparationSource/);
    });

    it('keeps the existing preparation method column', () => {
      const block = modelBlock(schema, 'RecipeItem');

      expect(block).toMatch(
        /preparationMethod\s+String\?\s+@map\("preparation_method"\)/,
      );
    });
  });

  describe('structured production steps', () => {
    it('adds structured steps to design drafts', () => {
      const block = modelBlock(schema, 'DesignRecipe');

      expect(block).toMatch(
        /productionStepsJson\s+Json\?\s+@map\("production_steps_json"\)/,
      );
    });

    it('adds structured steps to published recipes without replacing the legacy string', () => {
      const block = modelBlock(schema, 'Recipe');

      expect(block).toMatch(
        /productionStepsJson\s+Json\?\s+@map\("production_steps_json"\)/,
      );
      expect(block).toMatch(
        /productionSteps\s+String\?\s+@map\("production_steps"\)/,
      );
    });
  });

  describe('additive migration', () => {
    it('creates the migration file', () => {
      expect(
        existsSync(join(__dirname, '../..', MIGRATION_DIR, 'migration.sql')),
      ).toBe(true);
    });

    it('adds the nutrition food default target column', () => {
      expect(migrationStatementFor('nutrition_food')).toContain(
        'ADD COLUMN "default_supplement_targets" JSONB',
      );
    });

    it('adds preparation metadata to design and published recipe items', () => {
      expect(migrationStatementFor('design_recipe_item')).toContain(
        'ADD COLUMN "preparation_note" VARCHAR(500)',
      );
      expect(migrationStatementFor('design_recipe_item')).toContain(
        'ADD COLUMN "preparation_source" VARCHAR(20)',
      );
      expect(migrationStatementFor('recipe_item')).toContain(
        'ADD COLUMN "preparation_note" VARCHAR(500)',
      );
      expect(migrationStatementFor('recipe_item')).toContain(
        'ADD COLUMN "preparation_source" VARCHAR(20)',
      );
    });

    it('adds structured production steps to designs and published recipes', () => {
      expect(migrationStatementFor('design_recipe')).toContain(
        'ADD COLUMN "production_steps_json" JSONB',
      );
      expect(migrationStatementFor('recipe')).toContain(
        'ADD COLUMN "production_steps_json" JSONB',
      );
    });

    it('is additive and leaves existing text columns alone', () => {
      const sql = migrationSql();

      expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE|CONSTRAINT)/i);
      expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
      expect(sql).not.toMatch(/"production_steps"(\s|,|;)/i);
      expect(sql).not.toMatch(/preparation_method/i);
    });
  });
});
