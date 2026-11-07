import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 「采购商品必须有换算」下沉成数据库约束（2026-11-07 硬门禁）。
 *
 * 代码里再多判断也会被绕过（脚本、导入、直连库）。真正的门在表上：
 *   · purchase_to_base_ratio 不允许为空
 *   · 必须大于 0
 *
 * 生产库实测 303 条采购商品、0 条不满足，所以这个约束可以安全加上。
 */
const MIGRATION_PATH = join(
  process.cwd(),
  'prisma/migrations/20261107220000_sku_ratio_required/migration.sql',
);

describe('采购商品换算约束', () => {
  it('迁移把换算列为 NOT NULL 并加正数约束', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');

    expect(sql).toContain(
      'ALTER COLUMN "purchase_to_base_ratio" SET NOT NULL',
    );
    expect(sql).toMatch(
      /CHECK\s*\(\s*"purchase_to_base_ratio"\s*>\s*0\s*\)/,
    );
  });

  it('加约束前先体检，不满足就中止（别让迁移半路炸在 ALTER 上）', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');

    expect(sql).toMatch(/DO \$\$/);
    expect(sql).toContain('RAISE EXCEPTION');
  });
});
