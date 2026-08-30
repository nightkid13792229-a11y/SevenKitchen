import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schema = readFileSync(
  resolve(process.cwd(), 'prisma/schema.prisma'),
  'utf-8',
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    'prisma/migrations/20260727000000_recipe_series_list_pagination_index/migration.sql',
  ),
  'utf-8',
);

describe('recipe series list pagination index', () => {
  it('indexes the visibility and status fields in the list ordering direction', () => {
    expect(schema).toContain('@@index([createdBy, status, businessStatus, updatedAt])');
    expect(migration).toContain(
      'recipe_series_created_by_status_business_status_updated_at_idx',
    );
    expect(migration).toContain(
      '"created_by", "status", "business_status", "updated_at" DESC',
    );
  });
});
