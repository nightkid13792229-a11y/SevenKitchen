import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('purchase procurement sku snapshots migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260403133000_add_purchase_procurement_sku_snapshots/migration.sql',
    ),
    'utf8',
  );

  it('adds snapshot columns idempotently because suggested product columns may already exist', () => {
    const matches = migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? [];

    expect(matches.length).toBeGreaterThanOrEqual(6);
    expect(migration).not.toContain('ADD COLUMN "suggested_product_id"');
  });
});
