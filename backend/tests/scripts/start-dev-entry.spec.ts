import { readFileSync } from 'fs';
import { join } from 'path';

describe('backend dev server entrypoint', () => {
  it('starts the Nest watcher from the compiled src/main entrypoint', () => {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['start:dev']).toContain(
      'nest start --entryFile src/main --watch',
    );
  });

  it('loads env config before validating Prisma settings', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../../src/app.module.ts'),
      'utf8',
    );

    expect(appModuleSource.indexOf('loadEnvConfig();')).toBeGreaterThan(-1);
    expect(appModuleSource.indexOf('loadEnvConfig();')).toBeLessThan(
      appModuleSource.indexOf('validatePrismaConfig();'),
    );
  });
});
