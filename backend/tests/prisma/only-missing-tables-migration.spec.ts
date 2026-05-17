import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('only missing tables migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/2026020123300000_add_only_missing_tables/migration.sql',
    ),
    'utf8',
  );

  it('does not duplicate table creation already handled by the previous migration', () => {
    expect(migration).not.toContain('CREATE TABLE "purchase_list"');
    expect(migration).not.toContain('CREATE TABLE "purchase_item"');
    expect(migration).not.toContain('CREATE TABLE "purchase_record"');
    expect(migration).not.toContain('CREATE TABLE "custom_recipe_order"');
  });
});
