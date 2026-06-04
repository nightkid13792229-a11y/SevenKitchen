import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

describe('removed AI ingredient feature', () => {
  const backendRoot = resolve(__dirname, '../..');
  const featureSlug = ['ingredient', 'creation'].join('-');
  const featurePascal = ['Ingredient', 'Creation'].join('');
  const featureSnake = ['ingredient', 'creation'].join('_');
  const featureLabel = ['AI 新增', '食材'].join('');
  const featureTaskLabel = ['新增', '食材', '任务'].join('');

  const removedPaths = [
    join('src', 'application', featureSlug),
    join('src', 'interfaces', 'controllers', `${featureSlug}.controller.ts`),
    join('src', 'interfaces', 'dto', `${featureSlug}.dto.ts`),
    join('tests', 'application', featureSlug),
    join('tests', 'interfaces', 'controllers', `${featureSlug}.controller.spec.ts`),
    join('tests', 'prisma', `${featureSlug}-schema.spec.ts`),
  ];
  const retainedMigrationHistory = [
    join('prisma', 'migrations', `202605270003_add_${featureSnake}_agent`),
    join('prisma', 'migrations', `202605300001_drop_${featureSnake}_agent`),
  ];

  const sourceRoots = [
    join(backendRoot, 'src'),
    join(backendRoot, 'prisma', 'schema.prisma'),
  ];

  function collectFiles(path: string): string[] {
    if (!existsSync(path)) {
      return [];
    }

    if (statSync(path).isFile()) {
      return [path];
    }

    return readdirSync(path).flatMap((entry) => collectFiles(join(path, entry)));
  }

  it('does not keep feature files in the backend tree', () => {
    for (const path of removedPaths) {
      expect(existsSync(join(backendRoot, path))).toBe(false);
    }
  });

  it('keeps applied migration history for production deployments', () => {
    for (const path of retainedMigrationHistory) {
      expect(existsSync(join(backendRoot, path))).toBe(true);
    }
  });

  it('does not keep API or schema references for the removed feature', () => {
    const forbiddenTokens = [
      featureSlug,
      featurePascal,
      featureSnake,
      featureLabel,
      featureTaskLabel,
    ];

    const offenders = sourceRoots
      .flatMap(collectFiles)
      .filter((file) => !file.endsWith('.map'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8');
        return forbiddenTokens
          .filter((token) => source.includes(token))
          .map((token) => `${relative(backendRoot, file)} contains ${token}`);
      });

    expect(offenders).toEqual([]);
  });
});
