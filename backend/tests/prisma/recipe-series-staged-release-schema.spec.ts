import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 产品线分阶段发布 · 数据库结构守卫（2026-10-22）
 *
 * 守住：
 *  · RecipeSeries 上 5 个发布设置字段的 Prisma 名称 / 数据库列名 / 长度；
 *  · required_life_stages / target_health_tags 是 TEXT[] NOT NULL DEFAULT '{}'；
 *  · 迁移只做新增（不删列、不改类型），保证生产已有系列数据安全。
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

const MIGRATION_FILE =
  'prisma/migrations/20261022170000_series_staged_release/migration.sql';

describe('产品线分阶段发布 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');
  const recipeSeries = modelBlock(schema, 'RecipeSeries');

  it('RecipeSeries 保存必填阶段与系列级产品展示字段', () => {
    const expected: Array<[string, RegExp]> = [
      [
        '必填生命阶段数组',
        /requiredLifeStages\s+String\[\]\s+@default\(\[\]\)\s+@map\("required_life_stages"\)/,
      ],
      ['封面图', /coverImageUrl\s+String\?\s+@map\("cover_image_url"\)/],
      [
        '封面标题（20 字符）',
        /coverTitle\s+String\?\s+@map\("cover_title"\)\s+@db\.VarChar\(20\)/,
      ],
      [
        '一句话卖点（200 字符）',
        /sellingPoint\s+String\?\s+@map\("selling_point"\)\s+@db\.VarChar\(200\)/,
      ],
      [
        '目标健康标签数组',
        /targetHealthTags\s+String\[\]\s+@default\(\[\]\)\s+@map\("target_health_tags"\)/,
      ],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(recipeSeries))
      .map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('迁移文件存在且只新增发布设置列', () => {
    expect(existsSync(join(__dirname, '../..', MIGRATION_FILE))).toBe(true);
    const sql = readProjectFile(MIGRATION_FILE);

    for (const column of [
      'required_life_stages',
      'cover_image_url',
      'cover_title',
      'selling_point',
      'target_health_tags',
    ]) {
      expect(sql).toContain(`"${column}"`);
    }

    expect(sql).toContain(
      '"required_life_stages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
    expect(sql).toContain(
      '"target_health_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]',
    );
    expect(sql).toContain('"cover_title" VARCHAR(20)');
    expect(sql).toContain('"selling_point" VARCHAR(200)');
    expect(sql).not.toMatch(/\bDROP\s+(COLUMN|TABLE)\b/i);
    expect(sql).not.toMatch(/\bALTER\s+COLUMN\b/i);
  });
});
