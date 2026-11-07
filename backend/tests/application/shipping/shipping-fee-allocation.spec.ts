import {
  allocatePackageFee,
  allocateShipmentFees,
} from 'src/application/shipping/shipping-fee-allocation';

/**
 * 运费分摊（2026-11-07 合并 / 拆包）。
 *
 * 老板拍板的规则：按净重占比、零头落在排序最后一单、各单相加必须等于实付运费。
 */
describe('运费分摊 · allocatePackageFee', () => {
  const sum = (rows: Array<{ allocatedFee: number }>) =>
    Math.round(rows.reduce((total, row) => total + row.allocatedFee, 0) * 100) /
    100;

  it('★ 两单合并：20.00 按 1.54 : 2.64 分成 7.37 / 12.63', () => {
    const rows = allocatePackageFee(20, [
      { orderId: 'A', weightG: 1540 },
      { orderId: 'B', weightG: 2640 },
    ]);

    expect(rows.map((row) => row.allocatedFee)).toEqual([7.37, 12.63]);
    expect(sum(rows)).toBe(20);
  });

  it('★ 除不尽：10.00 分三单，零头只落最后一单，合计仍然精确', () => {
    const rows = allocatePackageFee(10, [
      { orderId: 'A', weightG: 1000 },
      { orderId: 'B', weightG: 1000 },
      { orderId: 'C', weightG: 1000 },
    ]);

    expect(sum(rows)).toBe(10);
    // 10 / 3 = 3.333…：两个 3.33，最后一单 3.34
    expect(rows.map((row) => row.allocatedFee)).toEqual([3.33, 3.33, 3.34]);
  });

  it('零头只看重量排序，跟传参顺序无关', () => {
    const rows = allocatePackageFee(10, [
      { orderId: 'C', weightG: 1000 },
      { orderId: 'A', weightG: 1000 },
      { orderId: 'B', weightG: 1000 },
    ]);

    // 同重量按订单 id 排：A、B、C → 最后是 C
    const byId = Object.fromEntries(
      rows.map((row) => [row.orderId, row.allocatedFee]),
    );
    expect(byId.C).toBe(3.34);
    expect(byId.A).toBe(3.33);
    expect(sum(rows)).toBe(10);
  });

  it('一个包裹只有一单：运费全给它', () => {
    const rows = allocatePackageFee(12, [{ orderId: 'A', weightG: 770 }]);
    expect(rows).toEqual([{ orderId: 'A', weightG: 770, allocatedFee: 12 }]);
  });

  it('0 元包裹不报错，各单都是 0', () => {
    const rows = allocatePackageFee(0, [
      { orderId: 'A', weightG: 500 },
      { orderId: 'B', weightG: 500 },
    ]);
    expect(rows.map((row) => row.allocatedFee)).toEqual([0, 0]);
  });

  it('重量全是 0（脏数据）时按单数平分，不抛错', () => {
    const rows = allocatePackageFee(1, [
      { orderId: 'A', weightG: 0 },
      { orderId: 'B', weightG: 0 },
    ]);
    expect(sum(rows)).toBe(1);
  });
});

describe('运费分摊 · allocateShipmentFees', () => {
  it('★ 一单拆两包：订单拿两包之和', () => {
    const result = allocateShipmentFees([
      { totalFee: 20, items: [{ orderId: 'A', weightG: 770 }, { orderId: 'B', weightG: 2640 }] },
      { totalFee: 12, items: [{ orderId: 'A', weightG: 770 }] },
    ]);

    expect(result.orderTotals.B).toBe(15.48);
    expect(result.orderTotals.A).toBe(16.52);
    expect(
      Math.round(
        (result.orderTotals.A + result.orderTotals.B) * 100,
      ) / 100,
    ).toBe(32);
  });

  it('★ 不变量：所有订单加起来 = 所有包裹运费加起来', () => {
    const result = allocateShipmentFees([
      { totalFee: 9.99, items: [{ orderId: 'A', weightG: 333 }, { orderId: 'B', weightG: 667 }] },
      { totalFee: 6.01, items: [{ orderId: 'B', weightG: 500 }, { orderId: 'C', weightG: 500 }] },
      { totalFee: 3.33, items: [{ orderId: 'A', weightG: 100 }] },
    ]);

    const orderTotal =
      Math.round(
        Object.values(result.orderTotals).reduce((sum, value) => sum + value, 0) *
          100,
      ) / 100;

    expect(orderTotal).toBe(19.33);
  });

  it('同一订单在一个包裹里有多行（多规格）也按行分、再汇总', () => {
    const result = allocateShipmentFees([
      {
        totalFee: 20,
        items: [
          { orderId: 'A', weightG: 1100 },
          { orderId: 'A', weightG: 2500 },
        ],
      },
    ]);

    expect(result.orderTotals.A).toBe(20);
  });
});
