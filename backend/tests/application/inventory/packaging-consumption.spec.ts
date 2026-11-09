import { PackagingConsumptionService } from 'src/application/inventory/packaging-consumption.service';

describe('PackagingConsumptionService (D1)', () => {
  const createService = (configOverrides: Record<string, any> = {}) => {
    const tx: any = {
      orderShipmentPackageItem: { findMany: jest.fn() },
      orderShipmentPackage: { findMany: jest.fn().mockResolvedValue([]) },
      orderItem: { findMany: jest.fn().mockResolvedValue([]) },
      ingredient: { findUnique: jest.fn() },
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
      calculateShippingContainers: jest.fn(),
      resolveBoxContainer: jest.fn(async () => ({
        thermalBag: { id: 'thermal-1' },
        icePacks: 3,
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
  it('包裹箱型按包裹扣 1 箱 + 1 保温袋 + N 冰袋', async () => {
    const { service, tx, packagingService } = createService();
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o1', specG: 250, bags: 2 },
    ]);
    tx.orderShipmentPackage.findMany.mockResolvedValue([
      {
        id: 'p1',
        boxIngredientId: 'box-4',
        thermalBagIngredientId: 'thermal-4',
      },
    ]);
    tx.ingredient.findUnique.mockResolvedValue({
      id: 'box-4',
      name: '泡沫箱4号',
      productModel: '4号箱',
    });
    packagingService.resolveBoxContainer.mockResolvedValue({
      thermalBag: { id: 'thermal-4' },
      icePacks: 3,
    });

    await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o1'],
    });

    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    const boxRows = rows.filter((row: any) => row.sourceId === 's1:pkg:p1');
    expect(boxRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ingredientId: 'box-4', deltaG: -1 }),
        expect.objectContaining({ ingredientId: 'thermal-4', deltaG: -1 }),
        expect.objectContaining({
          ingredientId: '1e3d5990-e553-44fb-8bb9-6144593b6899',
          deltaG: -3,
        }),
      ]),
    );
  });

  it('2 个包裹扣 2 个箱', async () => {
    const { service, tx, packagingService } = createService();
    tx.orderShipmentPackageItem.findMany.mockResolvedValue([
      { orderId: 'o1', specG: 250, bags: 1 },
    ]);
    tx.orderShipmentPackage.findMany.mockResolvedValue([
      { id: 'p1', boxIngredientId: 'box-3', thermalBagIngredientId: 'thermal-3' },
      { id: 'p2', boxIngredientId: 'box-3', thermalBagIngredientId: 'thermal-3' },
    ]);
    tx.ingredient.findUnique.mockResolvedValue({
      id: 'box-3',
      name: '泡沫箱3号',
      productModel: '3号箱',
    });
    packagingService.resolveBoxContainer.mockResolvedValue({
      thermalBag: { id: 'thermal-3' },
      icePacks: 5,
    });

    await service.consumePackagingForShipment(tx, {
      shipmentId: 's1',
      orderIds: ['o1'],
    });

    const rows = tx.inventoryLedgerEntry.createMany.mock.calls[0][0].data;
    const boxRows = rows.filter(
      (row: any) => row.ingredientId === 'box-3',
    );
    expect(boxRows).toHaveLength(2);
    expect(boxRows.every((row: any) => row.deltaG === -1)).toBe(true);
  });

  it('没传箱型时按总重推荐', async () => {
    const { service, packagingService } = createService();
    packagingService.calculateShippingContainers.mockResolvedValue([
      {
        boxItem: { id: 'box-3' },
        thermalItem: { id: 'thermal-3' },
        icePacks: 5,
      },
    ]);

    const result = await service.resolvePackageContainer(3000);

    expect(packagingService.calculateShippingContainers).toHaveBeenCalledWith(
      3000,
    );
    expect(result).toEqual({
      boxIngredientId: 'box-3',
      thermalBagIngredientId: 'thermal-3',
      icePacks: 5,
    });
  });

  it('箱型配不到保温袋时拒绝发货', async () => {
    const { service, packagingService } = createService();
    packagingService.resolveBoxContainer.mockRejectedValue(
      new Error('找不到匹配的保温袋'),
    );
    (service as any).prisma.ingredient = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'box-x',
        name: '泡沫箱X',
        type: 'PACKAGING',
        productModel: 'X号箱',
      }),
    };

    await expect(
      service.resolvePackageContainer(1000, 'box-x'),
    ).rejects.toThrow('找不到匹配的保温袋');
  });
});
