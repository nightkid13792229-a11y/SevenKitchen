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

  it('★ 抵扣含运费（2026-10-18 · V1 推翻了 09-25 的"只抵货款"）', () => {
    /**
     * ⚠️ **这是一次需求覆盖，不是放松守卫。**
     *
     * 09-25 的决定是「只抵货款，不抵运费」，本用例当初就是锁它的。
     * 2026-10-17 的 **V1** 明确推翻：
     *   "不要做复杂了，就是抵扣额度可以用于减免用户最终在成品订单中支付的总费用"
     *
     * 也就是**含运费**。所以现在允许 `shippingFee - creditAppliedToShipping`。
     *
     * **但原守卫真正在意的那条不变量没变**：
     * `货款 + 运费 = 总额` 必须仍然成立（退款/结算/报表都按这个读）。
     */
    const start = source.indexOf('const netProductAmount =');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start - 800, start + 900);

    // 抵扣先抵货款、抵不完再抵运费
    expect(block).toContain('creditAppliedToProduct');
    expect(block).toContain('creditAppliedToShipping');
    expect(block).toContain('shippingFee - creditAppliedToShipping');

    // ★ 不变量：总额 = 净货款 + 净运费（不能被拆坏）
    expect(block).toContain('netProductAmount + netShippingAmount');
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
