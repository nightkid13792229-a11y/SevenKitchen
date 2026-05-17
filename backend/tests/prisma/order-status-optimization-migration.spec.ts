import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('order status optimization migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20260109000000_phase9_order_status_optimization/migration.sql',
    ),
    'utf8',
  );

  it('avoids using a newly added enum value in the same PostgreSQL transaction', () => {
    expect(migration).not.toContain(
      'ALTER TYPE "OrderStatus" ADD VALUE \'PURCHASING\'',
    );
    expect(migration).toContain('ALTER TYPE "OrderStatus" RENAME TO');
    expect(migration).toContain('CREATE TYPE "OrderStatus" AS ENUM');
    expect(migration).toContain("THEN 'PURCHASING'");
  });

  it('uses the actual snake_case order status history columns', () => {
    expect(migration).toContain('"from_status"');
    expect(migration).toContain('"to_status"');
    expect(migration).not.toContain('"fromStatus"');
    expect(migration).not.toContain('"toStatus"');
  });
});
