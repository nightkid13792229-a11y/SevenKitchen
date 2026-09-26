import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 定制费抵扣成品货款 · 下单链路回归（2026-09-25）
 *
 * 这条链路动的是"钱"，有几个**跑不出来但一错就出事**的结构约定，
 * 用源码断言锁住（与补剂/定制的自动关单回归同一思路）。
 */
describe('定制费抵扣 · 下单链路', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/application/order/order.service.ts'),
    'utf-8',
  );

  it('只抵货款，运费不参与抵扣', () => {
    const start = source.indexOf('const netProductAmount =');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, start + 600);

    // 净货款 = 原货款 − 抵扣；运费原样进入总额
    expect(block).toContain('pricing.productPrice - customRecipeCredit.applied');
    expect(block).toContain('netProductAmount + shippingFee');
    // 运费行不能被抵扣污染
    expect(block).not.toContain('shippingFee -');
    expect(block).not.toContain('shippingFee + customRecipeCredit');
  });

  it('成本口径的原始货款不被抵扣改写', () => {
    // pricingBreakdown.productPrice 是成本与毛利的解释基准，
    // 改掉它会让毛利看起来凭空少了一笔抵扣，对不上账
    const breakdownStart = source.indexOf('pricingBreakdown: {', source.indexOf('const pricingResult = {'));
    expect(breakdownStart).toBeGreaterThan(-1);
    const block = source.slice(breakdownStart, breakdownStart + 700);

    expect(block).toContain('productPrice: pricing.productPrice');
    expect(block).not.toContain('productPrice: netProductAmount');
  });

  it('下单以快照为准，不重新算抵扣', () => {
    // 重新计算会出现"页面看到 300、实付抵 100"的错位
    expect(source).toContain('readCustomRecipeCreditFromSnapshot');
    expect(source).toContain('creditAmountApplied');
  });

  it('⚠️ 先扣额度、再落订单，落单失败要把额度还回去', () => {
    const consumeIdx = source.indexOf('consumeCredit({');
    const saveIdx = source.indexOf('await this.orderRepository.save(order)', consumeIdx);
    expect(consumeIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(consumeIdx);

    // save 之后必须能在 catch 里归还额度
    const catchIdx = source.indexOf('落单失败后归还抵扣额度也失败', saveIdx);
    expect(catchIdx).toBeGreaterThan(saveIdx);
    expect(source.slice(saveIdx, catchIdx)).toContain('restoreCredit({');
  });

  it('抵扣查询失败不能让报价整体失败（降级为不抵扣）', () => {
    const start = source.indexOf('const customRecipeCredit = isDiySheetPreview');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, start + 700);

    expect(block).toContain('.catch(');
    expect(block).toContain('return null');
  });

  it('DIY 制作单不参与抵扣（它不产生订单）', () => {
    expect(source).toContain('const customRecipeCredit = isDiySheetPreview');
  });
});
