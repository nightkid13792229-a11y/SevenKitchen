jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import {
  PurchaseList,
  PurchaseListConstructor,
} from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

const base: PurchaseListConstructor = {
  targetDate: new Date('2026-11-10T12:00:00'),
  kind: PurchaseListKind.STOCK_REPLENISHMENT,
  totalEstimatedCost: 0,
  itemCount: 0,
  createdById: 'user-1',
  sourceOrderIds: [],
};

describe('PurchaseList · 补货记录字段', () => {
  it('allows an empty draft replenishment record', () => {
    const list = new PurchaseList({ ...base, isDraft: true });

    expect(list.isDraft).toBe(true);
    expect(list.itemCount).toBe(0);
    expect(list.items).toEqual([]);
  });

  it('still rejects an empty non-draft list', () => {
    expect(() => new PurchaseList({ ...base })).toThrow(
      'Item count must be positive',
    );
  });

  it('round-trips replenishment amount and order fields', () => {
    const list = new PurchaseList({
      ...base,
      isDraft: true,
      orderNo: '261109957522606982',
      channel: 'HEMA',
      orderPlacedAt: new Date('2026-11-09T10:50:10'),
      expectedDeliveryAt: new Date('2026-11-10T20:00:00'),
      paidAmount: 113.03,
      personalAmount: 0,
      reimbursementAmount: 113.03,
      discountAmount: 1.2,
    });

    const prisma = list.toPrisma();

    expect(prisma.orderNo).toBe('261109957522606982');
    expect(prisma.channel).toBe('HEMA');
    expect(prisma.paidAmount).toBe(113.03);
    expect(prisma.personalAmount).toBe(0);
    expect(prisma.reimbursementAmount).toBe(113.03);
    expect(prisma.isDraft).toBe(true);
  });

  it('converts Prisma Decimal values from the database to numbers', () => {
    const decimal = (value: string) => ({ toString: () => value });

    const list = PurchaseList.fromPrisma({
      id: 'list-1',
      targetDate: new Date('2026-11-10T12:00:00'),
      kind: PurchaseListKind.STOCK_REPLENISHMENT,
      status: PurchaseListStatus.COMPLETED,
      totalEstimatedCost: decimal('53.98'),
      itemCount: 1,
      createdById: 'user-1',
      sourceOrderIds: [],
      isDraft: false,
      subtotalAmount: decimal('53.98'),
      shippingFee: decimal('0.00'),
      packagingFee: decimal('1.20'),
      discountAmount: decimal('0.00'),
      paidAmount: decimal('55.18'),
      personalAmount: decimal('0.00'),
      reimbursementAmount: decimal('55.18'),
      items: [
        {
          id: 'item-1',
          purchaseListId: 'list-1',
          ingredientId: 'ingredient-1',
          ingredientName: '青花鱼',
          quantityNeeded: 2,
          quantityUnit: '袋',
          estimatedCost: decimal('53.98'),
        },
      ],
    });

    expect(list.paidAmount).toBe(55.18);
    expect(list.reimbursementAmount).toBe(55.18);
    expect(list.packagingFee).toBe(1.2);
    expect(list.arrivedAt).toBeNull();
    expect(list.voidedAt).toBeNull();
  });
});
