import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('reimbursement table migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260203210000_add_reimbursement_table/migration.sql',
    ),
    'utf8',
  );

  it('does not add primary or unique constraints that may already exist unguarded', () => {
    expect(migration).not.toContain('ADD CONSTRAINT "reimbursement_pkey"');
    expect(migration).not.toContain(
      'ADD CONSTRAINT "reimbursement_claim_number_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "reimbursement_claim_number_key"',
    );
  });

  it('guards reimbursement and purchase list foreign keys', () => {
    expect(migration).toContain("conname = 'reimbursement_submitted_by_id_fkey'");
    expect(migration).toContain("conname = 'reimbursement_reviewed_by_id_fkey'");
    expect(migration).toContain(
      "conname = 'purchase_list_reimbursement_id_fkey'",
    );
  });
});
