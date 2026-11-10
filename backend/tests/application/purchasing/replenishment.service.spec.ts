import { ReplenishmentService } from '../../../src/application/purchasing/replenishment.service';
import { PurchaseOrderImportService } from '../../../src/application/purchasing/purchase-order-import.service';
import {
  PurchaseListKind,
  PurchaseListStatus,
} from '../../../src/domain/purchasing/enums';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('ReplenishmentService · 草稿', () => {
  it('creates an empty draft stock replenishment record', async () => {
    const repository = {
      save: jest.fn(async (list: any) => list),
    } as any;
    const service = new ReplenishmentService(
      repository,
      {} as any,
      {} as any,
      { confirm: jest.fn() } as any,
      {} as any,
    );

    const saved = await service.createDraft('user-1');

    expect(saved.kind).toBe(PurchaseListKind.STOCK_REPLENISHMENT);
    expect(saved.status).toBe(PurchaseListStatus.PENDING);
    expect(saved.isDraft).toBe(true);
    expect(saved.itemCount).toBe(0);
    expect(saved.createdById).toBe('user-1');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });
});

describe('PurchaseOrderImportService · 草稿全库候选', () => {
  it('falls back to the whole catalog when the draft has no items', async () => {
    const prisma: any = {
      purchaseItem: { findMany: jest.fn().mockResolvedValue([]) },
      ingredient: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'ing-1', name: '青花鱼' }]),
      },
      procurementSku: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sku-1',
            ingredientId: 'ing-1',
            name: '青花鱼 220g 2片装',
            productModel: '220g 2片装',
            purchaseChannel: '盒马鲜生',
            purchaseToBaseRatio: 440,
            purchaseUnit: '袋',
          },
        ]),
      },
      procurementSkuNameChange: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PurchaseOrderImportService(
      prisma,
      { getEnabledDeepSeekRuntimeConfig: jest.fn() } as any,
      {} as any,
      { listSet: jest.fn() } as any,
      { callDeepSeekJson: jest.fn() } as any,
    );

    const candidates = await (service as any).buildCandidates('draft-1');

    expect(candidates).toEqual([
      {
        purchaseItemId: null,
        ingredientId: 'ing-1',
        ingredientName: '青花鱼',
        skus: [
          {
            id: 'sku-1',
            name: '青花鱼 220g 2片装',
            productModel: '220g 2片装',
            purchaseChannel: '盒马鲜生',
            purchaseToBaseRatio: 440,
            purchaseUnit: '袋',
            previousNames: [],
          },
        ],
      },
    ]);
  });
});
