import { PackagingConsumptionService } from 'src/application/inventory/packaging-consumption.service';

describe('PackagingConsumptionService (D1)', () => {
  const createService = (configOverrides: Record<string, any> = {}) => {
    const tx: any = {
      orderShipmentPackageItem: { findMany: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryLedgerEntry: {
        createMany: jest.fn().mockImplementation(async ({ data }) => ({
          count: data.length,
        })),
      },
    };
    const prisma: any = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    const packagingService: any = {
      selectVacuumBag: jest.fn(async (specG: number) => ({
        id: specG < 300 ? 'bag-small' : 'bag-large',
      })),
    };
    const config: any = {
      getGlobalConfig: jest.fn().mockResolvedValue({
        packagingDeductionEnabled: true,
        defaultProductLabelId: 'label-1',
        ...configOverrides,
      }),
    };

    return {
      service: new PackagingConsumptionService(prisma, packagingService, config),
      tx,
      packagingService,
      config,
    };
  };

  it('发货 7 袋扣 7 个袋 + 7 张标签', async () => {
    const { service, tx } = createService();
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o1', specG: 250, bags: 7 },
    ]);

    const result = await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o1'],
    });

    expect(result.entryCount).toBe(2);
    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'bag-small', deltaG: -7 }),
        expect.objectContaining({ ingredientId: 'label-1', deltaG: -7 }),
      ]),
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        sourceType: 'PACKAGING_CONSUMPTION',
        sourceId: 's1:o1',
      }),
    );
  });

  it('多规格按各自袋型扣', async () => {
    const { service, tx } = createService();
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o1', specG: 250, bags: 3 },
      { orderId: 'o1', specG: 500, bags: 2 },
    ]);

    await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o1'],
    });

    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'bag-small', deltaG: -3 }),
        expect.objectContaining({ ingredientId: 'bag-large', deltaG: -2 }),
        expect.objectContaining({ ingredientId: 'label-1', deltaG: -5 }),
      ]),
    );
  });

  it('试吃装发货不重复扣袋', async () => {
    const { service, tx } = createService();
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o-tasting', specG: 250, bags: 3 },
    ]);
    tx.orderItem.findMany.mockResolvedValue([{ orderId: 'o-tasting' }]);

    const result = await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o-tasting'],
    });

    expect(result.entryCount).toBe(0);
    expect(tx.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('开关关闭时不写流水', async () => {
    const { service, tx } = createService({
      packagingDeductionEnabled: false,
    });
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o1', specG: 250, bags: 7 },
    ]);

    const result = await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o1'],
    });

    expect(result.entryCount).toBe(0);
    expect(tx.inventoryLedgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('备货锅完工按分装计划扣，来源是锅号:stock', async () => {
    const { service, tx } = createService();

    const result = await service.consumeForPackagingUnit({
      id: 'unit-1',
      stockPortionPlan: { packageSpecG: 250, packageCount: 3 },
      sourceOrderItemIds: [],
    });

    expect(result.entryCount).toBe(2);
    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    expect(rows.every((row: any) => row.sourceId === 'unit-1:stock')).toBe(true);
    expect(rows.every((row: any) => row.deltaG === -3)).toBe(true);
  });
});
