import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APPLIED_MIGRATION_CHECKSUMS = [
  [
    '20260109000000_phase9_order_status_optimization',
    '430934e0fa832426e2efd04e56cef894f7704c163064e9552d44407a7c6b00ad',
  ],
  [
    '20260125192532_add_reimbursement_cost_details',
    '14245bd2879e200f25bffd7e0e0c85b4b189a899e9017818ed4d82a96a9f116a',
  ],
  [
    '20260125205511_update_reimbursement_status_and_add_payment_proof',
    '422c9af0829deac49b7efc38d001296f126afe6795e050e0ebabf84435b4c936',
  ],
  [
    '20260125225305_remove_allergy_record_fields',
    'f085c3a040dbefb85fbcd53d247f56d424ce6435e7ee1457bb24e4116ad04a80',
  ],
  [
    '20260127183915_add_min_pot_weight_config',
    'b5e26ee1f7d142ad19100bb1a400db1293781243dfee81de93b65bff00fee5bf',
  ],
  [
    '20260201231000_add_missing_purchase_and_custom_recipe_tables',
    '5b541480a3b807a89d628e5f85b2cd2815557cf39e128c50c86d7382b534c672',
  ],
  [
    '2026020123300000_add_only_missing_tables',
    '342a7b7722326c3726905ec0870837767578da091b79141faa75ffd1293494e7',
  ],
  [
    '20260203210000_add_reimbursement_table',
    '2834d15d6e49e923f5508743018086f9ddd750cba76f7d8cb06398a6316bbb58',
  ],
  [
    '20260331120000_add_ingredient_price_change',
    'ef1af38d0180c5e4ab0a9521a1cc608e1789592e4d555df246641be689cf0f38',
  ],
  [
    '20260331180000_add_home_header_bg_image_url',
    'bb506ceb981b0fb265c9a90ea410b824c09b48dd0dff26a872a2beb22c3b7819',
  ],
  [
    '20260403133000_add_purchase_procurement_sku_snapshots',
    '597494363221b3dbefb8ee562dd56b11baa9d8e3f648e61d660daa7bc9a00442',
  ],
  [
    '20260425120000_add_diy_sheet_header_bg_config',
    'aff1df589798f939704902c9d09153380c531200253b18eef50cd002b3aa12e2',
  ],
] as const;

function migrationChecksum(migrationName: string): string {
  const migration = readFileSync(
    resolve(
      __dirname,
      `../../prisma/migrations/${migrationName}/migration.sql`,
    ),
  );

  return createHash('sha256').update(migration).digest('hex');
}

describe('production applied migration history', () => {
  it.each(APPLIED_MIGRATION_CHECKSUMS)(
    'keeps %s aligned with the production-applied checksum',
    (migrationName, checksum) => {
      expect(migrationChecksum(migrationName)).toBe(checksum);
    },
  );
});
