import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('FEDIAF 2025 dog standard audit CLI', () => {
  it('exposes package scripts for seeding and auditing the standard import', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
    );

    expect(packageJson.scripts['seed:fediaf-2025-dog-standard']).toContain(
      'prisma/seed-fediaf-2025-dog-standards.ts',
    );
    expect(packageJson.scripts['seed:fediaf-2025-dog-standard']).toContain(
      'DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen}',
    );
    expect(packageJson.scripts['audit:fediaf-2025-dog-standard']).toContain(
      'scripts/audit-fediaf-2025-dog-standard.ts',
    );
    expect(packageJson.scripts['audit:fediaf-2025-dog-standard']).toContain(
      'DATABASE_URL=${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/sevenkitchen}',
    );
  });

  it('keeps the audit CLI wired to the reusable audit module', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../scripts/audit-fediaf-2025-dog-standard.ts'),
      'utf8',
    );

    expect(source).toContain('auditFediaf2025DogStandardSnapshot');
    expect(source).toContain('FEDIAF_2025_DOG_STANDARD_VERSION.code');
    expect(source).toContain("error.code === 'P2021'");
    expect(source).toContain('process.exitCode = 1');
  });
});
