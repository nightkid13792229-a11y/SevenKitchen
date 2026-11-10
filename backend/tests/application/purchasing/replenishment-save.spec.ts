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
  const service = new ReplenishmentService(
    repository as any,
    prisma,
    importService as any,
  );
  return { service, repository, prisma, importService };
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

  it('creates a weight item without a procurement SKU', async () => {
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
    const { service, prisma } = createService({
      draft,
      importRow,
      itemRows: [
        {
          id: 'item-2',
          purchaseListId: 'draft-1',
          ingredientId: 'ing-2',
          procurementSkuId: null,
          ingredientName: '羊心',
          type: 'FOOD',
          quantityNeeded: 3,
          quantityUnit: '斤',
          estimatedCost: 37.39,
        },
      ],
    });
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'ing-2',
      name: '羊心',
      type: 'FOOD',
      baseUnit: 'G',
      unitDisplayLabel: '斤',
      purchaseChannel: '淘宝',
    });

    const saved = await service.saveRecord('draft-1', {}, 'user-1');

    expect(prisma.purchaseItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: null,
        quantityUnit: '斤',
        quantityNeeded: 3,
        estimatedCost: 37.39,
      }),
    });
    expect(saved.itemCount).toBe(1);
    expect(saved.reimbursementAmount).toBe(37.39);
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
