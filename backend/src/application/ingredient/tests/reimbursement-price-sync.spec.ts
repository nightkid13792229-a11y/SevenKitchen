/**
 * 报销价格变更同步（2026-11-14）
 *
 * 事故背景：BX202611140001 被驳回后，它的 8 条价格变更记录以 REJECTED 状态留在库里。
 * `ingredient_price_change.purchase_record_id` 是全局唯一键，旧实现重提时只按
 * 「当前报销单」删旧记录，于是同一批采购明细再建一次就撞唯一约束：
 * 报销单其实已经建好，接口却报 500，用户重试又被「已关联到报销单」拦住。
 */

import { IngredientPricingService } from '../ingredient-pricing.service';

const INGREDIENT_ID = 'ing-1';
const RECORD_ID = 'rec-1';

function buildService() {
  const prisma: any = {
    ingredientPriceChange: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const ingredientRepository: any = {
    findByIds: jest.fn().mockResolvedValue([
      {
        id: INGREDIENT_ID,
        name: '胡萝卜',
        purchaseToBaseRatio: 1,
        type: 'MEAT',
        purchaseUnit: 'kg',
        currentPricePerPurchaseUnit: 2.5,
        getEffectivePricePerPurchaseUnit: () => 2.5,
      },
    ]),
  };

  const purchaseRecordRepository: any = {
    findByPurchaseListId: jest.fn().mockResolvedValue([
      {
        id: RECORD_ID,
        ingredientId: INGREDIENT_ID,
        actualQuantity: 1,
        actualBaseQuantity: 1000,
        actualCost: 2.53,
      },
    ]),
  };

  const service = new IngredientPricingService(
    prisma,
    ingredientRepository,
    purchaseRecordRepository,
    { getGlobalConfig: jest.fn().mockResolvedValue({}) } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, prisma, purchaseRecordRepository };
}

describe('报销价格变更同步', () => {
  it('按采购明细清理旧单留下的 REJECTED 行，再按当前单重建', async () => {
    const { service, prisma } = buildService();

    await service.syncPendingChangesForReimbursement('new-reimb', ['list-1']);

    const where = prisma.ingredientPriceChange.deleteMany.mock.calls[0][0].where;
    // 关键：清理口径挂在采购明细上，而不是只挂当前报销单
    expect(where.purchaseRecordId).toEqual({ in: [RECORD_ID] });
    expect(where.status).toEqual({ in: ['PENDING', 'REJECTED'] });
    expect(where.OR).toEqual([
      { reimbursementId: 'new-reimb' },
      { status: 'REJECTED' },
    ]);

    const rows = prisma.ingredientPriceChange.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reimbursementId: 'new-reimb',
      purchaseRecordId: RECORD_ID,
    });
  });

  it('传了事务客户端时就只走这个客户端，不再落到主连接', async () => {
    const { service, prisma } = buildService();
    const tx: any = {
      ingredientPriceChange: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    await service.syncPendingChangesForReimbursement('r-1', ['list-1'], tx);

    expect(prisma.ingredientPriceChange.deleteMany).not.toHaveBeenCalled();
    expect(prisma.ingredientPriceChange.createMany).not.toHaveBeenCalled();
    expect(tx.ingredientPriceChange.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.ingredientPriceChange.createMany).toHaveBeenCalledTimes(1);
  });

  it('清单没有采购记录时只清当前单，不建新行', async () => {
    const { service, prisma, purchaseRecordRepository } = buildService();
    purchaseRecordRepository.findByPurchaseListId.mockResolvedValue([]);

    await service.syncPendingChangesForReimbursement('r-1', ['list-1']);

    const where = prisma.ingredientPriceChange.deleteMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      reimbursementId: 'r-1',
      status: { in: ['PENDING', 'REJECTED'] },
    });
    expect(prisma.ingredientPriceChange.createMany).not.toHaveBeenCalled();
  });
});
