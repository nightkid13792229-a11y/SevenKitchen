import { readFileSync } from 'fs';
import { join } from 'path';

describe('IngredientPriceChange Prisma schema', () => {
  it('stores sourceQuantity with decimal precision', () => {
    const schema = readFileSync(
      join(__dirname, '../../prisma/schema.prisma'),
      'utf8',
    );

    expect(schema).toMatch(
      /sourceQuantity\s+Decimal\s+@map\("source_quantity"\)\s+@db\.Decimal\(18,\s*6\)/,
    );
  });
});
