import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 补剂订单自动关单的回归（2026-09-24）
 *
 * 背景：补剂订单原先**完全不在自动关单的覆盖范围内** ——
 * 定时任务只查鲜食订单（`orderRepository.findByStatus`），
 * 结果本地 4 张从 9/21 起就没付款的补剂单一直挂在「待付款」，挂了 3 天。
 *
 * 这里用源码断言锁住几个**容易再犯**的点。用读源码而不是跑实例，
 * 是因为要锁的是"代码结构"（放在哪个分支里），单测跑不出来。
 */
describe('补剂订单自动关单', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/application/scheduler/order-scheduler.service.ts',
    ),
    'utf-8',
  );

  it('定时任务里确实处理了补剂订单', () => {
    expect(source).toContain('autoCancelExpiredSupplementOrders');
    expect(source).toContain('findExpiredUnpaidOrders');
  });

  it('⚠️ 补剂处理必须在 finally 里，否则会被鲜食逻辑的 return 跳过', () => {
    // 鲜食那段有多个 early return（"暂无待付款单"就 return），
    // 补剂逻辑写在 try/catch 之后的话**一次都不会执行** —— 实测踩过：
    // 定时任务每分钟都在跑，日志里只有鲜食那句话，补剂单纹丝不动。
    const callIdx = source.indexOf('await this.autoCancelExpiredSupplementOrders()');
    const finallyIdx = source.lastIndexOf('} finally {', callIdx);
    const catchIdx = source.lastIndexOf('} catch (error) {', callIdx);
    expect(callIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
    // 调用必须夹在 finally 与它对应的右括号之间
    expect(finallyIdx).toBeLessThan(callIdx);
  });

  it('超时值取自补剂商城设置，不是鲜食的支付配置', () => {
    const fn = source.slice(
      source.indexOf('private async autoCancelExpiredSupplementOrders'),
    );
    expect(fn).toContain('supplementShopConfigService.getConfig()');
    expect(fn).toContain('shopConfig.paymentTimeoutMinutes');
    // 不许回头去读平台支付配置的超时
    expect(fn).not.toContain('platformConfigService.getPaymentConfig');
  });

  it('配成 0 时不关单（用户可自主关闭）', () => {
    const fn = source.slice(
      source.indexOf('private async autoCancelExpiredSupplementOrders'),
      source.indexOf('private async autoCancelExpiredSupplementOrders') + 900,
    );
    expect(fn).toMatch(/timeoutMinutes <= 0/);
  });
});
