import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 食谱定制（付费 + 抵扣）数据库结构的守卫测试
 *
 * 背景（2026-09-25）：工作目录里有并行开发会话，`prisma/schema.prisma` 是共享文件，
 * 本项目实测被**整体覆盖过一次** —— 「食谱定制设置」的定义连同定制单上的额度字段
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
    expect(block).toMatch(
      /creditAmount\s+Decimal\s+@default\(300\)\s+@map\("credit_amount"\)/,
    );
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

  it('定制单保留额度台账与支付/关单字段', () => {
    const block = modelBlock(schema, 'CustomRecipeOrder');

    // 提交时快照的可抵扣金额 + 已用额度
    expect(block).toMatch(
      /creditAmount\s+Decimal\s+@default\(300\)\s+@map\("credit_amount"\)/,
    );
    expect(block).toMatch(
      /creditUsed\s+Decimal\s+@default\(0\)\s+@map\("credit_used"\)/,
    );
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

  it('migration 里确实写了额度与支付字段（不能只有 schema 没有库变更）', () => {
    const configSql = readProjectFile(
      'prisma/migrations/20260925120000_add_custom_recipe_config/migration.sql',
    );
    expect(configSql).toContain('custom_recipe_config');
    expect(configSql).toContain('credit_amount');
    expect(configSql).toContain('credit_used');

    const paymentSql = readProjectFile(
      'prisma/migrations/20260925235900_add_custom_recipe_payment_fields/migration.sql',
    );
    expect(paymentSql).toContain('CANCELLED');
    expect(paymentSql).toContain('payment_transaction_id');
    expect(paymentSql).toContain('cancelled_at');
  });
});
