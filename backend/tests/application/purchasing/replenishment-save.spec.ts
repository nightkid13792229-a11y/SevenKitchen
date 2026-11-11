import { BadRequestException } from '@nestjs/common';
import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const createDraft = () =>
  new PurchaseList({
    id: 'draft-1',
    targetDate: new Date('2026-11-10T12:00:00'),
    kind: PurchaseListKind.STOCK_REPLENISHMENT,
    status: PurchaseListStatus.PENDING,
    totalEstimatedCost: 0,
    itemCount: 0,
    createdById: 'user-1',
    sourceOrderIds: [],
    isDraft: true,
  });

const createImport = (lines: any[]): any => ({
  id: 'import-1',
  purchaseListId: 'draft-1',
  status: 'DRAFT',
  channel: '盒马鲜生',
  orderNo: '261109957522606982',
  orderTime: new Date('2026-11-09T10:50:10'),
  subtotal: 52.78,
  shippingFee: 0,
  packagingFee: 1.2,
  paid: 53.98,
  imageKeys: [],
  lines,
});

const createService = (options: {
  draft: PurchaseList;
  importRow: any;
  itemRows?: any[];
}) => {
  const repository = {
    findById: jest.fn().mockResolvedValue(options.draft),
    save: jest.fn(async (list: any) => list),
  };
  const prisma: any = {
    purchaseOrderImport: {
      findMany: jest.fn().mockResolvedValue([options.importRow]),
    },
    purchaseOrderImportLine: { update: jest.fn().mockResolvedValue({}) },
    purchaseItem: {
      create: jest.fn().mockResolvedValue({ id: 'item-1' }),
      findMany: jest.fn().mockResolvedValue(options.itemRows ?? []),
    },
    procurementSku: { findUnique: jest.fn() },
    ingredient: { findUnique: jest.fn() },
  };
  const importService = { confirm: jest.fn().mockResolvedValue({}) };
  const recordRepository = {
    findByPurchaseListId: jest.fn().mockResolvedValue([]),
  };
  const inventory = {
    inboundFromPurchaseRecords: jest
      .fn()
      .mockResolvedValue({ createdCount: 0, skippedCount: 0 }),
  };
  const service = new ReplenishmentService(
    repository as any,
    recordRepository as any,
    prisma,
    importService as any,
    inventory as any,
  );
  return { service, repository, prisma, importService, recordRepository, inventory };
};

describe('ReplenishmentService · 保存', () => {
  it('saves a record with items, records, and reimbursement amount', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '青花鱼 220g 2片装',
        spec: '220g 2片装',
        qty: 2,
        unit: '袋',
        lineTotal: 52.78,
        isPersonal: false,
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        purchaseItemId: null,
      },
    ]);
    const { service, repository, prisma, importService } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-1',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-1',
          procurementSkuId: 'sku-1',
          procurementSkuName: '青花鱼 220g 2片装',
          ingredientName: '青花鱼',
          type: 'FOOD',
          quantityNeeded: 2,
          quantityUnit: '袋',
          estimatedCost: 52.78,
        },
      ],
    });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      name: '青花鱼 220g 2片装',
      productModel: '220g 2片装',
      purchaseChannel: '盒马鲜生',
      purchaseUnit: '袋',
      ingredient: {
        id: 'ing-1',
        name: '青花鱼',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '袋',
        purchaseChannel: '盒马鲜生',
      },
    });

    const saved = await service.saveRecord('draft-1', {}, 'user-1');

    expect(importService.confirm).toHaveBeenCalledWith(['import-1'], 'user-1');
    expect(saved.isDraft).toBe(false);
    expect(saved.status).toBe(PurchaseListStatus.COMPLETED);
    expect(saved.itemCount).toBe(1);
    expect(saved.reimbursementAmount).toBe(53.98);
    expect(saved.personalAmount).toBe(0);
    expect(saved.paidAmount).toBe(53.98);
    expect(saved.discountAmount).toBe(0);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('按重量买但没有挂商品的行，保存时被拦住', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '新鲜羊心 3斤',
        spec: '3斤',
        qty: 3,
        unit: '斤',
        lineTotal: 37.39,
        isPersonal: false,
        ingredientId: 'ing-2',
        procurementSkuId: null,
        purchaseItemId: null,
      },
    ]);
    importRow.subtotal = 37.39;
    importRow.packagingFee = 0;
    importRow.paid = 37.39;
    const { service, prisma } = createService({ draft, importRow });

    await expect(service.saveRecord('draft-1', {}, 'user-1')).rejects.toThrow(
      /缺少采购商品/,
    );
    expect(prisma.purchaseItem.create).not.toHaveBeenCalled();
  });

  it('散称挂「按克卖」的商品：明细按 600 克记，商品一起落库', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '牛肉 600克',
        spec: '600克',
        qty: 600,
        unit: '克',
        lineTotal: 60,
        isPersonal: false,
        ingredientId: 'ing-2',
        procurementSkuId: 'sku-2',
        purchaseItemId: null,
      },
    ]);
    importRow.subtotal = 60;
    importRow.packagingFee = 0;
    importRow.paid = 60;
    const { service, prisma } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-2',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-2',
          procurementSkuId: 'sku-2',
          ingredientName: '牛肉',
          type: 'FOOD',
          quantityNeeded: 600,
          quantityUnit: '克',
          estimatedCost: 60,
        },
      ],
    });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-2',
      name: '菜市场牛肉（按克）',
      productModel: null,
      purchaseChannel: '菜市场',
      purchaseUnit: '克',
      ingredient: {
        id: 'ing-2',
        name: '牛肉',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        purchaseChannel: '菜市场',
      },
    });

    const saved = await service.saveRecord('draft-1', {}, 'user-1');

    expect(prisma.purchaseItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-2',
        quantityUnit: '克',
        quantityNeeded: 600,
        estimatedCost: 60,
      }),
    });
    expect(saved.itemCount).toBe(1);
    expect(saved.reimbursementAmount).toBe(60);
  });

  it('这行写的单位和商品的单位对不上时，保存时被拦住', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '新鲜羊心 3斤',
        spec: '3斤',
        qty: 3,
        unit: '斤',
        lineTotal: 37.39,
        isPersonal: false,
        ingredientId: 'ing-2',
        procurementSkuId: 'sku-2',
        purchaseItemId: null,
      },
    ]);
    importRow.subtotal = 37.39;
    importRow.packagingFee = 0;
    importRow.paid = 37.39;
    const { service, prisma } = createService({ draft, importRow });
    prisma.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-2',
      name: '羊心 500g/袋',
      productModel: '500g/袋',
      purchaseChannel: '淘宝',
      purchaseUnit: '袋',
      ingredient: {
        id: 'ing-2',
        name: '羊心',
        type: 'FOOD',
        baseUnit: 'G',
        unitDisplayLabel: '袋',
        purchaseChannel: '淘宝',
      },
    });

    await expect(service.saveRecord('draft-1', {}, 'user-1')).rejects.toThrow(
      /这行写的是/,
    );
    expect(prisma.purchaseItem.create).not.toHaveBeenCalled();
  });

  it('excludes personal lines from the reimbursement amount', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '青花鱼',
        qty: 2,
        unit: '袋',
        lineTotal: 30,
        isPersonal: false,
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        purchaseItemId: 'item-1',
      },
      {
        id: 'line-2',
        rawName: '个人可乐',
        qty: 1,
        unit: '瓶',
        lineTotal: 10,
        isPersonal: true,
        ingredientId: null,
        procurementSkuId: null,
        purchaseItemId: null,
      },
    ]);
    importRow.subtotal = 40;
    importRow.packagingFee = 0;
    importRow.paid = 40;
    const { service, prisma } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-1',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-1',
          procurementSkuId: 'sku-1',
          ingredientName: '青花鱼',
          type: 'FOOD',
          quantityNeeded: 2,
          quantityUnit: '袋',
          estimatedCost: 30,
        },
      ],
    });

    const saved = await service.saveRecord('draft-1', {}, 'user-1');

    expect(prisma.purchaseOrderImportLine.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'line-2' },
      }),
    );
    expect(saved.personalAmount).toBe(10);
    expect(saved.reimbursementAmount).toBe(30);
    expect(saved.itemCount).toBe(1);
  });

  it('marks a delivered screenshot as arrived and inbounds on save', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '青花鱼',
        qty: 1,
        unit: '袋',
        lineTotal: 26.99,
        isPersonal: false,
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        purchaseItemId: 'item-1',
      },
    ]);
    importRow.subtotal = 26.99;
    importRow.packagingFee = 0;
    importRow.paid = 26.99;
    importRow.deliveredAt = new Date('2026-11-09T11:33:00+08:00');
    const { service, inventory } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-1',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-1',
          procurementSkuId: 'sku-1',
          ingredientName: '青花鱼',
          type: 'FOOD',
          quantityNeeded: 1,
          quantityUnit: '袋',
          estimatedCost: 26.99,
        },
      ],
    });

    const saved = await service.saveRecord('draft-1', {}, 'user-1');

    expect(saved.arrivedAt).toBeInstanceOf(Date);
    expect(inventory.inboundFromPurchaseRecords).toHaveBeenCalledTimes(1);
  });

  it('rejects a record without a paid amount', async () => {
    const draft = createDraft();
    const importRow = createImport([
      {
        id: 'line-1',
        rawName: '青花鱼',
        qty: 1,
        unit: '袋',
        lineTotal: 26.99,
        isPersonal: false,
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        purchaseItemId: 'item-1',
      },
    ]);
    importRow.paid = null;
    const { service } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-1',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-1',
          ingredientName: '青花鱼',
          quantityNeeded: 1,
          quantityUnit: '袋',
          estimatedCost: 26.99,
        },
      ],
    });

    await expect(service.saveRecord('draft-1', {}, 'user-1')).rejects.toThrow(
      BadRequestException,
    );
  });
});
