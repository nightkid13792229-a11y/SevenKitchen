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

const enumBlock = (schema: string, enumName: string) => {
  const match = schema.match(
    new RegExp(`enum ${enumName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

describe('nutrition governance Prisma schema', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('declares governance enums with the planned values', () => {
    expect(enumBlock(schema, 'NutritionGovernanceSourceType')).toMatch(
      /USDA[\s\S]*NZFCD[\s\S]*CFCT[\s\S]*SUPPLEMENT_LABEL[\s\S]*MANUAL/,
    );
    expect(enumBlock(schema, 'NutritionGovernanceRecordStatus')).toMatch(
      /ACTIVE[\s\S]*DEPRECATED/,
    );
    expect(enumBlock(schema, 'NutritionCandidateStatus')).toMatch(
      /CANDIDATE[\s\S]*CONFIRMED[\s\S]*REJECTED[\s\S]*SKIPPED/,
    );
    expect(enumBlock(schema, 'NutritionMatchConfidence')).toMatch(
      /HIGH[\s\S]*MEDIUM[\s\S]*LOW/,
    );
    expect(enumBlock(schema, 'SupplementNutritionDraftStatus')).toMatch(
      /DRAFT[\s\S]*CONFIRMED[\s\S]*REJECTED/,
    );
  });

  it('adds governance relations to Ingredient after nutrition food mappings', () => {
    expect(modelBlock(schema, 'Ingredient')).toMatch(
      /nutritionFoodMappings\s+NutritionFoodMapping\[\]\s+nutritionCandidates\s+IngredientNutritionCandidate\[\]\s+supplementNutritionDrafts\s+SupplementNutritionDraft\[\]/,
    );
  });

  it('declares nutrition source records with governance metadata and indexes', () => {
    const block = modelBlock(schema, 'NutritionSourceRecord');

    expect(block).toMatch(
      /id\s+String\s+@id\s+@default\(uuid\(\)\)\s+@map\("id"\)/,
    );
    expect(block).toMatch(
      /sourceType\s+NutritionGovernanceSourceType\s+@map\("source_type"\)/,
    );
    expect(block).toMatch(
      /sourceKey\s+String\s+@map\("source_key"\)\s+@db\.VarChar\(200\)/,
    );
    expect(block).toMatch(
      /sourceTitle\s+String\s+@map\("source_title"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(/sourceDetail\s+Json\?\s+@map\("source_detail"\)/);
    expect(block).toMatch(
      /foodName\s+String\s+@map\("food_name"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(
      /foodNameEn\s+String\?\s+@map\("food_name_en"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(
      /dataType\s+String\?\s+@map\("data_type"\)\s+@db\.VarChar\(100\)/,
    );
    expect(block).toMatch(
      /category\s+String\?\s+@map\("category"\)\s+@db\.VarChar\(100\)/,
    );
    expect(block).toMatch(/rawData\s+Json\s+@map\("raw_data"\)/);
    expect(block).toMatch(
      /normalizedNutrition\s+Json\?\s+@map\("normalized_nutrition"\)/,
    );
    expect(block).toMatch(
      /status\s+NutritionGovernanceRecordStatus\s+@default\(ACTIVE\)\s+@map\("status"\)/,
    );
    expect(block).toMatch(/candidates\s+IngredientNutritionCandidate\[\]/);
    expect(block).toMatch(/supplementDrafts\s+SupplementNutritionDraft\[\]/);
    expect(block).toMatch(/@@unique\(\[sourceType,\s+sourceKey\]\)/);
    expect(block).toMatch(/@@index\(\[sourceType\]\)/);
    expect(block).toMatch(/@@index\(\[foodName\]\)/);
    expect(block).toMatch(/@@index\(\[status\]\)/);
    expect(block).toContain('@@map("nutrition_source_record")');
  });

  it('declares ingredient nutrition candidates with confirmation workflow constraints', () => {
    const block = modelBlock(schema, 'IngredientNutritionCandidate');

    expect(block).toMatch(/ingredientId\s+String\s+@map\("ingredient_id"\)/);
    expect(block).toMatch(
      /sourceRecordId\s+String\s+@map\("source_record_id"\)/,
    );
    expect(block).toMatch(/sourcePriority\s+Int\s+@map\("source_priority"\)/);
    expect(block).toMatch(
      /confidence\s+NutritionMatchConfidence\s+@map\("confidence"\)/,
    );
    expect(block).toMatch(/score\s+Float\s+@map\("score"\)/);
    expect(block).toMatch(/matchReasons\s+Json\s+@map\("match_reasons"\)/);
    expect(block).toMatch(
      /normalizedNutrition\s+Json\s+@map\("normalized_nutrition"\)/,
    );
    expect(block).toMatch(
      /status\s+NutritionCandidateStatus\s+@default\(CANDIDATE\)\s+@map\("status"\)/,
    );
    expect(block).toMatch(
      /confirmationSnapshot\s+Json\?\s+@map\("confirmation_snapshot"\)/,
    );
    expect(block).toMatch(/confirmedBy\s+String\?\s+@map\("confirmed_by"\)/);
    expect(block).toMatch(/confirmedAt\s+DateTime\?\s+@map\("confirmed_at"\)/);
    expect(block).toMatch(
      /ingredient\s+Ingredient\s+@relation\(fields: \[ingredientId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(block).toMatch(
      /sourceRecord\s+NutritionSourceRecord\s+@relation\(fields: \[sourceRecordId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(block).toMatch(/@@unique\(\[ingredientId,\s+sourceRecordId\]\)/);
    expect(block).toMatch(/@@index\(\[ingredientId\]\)/);
    expect(block).toMatch(/@@index\(\[sourceRecordId\]\)/);
    expect(block).toMatch(/@@index\(\[status\]\)/);
    expect(block).toMatch(/@@index\(\[confidence\]\)/);
    expect(block).toContain('@@map("ingredient_nutrition_candidate")');
  });

  it('declares supplement nutrition drafts with optional source record links', () => {
    const block = modelBlock(schema, 'SupplementNutritionDraft');

    expect(block).toMatch(/ingredientId\s+String\s+@map\("ingredient_id"\)/);
    expect(block).toMatch(
      /sourceRecordId\s+String\?\s+@map\("source_record_id"\)/,
    );
    expect(block).toMatch(/imageUrl\s+String\s+@map\("image_url"\)/);
    expect(block).toMatch(
      /imageKey\s+String\s+@map\("image_key"\)\s+@db\.VarChar\(300\)/,
    );
    expect(block).toMatch(/ocrText\s+String\?\s+@map\("ocr_text"\)/);
    expect(block).toMatch(/aiExtraction\s+Json\s+@map\("ai_extraction"\)/);
    expect(block).toMatch(
      /normalizedNutrition\s+Json\?\s+@map\("normalized_nutrition"\)/,
    );
    expect(block).toMatch(
      /missingFields\s+String\[\]\s+@default\(\[\]\)\s+@map\("missing_fields"\)/,
    );
    expect(block).toMatch(
      /status\s+SupplementNutritionDraftStatus\s+@default\(DRAFT\)\s+@map\("status"\)/,
    );
    expect(block).toMatch(/createdBy\s+String\?\s+@map\("created_by"\)/);
    expect(block).toMatch(/confirmedBy\s+String\?\s+@map\("confirmed_by"\)/);
    expect(block).toMatch(/confirmedAt\s+DateTime\?\s+@map\("confirmed_at"\)/);
    expect(block).toMatch(
      /ingredient\s+Ingredient\s+@relation\(fields: \[ingredientId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(block).toMatch(
      /sourceRecord\s+NutritionSourceRecord\?\s+@relation\(fields: \[sourceRecordId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(block).toMatch(/@@index\(\[ingredientId\]\)/);
    expect(block).toMatch(/@@index\(\[sourceRecordId\]\)/);
    expect(block).toMatch(/@@index\(\[status\]\)/);
    expect(block).toContain('@@map("supplement_nutrition_draft")');
  });

  it('adds a SQL migration for matching governance database objects', () => {
    const migration = readProjectFileIfExists(
      'prisma/migrations/202605110001_add_nutrition_governance/migration.sql',
    );

    expect(migration).toContain(
      'CREATE TYPE "NutritionGovernanceSourceType" AS ENUM',
    );
    expect(migration).toContain(
      'CREATE TYPE "NutritionGovernanceRecordStatus" AS ENUM',
    );
    expect(migration).toContain(
      'CREATE TYPE "NutritionCandidateStatus" AS ENUM',
    );
    expect(migration).toContain(
      'CREATE TYPE "NutritionMatchConfidence" AS ENUM',
    );
    expect(migration).toContain(
      'CREATE TYPE "SupplementNutritionDraftStatus" AS ENUM',
    );
    expect(migration).toContain('CREATE TABLE "nutrition_source_record"');
    expect(migration).toContain(
      'CREATE TABLE "ingredient_nutrition_candidate"',
    );
    expect(migration).toContain('CREATE TABLE "supplement_nutrition_draft"');
    expect(migration).toContain(
      'nutrition_source_record_source_type_source_key_key',
    );
    expect(migration).toContain(
      'ingredient_nutrition_candidate_ingredient_id_source_record_id_key',
    );
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
    expect(migration).not.toMatch(
      /"updated_at" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/,
    );
  });
});
