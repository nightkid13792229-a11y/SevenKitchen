import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve, relative, join, dirname, sep } from 'node:path';

/**
 * 分包之间不能互相 require。
 *
 * 2026-11-11 踩过：补货页（staff-purchasing 分包）import 了库存页的 api
 * （staff-inventory 分包），编译不报错，但真机/模拟器里报
 * `module 'pages/staff-inventory/api/inventory.js' is not defined`，整页白屏。
 *
 * 这里把规则固化：只要一条相对导入从 A 分包指向 B 分包，就算违规。
 */

const SRC = resolve(__dirname, '..');
const PAGES_JSON = resolve(SRC, 'pages.json');

type Package = string;

const subpackageRoots = (): string[] => {
  const json = JSON.parse(readFileSync(PAGES_JSON, 'utf8'));
  return (json.subPackages || json.subpackages || [])
    .map((item: any) => String(item.root || '').replace(/^\/+/, ''))
    .filter(Boolean);
};

const packageOf = (filePath: string, roots: string[]): Package => {
  const rel = relative(SRC, filePath).split(sep).join('/');
  for (const root of roots) {
    if (rel === root || rel.startsWith(`${root}/`)) return root;
  }
  return 'main';
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (/\.(vue|ts)$/.test(name) && !/\.spec\.ts$/.test(name)) {
      out.push(full);
    }
  }
  return out;
};

const importSpecs = (source: string): string[] => {
  const specs: string[] = [];
  const patterns = [
    /from\s+['"](\.[^'"]+)['"]/g,
    /import\s*\(\s*['"](\.[^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      specs.push(match[1]);
    }
  }
  return specs;
};

/**
 * 历史遗留：这条跨分包导入在 2026-11-11 之前就存在，暂不归本次改动处理。
 * 若它也在真机上白屏，需要单独评估迁移到主包公共模块。
 */
const KNOWN_ALLOWED = [
  'pages/recipe-nutrition-report/index.vue → ../recipe-designer/assessment',
];

describe('分包隔离', () => {
  it('不允许从 A 分包相对导入 B 分包的文件', () => {
    const roots = subpackageRoots();
    expect(roots.length).toBeGreaterThan(0);

    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const from = packageOf(file, roots);
      if (from === 'main') continue;

      const source = readFileSync(file, 'utf8');
      for (const spec of importSpecs(source)) {
        const target = resolve(dirname(file), spec);
        const candidate = [target, `${target}.ts`, `${target}.js`, `${target}.vue`]
          .find((path) => existsSync(path) && statSync(path).isFile());
        if (!candidate) continue;

        const to = packageOf(candidate, roots);
        if (to === 'main' || to === from) continue;

        offenders.push(
          `${relative(SRC, file)} → ${spec}（${from} → ${to}）`,
        );
      }
    }

    const unexpected = offenders.filter(
      (item) => !KNOWN_ALLOWED.some((allowed) => item.startsWith(allowed)),
    );
    expect(unexpected).toEqual([]);
  });
});
