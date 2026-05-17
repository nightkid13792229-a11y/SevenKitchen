import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('FEDIAF 2025 dog standard schema', () => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );

  it('removes the legacy single-version FEDIAF model', () => {
    expect(schema).not.toContain('model NutritionStandardFediaf');
    expect(schema).not.toContain('@@map("nutrition_standard_fediaf")');
    expect(
      existsSync(
        join(__dirname, '../../../prisma/seed-nutrition-standards.ts'),
      ),
    ).toBe(false);
  });

  it('defines versioned nutrition standard models', () => {
    expect(schema).toContain('model NutritionStandardVersion');
    expect(schema).toContain('model NutritionNutrientDefinition');
    expect(schema).toContain('model NutritionStandardEntry');
    expect(schema).toContain('model NutritionStandardReviewEvent');
  });

  it('defines controlled enums for species, source type, basis, max type, and review status', () => {
    expect(schema).toContain('enum NutritionStandardSpecies');
    expect(schema).toContain('enum NutritionStandardEntrySourceType');
    expect(schema).toContain('enum NutritionStandardBasis');
    expect(schema).toContain('enum NutritionStandardMaxType');
    expect(schema).toContain('enum NutritionStandardReviewStatus');
  });

  it('enforces entry species consistency through the version relation', () => {
    expect(schema).toContain('@@unique([id, species])');
    expect(schema).toContain(
      '@relation(fields: [versionId, species], references: [id, species], onDelete: Cascade)',
    );
  });
});
