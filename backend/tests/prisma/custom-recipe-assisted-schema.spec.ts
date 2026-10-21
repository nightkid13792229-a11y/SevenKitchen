import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 代客定制食谱订单 · 数据库结构守卫（2026-10-21 · Task 1）
 *
 * 为什么要有这组测试：
 *   · `schema.prisma` 是并行会话共享的文件，本项目实测被**整体覆盖过**；
 *   · 代客单与自助单共用同一张 `custom_recipe_order`，一旦来源/收款字段丢失，
 *     线下已收款订单就会被当成"没付钱"，甚至误走微信退款、账对不上；
 *   · 交付分享 token 是**对外的唯一凭据**，一旦不唯一或过期语义被改，
 *     别人的交付内容就可能被枚举/长期泄漏。
 *
 * 单测连不上数据库，所以守住两件事：schema 定义还在，migration 只做新增。
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

const MIGRATION_FILE =
  'prisma/migrations/20261021210000_assisted_custom_recipe_order/migration.sql';

describe('代客定制食谱订单 · 数据库结构守卫', () => {
  const schema = readProjectFile('prisma/schema.prisma');

  it('新增订单来源枚举，只有 SELF / ASSISTED，老订单默认 SELF', () => {
    const values = enumBlock(schema, 'CustomRecipeOrderSource')
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !line.startsWith('//') &&
          !line.startsWith('enum') &&
          !line.startsWith('}'),
      );

    expect(values).toEqual(['SELF', 'ASSISTED']);

    const order = modelBlock(schema, 'CustomRecipeOrder');
    expect(order).toMatch(
      /orderSource\s+CustomRecipeOrderSource\s+@default\(SELF\)\s+@map\("order_source"\)/,
    );
  });

  it('定制单保留代客来源、操作人与线下收款字段', () => {
    const order = modelBlock(schema, 'CustomRecipeOrder');

    /**
     * 这些字段缺一个都会出事：
     *   · 没有 `createdByStaffId` → 查不到是谁代下的单；
     *   · 没有 `paymentChannel` → 线下单会被当成微信单误退款；
     *   · 没有 `actualPaidAmount` → 实收与报价不一致时无法对账；
     *   · 没有 `priceOverrideReason` → 改价没有留痕。
     */
    const expected: Array<[string, RegExp]> = [
      [
        '操作人',
        /createdByStaffId\s+String\?\s+@map\("created_by_staff_id"\)/,
      ],
      [
        '收款渠道',
        /paymentChannel\s+String\?\s+@map\("payment_channel"\)\s+@db\.VarChar\(30\)/,
      ],
      [
        '外部流水号',
        /externalPaymentRef\s+String\?\s+@map\("external_payment_ref"\)\s+@db\.VarChar\(100\)/,
      ],
      [
        '实际收款',
        /actualPaidAmount\s+Decimal\?\s+@map\("actual_paid_amount"\)\s+@db\.Decimal\(10,\s*2\)/,
      ],
      [
        '改价原因',
        /priceOverrideReason\s+String\?\s+@map\("price_override_reason"\)\s+@db\.VarChar\(200\)/,
      ],
      [
        '无账号代客标记',
        /assistedForGuest\s+Boolean\s+@default\(false\)\s+@map\("assisted_for_guest"\)/,
      ],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(order))
      .map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('定制单保留线下退款登记字段（线下单不调微信退款）', () => {
    const order = modelBlock(schema, 'CustomRecipeOrder');

    const expected: Array<[string, RegExp]> = [
      [
        '退款渠道',
        /refundChannel\s+String\?\s+@map\("refund_channel"\)\s+@db\.VarChar\(30\)/,
      ],
      [
        '线下退款时间',
        /offlineRefundedAt\s+DateTime\?\s+@map\("offline_refunded_at"\)/,
      ],
      [
        '线下退款金额',
        /offlineRefundAmount\s+Decimal\?\s+@map\("offline_refund_amount"\)\s+@db\.Decimal\(10,\s*2\)/,
      ],
      [
        '线下退款方式',
        /offlineRefundMethod\s+String\?\s+@map\("offline_refund_method"\)\s+@db\.VarChar\(30\)/,
      ],
      [
        '线下退款备注',
        /offlineRefundNote\s+String\?\s+@map\("offline_refund_note"\)\s+@db\.VarChar\(200\)/,
      ],
      [
        '线下退款操作人',
        /offlineRefundByStaffId\s+String\?\s+@map\("offline_refund_by_staff_id"\)/,
      ],
    ];

    const missing = expected
      .filter(([, pattern]) => !pattern.test(order))
      .map(([label]) => label);

    expect(missing).toEqual([]);
  });

  it('User 上保留代客客户标识与联系方式，默认不改变现有账号', () => {
    const user = modelBlock(schema, 'User');

    // 默认 false：存量用户与小程序注册用户都必须还是普通账号
    expect(user).toMatch(
      /isGuest\s+Boolean\s+@default\(false\)\s+@map\("is_guest"\)/,
    );
    // 代客客户没有 openid/password，联系方式就是唯一能联系到人的信息
    expect(user).toMatch(
      /guestContactName\s+String\?\s+@map\("guest_contact_name"\)\s+@db\.VarChar\(50\)/,
    );
    expect(user).toMatch(
      /guestContactPhone\s+String\?\s+@map\("guest_contact_phone"\)\s+@db\.VarChar\(20\)/,
    );
    expect(user).toMatch(
      /guestContactWechat\s+String\?\s+@map\("guest_contact_wechat"\)\s+@db\.VarChar\(100\)/,
    );
    expect(user).toMatch(
      /guestCreatedByStaffId\s+String\?\s+@map\("guest_created_by_staff_id"\)/,
    );
  });

  it('交付分享表存在：token 唯一、内容归属只到订单/批次', () => {
    const share = modelBlock(schema, 'CustomRecipeDeliveryShare');

    expect(share).toMatch(
      /token\s+String\s+@unique\s+@map\("token"\)\s+@db\.VarChar\(64\)/,
    );
    expect(share).toMatch(/orderId\s+String\s+@map\("order_id"\)/);
    // 批次可空：尚未交付 / 批次被清理时，分享仍按订单记着
    expect(share).toMatch(
      /deliveryBatchId\s+String\?\s+@map\("delivery_batch_id"\)/,
    );
    // null = 不自动过期（交付内容归顾客所有，只能人工撤销）
    expect(share).toMatch(/expiresAt\s+DateTime\?\s+@map\("expires_at"\)/);
    expect(share).toMatch(/revokedAt\s+DateTime\?\s+@map\("revoked_at"\)/);
    expect(share).toMatch(
      /createdByStaffId\s+String\s+@map\("created_by_staff_id"\)/,
    );
    expect(share).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(share).toMatch(/@@map\("custom_recipe_delivery_share"\)/);

    // 分享**只**引用订单与批次；不许直接挂到 User 上（否则会暴露顾客信息）
    const relationFields = share.match(/^\s+\w+\s+\w+.*@relation/gm) ?? [];
    expect(relationFields).toHaveLength(2);
    expect(share).not.toMatch(/\buser\s+User\b/);
    expect(share).not.toMatch(/\bcustomer\s+User\b/);
  });

  it('分享挂订单/批次的关系与索引都在', () => {
    const share = modelBlock(schema, 'CustomRecipeDeliveryShare');

    expect(share).toMatch(
      /order\s+CustomRecipeOrder\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(share).toMatch(
      /batch\s+CustomRecipeDeliveryBatch\?\s+@relation\(fields: \[deliveryBatchId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(share).toMatch(/@@index\(\[orderId\]\)/);
    expect(share).toMatch(/@@index\(\[deliveryBatchId\]\)/);

    // 反向关系：按订单 / 批次都能查到分享
    expect(modelBlock(schema, 'CustomRecipeOrder')).toMatch(
      /deliveryShares\s+CustomRecipeDeliveryShare\[\]/,
    );
    expect(modelBlock(schema, 'CustomRecipeDeliveryBatch')).toMatch(
      /deliveryShares\s+CustomRecipeDeliveryShare\[\]/,
    );
  });

  it('迁移文件存在，且只做新增（枚举 / 加列 / 建表 / 索引 / 外键）', () => {
    expect(existsSync(join(__dirname, '../..', MIGRATION_FILE))).toBe(true);

    const sql = readProjectFile(MIGRATION_FILE);

    // 枚举
    expect(sql).toMatch(
      /CREATE TYPE "CustomRecipeOrderSource" AS ENUM \('SELF', 'ASSISTED'\)/,
    );

    // 定制单：加列，且默认值明确（老订单全部落 SELF）
    expect(sql).toMatch(
      /ADD COLUMN\s+"order_source" "CustomRecipeOrderSource" NOT NULL DEFAULT 'SELF'/,
    );
    expect(sql).toMatch(/ADD COLUMN\s+"created_by_staff_id" TEXT/);
    expect(sql).toMatch(/ADD COLUMN\s+"payment_channel" VARCHAR\(30\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"external_payment_ref" VARCHAR\(100\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"actual_paid_amount" DECIMAL\(10,\s*2\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"price_override_reason" VARCHAR\(200\)/);
    expect(sql).toMatch(
      /ADD COLUMN\s+"assisted_for_guest" BOOLEAN NOT NULL DEFAULT false/,
    );
    expect(sql).toMatch(/ADD COLUMN\s+"refund_channel" VARCHAR\(30\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"offline_refunded_at" TIMESTAMP\(3\)/);
    expect(sql).toMatch(
      /ADD COLUMN\s+"offline_refund_amount" DECIMAL\(10,\s*2\)/,
    );
    expect(sql).toMatch(/ADD COLUMN\s+"offline_refund_method" VARCHAR\(30\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"offline_refund_note" VARCHAR\(200\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"offline_refund_by_staff_id" TEXT/);

    // 用户：代客客户标识与联系方式
    expect(sql).toMatch(/ADD COLUMN\s+"is_guest" BOOLEAN NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ADD COLUMN\s+"guest_contact_name" VARCHAR\(50\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"guest_contact_phone" VARCHAR\(20\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"guest_contact_wechat" VARCHAR\(100\)/);
    expect(sql).toMatch(/ADD COLUMN\s+"guest_created_by_staff_id" TEXT/);

    // 分享表
    expect(sql).toMatch(/CREATE TABLE "custom_recipe_delivery_share"/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "custom_recipe_delivery_share_token_key" ON "custom_recipe_delivery_share"\("token"\)/,
    );
    // null = 不自动过期
    expect(sql).toMatch(/"expires_at" TIMESTAMP\(3\),/);
    expect(sql).not.toMatch(/"expires_at" TIMESTAMP\(3\) NOT NULL/);

    // 外键：订单删则分享删；批次断链不删分享，只置空
    expect(sql).toMatch(
      /FOREIGN KEY \("order_id"\) REFERENCES "custom_recipe_order"\("id"\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(
      /FOREIGN KEY \("delivery_batch_id"\) REFERENCES "custom_recipe_delivery_batch"\("id"\) ON DELETE SET NULL/,
    );
  });

  it('迁移是 additive：不许删表/删列/改既有列类型', () => {
    const sql = readProjectFile(MIGRATION_FILE);

    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/ALTER COLUMN/i);
    // 旧订单表只允许加列，不许重建
    expect(sql).not.toMatch(/CREATE TABLE "custom_recipe_order"/);
    expect(sql).not.toMatch(/CREATE TABLE "user"/);
  });
});
