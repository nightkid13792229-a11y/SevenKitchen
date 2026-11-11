import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseOrderImportService } from '../../../src/application/purchasing/purchase-order-import.service';
import { PurchaseList } from '../../../src/domain/purchasing/purchase-list.entity';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

const draft = () => {
  const list = new PurchaseList({
    id: 'draft-1',
    targetDate: new Date('2026-11-11T12:00:00'),
    kind: PurchaseListKind.STOCK_REPLENISHMENT,
    status: PurchaseListStatus.PENDING,
    totalEstimatedCost: 0,
    itemCount: 0,
    createdById: 'user-1',
    sourceOrderIds: [],
    isDraft: true,
  });
  return list;
};

describe('ReplenishmentService · 手填兜底', () => {
  it('creates a manual import with no screenshot', async () => {
    const prisma: any = {
      purchaseOrderImport: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'import-1' }),
      },
    };
    const service = new ReplenishmentService(
      { findById: jest.fn().mockResolvedValue(draft()) } as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
    );

    const result = await service.createManualImport('draft-1', 'user-1', 'STAFF');

    expect(result.id).toBe('import-1');
    expect(prisma.purchaseOrderImport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purchaseListId: 'draft-1',
        uploadedById: 'user-1',
        imageUrls: [],
        imageKeys: [],
        status: 'DRAFT',
      }),
    });
    const data = prisma.purchaseOrderImport.create.mock.calls[0][0].data;
    expect(data.imageHash.startsWith('manual:')).toBe(true);
  });

  it('refuses to add a second manual import to the same draft', async () => {
    const prisma: any = {
      purchaseOrderImport: {
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn(),
      },
    };
    const service = new ReplenishmentService(
      { findById: jest.fn().mockResolvedValue(draft()) } as any,
      {} as any,
      prisma,
      {} as any,
      {} as any,
    );

    await expect(
      service.createManualImport('draft-1', 'user-1', 'STAFF'),
    ).rejects.toThrow('已经有识别记录');
  });
});

describe('PurchaseOrderImportService · 手动加行', () => {
  const createService = (status = 'DRAFT') => {
    const prisma: any = {
      purchaseOrderImport: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'import-1',
          status,
          uploadedById: 'user-1',
        }),
      },
      ingredient: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ing-1', name: '羊心' }),
      },
      procurementSku: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'sku-1',
          name: '羊心 500g/袋',
          ingredientId: 'ing-1',
        }),
      },
      purchaseOrderImportLine: {
        aggregate: jest.fn().mockResolvedValue({ _max: { lineNo: 2 } }),
        create: jest.fn(async ({ data }: any) => ({ id: 'line-1', ...data })),
      },
    };
    const service = new PurchaseOrderImportService(
      prisma,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, prisma };
  };

  it('adds a matched manual line with the next line number', async () => {
    const { service, prisma } = createService();

    await service.addLine(
      'import-1',
      {
        ingredientId: 'ing-1',
        procurementSkuId: 'sku-1',
        qty: 3,
        unit: '袋',
        unitPrice: 12.46,
      },
      'user-1',
    );

    expect(prisma.purchaseOrderImportLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lineNo: 3,
        rawName: '羊心 500g/袋',
        qty: 3,
        lineTotal: 37.38,
        matchSource: 'MANUAL',
        editedByUser: true,
      }),
    });
  });

  it('adds a personal line without an ingredient', async () => {
    const { service, prisma } = createService();

    await service.addLine(
      'import-1',
      { qty: 1, unitPrice: 8, isPersonal: true },
      'user-1',
    );

    expect(prisma.purchaseOrderImportLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rawName: '个人商品',
        ingredientId: null,
        procurementSkuId: null,
        isPersonal: true,
        matchSource: 'PERSONAL',
      }),
    });
  });

  it('rejects another user and a confirmed import', async () => {
    const { service } = createService();
    await expect(
      service.addLine('import-1', { qty: 1, unitPrice: 8 }, 'other'),
    ).rejects.toThrow('只能修改自己');

    const confirmed = createService('CONFIRMED');
    await expect(
      confirmed.service.addLine(
        'import-1',
        { qty: 1, unitPrice: 8 },
        'user-1',
      ),
    ).rejects.toThrow('已确认');
  });
});
