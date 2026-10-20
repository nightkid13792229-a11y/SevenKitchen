import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 食谱定制（付费）数据库结构的守卫测试
 *
 * 背景（2026-09-25）：工作目录里有并行开发会话，`prisma/schema.prisma` 是共享文件，
 * 本项目实测被**整体覆盖过一次** —— 「食谱定制设置」的定义连同定制单字段
 * 一起消失，而数据库里表和列都还在，于是 schema 与库产生漂移。
 *
 * 单测跑不通数据库，但可以守住"定义必须还在"。任何一次覆盖都会在这里立刻红掉，
 * 而不是等到上线时才发现。
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

describe('食谱定制 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('保留「食谱定制设置」单例表及其全部参数', () => {
    const block = modelBlock(schema, 'CustomRecipeConfig');

    expect(block).toMatch(/feeAmount\s+Decimal\s+@default\(300\)\s+@map\("fee_amount"\)/);
    // 2026-10-20：可抵扣金额已整体删除，不得再回到 schema
    expect(block).not.toContain('creditAmount');
    expect(block).toMatch(
      /deliveryWorkDays\s+Int\s+@default\(3\)\s+@map\("delivery_work_days"\)/,
    );
    expect(block).toMatch(
      /dailyCapacity\s+Int\s+@default\(4\)\s+@map\("daily_capacity"\)/,
    );
    expect(block).toMatch(
      /paymentTimeoutMinutes\s+Int\s+@default\(30\)\s+@map\("payment_timeout_minutes"\)/,
    );
    expect(block).toMatch(/@@map\("custom_recipe_config"\)/);
  });

  it('配置单例保留 2026-10-16（批次 1.4）新增的全部参数', () => {
    const block = modelBlock(schema, 'CustomRecipeConfig');

    /**
     * 这些参数原先都**写死在代码里**（有的还写死在两处）。
     * 加这批守卫是因为 `schema.prisma` 被并行会话整体覆盖过 ——
     * 定义一旦消失，代码读配置就会拿到 undefined，
     * 而"配置缺字段"在运行时的表现是「近期名额已满」这类**看不出原因**的错
     * （2026-10-16 实测踩到过，坏了 5 条排期测试）。
     */
    const expected: Array<[string, RegExp]> = [
      ['每日交付上限', /dailyDeliveryCapacity\s+Int\s+@default\(4\)/],
      /**
       * 2026-10-18：默认值从 30 / 1 改成 7 / 2。
       *
       * 依据老板 10-17 的明确决定：
       *   V22「售后窗口就留 7 天吧」
       *   V23「那就改成 7 天之内免费修改两次吧」
       *
       * 旧默认值（30 / 1）是 10-16 写的，早于决策 —— 一直没改，
       * 生产库里那一行也还是 30 / 1（说明没人动过，是纯旧默认值）。
       */
      ['售后窗口', /aftersaleWindowDays\s+Int\s+@default\(7\)/],
      ['免费调整次数', /freeRevisionCount\s+Int\s+@default\(2\)/],
      ['免费调整窗口', /freeRevisionWindowDays\s+Int\s+@default\(7\)/],
      ['自动完成天数', /autoCompleteDays\s+Int\s+@default\(3\)/],
      ['要求确认收货', /requireCustomerConfirm\s+Boolean\s+@default\(true\)/],
      ['交付物清单', /deliveryItemCodes\s+String\[\]/],
      ['附件张数上限', /attachmentMaxCount\s+Int\s+@default\(9\)/],
      ['附件大小上限', /attachmentMaxSizeMb\s+Int\s+@default\(10\)/],
      ['默认营养标准', /defaultNutritionStandard\s+String/],
      ['默认能量密度', /defaultEnergyDensityKcalPerKg\s+Int\s+@default\(3200\)/],
      ['生产损耗率', /productionLossRate\s+Decimal\s+@default\(1\.07\)/],
      ['默认工时', /defaultLaborHours\s+Decimal\s+@default\(2\)/],
      ['排期前瞻天数', /scheduleLookaheadDays\s+Int\s+@default\(45\)/],
      ['占位重试次数', /slotRetryTimes\s+Int\s+@default\(5\)/],
      ['业务编号前缀', /orderNoPrefix\s+String\s+@default\("CR"\)/],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(block))
      .map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('批次 1.4 的迁移存在，且是「只加列」而不是重建表', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../..',
        'prisma/migrations/20261016233000_custom_recipe_config_expansion/migration.sql',
      ),
      'utf8',
    );

    expect(sql).toMatch(/ALTER TABLE "custom_recipe_config"/);
    expect(sql).toMatch(
      /ADD COLUMN "auto_complete_days" INTEGER NOT NULL DEFAULT 3/,
    );
    // 只加列：不许出现删表/删列，回滚只需 drop 这些列
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
  });

  it('定制单保留支付/关单字段，且不再有额度台账', () => {
    const block = modelBlock(schema, 'CustomRecipeOrder');

    // 2026-10-20：可抵扣金额与已用额度整体删除
    expect(block).not.toContain('creditAmount');
    expect(block).not.toContain('creditUsed');
    // 微信支付交易号 + 关单留痕
    expect(block).toMatch(
      /paymentTransactionId\s+String\?\s+@map\("payment_transaction_id"\)/,
    );
    expect(block).toMatch(/cancelledAt\s+DateTime\?\s+@map\("cancelled_at"\)/);
    expect(block).toMatch(
      /cancellationReason\s+String\?\s+@map\("cancellation_reason"\)/,
    );
  });

  it('定制单状态机保留 CANCELLED（超时关单依赖它）', () => {
    const match = schema.match(/enum CustomRecipeStatus \{[\s\S]*?\n\}/);

    expect(match).not.toBeNull();
    expect(match?.[0]).toContain('CANCELLED');
  });

  it('对应的 migration 都在库里可追溯', () => {
    expect(
      existsSync(
        join(
          __dirname,
          '../..',
          'prisma/migrations/20260925120000_add_custom_recipe_config/migration.sql',
        ),
      ),
    ).toBe(true);

    expect(
      existsSync(
        join(
          __dirname,
          '../..',
          'prisma/migrations/20260925235900_add_custom_recipe_payment_fields/migration.sql',
        ),
      ),
    ).toBe(true);
  });

  it('migration 里确实写了配置与支付字段（不能只有 schema 没有库变更）', () => {
    const configSql = readProjectFile(
      'prisma/migrations/20260925120000_add_custom_recipe_config/migration.sql',
    );
    expect(configSql).toContain('custom_recipe_config');
    expect(configSql).toContain('fee_amount');
    // 历史 migration 曾经加过 credit_amount / credit_used，后来由
    // 20261020230000_remove_custom_recipe_credit 删掉（见移除守卫测试）。

    const paymentSql = readProjectFile(
      'prisma/migrations/20260925235900_add_custom_recipe_payment_fields/migration.sql',
    );
    expect(paymentSql).toContain('CANCELLED');
    expect(paymentSql).toContain('payment_transaction_id');
    expect(paymentSql).toContain('cancelled_at');
  });

  describe('交付 / 售后 / 日历 / 问卷（2026-10-16 批次 1.6）', () => {
    it('四张表都在（交付、售后、星期规则、问卷字段）', () => {
      for (const model of [
        'CustomRecipeDelivery',
        'CustomRecipeAftersale',
        'CustomRecipeWeekdayRule',
        'CustomRecipeFormField',
      ]) {
        expect({ model, ok: modelBlock(schema, model).length > 0 }).toEqual({
          model,
          ok: true,
        });
      }
    });

    it('★ 交付单必须带 contentSnapshot（否则"交付后改配方会串改历史"这个缺陷会重演）', () => {
      const block = modelBlock(schema, 'CustomRecipeDelivery');
      expect(block).toMatch(/contentSnapshot\s+Json\s+@map\("content_snapshot"\)/);
      // 版本号要么有，要么无法区分"第几版"
      expect(block).toMatch(/version\s+Int/);
      expect(block).toMatch(/@@unique\(\[orderId, version\]\)/);
      // 替换关系：重新交付时旧版本要能指向新版本
      expect(block).toMatch(/replacedByDeliveryId/);
    });

    it('★ 交付的食谱外键是 RESTRICT（食谱被交付过就不许删）', () => {
      const block = modelBlock(schema, 'CustomRecipeDelivery');
      expect(block).toMatch(
        /recipe\s+Recipe\s+@relation\(fields: \[recipeId\], references: \[id\]\)/,
      );
      // 不带 onDelete 时 Prisma 默认就是 RESTRICT —— 这里用"没有 CASCADE"来锁住意图
      expect(block).not.toMatch(/recipe\s+Recipe[^\n]*onDelete: Cascade/);
    });

    it('售后单独立于订单状态（有自己的状态枚举）', () => {
      const block = modelBlock(schema, 'CustomRecipeAftersale');
      expect(block).toMatch(/status\s+CustomRecipeAftersaleStatus/);
      // 处理"调整食谱"时要能关联到重新交付的那一版
      expect(block).toMatch(/linkedDeliveryId/);
      // 交付记录被删时售后痕迹要保留（SET NULL），不是一起删掉
      expect(block).toMatch(
        /delivery\s+CustomRecipeDelivery\?\s+@relation\(fields: \[deliveryId\], references: \[id\]\)/,
      );
    });

    it('问卷字段的 binding 双轨机制在（核心列 vs EXTRA JSON）', () => {
      const block = modelBlock(schema, 'CustomRecipeFormField');
      expect(block).toMatch(/binding\s+String\s+@default\("EXTRA"\)/);
      expect(block).toMatch(/optionSetCode\s+String\?/);
      expect(block).toMatch(/visibleWhen\s+Json\?/);
    });

    it('订单补了 answers 与 formSchemaVersion；排期补了交付容量', () => {
      const order = modelBlock(schema, 'CustomRecipeOrder');
      expect(order).toMatch(/answers\s+Json\?\s+@map\("answers"\)/);
      expect(order).toMatch(/formSchemaVersion\s+Int\?/);

      const schedule = modelBlock(schema, 'CustomRecipeSchedule');
      expect(schedule).toMatch(/deliveryCapacity\s+Int\s+@default\(4\)/);
      expect(schedule).toMatch(/deliveryCount\s+Int\s+@default\(0\)/);
    });

    it('迁移存在，且只新增（不 drop、不改既有列类型）', () => {
      const sql = readProjectFile(
        'prisma/migrations/20261017000000_custom_recipe_delivery_and_aftersale/migration.sql',
      );
      expect(sql).toMatch(/CREATE TABLE "custom_recipe_delivery"/);
      expect(sql).toMatch(/CREATE TABLE "custom_recipe_aftersale"/);
      expect(sql).toMatch(/CREATE INDEX "custom_recipe_delivery_order_id_idx"/);
      expect(sql).toMatch(
        /FOREIGN KEY \("recipe_id"\) REFERENCES "recipe"\("id"\) ON DELETE RESTRICT/,
      );
      // 只加不改
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
    });
  });

  describe('多份交付批次（2026-10-21 · 第二阶段地基）', () => {
    it('批次与明细两张表都在，明细每份都有自己的快照', () => {
      const batch = modelBlock(schema, 'CustomRecipeDeliveryBatch');
      expect(batch).toMatch(/@@unique\(\[orderId, version\]\)/);
      expect(batch).toMatch(/@@map\("custom_recipe_delivery_batch"\)/);
      expect(batch).toMatch(/items\s+CustomRecipeDeliveryItem\[\]/);

      const item = modelBlock(schema, 'CustomRecipeDeliveryItem');
      expect(item).toMatch(
        /contentSnapshot\s+Json\s+@map\("content_snapshot"\)/,
      );
      expect(item).toMatch(/recipeVersion\s+Int\s+@map\("recipe_version"\)/);
      expect(item).toMatch(/@@unique\(\[batchId, recipeId\]\)/);
      expect(item).toMatch(/@@map\("custom_recipe_delivery_item"\)/);
      // 与老交付表一致：食谱被交付过就不许删（不是 CASCADE）
      expect(item).not.toMatch(/recipe\s+Recipe[^\n]*onDelete: Cascade/);
    });

    it('订单与食谱都挂上了新关系', () => {
      expect(modelBlock(schema, 'CustomRecipeOrder')).toMatch(
        /deliveryBatches\s+CustomRecipeDeliveryBatch\[\]/,
      );
      expect(modelBlock(schema, 'Recipe')).toMatch(
        /deliveryItems\s+CustomRecipeDeliveryItem\[\]/,
      );
    });

    it('迁移只新增两张表，不动老的单份交付表', () => {
      const sql = readProjectFile(
        'prisma/migrations/20261021003000_multi_recipe_delivery_batch/migration.sql',
      );
      expect(sql).toMatch(/CREATE TABLE "custom_recipe_delivery_batch"/);
      expect(sql).toMatch(/CREATE TABLE "custom_recipe_delivery_item"/);
      // 批次随订单删、明细随批次删；食谱被交付过则不许删
      expect(sql).toMatch(/ON DELETE CASCADE/);
      expect(sql).toMatch(/ON DELETE RESTRICT/);
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
      // 老表一个字都不改
      expect(sql).not.toMatch(/ALTER TABLE "custom_recipe_delivery"/i);
    });

    it('批次上有顾客确认字段，与老的单份交付表同口径', () => {
      const batch = modelBlock(schema, 'CustomRecipeDeliveryBatch');
      expect(batch).toMatch(
        /confirmedAt\s+DateTime\?\s+@map\("confirmed_at"\)/,
      );
      expect(batch).toMatch(
        /confirmChannel\s+String\?\s+@map\("confirm_channel"\)\s+@db\.VarChar\(20\)/,
      );
    });

    it('确认字段的迁移只给批次表加列（可回滚，不碰老表）', () => {
      const sql = readProjectFile(
        'prisma/migrations/20261021010000_multi_recipe_delivery_batch_confirm/migration.sql',
      );
      expect(sql).toMatch(
        /ALTER TABLE "custom_recipe_delivery_batch" ADD COLUMN\s+"confirm_channel" VARCHAR\(20\)/,
      );
      expect(sql).toMatch(/ADD COLUMN\s+"confirmed_at" TIMESTAMP\(3\)/);
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
      // 老的单份交付表已经有同名字段，不能重复加
      expect(sql).not.toMatch(/ALTER TABLE "custom_recipe_delivery"/i);
    });
  });

  describe('多份售后（2026-10-21 · 第二阶段 Task 6）', () => {
    it('售后单能指向批次 / 明细，并保存逐份说明', () => {
      const aftersale = modelBlock(schema, 'CustomRecipeAftersale');

      expect(aftersale).toMatch(
        /deliveryBatchId\s+String\?\s+@map\("delivery_batch_id"\)/,
      );
      expect(aftersale).toMatch(
        /deliveryItemIds\s+String\[\]\s+@default\(\[\]\)\s+@map\("delivery_item_ids"\)/,
      );
      expect(aftersale).toMatch(
        /recipeRequests\s+Json\?\s+@map\("recipe_requests"\)/,
      );
      expect(aftersale).toMatch(
        /deliveryBatch\s+CustomRecipeDeliveryBatch\?\s+@relation/,
      );
      // 老的单份交付关系必须还在 —— 老订单仍走它
      expect(aftersale).toMatch(
        /delivery\s+CustomRecipeDelivery\?\s+@relation/,
      );
    });

    it('批次上挂反向关系，便于按批次查售后', () => {
      expect(modelBlock(schema, 'CustomRecipeDeliveryBatch')).toMatch(
        /aftersales\s+CustomRecipeAftersale\[\]/,
      );
    });

    it('迁移只给售后表加列，老的单份交付表一个字都不改', () => {
      const sql = readProjectFile(
        'prisma/migrations/20261021020000_multi_recipe_aftersale_batch/migration.sql',
      );

      expect(sql).toMatch(
        /ALTER TABLE "custom_recipe_aftersale" ADD COLUMN\s+"delivery_batch_id" TEXT/,
      );
      expect(sql).toMatch(
        /ADD COLUMN\s+"delivery_item_ids" TEXT\[\] DEFAULT ARRAY\[\]::TEXT\[\]/,
      );
      expect(sql).toMatch(/ADD COLUMN\s+"recipe_requests" JSONB/);
      // 批次被删时只断开关联，不能连带删掉售后单
      expect(sql).toMatch(/ON DELETE SET NULL/);
      expect(sql).not.toMatch(/DROP TABLE/i);
      expect(sql).not.toMatch(/DROP COLUMN/i);
      expect(sql).not.toMatch(/ALTER COLUMN/i);
      expect(sql).not.toMatch(/ALTER TABLE "custom_recipe_delivery"/i);
    });
  });
});
