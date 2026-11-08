import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 采购商品初始价历史的“入口守卫”（2026-11-08 复核）。
 *
 * 这个 bug 已经补过三次（2026-04-19 两次、2026-11-08 一次）：某条建 SKU 的
 * 路径只写 procurement_sku、不写 procurement_sku_price_history，SKU 的
 * 「价格历史」就是空表。
 *
 * 这里不测某个具体路径，而是扫 src 下所有出现 `procurementSku.create` 的文件，
 * 要求同一文件里也有 `procurementSkuPriceHistory.create`。新增建 SKU 的入口
 * 如果忘了写历史，这条测试会直接红，而不是等到用户发现空表。
 */
describe('采购商品初始价历史 · 所有建 SKU 路径都要写历史', () => {
  it('每个 procurementSku.create 所在文件都有 procurementSkuPriceHistory.create', () => {
    const srcRoot = resolve(__dirname, '../../../src');
    const output = execFileSync(
      'grep',
      ['-rl', 'procurementSku.create', srcRoot],
      { encoding: 'utf8' },
    ).trim();

    const files = output ? output.split('\n') : [];
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('procurementSkuPriceHistory.create');
    }
  });
});
