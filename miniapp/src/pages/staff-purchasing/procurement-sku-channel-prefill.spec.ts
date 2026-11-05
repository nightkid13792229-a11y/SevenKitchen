import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'procurement-sku-create.vue'), 'utf8');

/**
 * 从识别结果页「新建采购商品」过来时，商品本来就属于那笔订单的渠道
 * （2026-11-06）。以前不带渠道，进去还得在 17 项里再找一次盒马鲜生，
 * 找漏了商品就没渠道、下次匹配不上。
 */
describe('新建采购商品 · 预选订单渠道', () => {
  it('读路由上的 channel，并用字典里的那一条预选（认简称）', () => {
    expect(source).toContain("prefillChannel");
    expect(source).toContain("options?.channel");
    expect(source).toContain("form.value.purchaseChannel = requestedChannel");
  });

  it('预选只是默认值，员工还能改（不是锁死）', () => {
    expect(source).toContain('const selectChannel');
  });
});
