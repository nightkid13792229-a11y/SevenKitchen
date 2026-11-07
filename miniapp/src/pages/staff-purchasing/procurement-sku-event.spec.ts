import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildSkuCreateQuery,
  canAutoMatchSku,
  isSkuCreatedFor,
  normalizeSkuCreateSource,
} from './procurement-sku-event';

/**
 * 「新增采购商品」是 uni.$emit 全应用广播：页面被压在栈里也收得到。
 * 2026-11-06 老板撞到的现象：识别结果页新建了「盒马 280g 猪里脊」，
 * 下面的日采清单详情页收到广播就把「添加采购记录」抽屉打开了；
 * 员工确认生成记录、退回详情页，看到一个自己没点过的抽屉。
 * 广播必须带发起方，只有发起新建的那个页面才处理。
 */
describe('新增采购商品广播 · 只回发起方', () => {
  it('发起方能收到自己的广播', () => {
    expect(isSkuCreatedFor({ from: 'detail' }, 'detail')).toBe(true);
    expect(isSkuCreatedFor({ from: 'order-import' }, 'order-import')).toBe(true);
    expect(isSkuCreatedFor({ from: 'record-form' }, 'record-form')).toBe(true);
  });

  it('不是发起方就不处理（含识别结果页新建 → 详情页不弹抽屉）', () => {
    expect(isSkuCreatedFor({ from: 'order-import' }, 'detail')).toBe(false);
    expect(isSkuCreatedFor({ from: 'detail' }, 'order-import')).toBe(false);
    expect(isSkuCreatedFor({ from: 'record-form' }, 'detail')).toBe(false);
  });

  it('没有 from 的旧广播谁都不认，避免再误开抽屉', () => {
    expect(isSkuCreatedFor({ ingredientId: 'x', skuId: 'y' }, 'detail')).toBe(false);
    expect(isSkuCreatedFor({}, 'order-import')).toBe(false);
    expect(isSkuCreatedFor(null, 'record-form')).toBe(false);
  });

  it('来源只认三个页面，其它值一律丢弃', () => {
    expect(normalizeSkuCreateSource('detail')).toBe('detail');
    expect(normalizeSkuCreateSource(' order-import ')).toBe('order-import');
    expect(normalizeSkuCreateSource('record-form')).toBe('record-form');
    expect(normalizeSkuCreateSource('')).toBe('');
    expect(normalizeSkuCreateSource(undefined)).toBe('');
    expect(normalizeSkuCreateSource('other-page')).toBe('');
  });

  it('带来源的跳转参数格式统一', () => {
    expect(buildSkuCreateQuery('detail')).toBe('from=detail');
    expect(buildSkuCreateQuery('order-import')).toBe('from=order-import');
  });
});

describe('四个页面按来源接广播（回归：确认后误弹抽屉）', () => {
  const read = (path: string): string =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');

  it('识别结果页新建商品时带上自己的来源，并且只处理自己的广播', () => {
    const source = read('src/pages/staff-purchasing/order-import/review.vue');
    expect(source).toContain("buildSkuCreateQuery('order-import')");
    expect(source).toContain("isSkuCreatedFor(payload, 'order-import')");
  });

  it('详情页只在它是发起方时才打开「添加采购记录」抽屉', () => {
    const source = read('src/pages/staff-purchasing/detail.vue');
    expect(source).toContain("buildSkuCreateQuery('detail')");
    expect(source).toContain("isSkuCreatedFor(payload, 'detail')");
  });

  it('独立的采购记录页也按来源过滤', () => {
    const source = read('src/pages/staff-purchasing/record-form.vue');
    expect(source).toContain("buildSkuCreateQuery('record-form')");
    expect(source).toContain("isSkuCreatedFor(payload, 'record-form')");
  });

  it('新增商品页把来源原样广播回去', () => {
    const source = read('src/pages/staff-purchasing/procurement-sku-create.vue');
    expect(source).toContain('normalizeSkuCreateSource');
    expect(source).toContain('from: createSource');
  });
});

/**
 * 2026-11-07：识别结果页新建商品，保存后要自动匹配回原来那一行。
 * 为此广播要多带两样东西：是**哪一行**（lineId）和**建好的商品**（sku），
 * 少了任何一个就只能退回「刷新一下、你自己再挑」的老样子。
 */
describe('新增商品广播 · 带回去匹配哪一行', () => {
  const read = (path: string): string =>
    readFileSync(resolve(process.cwd(), path), 'utf-8');

  it('新建商品页把 lineId 和商品摘要一起广播回去', () => {
    const source = read('src/pages/staff-purchasing/procurement-sku-create.vue');
    expect(source).toContain('lineId: createForLineId');
    expect(source).toContain('sku: result?.sku');
    expect(source).toContain("createForLineId = String(options?.lineId || '')");
  });

  it('识别结果页跳新建时带上这一行的 id', () => {
    const source = read('src/pages/staff-purchasing/order-import/review.vue');
    expect(source).toContain('`&lineId=${encodeURIComponent(fromLineId)}`');
    expect(source).toContain("const fromLineId = String(editing.value?.id || '')");
  });

  it('收到广播后自动匹配，而不是只刷新', () => {
    const source = read('src/pages/staff-purchasing/order-import/review.vue');
    expect(source).toContain('applyPendingSkuMatch');
    expect(source).toContain('updateOrderImportLine(owner.id, pending.lineId');
    expect(source).toContain("已匹配刚新建的商品");
  });
});

describe('新建的商品能不能直接挂到这笔上', () => {
  it('同一个渠道可以', () => {
    expect(canAutoMatchSku('沃尔玛', '沃尔玛')).toBe(true);
    expect(canAutoMatchSku(' 沃尔玛 ', '沃尔玛')).toBe(true);
  });

  it('渠道不同就不挂（同一件东西在两家是两个商品）', () => {
    expect(canAutoMatchSku('盒马鲜生', '沃尔玛')).toBe(false);
  });

  it('有一边空着（渠道没确认 / 老数据没填）时先放过去', () => {
    expect(canAutoMatchSku('', '沃尔玛')).toBe(true);
    expect(canAutoMatchSku('沃尔玛', null)).toBe(true);
    expect(canAutoMatchSku(undefined, undefined)).toBe(true);
  });
});
