import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 内部生产损耗系数迁移守卫（2026-10-21）
 *
 * 背景：这个值原先挂在 `CustomRecipeConfig.productionLossRate`，
 * 现在迁到 `GlobalConfig.productionLossRate`，但必须满足两条硬约束：
 *
 *   1. **只加列**：不能动 `recipe.production_loss_rate`、不能删
 *      `custom_recipe_config.production_loss_rate`（旧数据/回滚还要用）；
 *   2. 新建食谱读全局配置，已有食谱与交付快照保持原值。
 *
 * 单测跑不到真库，但可以守住 schema 与 migration 的形状。
 */
const readProjectFile = (...segments: string[]) =>
  readFileSync(join(__dirname, '../..', ...segments), 'utf8');

const modelBlock = (schema: string, modelName: string) => {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

describe('内部生产损耗系数 · 全局配置迁移', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('GlobalConfig 新增 productionLossRate，默认 1.07 且映射 production_loss_rate', () => {
    const block = modelBlock(schema, 'GlobalConfig');

    expect(block).toMatch(
      /productionLossRate\s+Decimal\s+@default\(1\.07\)\s+@map\("production_loss_rate"\)/,
    );
  });

  it('CustomRecipeConfig 的旧列保留（不 drop），并明确标记 deprecated', () => {
    const block = modelBlock(schema, 'CustomRecipeConfig');

    // 兼容旧数据 / 旧部署 / 回滚：列必须还在
    expect(block).toMatch(
      /productionLossRate\s+Decimal\s+@default\(1\.07\)\s+@map\("production_loss_rate"\)/,
    );
    expect(block).toContain('@deprecated');
  });

  it('Recipe.productionLossRate 保持原样（已有食谱与快照的口径不变）', () => {
    const block = modelBlock(schema, 'Recipe');

    // 仍是 NOT NULL、无默认值：已有食谱的值不会被“默认值”悄悄改写
    expect(block).toMatch(
      /productionLossRate\s+Float\s+@map\("production_loss_rate"\)/,
    );
    expect(block).not.toMatch(/productionLossRate\s+Float\s+@default/);
  });

  it('migration 只给 global_config 加一列，可回滚，不碰 recipe / custom_recipe_config', () => {
    const path = join(
      __dirname,
      '../..',
      'prisma/migrations/20261021173000_global_config_production_loss_rate/migration.sql',
    );
    expect(existsSync(path)).toBe(true);

    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/ALTER TABLE "global_config"/);
    expect(sql).toMatch(
      /ADD COLUMN "production_loss_rate" DECIMAL\(65,30\) NOT NULL DEFAULT 1\.07/,
    );
    // 只加列：不许删表/删列/改既有列
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    // 老表一个字都不动
    expect(sql).not.toMatch(/ALTER TABLE "recipe"/i);
    expect(sql).not.toMatch(/ALTER TABLE "custom_recipe_config"/i);
  });
});
