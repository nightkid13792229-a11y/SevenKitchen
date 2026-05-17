import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('early reimbursement migrations', () => {
  const costDetailsMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260125192532_add_reimbursement_cost_details/migration.sql',
    ),
    'utf8',
  );
  const paymentProofMigration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260125205511_update_reimbursement_status_and_add_payment_proof/migration.sql',
    ),
    'utf8',
  );

  it('skips cost detail additions when reimbursement has not been created yet', () => {
    expect(costDetailsMigration).toContain(
      "to_regclass('public.reimbursement') IS NOT NULL",
    );
    expect(costDetailsMigration).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('skips payment proof updates when reimbursement status objects do not exist yet', () => {
    expect(paymentProofMigration).toContain(
      "to_regclass('public.reimbursement') IS NOT NULL",
    );
    expect(paymentProofMigration).toContain("typname = 'ReimbursementStatus'");
    expect(paymentProofMigration).toContain('RENAME VALUE');
  });
});
