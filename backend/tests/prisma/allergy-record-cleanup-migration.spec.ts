import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('allergy record cleanup migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260125225305_remove_allergy_record_fields/migration.sql',
    ),
    'utf8',
  );

  it('skips column cleanup when allergy_record has not been created yet', () => {
    expect(migration).toContain(
      "to_regclass('public.allergy_record') IS NOT NULL",
    );
    expect(migration).toContain('DROP COLUMN IF EXISTS');
  });
});
