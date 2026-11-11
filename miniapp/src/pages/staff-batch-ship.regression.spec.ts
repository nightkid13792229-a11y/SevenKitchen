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
const orderCenterSource = read('src/pages/staff-order-center/index.vue');
const batchSource = read('src/pages/staff-orders/batch-ship.vue');
const detailSource = read('src/pages/staff-orders/detail.vue');
const customerSource = read('src/pages/order-detail/index.vue');

describe('合并 / 拆包发货', () => {
  it('★ 「发货单」页已注册，能从订单中心跳进来（旧后台订单页已无入口）', () => {
    expect(pagesJson).toContain('"path": "batch-ship"');
    expect(orderCenterSource).toContain('/pages/staff-orders/batch-ship?orderIds=');
    // 2026-11-10：旧「后台订单」列表页已下线，入口只由订单中心守
  });

  it('★ 列表只有点了「合并发货」才进选择态，平时不打扰', () => {
    expect(orderCenterSource).toContain('mergeMode');
    expect(orderCenterSource).toContain('toggleMergeMode');
    // 非选择态点卡片还是进详情
    expect(orderCenterSource).toContain('@tap="onCardTap(item)"');
    expect(orderCenterSource).toContain('/pages/staff-orders/detail?id=');
    // 只有待发货的鲜食能勾（后端 TO_SHIP 已含试吃装 PAID）
    expect(orderCenterSource).toContain("item.statusGroup === 'TO_SHIP'");
  });

  it('★ 发货单页：默认 1 个包裹、能再拆、最多 6 个', () => {
    expect(batchSource).toContain('再拆一个包裹');
    expect(batchSource).toContain('packages.value.length >= 6');
    // 默认把全部袋装进第 1 个包裹
    expect(batchSource).toContain('bags[row.key] = row.totalBags');
  });

  it('★ 提交打的是「一票发货」接口，带包裹与袋数', () => {
    expect(batchSource).toContain("url: '/admin/order-shipments'");
    expect(batchSource).toContain('actualShippingFee: parseShipFee(pkg.fee).value');
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

/**
 * 2026-11-11：发货表单合并第 3 步 —— 合并/拆包页也换用同一套零件。
 * 页面形态（多包裹、分袋、分摊运费）保持原样，只共用「寄给谁」与运费校验。
 */
describe('合并发货页 · 复用发货公共零件', () => {
  const drawerSource = readFileSync(
    resolve(root, 'src/components/shipping/StaffShipDrawer.vue'),
    'utf8',
  )

  it('顶部显示顾客 / 狗狗 / 收货地址（与发货抽屉同一个组件）', () => {
    expect(batchSource).toContain('<ShipRecipientSummary')
    expect(batchSource).toContain(':address="shipAddress"')
    expect(drawerSource).toContain('<ShipRecipientSummary')
  })

  it('★ 同顾客不同地址：页面提前拦住，不让员工先装完再被后台拒', () => {
    expect(batchSource).toContain('const addressMismatch = computed')
    expect(batchSource).toContain('orderAddressKey(order?.address)')
    expect(batchSource).toContain('这几单收货地址不一样，不能合并发货')
    expect(batchSource).toContain('addressMismatch.value')
  })

  it('运费校验走同一份规则（必填 + 两位小数）', () => {
    expect(batchSource).toContain('parseShipFee(pkg.fee)')
    expect(drawerSource).toContain('parseShipFee(actualShippingFeeDraft.value)')
  })
})
