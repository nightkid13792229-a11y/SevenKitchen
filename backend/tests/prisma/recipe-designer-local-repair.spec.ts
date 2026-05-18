import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('recipe designer local schema repair', () => {
  it('can repair a local database that has the old design recipe table shape', () => {
    const repairSql = readFileSync(
      resolve(
        process.cwd(),
        'prisma/local-repairs/recipe-designer-schema.sql',
      ),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );

    expect(packageJson.scripts['repair:local-recipe-designer-schema']).toContain(
      'prisma/local-repairs/recipe-designer-schema.sql',
    );
    expect(repairSql).toContain(
      'ADD COLUMN IF NOT EXISTS "fediaf_dog_scenario"',
    );
    expect(repairSql).toContain('ADD COLUMN IF NOT EXISTS "weight_g"');
    expect(repairSql).toContain('DROP COLUMN IF EXISTS "weight_per_kg_g"');
    expect(repairSql).toContain(
      'CREATE TABLE IF NOT EXISTS "design_recipe_publish_snapshot"',
    );
  });
});
