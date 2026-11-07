import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 食材成本口径归位迁移（2026-11-07）。
 *
 * 这里只做**静态检查**：迁移文件必须同时包含「备份 / 折算 / 建表」三件事。
 * 真正跑在库上的效果由 `scripts/audit-food-cost-basis.ts` 对账（Task 14）。
 *
 * 为什么不连库跑：迁移在 CI 里不一定有库；而这三条语句少任何一条，
 * 都会造成「备份没了无法回滚」或「表建了但价没折」这类不可逆事故。
 */
const MIGRATION_PATH = join(
  process.cwd(),
  'prisma/migrations/20261107180000_food_cost_basis/migration.sql',
);

describe('食材成本口径归位迁移', () => {
  it('同时包含备份表、食材折算与流水表三件事', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');

    // ① 备份：折算不可逆，先把旧值整表存一份
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "ingredient_food_cost_backup_20261107"',
    );

    // ② 折算：旧成本 ÷ 旧换算 → 新成本，换算归 1。
    //    除法必须转 numeric 再取整：`numeric / double precision` 在 PG 里是
    //    double，`round(double, int)` 不存在（第一次应用迁移就是这么挂的）。
    expect(sql).toMatch(
      /ROUND\(\s*\("current_price_per_purchase_unit"\s*\/\s*"purchase_to_base_ratio"\)::numeric\s*,\s*6\s*\)/,
    );
    expect(sql).toContain('"purchase_to_base_ratio" = 1');

    // ③ 建表：成本流水
    expect(sql).toContain('CREATE TABLE "ingredient_price_history"');
    expect(sql).toContain("'MIGRATION'");
  });

  it('折算只动食材，不动补剂与包材', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');

    expect(sql).toMatch(/WHERE\s+"type"\s*=\s*'FOOD'/);
    expect(sql).toContain('IS DISTINCT FROM 1');
  });
});
