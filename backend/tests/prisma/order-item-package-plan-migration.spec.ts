import { readFileSync } from 'fs';
import { join } from 'path';

describe('order item package plan migration', () => {
  it('guards legacy packagePlan backfill against mismatched totals', () => {
    const migration = readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/202604160001_add_order_item_package_plan/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(
      'Only backfill package_plan when the legacy single-spec total is exact.',
    );
    expect(migration).toMatch(
      /"package_spec_g"\s*\*\s*"package_count"\s*=\s*"quantity_g"/,
    );
  });
});
