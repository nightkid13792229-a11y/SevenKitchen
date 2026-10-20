import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { CustomRecipeStatus } from '@prisma/client';

import {
  CUSTOM_RECIPE_ACTIONS,
  resolveCustomerActions,
} from '../../src/application/custom-recipe/custom-recipe-action-resolver';
import { AdminCustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { CustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/custom-recipe.controller';

/**
 * 定制费抵扣成品货款 · 彻底移除守卫（2026-10-20）
 *
 * 老板拍板：确认取消「定制费可抵扣成品鲜食」，而且**不做兼容保留** ——
 * 没有真实历史顾客订单，唯一一张已支付订单是测试单，测试单也不保留余额。
 *
 * 所以这个模块是**硬删除**：
 *   · 数据库里 5 个列直接 drop；
 *   · 配置、接口、序列化、下单/取消/退款里的抵扣逻辑一并删掉；
 *   · 恢复额度接口删除后必须 404（而不是留一个空壳接口）。
 *
 * 唯一保留的是「用这份食谱订购成品」这个动作本身 —— 它只是入口，
 * 不该再带任何抵扣文案或金额。
 */

const repoFile = (...segments: string[]) =>
  resolve(process.cwd(), ...segments);

const read = (...segments: string[]) =>
  readFileSync(repoFile(...segments), 'utf-8');

/** 取控制器里所有已注册的路由路径 */
function methodPaths(controller: any): string[] {
  const paths: string[] = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === 'constructor') continue;
    const handler = controller.prototype[name];
    if (typeof handler !== 'function') continue;

    const meta = Reflect.getMetadata(PATH_METADATA, handler);
    if (!meta) continue;

    for (const item of Array.isArray(meta) ? meta : [meta]) {
      paths.push(String(item));
    }
  }
  return paths;
}

describe('Prisma schema · 抵扣列必须删干净', () => {
  const schema = read('prisma/schema.prisma');

  it('Order 不再有 creditAmountApplied / customRecipeCreditOrderId', () => {
    expect(schema).not.toContain('creditAmountApplied');
    expect(schema).not.toContain('customRecipeCreditOrderId');
  });

  it('CustomRecipeOrder 不再有 creditAmount / creditUsed', () => {
    expect(schema).not.toContain('creditAmount');
    expect(schema).not.toContain('creditUsed');
  });

  it('CustomRecipeConfig 不再有 creditAmount', () => {
    const configBlock =
      schema.match(/model CustomRecipeConfig \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(configBlock).not.toBe('');
    expect(configBlock).not.toContain('credit');
  });

  it('有对应的删列 migration（不是只改 schema、库里还留着列）', () => {
    const migrationsDir = repoFile('prisma/migrations');
    const names = readdirSync(migrationsDir).filter((name) =>
      /_remove_custom_recipe_credit$/.test(name),
    );

    expect(names).toHaveLength(1);

    const sql = readFileSync(
      join(migrationsDir, names[0], 'migration.sql'),
      'utf-8',
    );

    expect(sql).toMatch(
      /ALTER TABLE "order"[\s\S]*?DROP COLUMN "credit_amount_applied"/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "order"[\s\S]*?DROP COLUMN "custom_recipe_credit_order_id"/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "custom_recipe_order"[\s\S]*?DROP COLUMN "credit_amount"/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "custom_recipe_order"[\s\S]*?DROP COLUMN "credit_used"/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "custom_recipe_config"[\s\S]*?DROP COLUMN "credit_amount"/,
    );

    // 反向确认：迁移只有 DROP，不偷偷重建表
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ADD COLUMN/i);
  });
});

describe('配置 · 不再提供可抵扣金额', () => {
  const config = read(
    'src/application/custom-recipe/custom-recipe-config.service.ts',
  );

  it('配置 DTO / 公开配置 / 校验 / 写库都没有 creditAmount', () => {
    expect(config).not.toContain('creditAmount');
    expect(config).not.toContain('DEFAULT_CUSTOM_RECIPE_CREDIT');
  });
});

describe('定制订单服务 · 抵扣台账方法整个删除', () => {
  const service = read(
    'src/application/custom-recipe/custom-recipe.service.ts',
  );

  it('findUsableCredit / consumeCredit / restoreCredit / getCreditSummary 都不在', () => {
    for (const method of [
      'findUsableCredit',
      'consumeCredit',
      'restoreCredit',
      'getCreditSummary',
      'CREDIT_USABLE_STATUSES',
    ]) {
      expect(service).not.toContain(method);
    }
  });

  it('下单不再写 creditAmount', () => {
    expect(service).not.toContain('creditAmount');
    expect(service).not.toContain('creditUsed');
  });
});

describe('后台接口 · 恢复额度必须 404', () => {
  it('AdminCustomRecipeController 不再注册 restore-credit 路由', () => {
    const paths = methodPaths(AdminCustomRecipeController);
    expect(paths).not.toContain('orders/:orderId/restore-credit');
  });

  it('控制器源码里也没有恢复额度的残留', () => {
    const controller = read(
      'src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller.ts',
    );
    expect(controller).not.toContain('restore-credit');
    expect(controller).not.toContain('restoreCredit');
    expect(controller).not.toContain('getCreditSummary');
    expect(controller).not.toContain('creditAmount');
    expect(controller).not.toContain('creditUsed');
    expect(controller).not.toContain('creditRemaining');
  });
});

describe('订单链路 · 不再计算、扣减或恢复抵扣', () => {
  const orderService = read('src/application/order/order.service.ts');

  it('订单服务没有抵扣方法与字段', () => {
    for (const removed of [
      'resolveCustomRecipeCredit',
      'readCustomRecipeCreditFromSnapshot',
      'restoreCustomRecipeCreditIfNeeded',
      'creditAmountApplied',
      'customRecipeCreditOrderId',
      'creditAppliedToProduct',
      'creditAppliedToShipping',
      'consumeCredit',
      'restoreCredit',
    ]) {
      expect(orderService).not.toContain(removed);
    }
  });

  it('订单详情序列化与响应 DTO 不再返回抵扣字段', () => {
    const controller = read('src/interfaces/controllers/orders.controller.ts');
    const dto = read('src/interfaces/dto/orders/order-response.dto.ts');

    for (const field of [
      'creditAmountApplied',
      'creditOriginalProductAmount',
      'customRecipeCreditOrderId',
    ]) {
      expect(controller).not.toContain(field);
      expect(dto).not.toContain(field);
    }
  });

  it('取消/退款流程不再恢复额度', () => {
    expect(orderService).not.toContain('CustomRecipeCredit');
  });
});

describe('定制订单响应 · 不再下发抵扣余额', () => {
  const customerController = read(
    'src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts',
  );

  it('下单/列表/详情三处序列化都没有 creditAmount / creditUsed / creditRemaining', () => {
    for (const field of ['creditAmount', 'creditUsed', 'creditRemaining']) {
      expect(customerController).not.toContain(field);
    }
  });

  it('POST /custom-recipe/orders 的响应里没有 creditAmount', async () => {
    const order = {
      orderId: 'CR202610200001',
      status: 'PENDING_PAYMENT',
      createdAt: new Date('2026-10-20T00:00:00+08:00'),
      scheduledDate: new Date('2026-10-21'),
      estimatedDeliveryDate: new Date('2026-10-24'),
      amount: 300,
      // 故意仍然塞一个 creditAmount：控制器不能把它透出去
      creditAmount: 300,
    };

    const controller = new CustomRecipeController(
      {
        createOrder: jest.fn().mockResolvedValue(order),
        getPaymentTimeoutMinutes: jest.fn().mockResolvedValue(30),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      // 2026-10-20：报价接口新增的两个依赖，本用例只测下单响应
      {} as any,
      {} as any,
    );

    const response = await controller.submitOrder(
      { user: { userId: 'user-1' } } as any,
      { dogId: 'dog-1' } as any,
    );

    expect(response.data).toBeDefined();
    expect(response.data).not.toHaveProperty('creditAmount');
    expect(response.data).not.toHaveProperty('creditUsed');
    expect(response.data).not.toHaveProperty('creditRemaining');
  });
});

describe('动作契约 · 保留订购成品入口，删除恢复额度', () => {
  it('「用这份食谱订购成品」动作仍然存在（只是不再提抵扣）', () => {
    const actions = resolveCustomerActions({
      status: CustomRecipeStatus.DELIVERED,
      viewer: 'CUSTOMER',
      hasAnyDelivery: true,
    } as any);

    const action = actions.find(
      (item) => item.code === CUSTOM_RECIPE_ACTIONS.ORDER_FINISHED_FOOD,
    );
    expect(action).toBeDefined();
    expect(action?.enabled).toBe(true);
    expect(action?.label).toBe('用这份食谱订购成品');
    expect(action?.label).not.toContain('抵扣');
  });

  it('RESTORE_CREDIT 动作码已删除', () => {
    expect(CUSTOM_RECIPE_ACTIONS).not.toHaveProperty('RESTORE_CREDIT');
    expect(Object.values(CUSTOM_RECIPE_ACTIONS)).not.toContain('RESTORE_CREDIT');
  });
});

describe('迁移文件本身存在（便于人工核对路径）', () => {
  it('prisma/migrations 下有删列迁移目录', () => {
    const migrationsDir = repoFile('prisma/migrations');
    const candidates = readdirSync(migrationsDir).filter((name) =>
      /_remove_custom_recipe_credit$/.test(name),
    );
    expect(candidates).toHaveLength(1);
    expect(existsSync(join(migrationsDir, candidates[0], 'migration.sql'))).toBe(
      true,
    );
  });
});
