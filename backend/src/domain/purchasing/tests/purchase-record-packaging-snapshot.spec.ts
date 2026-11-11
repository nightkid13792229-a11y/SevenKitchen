jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { PurchaseRecord } from '../purchase-record.entity';

const base = {
  id: 'rec-1',
  purchaseListId: 'list-1',
  purchaseItemId: 'item-1',
  ingredientId: 'ing-1',
  ingredientName: '鸡蛋',
  purchaseChannel: '盒马',
  actualQuantity: 1,
  actualBaseQuantity: 1590,
  actualBaseUnit: 'G',
  actualCost: 19.9,
  inboundVersion: 0,
  purchasedAt: '2026-11-12T00:00:00.000Z',
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const snapshot = {
  links: [{ count: 30, unit: '枚' }],
  amount: 53,
  amountUnit: 'G',
  printedText: '30枚 1.59kg',
};

describe('PurchaseRecord · 包装快照（2026-11-12）', () => {
  it('读出来时保留快照和展示文本', () => {
    const record = PurchaseRecord.fromPrisma({
      ...base,
      packagingSnapshot: snapshot,
      packagingTextSnapshot: '1 盒 = 30 枚 × 53 克',
    });

    expect(record.packagingSnapshot).toEqual(snapshot);
    expect(record.packagingTextSnapshot).toBe('1 盒 = 30 枚 × 53 克');
  });

  it('写回时快照不丢', () => {
    const record = PurchaseRecord.fromPrisma({
      ...base,
      packagingSnapshot: snapshot,
      packagingTextSnapshot: '1 盒 = 30 枚 × 53 克',
    });

    expect(record.toPrisma()).toEqual(
      expect.objectContaining({
        packagingSnapshot: snapshot,
        packagingTextSnapshot: '1 盒 = 30 枚 × 53 克',
      }),
    );
  });
});
