import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 定制食谱订单自动关单的回归（2026-09-25）
 *
 * 背景：定制单提交后不付款、顾客又关掉小程序，这张单会永远挂在「待付款」，
 * 而且**当天的排期名额不会释放** —— booked_count 只增不减，
 * 几天之后就会"明明没人下单却提示该日期已约满"。
 *
 * 与补剂同源：这里用源码断言锁住"放在哪个分支里"这种单测跑不出来的结构问题。
 */
describe('定制食谱订单自动关单', () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      'src/application/scheduler/order-scheduler.service.ts',
    ),
    'utf-8',
  );

  it('定时任务里确实处理了定制订单', () => {
    expect(source).toContain('autoCancelExpiredCustomRecipeOrders');
    expect(source).toContain('findExpiredUnpaidOrders');
  });

  it('⚠️ 定制处理必须在 finally 里，否则会被鲜食逻辑的 return 跳过', () => {
    const callIdx = source.indexOf(
      'await this.autoCancelExpiredCustomRecipeOrders()',
    );
    const finallyIdx = source.lastIndexOf('} finally {', callIdx);
    const catchIdx = source.lastIndexOf('} catch (error) {', callIdx);

    expect(callIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(catchIdx);
    expect(finallyIdx).toBeLessThan(callIdx);
  });

  it('超时值取自「食谱定制设置」，与鲜食、补剂各自独立', () => {
    const fn = source.slice(
      source.indexOf('private async autoCancelExpiredCustomRecipeOrders'),
    );

    expect(fn).toContain('customRecipeConfigService.getConfig()');
    expect(fn).toContain('recipeConfig.paymentTimeoutMinutes');
    // 不许回头去读平台支付配置或补剂配置的超时
    expect(fn).not.toContain('platformConfigService.getPaymentConfig');
    expect(fn).not.toContain('supplementShopConfigService');
  });

  it('配成 0 时不关单', () => {
    const start = source.indexOf(
      'private async autoCancelExpiredCustomRecipeOrders',
    );
    const fn = source.slice(start, start + 1200);

    expect(fn).toMatch(/timeoutMinutes <= 0/);
  });

  it('关单必须走 service（由它负责释放排期名额），定时任务不直接碰 Prisma', () => {
    const start = source.indexOf(
      'private async autoCancelExpiredCustomRecipeOrders',
    );
    const fn = source.slice(start, start + 1600);

    expect(fn).toContain('customRecipeService.cancelOrder');
    expect(fn).not.toContain('this.prisma');
  });
});
