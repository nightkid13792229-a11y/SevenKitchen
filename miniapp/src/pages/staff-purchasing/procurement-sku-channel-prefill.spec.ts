import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'procurement-sku-create.vue'), 'utf8');

/**
 * 从识别结果页「新建采购商品」过来时，商品本来就属于那笔订单的渠道
 * （2026-11-06）。以前不带渠道，进去还得在 17 项里再找一次盒马鲜生，
 * 找漏了商品就没渠道、下次匹配不上。
 *
 * 2026-11-07 收紧：这个入口的渠道**不能改**。改了就等于绕开
 * 「同名同渠道才算重复」的判重，把商品建到别家去，还挂不回这一行。
 */
describe('新建采购商品 · 订单渠道预选与锁定', () => {
  it('读路由上的 channel，并用字典里的那一条预选（认简称）', () => {
    expect(source).toContain('prefillChannel');
    expect(source).toContain('options?.channel');
    expect(source).toContain('form.value.purchaseChannel = requestedChannel');
  });

  it('从识别结果页进来时渠道锁死，点别的渠道无效', () => {
    expect(source).toContain("channelLocked.value = createSource === 'order-import'");
    expect(source).toContain('if (channelLocked.value) return;');
    expect(source).toContain('本单渠道');
  });

  it('保存时带上识别记录，服务端还会再校验一次渠道', () => {
    expect(source).toContain('options?.importId');
    expect(source).toContain('orderImportId: createOrderImportId');
  });
});
