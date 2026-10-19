import { BadRequestException } from '@nestjs/common';
import { SupplementInventoryService } from '../../../src/application/supplement-shop/supplement-inventory.service';

describe('SupplementInventoryService', () => {
  const prisma: any = {};
  let service: SupplementInventoryService;

  beforeEach(() => {
    process.env.SUPPLEMENT_INVENTORY_RESERVATION_ENABLED = 'true';
    service = new SupplementInventoryService(prisma);
  });

  it('平勺按 PCS 1:1 换算，不换算成克', async () => {
    await expect(service.toBaseQuantity('平勺', 2, 'PCS', '海藻粉')).resolves.toBe(2);
    await expect(service.toBaseQuantity('g', 2.1, 'G', '海藻粉')).resolves.toBe(2.1);
    await expect(service.toBaseQuantity('ml', 5, 'ML', '液体')).resolves.toBe(5);
    await expect(service.toBaseQuantity('片', 3, 'PCS', '胆碱片')).resolves.toBe(3);
  });

  it('单位与基准单位不匹配时拒绝', async () => {
    await expect(
      service.toBaseQuantity('平勺', 1, 'G', '海藻粉'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.toBaseQuantity('g', 1, 'PCS', '海藻粉'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('预占：按订单行建 allocation，quantity 是 base unit', async () => {
    const tx: any = {
      supplementOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          status: 'PAID',
          packingDate: new Date('2026-10-21T00:00:00Z'),
          items: [
            {
              ingredientId: 'i1',
              name: '海藻粉',
              unit: '平勺',
              packedAmount: 1,
              bags: 2,
            },
          ],
        }),
      },
      inventoryAllocation: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
      inventoryAllocationLine: { createMany: jest.fn().mockResolvedValue({}) },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', name: '海藻粉', baseUnit: 'PCS', unitDisplayLabel: '平勺' },
        ]),
      },
    };

    await service.reserveForOrder(tx, 'o1');

    expect(tx.inventoryAllocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'SUPPLEMENT_PACK',
          sourceOrderIds: ['o1'],
        }),
      }),
    );
    expect(tx.inventoryAllocationLine.createMany).toHaveBeenCalledWith({
      data: [{ allocationId: 'a1', ingredientId: 'i1', quantityG: 2 }],
    });
  });

  it('扣减：写 SUPPLEMENT_PACK_CONSUMPTION ledger 并把 allocation 置 CONSUMED', async () => {
    const tx: any = {
      inventoryAllocation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          lines: [{ ingredientId: 'i1', quantityG: 2 }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      inventoryLedgerEntry: { createMany: jest.fn().mockResolvedValue({}) },
    };

    await service.consumeForOrder(tx, 'o1');

    expect(tx.inventoryLedgerEntry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            ingredientId: 'i1',
            deltaG: -2,
            sourceType: 'SUPPLEMENT_PACK_CONSUMPTION',
            sourceId: 'o1',
          }),
        ],
      }),
    );
    expect(tx.inventoryAllocation.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({ status: 'CONSUMED' }),
    });
  });

  it('没有预占时正常分装拒绝；强制分装允许直接写 ledger', async () => {
    const tx: any = {
      inventoryAllocation: { findFirst: jest.fn().mockResolvedValue(null) },
      supplementOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o1',
          items: [
            {
              ingredientId: 'i1',
              name: '海藻粉',
              unit: '平勺',
              packedAmount: 1,
              bags: 1,
            },
          ],
        }),
      },
      ingredient: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'i1', name: '海藻粉', baseUnit: 'PCS', unitDisplayLabel: '平勺' },
        ]),
      },
      inventoryLedgerEntry: { createMany: jest.fn().mockResolvedValue({}) },
    };

    await expect(service.consumeForOrder(tx, 'o1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await service.consumeForOrder(tx, 'o1', { allowMissing: true });
    expect(tx.inventoryLedgerEntry.createMany).toHaveBeenCalled();
  });
});
