/**
 * 锅的配方快照：订单锅走引用、备货锅走自带快照
 *
 * 2026-10-28 的教训：锅复制了订单快照，上游修正后锅不跟，只能删批次重排。
 * 改成引用后，「修一次 = 全链路生效」，这里把两条读取路径钉死。
 */
import { PrismaProductionRepository } from '../../../src/infrastructure/repositories/prisma-production.repository';
import { PackagingUnit } from '../../../src/domain/production/packaging-unit.entity';
import { ProductionBatch } from '../../../src/domain/production/production-batch.entity';
import {
  PackagingUnitStatus,
  ProductionBatchStatus,
} from '../../../src/domain/production/enums';

describe('PrismaProductionRepository · 配方快照引用', () => {
  const orderSnapshot = {
    id: 'recipe-from-order',
    name: '提莫 · 猪里脊鲜食',
    version: 1,
    production_loss_rate: 1.05,
    items: [{ ingredient_id: 'ing-pork', name: '猪里脊', ratio: 27.56 }],
  };

  function baseUnit(overrides: Record<string, unknown> = {}) {
    return {
      id: 'unit-1',
      productionBatchId: 'batch-1',
      recipeSnapshot: null,
      recipeSnapshotRefOrderItemId: 'oi-1',
      totalProductionG: 1050,
      sourceOrderItemIds: ['oi-1'],
      createdAt: new Date('2026-10-29T05:00:00.000Z'),
      status: 'PENDING',
      photosCooked: [],
      photosPortioned: [],
      photosRaw: [],
      resultPhotoUrls: [],
      ingredientsUsageSnapshot: null,
      stockPortionPlan: null,
      updatedAt: new Date('2026-10-29T05:00:00.000Z'),
      ...overrides,
    };
  }

  function baseBatch(units: any[]) {
    return {
      id: 'batch-1',
      productionDate: new Date('2026-10-29T04:00:00.000Z'),
      status: 'IN_PRODUCTION',
      packagingUnits: units,
      createdAt: new Date('2026-10-29T05:00:00.000Z'),
      plannedOutputG: null,
      actualOutputG: null,
      surplusG: 0,
      shortageG: 0,
      actualCost: null,
      costSettlementSnapshot: null,
      completedAt: null,
      source: 'ORDER',
      tastingPackProductionPlanId: null,
    };
  }

  function buildRepository() {
    const prisma = {
      productionBatch: { findUnique: jest.fn() },
      orderItem: { findMany: jest.fn() },
    } as any;
    return { prisma, repository: new PrismaProductionRepository(prisma) };
  }

  it('订单锅：配方从来源订单明细取，自己身上没有副本', async () => {
    const { prisma, repository } = buildRepository();
    prisma.productionBatch.findUnique.mockResolvedValue(
      baseBatch([baseUnit()]),
    );
    prisma.orderItem.findMany.mockResolvedValue([
      { id: 'oi-1', recipeSnapshot: orderSnapshot },
    ]);

    const batch = await repository.findById('batch-1');

    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['oi-1'] } },
      }),
    );
    const unit = batch?.packagingUnits[0];
    expect(unit?.recipeSnapshotRefOrderItemId).toBe('oi-1');
    expect((unit?.recipeSnapshot as any)?.id).toBe('recipe-from-order');
  });

  it('备货锅：没有引用时读自己存的快照', async () => {
    const { prisma, repository } = buildRepository();
    const stockSnapshot = { id: 'recipe-stock', name: '试吃装', items: [] };
    prisma.productionBatch.findUnique.mockResolvedValue(
      baseBatch([
        baseUnit({
          id: 'unit-stock',
          recipeSnapshotRefOrderItemId: null,
          recipeSnapshot: stockSnapshot,
          sourceOrderItemIds: [],
          stockPortionPlan: { packageSpecG: 50, packageCount: 20 },
        }),
      ]),
    );

    const batch = await repository.findById('batch-1');

    expect(prisma.orderItem.findMany).not.toHaveBeenCalled();
    expect((batch?.packagingUnits[0].recipeSnapshot as any)?.id).toBe(
      'recipe-stock',
    );
  });

  it('引用指向的订单明细丢失时不抛错，退回空快照', async () => {
    const { prisma, repository } = buildRepository();
    prisma.productionBatch.findUnique.mockResolvedValue(
      baseBatch([baseUnit()]),
    );
    prisma.orderItem.findMany.mockResolvedValue([]);

    const batch = await repository.findById('batch-1');

    expect(batch?.packagingUnits[0].recipeSnapshot).toEqual({});
  });

  it('保存时：订单锅写引用、不写整份快照', async () => {
    const { prisma, repository } = buildRepository();
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.$transaction = jest.fn(async (callback: any) =>
      callback({
        productionBatch: { create: jest.fn().mockResolvedValue({}) },
        packagingUnit: { createMany },
      }),
    );
    // 第一次查存在性（不存在）；保存后回读（返回带引用的锅）
    prisma.productionBatch.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(baseBatch([baseUnit()]));
    prisma.orderItem.findMany.mockResolvedValue([
      { id: 'oi-1', recipeSnapshot: orderSnapshot },
    ]);

    const unit = new PackagingUnit(
      'unit-1',
      'batch-1',
      orderSnapshot as any,
      1050,
      ['oi-1'],
      new Date('2026-10-29T05:00:00.000Z'),
      PackagingUnitStatus.PENDING,
    );
    unit.recipeSnapshotRefOrderItemId = 'oi-1';
    const batch = new ProductionBatch(
      'batch-1',
      new Date('2026-10-29T04:00:00.000Z'),
      ProductionBatchStatus.IN_PRODUCTION,
      [unit],
      new Date('2026-10-29T05:00:00.000Z'),
    );

    await repository.save(batch);

    const payload = createMany.mock.calls[0][0].data[0];
    expect(payload.recipeSnapshot).toBeNull();
    expect(payload.recipeSnapshotRefOrderItemId).toBe('oi-1');
  });
});
