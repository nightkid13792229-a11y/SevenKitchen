import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 订单绑定食谱设计 · 数据库结构守卫（2026-10-22 · Task 1）
 *
 * 为什么要有这组测试：
 *   · `schema.prisma` 是并行会话共享的文件，本项目实测被**整体覆盖过**；
 *   · 订单槽位是「本单 N 份」计数的唯一来源：唯一键一旦丢一个，
 *     同一份就会被算两次，可能提前交付或卡死订单；
 *   · 订单绑定系列必须能从产品线列表中过滤出去（designMode / orderId），
 *     字段或索引丢了，Foxy 的 N 个中间系列会铺满产品线列表；
 *   · 迁移必须只做新增 —— 生产库已有 203 条迁移，任何删列/改类型都可能丢数据。
 *
 * 单测连不上数据库，所以守住三件事：schema 定义还在、关系两侧成对、
 * migration 只做新增且结构与模型一致。
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

const enumBlock = (schema: string, enumName: string) => {
  const match = schema.match(
    new RegExp(`enum ${enumName} \\{[\\s\\S]*?\\n\\}`),
  );

  expect(match).not.toBeNull();

  return match?.[0] ?? '';
};

const enumValues = (schema: string, enumName: string) =>
  enumBlock(schema, enumName)
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith('//') &&
        !line.startsWith('///') &&
        !line.startsWith('enum') &&
        !line.startsWith('}'),
    );

const MIGRATION_FILE =
  'prisma/migrations/20261022020000_order_bound_recipe/migration.sql';

describe('订单绑定食谱设计 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('设计模式枚举只有 CATALOG / ORDER，默认值才能是 CATALOG', () => {
    expect(enumValues(schema, 'RecipeDesignMode')).toEqual([
      'CATALOG',
      'ORDER',
    ]);
  });

  it('槽位状态枚举覆盖编辑中 / 就绪 / 已交付 / 已移除', () => {
    expect(enumValues(schema, 'OrderRecipeDesignStatus')).toEqual([
      'EDITING',
      'READY',
      'DELIVERED',
      'REMOVED',
    ]);
  });

  it('设计系列记录设计模式与订单上下文，老系列默认 CATALOG', () => {
    const series = modelBlock(schema, 'RecipeSeries');

    /**
     * 这三列缺一不可：
     *   · 没有 `designMode` → 产品线列表无法过滤订单中间系列；
     *   · 没有 `orderId` → 刷新后订单上下文丢失，只能靠 URL 猜；
     *   · 没有 `orderQuantity` → 工作台算不出 N 份进度。
     */
    const expected: Array<[string, RegExp]> = [
      [
        '设计模式',
        /designMode\s+RecipeDesignMode\s+@default\(CATALOG\)\s+@map\("design_mode"\)/,
      ],
      ['订单 ID', /orderId\s+String\?\s+@map\("order_id"\)/],
      ['本单份数', /orderQuantity\s+Int\?\s+@map\("order_quantity"\)/],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(series))
      .map(([label]) => label);

    expect(missing).toEqual([]);

    // 产品线列表与订单工作台都按这两列查
    expect(series).toMatch(/@@index\(\[designMode\]\)/);
    expect(series).toMatch(/@@index\(\[orderId\]\)/);

    // 一份订单设计 = 一个独立系列；反向关系必须是可空一对一
    expect(series).toMatch(
      /orderDesign\s+OrderRecipeDesign\?\s+@relation\("OrderRecipeDesignSeries"\)/,
    );
  });

  it('订单槽位保留全部字段、映射与默认值', () => {
    const design = modelBlock(schema, 'OrderRecipeDesign');

    const expected: Array<[string, RegExp]> = [
      ['主键', /id\s+String\s+@id\s+@default\(uuid\(\)\)\s+@map\("id"\)/],
      ['订单', /orderId\s+String\s+@map\("order_id"\)/],
      ['爱犬', /dogId\s+String\s+@map\("dog_id"\)/],
      [
        '设计系列（一份一个系列）',
        /seriesId\s+String\s+@unique\s+@map\("series_id"\)/,
      ],
      [
        '设计草稿（一份一个草稿）',
        /designDraftId\s+String\s+@unique\s+@map\("design_draft_id"\)/,
      ],
      [
        '就绪后的私密食谱（可空，且一个食谱只能占一个槽位）',
        /recipeId\s+String\?\s+@unique\s+@map\("recipe_id"\)/,
      ],
      [
        '模板来源食谱',
        /sourceRecipeId\s+String\?\s+@map\("source_recipe_id"\)/,
      ],
      [
        '模板来源版本',
        /sourceRecipeVersion\s+Int\?\s+@map\("source_recipe_version"\)/,
      ],
      [
        '模板来源类型',
        /sourceKind\s+String\?\s+@map\("source_kind"\)\s+@db\.VarChar\(20\)/,
      ],
      [
        '槽位状态',
        /status\s+OrderRecipeDesignStatus\s+@default\(EDITING\)\s+@map\("status"\)/,
      ],
      [
        '阶段不匹配提示（只提示，不阻止）',
        /stageWarning\s+String\?\s+@map\("stage_warning"\)\s+@db\.Text/,
      ],
      ['操作人留痕', /createdBy\s+String\?\s+@map\("created_by"\)/],
      [
        '创建时间',
        /createdAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("created_at"\)/,
      ],
      ['更新时间', /updatedAt\s+DateTime\s+@updatedAt\s+@map\("updated_at"\)/],
      ['表名', /@@map\("order_recipe_design"\)/],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(design))
      .map(([label]) => label);

    expect(missing).toEqual([]);

    // 工作台 / 最终提交按订单、狗、状态查询
    expect(design).toMatch(/@@index\(\[orderId\]\)/);
    expect(design).toMatch(/@@index\(\[dogId\]\)/);
    expect(design).toMatch(/@@index\(\[status\]\)/);

    // 同一订单同一系列只能有一条槽位（seriesId 已唯一，这里是第二道保险）
    expect(design).toMatch(/@@unique\(\[orderId, seriesId\]\)/);
  });

  it('槽位关系两侧成对：订单 / 狗 / 系列 / 草稿 / 食谱', () => {
    const design = modelBlock(schema, 'OrderRecipeDesign');

    const relations: Array<[string, RegExp]> = [
      [
        '订单',
        /order\s+CustomRecipeOrder\s+@relation\("OrderRecipeDesignOrder", fields: \[orderId\], references: \[id\], onDelete: Cascade\)/,
      ],
      [
        '爱犬',
        /dog\s+Dog\s+@relation\("OrderRecipeDesignDog", fields: \[dogId\], references: \[id\], onDelete: Cascade\)/,
      ],
      [
        '系列',
        /series\s+RecipeSeries\s+@relation\("OrderRecipeDesignSeries", fields: \[seriesId\], references: \[id\], onDelete: Cascade\)/,
      ],
      [
        '草稿',
        /designDraft\s+DesignRecipe\s+@relation\("OrderRecipeDesignDraft", fields: \[designDraftId\], references: \[id\], onDelete: Cascade\)/,
      ],
      [
        '食谱',
        /recipe\s+Recipe\?\s+@relation\("OrderRecipeDesignRecipe", fields: \[recipeId\], references: \[id\]\)/,
      ],
    ];

    const missing = relations
      .filter(([, pattern]) => !pattern.test(design))
      .map(([label]) => label);

    expect(missing).toEqual([]);

    // 反向关系：一一对应，缺一个 Prisma 就拒绝启动
    expect(modelBlock(schema, 'CustomRecipeOrder')).toMatch(
      /orderDesigns\s+OrderRecipeDesign\[\]\s+@relation\("OrderRecipeDesignOrder"\)/,
    );
    expect(modelBlock(schema, 'Dog')).toMatch(
      /orderRecipeDesigns\s+OrderRecipeDesign\[\]\s+@relation\("OrderRecipeDesignDog"\)/,
    );
    expect(modelBlock(schema, 'DesignRecipe')).toMatch(
      /orderDesign\s+OrderRecipeDesign\?\s+@relation\("OrderRecipeDesignDraft"\)/,
    );
    expect(modelBlock(schema, 'Recipe')).toMatch(
      /orderRecipeDesigns\s+OrderRecipeDesign\[\]\s+@relation\("OrderRecipeDesignRecipe"\)/,
    );
  });

  it('迁移文件存在，建枚举 / 加列 / 建表 / 索引 / 外键', () => {
    expect(existsSync(join(__dirname, '../..', MIGRATION_FILE))).toBe(true);

    const sql = readProjectFile(MIGRATION_FILE);

    // 枚举
    expect(sql).toMatch(
      /CREATE TYPE "RecipeDesignMode" AS ENUM \('CATALOG', 'ORDER'\)/,
    );
    expect(sql).toMatch(
      /CREATE TYPE "OrderRecipeDesignStatus" AS ENUM \('EDITING', 'READY', 'DELIVERED', 'REMOVED'\)/,
    );

    // 设计系列：additive 加列，老系列全部落 CATALOG
    expect(sql).toMatch(
      /ADD COLUMN\s+"design_mode" "RecipeDesignMode" NOT NULL DEFAULT 'CATALOG'/,
    );
    expect(sql).toMatch(/ADD COLUMN\s+"order_id" TEXT/);
    expect(sql).toMatch(/ADD COLUMN\s+"order_quantity" INTEGER/);

    // 槽位表
    expect(sql).toMatch(/CREATE TABLE "order_recipe_design"/);
    expect(sql).toMatch(
      /"status" "OrderRecipeDesignStatus" NOT NULL DEFAULT 'EDITING'/,
    );
    expect(sql).toMatch(/"stage_warning" TEXT/);
    expect(sql).toMatch(/"source_kind" VARCHAR\(20\)/);
    expect(sql).toMatch(/"updated_at" TIMESTAMP\(3\) NOT NULL/);

    // 唯一键：一份一个系列 / 草稿 / 食谱；同订单同系列只有一条
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "order_recipe_design_series_id_key" ON "order_recipe_design"\("series_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "order_recipe_design_design_draft_id_key" ON "order_recipe_design"\("design_draft_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "order_recipe_design_recipe_id_key" ON "order_recipe_design"\("recipe_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "order_recipe_design_order_id_series_id_key" ON "order_recipe_design"\("order_id", "series_id"\)/,
    );

    // 查询索引
    expect(sql).toMatch(
      /CREATE INDEX "order_recipe_design_order_id_idx" ON "order_recipe_design"\("order_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "order_recipe_design_dog_id_idx" ON "order_recipe_design"\("dog_id"\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "order_recipe_design_status_idx" ON "order_recipe_design"\("status"\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "recipe_series_design_mode_idx" ON "recipe_series"\("design_mode"\)/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "recipe_series_order_id_idx" ON "recipe_series"\("order_id"\)/,
    );

    // 外键
    const expectedForeignKeys = [
      /FOREIGN KEY \("order_id"\) REFERENCES "custom_recipe_order"\("id"\)/,
      /FOREIGN KEY \("dog_id"\) REFERENCES "dog"\("id"\)/,
      /FOREIGN KEY \("series_id"\) REFERENCES "recipe_series"\("id"\)/,
      /FOREIGN KEY \("design_draft_id"\) REFERENCES "design_recipe"\("id"\)/,
      /FOREIGN KEY \("recipe_id"\) REFERENCES "recipe"\("id"\)/,
    ];

    expect(expectedForeignKeys.filter((pattern) => !pattern.test(sql))).toEqual(
      [],
    );
  });

  it('迁移是 additive：不许删表 / 删列 / 改既有列类型 / 重建既有表', () => {
    const sql = readProjectFile(MIGRATION_FILE);

    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    expect(sql).not.toMatch(/CREATE TABLE "recipe_series"/);
    expect(sql).not.toMatch(/CREATE TABLE "custom_recipe_order"/);
    expect(sql).not.toMatch(/CREATE TABLE "dog"/);
    expect(sql).not.toMatch(/CREATE TABLE "recipe"/);
    expect(sql).not.toMatch(/CREATE TABLE "design_recipe"/);
  });
});
