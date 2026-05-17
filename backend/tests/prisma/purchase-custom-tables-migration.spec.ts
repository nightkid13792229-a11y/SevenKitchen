import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('purchase and custom recipe tables migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260201231000_add_missing_purchase_and_custom_recipe_tables/migration.sql',
    ),
    'utf8',
  );

  it('does not add the purchase list reimbursement foreign key twice', () => {
    const matches = migration.match(/purchase_list_reimbursement_id_fkey/g) ?? [];

    expect(matches).toHaveLength(1);
  });
});
