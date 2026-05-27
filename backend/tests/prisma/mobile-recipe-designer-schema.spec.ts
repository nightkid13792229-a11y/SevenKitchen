import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf8',
);

describe('mobile recipe designer schema', () => {
  it('keeps FEDIAF 2025 dog scenarios explicit', () => {
    expect(schema).toContain('enum FediafDogScenario');
    expect(schema).toContain('EARLY_GROWTH_REPRODUCTION');
    expect(schema).toContain('REPRODUCTION');
    expect(schema).toContain('LATE_GROWTH');
    expect(schema).toContain('ADULT_MER_95');
    expect(schema).toContain('ADULT_MER_110');
  });

  it('stores design recipe free-total fields without 1kg wording', () => {
    expect(schema).toContain('fediafDogScenario');
    expect(schema).toContain('@map("fediaf_dog_scenario")');
    expect(schema).toContain('@default(ADULT_MER_110)');
    expect(schema).toContain('totalWeightG');
    expect(schema).toContain('@map("total_weight_g")');
    expect(schema).toContain(
      'energyDensityKcalPerKg Float?                        @map("energy_density_kcal_per_kg")',
    );
    expect(schema).toContain('assessmentSummary');
    expect(schema).toContain('@map("assessment_summary")');
    expect(schema).toContain(
      'assessmentSummary      Json                          @default("{}")',
    );
    expect(schema).toContain('missingDataReport');
    expect(schema).toContain('@map("missing_data_report")');
    expect(schema).toContain(
      'missingDataReport      Json                          @default("[]")',
    );
    expect(schema).toContain('@default("FEDIAF_2025")');
    expect(schema).toContain('weightG');
    expect(schema).toContain('@map("weight_g")');
    expect(schema).toContain('includeInAssessment');
    expect(schema).toContain('@map("include_in_assessment")');
    expect(schema).toContain('@default(true)');
    expect(schema).toContain('ratioPercent        Float?');
    expect(schema).not.toContain('weightPerKgG');
    expect(schema).not.toContain('@map("weight_per_kg_g")');
    expect(schema).not.toContain('weight_per_kg_g Float');
  });

  it('stores review and publish snapshot records separately from recipes', () => {
    expect(schema).toContain('enum DesignRecipeReviewStatus');
    expect(schema).toContain('model DesignRecipePublishSnapshot');
    expect(schema).toContain('reviewStatus');
    expect(schema).toContain(
      'reviewStatus           DesignRecipeReviewStatus      @default(NONE)',
    );
    expect(schema).toContain('@map("review_status")');
    expect(schema).toContain('snapshotData');
    expect(schema).toContain('@map("snapshot_data")');
    expect(schema).toContain('publishedRecipeVersion');
    expect(schema).toContain('@map("published_recipe_version")');
    expect(schema).toContain('revisionOfDesignRecipeId');
    expect(schema).toContain('@map("revision_of_design_recipe_id")');
    expect(schema).toContain('revisionBaseRecipeId');
    expect(schema).toContain('@map("revision_base_recipe_id")');
    expect(schema).toContain('recipeVersion');
    expect(schema).toContain('@map("recipe_version")');
  });
});
