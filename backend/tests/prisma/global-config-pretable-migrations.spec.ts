import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('early global config migrations', () => {
  const minPotWeightMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260127183915_add_min_pot_weight_config/migration.sql',
    ),
    'utf8',
  );
  const ingredientPriceMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260331120000_add_ingredient_price_change/migration.sql',
    ),
    'utf8',
  );
  const homeHeaderMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260331180000_add_home_header_bg_image_url/migration.sql',
    ),
    'utf8',
  );
  const diySheetHeaderMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260425120000_add_diy_sheet_header_bg_config/migration.sql',
    ),
    'utf8',
  );

  it('skips early config columns when global_config has not been created yet', () => {
    for (const migration of [
      minPotWeightMigration,
      ingredientPriceMigration,
      homeHeaderMigration,
      diySheetHeaderMigration,
    ]) {
      expect(migration).toContain(
        "to_regclass('public.global_config') IS NOT NULL",
      );
      expect(migration).toContain('ADD COLUMN IF NOT EXISTS');
    }
  });
});
