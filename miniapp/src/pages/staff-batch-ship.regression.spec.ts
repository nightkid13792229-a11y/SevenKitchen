import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 合并 / 拆包发货（2026-11-07）。
 *
 * 这些断言是给「以后别手滑改坏」用的：页面、入口、接口路径、分摊口径。
 */
const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const pagesJson = read('src/pages.json');
const listSource = read('src/pages/staff-orders/index.vue');
const batchSource = read('src/pages/staff-orders/batch-ship.vue');
const detailSource = read('src/pages/staff-orders/detail.vue');
const customerSource = read('src/pages/order-detail/index.vue');

describe('合并 / 拆包发货', () => {
  it('★ 「发货单」页已注册，能从列表跳进来', () => {
    expect(pagesJson).toContain('"path": "batch-ship"');
    expect(listSource).toContain('/pages/staff-orders/batch-ship?orderIds=');
  });

  it('★ 列表只有点了「合并发货」才进选择态，平时不打扰', () => {
    expect(listSource).toContain('mergeMode');
    expect(listSource).toContain('toggleMergeMode');
    // 非选择态点卡片还是进详情
    expect(listSource).toContain('viewOrderDetail(order.id)');
    // 只有待发货的单能勾
    expect(listSource).toContain("['PAID', 'FREEZING'].includes(order.status)");
  });

  it('★ 发货单页：默认 1 个包裹、能再拆、最多 6 个', () => {
    expect(batchSource).toContain('再拆一个包裹');
    expect(batchSource).toContain('packages.value.length >= 6');
    // 默认把全部袋装进第 1 个包裹
    expect(batchSource).toContain('bags[row.key] = row.totalBags');
  });

  it('★ 提交打的是「一票发货」接口，带包裹与袋数', () => {
    expect(batchSource).toContain("url: '/admin/order-shipments'");
    expect(batchSource).toContain('actualShippingFee: Number(pkg.fee)');
    expect(batchSource).toContain('specG: row.specG');
    expect(batchSource).toContain('bags: pkg.bags[row.key]');
  });

  it('★ 袋数没装完不许提交', () => {
    expect(batchSource).toContain('unassignedBags');
    expect(batchSource).toContain('还有 ${unassignedBags.value} 袋没装');
  });

  it('★ 详情页有票就按包裹列，没票还是老样子', () => {
    expect(detailSource).toContain('/shipment');
    expect(detailSource).toContain('shipment.packages');
    expect(detailSource).toContain('本单承担运费');
    // 改运费：有包裹改包裹，老订单仍改订单
    expect(detailSource).toContain('/admin/order-shipments/packages/');
    expect(detailSource).toContain('/shipping-fee');
  });

  it('★ 顾客端多包裹时逐个单号，不显示运费', () => {
    expect(customerSource).toContain('customerPackages');
    expect(customerSource).toContain('分了 {{ customerPackages.length }} 个包裹');
    expect(customerSource).toContain('copyPackageTracking');
    // 顾客端不能出现「实际运费」字样
    expect(customerSource).not.toContain('实际运费');
  });
});
