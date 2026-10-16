import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 平台选项字典 · 数据库结构守卫（2026-10-16，批次 1.3）
 *
 * 为什么要有这条：
 *   `prisma/schema.prisma` 是**共享文件**，本项目实测被并行会话**整体覆盖过一次** ——
 *   「食谱定制设置」的定义连同定制单的额度字段一起消失，而库里表和列都还在，
 *   于是 schema 与库产生漂移，直到上线才可能发现。
 *
 *   单测连不上数据库，但可以守住"**定义必须还在**"。任何一次覆盖都会在这里立刻红掉。
 *   这是本项目的既有做法，见 `custom-recipe-schema.spec.ts` 的文件头。
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

const MIGRATION_DIR =
  'prisma/migrations/20261016220000_platform_option_dictionary';

describe('平台选项字典 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('保留选项集表 PlatformOptionSet', () => {
    const block = modelBlock(schema, 'PlatformOptionSet');

    expect(block).toMatch(/code\s+String\s+@id/);
    expect(block).toMatch(/sourceType\s+String\s+@default\("DATA"\)/);
    expect(block).toMatch(/enumName\s+String\?/);
    expect(block).toMatch(/@@map\("platform_option_set"\)/);
  });

  it('保留选项项表 PlatformOptionItem 及其关键字段', () => {
    const block = modelBlock(schema, 'PlatformOptionItem');

    // 码与中文标签 —— 前端零映射的来源
    expect(block).toMatch(/code\s+String\s+@db\.VarChar\(48\)/);
    expect(block).toMatch(/label\s+String\s+@db\.VarChar\(64\)/);
    // 色彩档位（语义档位，不是颜色值）
    expect(block).toMatch(/tone\s+String\?/);
    // 排序 / 启用 / 默认项
    expect(block).toMatch(/sortOrder\s+Int/);
    expect(block).toMatch(/enabled\s+Boolean\s+@default\(true\)/);
    expect(block).toMatch(/isDefault\s+Boolean\s+@default\(false\)/);
    expect(block).toMatch(/@@unique\(\[setId, code\]\)/);
    expect(block).toMatch(/@@map\("platform_option_item"\)/);
  });

  it('保留「删掉选项集时一并删掉它的项」的外键', () => {
    const block = modelBlock(schema, 'PlatformOptionItem');
    expect(block).toMatch(
      /set\s+PlatformOptionSet\s+@relation\(fields: \[setId\], references: \[code\], onDelete: Cascade\)/,
    );
  });

  it('迁移文件存在，且 SQL 里确实建了这两张表（不是空壳）', () => {
    const sqlPath = join(
      __dirname,
      '../..',
      `${MIGRATION_DIR}/migration.sql`,
    );
    expect(existsSync(sqlPath)).toBe(true);

    const sql = readFileSync(sqlPath, 'utf8');
    expect(sql).toMatch(/CREATE TABLE "platform_option_set"/);
    expect(sql).toMatch(/CREATE TABLE "platform_option_item"/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "platform_option_item_set_id_code_key"/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "platform_option_item_set_id_enabled_sort_order_idx"/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("set_id"\) REFERENCES "platform_option_set"\("code"\) ON DELETE CASCADE/,
    );
  });

  it('迁移是**只加不改**（不改既有表的列），这样回滚只需 drop 两张表', () => {
    const sql = readProjectFile(
      `${MIGRATION_DIR}/migration.sql`,
    );

    // 不允许出现对这些既有表的 ALTER（除了本迁移自己的外键）
    expect(sql).not.toMatch(/ALTER TABLE "(?!platform_option_item")/);
    // 不允许删表删列
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it('登记表里的 code 与库表字段宽度一致（超长会被静默截断）', () => {
    const registry = readProjectFile(
      'src/application/platform-options/option-sets.registry.ts',
    );

    /**
     * set.code 是 VARCHAR(48)、item.code 是 VARCHAR(48)、item.label 是 VARCHAR(64)。
     * 登记表里写超了会在写库时报错（还好），但**中文按字符算、英文按字节算**的差异
     * 容易让人误判，所以这里守住几个最长的实际取值。
     */
    const codes = [...registry.matchAll(/code:\s*'([^']+)'/g)].map(
      (match) => match[1],
    );
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(code.length).toBeLessThanOrEqual(48);
    }
  });
});
