import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 小程序 ↔ 后端 · 定制食谱契约守卫（2026-10-04）
 *
 * 为什么需要单独一个文件：这一批改了一处**跨端配对**的契约 ——
 * 顾客不再选日期，小程序提交时**不再传 `scheduledDate`**。
 * 后端因此必须把它保持成"可选且不采信"。
 *
 * 这条契约的危险点在于**两侧不会同时报错**：
 *   · 后端把 `scheduledDate` 改回必填 → 小程序的请求会被校验直接拒掉（400），
 *     顾客表现为"点了没反应/提交失败"，而单测、构建、后台全都正常；
 *   · 小程序又把日期塞回载荷 → 表面能跑，但会重新引入"假预约日期"。
 *
 * 所以这里用声明式守卫把两侧钉在一起：任何一侧被改回去，这里立刻红。
 */
describe('定制食谱 · 小程序与后端的跨端契约', () => {
  const backend = (path: string) =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');
  const miniapp = (path: string) =>
    readFileSync(resolve(process.cwd(), '../miniapp', path), 'utf-8');

  it('⚠️ 后端把 scheduledDate 保持为「可选」，否则小程序提交会被 400 拒掉', () => {
    const dto = backend(
      'src/application/custom-recipe/dto/custom-recipe.dto.ts',
    );

    // 找到 scheduledDate 那一段声明
    const start = dto.indexOf('scheduledDate?');
    expect(start).toBeGreaterThan(-1);

    const segment = dto.slice(Math.max(0, start - 320), start + 20);
    expect(segment).toContain('@IsOptional()');
    expect(segment).toContain('@ApiPropertyOptional');
    // 领域 DTO 侧也要是可选的
    const domain = backend(
      'src/domain/custom-recipe/custom-recipe.repository.ts',
    );
    expect(domain).toContain('scheduledDate?: Date');
  });

  it('⚠️ 小程序提交时不再传日期（排期由服务端定）', () => {
    const indexPage = miniapp('src/pages/custom-recipe/index.vue');

    // 载荷里不能出现 scheduledDate 字段
    expect(indexPage).not.toMatch(/scheduledDate\s*[:,]/);
    // 但必须把"排期由后端定"这件事写在注释里，避免后人又加回来
    expect(indexPage).toContain('scheduledDate');
  });

  it('后端下单时确实忽略传入日期，改用自动排期', () => {
    const service = backend(
      'src/application/custom-recipe/custom-recipe.service.ts',
    );

    expect(service).toContain('findNextAvailableDate');
    expect(service).toContain('tryBookSlotTx');
    // 订单落库用的是排期算出来的日期，不是 data.scheduledDate
    expect(service).toMatch(/scheduledDate,\s*\n\s*estimatedDeliveryDate,/);
    expect(service).not.toMatch(/scheduledDate:\s*data\.scheduledDate/);
  });

  it('小程序需要的支付时限与退款状态，后端都下发了', () => {
    const config = backend(
      'src/application/custom-recipe/custom-recipe-config.service.ts',
    );
    const controller = backend(
      'src/interfaces/controllers/custom-recipe/custom-recipe.controller.ts',
    );
    const orderUtil = miniapp('src/utils/custom-recipe-order.ts');

    // 公开配置必须带支付时限（顾客要知道多久不付会被关单）
    expect(config).toContain('paymentTimeoutMinutes: config.paymentTimeoutMinutes');

    // 订单列表与详情都要给支付截止时间与退款进展
    expect(controller).toContain('paymentDeadlineAt');
    expect(controller).toContain('refundStatus');
    expect(controller).toContain('refundAmount');

    // 小程序侧确实在消费这些字段
    expect(orderUtil).toContain('paymentDeadlineAt');
    expect(orderUtil).toContain('paymentTimeoutMinutes');
  });
});
