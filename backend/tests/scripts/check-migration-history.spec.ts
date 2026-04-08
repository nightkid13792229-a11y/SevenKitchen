import { execFileSync } from 'child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

describe('check_migration_history.sh', () => {
  const repoRoot = resolve(__dirname, '..', '..');
  const sourceScript = join(repoRoot, 'scripts', 'check_migration_history.sh');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('strips Prisma schema query parameters before invoking psql', () => {
    const backendDir = mkdtempSync(join(tmpdir(), 'migration-history-check-'));
    const scriptsDir = join(backendDir, 'scripts');
    const migrationsDir = join(
      backendDir,
      'prisma',
      'migrations',
      '20260403190000_add_dog_profile_event',
    );
    const binDir = join(backendDir, 'test-bin');
    const capturedUrlFile = join(backendDir, 'captured-psql-url.txt');
    const scriptPath = join(scriptsDir, 'check_migration_history.sh');

    mkdirSync(scriptsDir, { recursive: true });
    mkdirSync(migrationsDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    copyFileSync(sourceScript, scriptPath);
    chmodSync(scriptPath, 0o755);

    writeFileSync(join(backendDir, '.env'), 'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sevenkitchen?schema=public"\n');
    writeFileSync(join(migrationsDir, 'migration.sql'), '-- test migration\n');

    writeFileSync(
      join(binDir, 'psql'),
      `#!/bin/sh
url="$1"
printf '%s' "$url" > "${capturedUrlFile}"
case "$url" in
  *schema=*)
    echo 'psql: error: invalid URI query parameter: "schema"' >&2
    exit 1
    ;;
esac
printf '%s\\n' '20260403190000_add_dog_profile_event|placeholder_checksum|1'
`,
    );
    chmodSync(join(binDir, 'psql'), 0o755);

    const output = execFileSync('bash', [scriptPath], {
      cwd: backendDir,
      env: {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
      },
      encoding: 'utf8',
    });

    expect(output).toContain('[Migration Check] ✓ Applied migration history matches local files');
    expect(output).not.toContain('Pending local migrations');
    expect(require('fs').readFileSync(capturedUrlFile, 'utf8')).toBe(
      'postgresql://postgres:postgres@localhost:5432/sevenkitchen',
    );

    rmSync(backendDir, { recursive: true, force: true });
  });
});
