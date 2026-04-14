import fs from 'node:fs';
import path from 'node:path';

describe('IngredientPriceChange schema', () => {
  it('stores sourceQuantity with decimal precision', () => {
    const schemaPath = path.join(
      __dirname,
      '..',
      '..',
      'prisma',
      'schema.prisma',
    );
    const schema = fs.readFileSync(schemaPath, 'utf8');
    const modelMatch = schema.match(
      /model IngredientPriceChange \{[\s\S]*?\n\}/,
    );

    expect(modelMatch?.[0]).toMatch(/sourceQuantity\s+Decimal\b/);
    expect(modelMatch?.[0]).not.toMatch(/sourceQuantity\s+Int\b/);
  });
});
