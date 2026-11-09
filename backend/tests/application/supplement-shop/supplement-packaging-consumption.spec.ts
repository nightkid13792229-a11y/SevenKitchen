import { SupplementPackagingService } from 'src/application/supplement-shop/supplement-packaging.service';

describe('SupplementPackagingService consumption (D3)', () => {
  const rules = [
    {
      id: 'r-pouch',
      role: 'POUCH',
      ingredientId: 'pouch-1',
      physicalForm: null,
      unitPattern: null,
      minAmount: null,
      maxAmount: null,
      priority: 0,
      enabled: true,
      ingredient: { id: 'pouch-1', name: '自封袋' },
    },
    {
      id: 'r-label',
      role: 'LABEL',
      ingredientId: 'label-1',
      physicalForm: null,
      unitPattern: null,
      minAmount: null,
      maxAmount: null,
      priority: 0,
      enabled: true,
      ingredient: { id: 'label-1', name: '标签' },
    },
    {
      id: 'r-desiccant',
      role: 'DESICCANT',
      ingredientId: 'desiccant-1',
      physicalForm: null,
      unitPattern: null,
      minAmount: null,
      maxAmount: null,
      priority: 0,
      enabled: true,
      ingredient: { id: 'desiccant-1', name: '干燥剂' },
    },
  ];

  const createService = (config: Record<string, any> = {}) => {
    const tx: any = {
      supplementOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'so-1',
          bagCount: 3,
          items: [
            {
              ingredientId: 'ing-1',
              name: '鱼油',
              unit: '粒',
              physicalForm: null,
              packedAmount: 60,
              bags: 3,
            },
          ],
        }),
      },
      supplementPackagingRule: { findMany: jest.fn().mockResolvedValue(rules) },
      inventoryLedgerEntry: {
        createMany: jest.fn().mockImplementation(async ({ data }) => ({
          count: data.length,
        })),
      },
    };
    const prisma: any = {};
    const inventoryService: any = {};
    const globalConfigService: any = {
      getGlobalConfig: jest.fn().mockResolvedValue({
        packagingDeductionEnabled: true,
        ...config,
      }),
    };

    return {
      service: new SupplementPackagingService(
        prisma,
        inventoryService,
        globalConfigService,
      ),
      tx,
    };
  };

  it('一单 3 袋扣 3 只袋、3 张标签、3 个干燥剂', async () => {
    const { service, tx } = createService();

    const result = await service.consumePackagingForOrder(tx, 'so-1');

    expect(result.entryCount).toBe(3);
    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'pouch-1', deltaG: -3 }),
        expect.objectContaining({ ingredientId: 'label-1', deltaG: -3 }),
        expect.objectContaining({ ingredientId: 'desiccant-1', deltaG: -3 }),
      ]),
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceType: 'PACKAGING_CONSUMPTION',
        sourceId: 'so-1:supplement',
      }),
    );
  });

  it('没有袋型规则时只扣标签和干燥剂', async () => {
    const { service, tx } = createService();
    tx.supplementPackagingRule.findMany.mockResolvedValue([
      rules[1],
      rules[2],
    ]);

    const result = await service.consumePackagingForOrder(tx, 'so-1');

    expect(result.entryCount).toBe(2);
  });

  it('开关关闭时不写流水', async () => {
    const { service, tx } = createService({
      packagingDeductionEnabled: false,
    });

    const result = await service.consumePackagingForOrder(tx, 'so-1');

    expect(result.entryCount).toBe(0);
    expect(tx.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
  });
});
