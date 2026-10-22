import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 设计草稿产品展示 · 数据库结构守卫（2026-10-22）
 *
 * `schema.prisma` 是并行会话共享文件，本项目实测被整体覆盖过。
 * 这里守住：
 *  · DesignRecipe 上 6 个展示字段的 Prisma 名称 / 数据库列名 / 长度；
 *  · 迁移只做新增（不删列、不改类型），保证生产已有数据安全；
 *  · `detail_images` 是 JSONB，`cover_title` / `selling_point` 有长度限制。
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
  'prisma/migrations/20261022160000_design_recipe_presentation/migration.sql';

describe('设计草稿产品展示 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');
  const designRecipe = modelBlock(schema, 'DesignRecipe');

  it('DesignRecipe 保存封面 / 描述 / 卖点 / 详情图 / 视频字段', () => {
    const expected: Array<[string, RegExp]> = [
      ['封面图', /coverImageUrl\s+String\?\s+@map\("cover_image_url"\)/],
      [
        '封面标题（20 字符）',
        /coverTitle\s+String\?\s+@map\("cover_title"\)\s+@db\.VarChar\(20\)/,
      ],
      ['详情描述', /description\s+String\?\s+@map\("description"\)/],
      [
        '一句话卖点（200 字符）',
        /sellingPoint\s+String\?\s+@map\("selling_point"\)\s+@db\.VarChar\(200\)/,
      ],
      ['详情图 JSON', /detailImages\s+Json\?\s+@map\("detail_images"\)/],
      ['视频 URL', /videoUrl\s+String\?\s+@map\("video_url"\)/],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(designRecipe))
      .map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('迁移文件存在且只新增可空展示列', () => {
    expect(existsSync(join(__dirname, '../..', MIGRATION_FILE))).toBe(true);
    const sql = readProjectFile(MIGRATION_FILE);

    for (const column of [
      'cover_image_url',
      'cover_title',
      'description',
      'selling_point',
      'detail_images',
      'video_url',
    ]) {
      expect(sql).toContain(`"${column}"`);
    }

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "detail_images" JSONB');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "cover_title" VARCHAR(20)');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "selling_point" VARCHAR(200)',
    );
    expect(sql).not.toMatch(/\bDROP\s+(COLUMN|TABLE)\b/i);
    expect(sql).not.toMatch(/\bALTER\s+COLUMN\b/i);
  });
});
