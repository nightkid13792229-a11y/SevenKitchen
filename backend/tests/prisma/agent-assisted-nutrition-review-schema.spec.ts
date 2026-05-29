import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const readProjectFile = (...segments: string[]) =>
  readFileSync(join(__dirname, '../..', ...segments), 'utf8');

const modelBlock = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

describe('agent-assisted nutrition review schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('stores Agent review and hard-gate cache on food candidates', () => {
    const block = modelBlock(schema, 'IngredientNutritionCandidate');

    expect(block).toMatch(/agentReview\s+Json\?/);
    expect(block).toMatch(/agentReviewStatus\s+String\?/);
    expect(block).toMatch(/hardGateResults\s+Json\?/);
    expect(block).toMatch(/reviewGroup\s+String\?/);
    expect(block).toMatch(/preparationState\s+String\?/);
    expect(block).toMatch(/preparationStateLabel\s+String\?/);
    expect(block).toMatch(/ediblePortionLabel\s+String\?/);
    expect(block).toMatch(/processingLabel\s+String\?/);
    expect(block).toMatch(/reviewNote\s+String\?/);
  });

  it('stores edible portion and processing labels on confirmed nutrition foods', () => {
    const block = modelBlock(schema, 'NutritionFood');

    expect(block).toMatch(/ediblePortionLabel\s+String\?/);
    expect(block).toMatch(/processingLabel\s+String\?/);
  });

  it('adds a migration for the review workbench fields', () => {
    const migrationPath = join(
      __dirname,
      '../../prisma/migrations/202605120002_agent_assisted_nutrition_review/migration.sql',
    );
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');
    expect(migration).toContain('agent_review');
    expect(migration).toContain('hard_gate_results');
    expect(migration).toContain('review_group');
    expect(migration).toContain('edible_portion_label');
    expect(migration).toContain('processing_label');
  });
});
