import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

describe('user table foundation migration', () => {
  const migrationPath = resolve(
    __dirname,
    '../../prisma/migrations/20260130050000_create_user_table_if_missing/migration.sql',
  );

  it('creates the user table and enum dependencies before user foreign keys', () => {
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain("typname = 'UserRole'");
    expect(migration).toContain("typname = 'UserStatus'");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "user"');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "user_phone_key"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "user_wechat_openid_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "user_wechat_unionid_key"',
    );
  });
});
