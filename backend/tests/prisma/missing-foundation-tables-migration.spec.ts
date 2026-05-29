import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('missing foundation tables migration', () => {
  const migrationPath = resolve(
    __dirname,
    '../../prisma/migrations/20260201230900_create_missing_foundation_tables_if_missing/migration.sql',
  );

  it('creates baseline tables that later migrations depend on', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    for (const table of [
      'dog_breed',
      'ingredient',
      'ingredient_tag',
      'ingredient_tag_assignment',
      'weight_record',
      'vaccine_record',
      'checkup_record',
      'medical_record',
      'allergy_record',
      'global_config',
      'shipping_template',
      'photo_share_token',
      'design_source',
      'recipe_health_tag',
      'recipe_health_tag_assignment',
      'preparation_method',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`);
    }
  });

  it('leaves columns that later historical migrations add out of baseline tables', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).not.toContain('"procurement_strategy"');
    expect(migration).not.toContain('"diy_enabled"');
    expect(migration).not.toContain('"procurement_enabled"');
    expect(migration).not.toContain('"nutrition_profile"');
    expect(migration).not.toContain('"safety_stock"');
    expect(migration).not.toContain('"reorder_point"');
    expect(migration).not.toContain('"target_stock"');
  });
});
