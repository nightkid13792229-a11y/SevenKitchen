import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('ProcurementSkuService', () => {
  let service: ProcurementSkuService;
  const mockPrismaService = {
    $transaction: jest.fn(),
    procurementSku: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    procurementSkuPriceHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    ingredient: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementSkuService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get(ProcurementSkuService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(
      async (callback: any) => callback(mockPrismaService),
    );
  });

  it('batchFindActive ignores legacy sortOrder and orders active procurement skus by automatic purchase cost', async () => {
    mockPrismaService.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-2',
        ingredientId: 'ingredient-1',
        name: '高折算价鸡胸',
        brand: null,
        productModel: null,
        purchaseChannel: '京东冷链',
        purchaseToBaseRatio: 500,
        currentPurchasePrice: { toNumber: () => 21.5 },
        referencePurchasePrice: null,
        referencePricePerPurchaseUnit: null,
        displayUnit: '袋',
        sourceTier: 'MARKET_PREMIUM',
        notes: null,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-03T00:00:02.000Z'),
        updatedAt: new Date('2026-04-03T00:00:02.000Z'),
      },
      {
        id: 'sku-1',
        ingredientId: 'ingredient-1',
        name: '低折算价鸡胸',
        brand: null,
        productModel: null,
        purchaseChannel: '京东冷链',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: { toNumber: () => 39.9 },
        referencePurchasePrice: null,
        referencePricePerPurchaseUnit: null,
        displayUnit: '袋',
        sourceTier: 'MARKET_PREMIUM',
        notes: null,
        isDefault: false,
        isActive: true,
        sortOrder: 99,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-03T00:00:01.000Z'),
        updatedAt: new Date('2026-04-03T00:00:01.000Z'),
      },
    ]);

    await expect(service.batchFindActive(['ingredient-1'])).resolves.toEqual({
      'ingredient-1': [
        expect.objectContaining({
          id: 'sku-1',
          ingredientId: 'ingredient-1',
          name: '低折算价鸡胸',
          purchaseChannel: '京东冷链',
          currentPurchasePrice: 39.9,
          isActive: true,
          sortOrder: 99,
          sourceTier: 'MARKET_PREMIUM',
        }),
        expect.objectContaining({
          id: 'sku-2',
          ingredientId: 'ingredient-1',
          name: '高折算价鸡胸',
          purchaseChannel: '京东冷链',
          currentPurchasePrice: 21.5,
          isActive: true,
          sortOrder: 0,
          sourceTier: 'MARKET_PREMIUM',
        }),
      ],
    });

    expect(mockPrismaService.procurementSku.findMany).toHaveBeenCalledWith({
      where: {
        ingredientId: { in: ['ingredient-1'] },
        isActive: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  });

  it('create throws NotFoundException for missing ingredient', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue(null);

    await expect(
      service.create('missing-ingredient', {
        name: '京东鸡胸 1kg/袋',
        purchaseChannel: '京东冷链',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('create normalizes null and blank optional fields to null', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
    });
    mockPrismaService.procurementSku.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-3',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: data.brand,
        productModel: data.productModel,
        purchaseChannel: data.purchaseChannel,
        referencePricePerPurchaseUnit: data.referencePricePerPurchaseUnit,
        sourceTier: data.sourceTier,
        notes: data.notes,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdAt: new Date('2026-04-03T00:00:03.000Z'),
      }),
    );

    await expect(
      service.create('ingredient-1', {
        name: '测试采购 SKU',
        brand: null,
        productModel: '   ',
        purchaseChannel: '',
        notes: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        brand: null,
        productModel: null,
        purchaseChannel: null,
        notes: null,
      }),
    );
  });

  it('create persists procurement execution fields and ignores legacy default flags', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    mockPrismaService.procurementSku.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-4',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: data.brand ?? null,
        productModel: data.productModel ?? null,
        purchaseChannel: data.purchaseChannel ?? null,
        supplierName: data.supplierName ?? null,
        purchaseUnit: data.purchaseUnit ?? null,
        purchaseToBaseRatio: data.purchaseToBaseRatio ?? null,
        currentPurchasePrice: data.currentPurchasePrice ?? null,
        referencePurchasePrice: data.referencePurchasePrice ?? null,
        referencePricePerPurchaseUnit: null,
        sourceTier: data.sourceTier ?? null,
        notes: data.notes ?? null,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
        safetyStock: data.safetyStock ?? null,
        reorderPoint: data.reorderPoint ?? null,
        targetStock: data.targetStock ?? null,
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
      }),
    );

    await expect(
      service.create('ingredient-1', {
        name: '山姆猪里脊',
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: 79.9,
        referencePurchasePrice: 82.5,
        sourceTier: 'ORGANIC',
        isDefault: true,
        sortOrder: 9,
        safetyStock: 5,
        reorderPoint: 8,
        targetStock: 15,
      } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        purchaseUnit: 'kg',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: 79.9,
        referencePurchasePrice: 82.5,
        sourceTier: 'ORGANIC',
        isDefault: false,
        sortOrder: 0,
        safetyStock: 5,
        reorderPoint: 8,
        targetStock: 15,
      }),
    );

    expect(mockPrismaService.procurementSku.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseUnit: 'kg',
          purchaseToBaseRatio: 1000,
          currentPurchasePrice: 79.9,
          referencePurchasePrice: 82.5,
          sourceTier: 'ORGANIC',
          isDefault: false,
          sortOrder: 0,
          safetyStock: 5,
          reorderPoint: 8,
          targetStock: 15,
        }),
      }),
    );
  });

  it('create records initial effective purchase price history when current price is provided', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    mockPrismaService.procurementSku.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-initial-price',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: null,
        productModel: null,
        purchaseChannel: null,
        supplierName: null,
        purchaseUnit: data.purchaseUnit ?? null,
        purchaseToBaseRatio: data.purchaseToBaseRatio ?? null,
        currentPurchasePrice: data.currentPurchasePrice ?? null,
        referencePurchasePrice: null,
        referencePricePerPurchaseUnit: null,
        sourceTier: null,
        notes: null,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      }),
    );

    await service.create('ingredient-1', {
      name: '山姆三文鱼',
      purchaseUnit: '袋',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: 135.004,
    });

    expect(mockPrismaService.$transaction).toHaveBeenCalled();
    expect(mockPrismaService.procurementSkuPriceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-initial-price',
        ingredientId: 'ingredient-1',
        oldPrice: null,
        newPrice: 135,
        source: 'MANUAL',
        note: '创建 SKU 时设置初始采购价',
      }),
    });
  });

  it('create normalizes controlled purchase unit aliases and does not persist displayUnit', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
      baseUnit: 'G',
    });
    mockPrismaService.procurementSku.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-5',
        ingredientId: data.ingredientId,
        name: data.name,
        brand: null,
        productModel: null,
        purchaseChannel: null,
        supplierName: null,
        purchaseUnit: data.purchaseUnit ?? null,
        purchaseToBaseRatio: data.purchaseToBaseRatio ?? null,
        currentPurchasePrice: data.currentPurchasePrice ?? null,
        referencePurchasePrice: null,
        referencePricePerPurchaseUnit: null,
        sourceTier: null,
        notes: null,
        isDefault: false,
        isActive: true,
        sortOrder: 0,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-19T00:00:00.000Z'),
      }),
    );

    await expect(
      service.create('ingredient-1', {
        name: '本地生鲜市场牛霖',
        purchaseUnit: '公斤',
        purchaseToBaseRatio: 1000,
        currentPurchasePrice: 64.62,
        displayUnit: '盒',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        purchaseUnit: 'kg',
      }),
    );

    expect(mockPrismaService.procurementSku.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseUnit: 'kg',
        }),
      }),
    );
    expect(
      mockPrismaService.procurementSku.create.mock.calls[0][0].data,
    ).not.toHaveProperty('displayUnit');
  });

  it('create rejects purchase units outside the controlled list for the ingredient base unit', async () => {
    mockPrismaService.ingredient.findUnique.mockResolvedValue({
      id: 'ingredient-1',
      type: 'FOOD',
      baseUnit: 'G',
    });

    await expect(
      service.create('ingredient-1', {
        name: '错误单位牛霖',
        purchaseUnit: '盒装',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrismaService.procurementSku.create).not.toHaveBeenCalled();
  });

  it('update ignores legacy default flags', async () => {
    mockPrismaService.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredient: {
        id: 'ingredient-1',
        type: 'FOOD',
      },
    });
    mockPrismaService.procurementSku.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'sku-1',
        ingredientId: 'ingredient-1',
        name: '山姆猪里脊',
        brand: null,
        productModel: null,
        purchaseChannel: null,
        supplierName: null,
        purchaseUnit: null,
        purchaseToBaseRatio: null,
        currentPurchasePrice: null,
        referencePurchasePrice: null,
        referencePricePerPurchaseUnit: null,
        displayUnit: null,
        sourceTier: null,
        notes: null,
        isDefault: data.isDefault ?? false,
        isActive: true,
        sortOrder: 0,
        safetyStock: null,
        reorderPoint: null,
        targetStock: null,
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
      }),
    );

    await expect(
      service.update('sku-1', {
        isDefault: true,
        sortOrder: 7,
      } as any),
    ).resolves.toEqual(
      expect.objectContaining({
        isDefault: false,
      }),
    );

    expect(mockPrismaService.procurementSku.update).toHaveBeenCalledWith({
      where: { id: 'sku-1' },
      data: {},
    });
  });

  it('listBrands returns distinct trimmed historical brands', async () => {
    mockPrismaService.procurementSku.findMany.mockResolvedValue([
      { brand: ' iHerb ' },
      { brand: 'iHerb' },
      { brand: null },
      { brand: '  ' },
      { brand: 'NOW Foods' },
    ]);

    await expect(service.listBrands()).resolves.toEqual(['iHerb', 'NOW Foods']);

    expect(mockPrismaService.procurementSku.findMany).toHaveBeenCalledWith({
      where: {
        brand: { not: null },
      },
      select: {
        brand: true,
      },
    });
  });

  it('listPurchaseChannels returns distinct trimmed historical channels', async () => {
    mockPrismaService.procurementSku.findMany.mockResolvedValue([
      { purchaseChannel: ' 山姆 ' },
      { purchaseChannel: '盒马' },
      { purchaseChannel: '山姆' },
      { purchaseChannel: '' },
      { purchaseChannel: null },
    ]);

    await expect(service.listPurchaseChannels()).resolves.toEqual([
      '山姆',
      '盒马',
    ]);

    expect(mockPrismaService.procurementSku.findMany).toHaveBeenCalledWith({
      where: {
        purchaseChannel: { not: null },
      },
      select: {
        purchaseChannel: true,
      },
    });
  });

  it('records manual effective purchase price history when updating current price', async () => {
    mockPrismaService.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      currentPurchasePrice: { toNumber: () => 79.9 },
      ingredient: {
        id: 'ingredient-1',
        type: 'FOOD',
      },
    });
    mockPrismaService.procurementSku.update.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      name: '山姆猪里脊',
      brand: null,
      productModel: '1kg/包',
      purchaseChannel: '山姆',
      supplierName: null,
      purchaseUnit: '包',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: { toNumber: () => 85 },
      referencePurchasePrice: null,
      referencePricePerPurchaseUnit: null,
      displayUnit: '包',
      sourceTier: 'MARKET_PREMIUM',
      notes: null,
      isDefault: false,
      isActive: true,
      sortOrder: 0,
      safetyStock: null,
      reorderPoint: null,
      targetStock: null,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    });

    await service.update('sku-1', {
      currentPurchasePrice: 85,
    });

    expect(mockPrismaService.procurementSkuPriceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-1',
        ingredientId: 'ingredient-1',
        oldPrice: 79.9,
        newPrice: 85,
        source: 'MANUAL',
      }),
    });
  });

  it('applies reimbursement effective purchase price to a procurement sku with history', async () => {
    mockPrismaService.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      currentPurchasePrice: { toNumber: () => 85 },
      ingredient: {
        id: 'ingredient-1',
        type: 'FOOD',
      },
    });
    mockPrismaService.procurementSku.update.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      name: '山姆猪里脊',
      brand: null,
      productModel: '1kg/包',
      purchaseChannel: '山姆',
      supplierName: null,
      purchaseUnit: '包',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: { toNumber: () => 82.5 },
      referencePurchasePrice: null,
      referencePricePerPurchaseUnit: null,
      displayUnit: '包',
      sourceTier: 'MARKET_PREMIUM',
      notes: null,
      isDefault: false,
      isActive: true,
      sortOrder: 0,
      safetyStock: null,
      reorderPoint: null,
      targetStock: null,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    });

    await service.applyCurrentPurchasePrice('sku-1', 82.5, {
      source: 'REIMBURSEMENT',
      reimbursementId: 'reimbursement-1',
      purchaseRecordId: 'purchase-record-1',
      operatorId: 'admin-1',
      note: '报销凭证确认后自动更新',
    });

    expect(mockPrismaService.procurementSku.update).toHaveBeenCalledWith({
      where: { id: 'sku-1' },
      data: { currentPurchasePrice: 82.5 },
    });
    expect(mockPrismaService.procurementSkuPriceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-1',
        ingredientId: 'ingredient-1',
        oldPrice: 85,
        newPrice: 82.5,
        source: 'REIMBURSEMENT',
        reimbursementId: 'reimbursement-1',
        purchaseRecordId: 'purchase-record-1',
        operatorId: 'admin-1',
      }),
    });
  });

  it('rolls back current purchase price to a selected history row and records rollback history', async () => {
    mockPrismaService.procurementSku.findUnique.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      currentPurchasePrice: { toNumber: () => 88 },
      ingredient: {
        id: 'ingredient-1',
        type: 'FOOD',
      },
    });
    mockPrismaService.procurementSkuPriceHistory.findFirst.mockResolvedValue({
      id: 'history-1',
      procurementSkuId: 'sku-1',
      ingredientId: 'ingredient-1',
      oldPrice: { toNumber: () => 80 },
      newPrice: { toNumber: () => 76.5 },
      source: 'REIMBURSEMENT',
      reimbursementId: 'reimbursement-1',
      purchaseRecordId: 'purchase-record-1',
      rollbackFromHistoryId: null,
      operatorId: 'admin-1',
      note: '测试价',
      createdAt: new Date('2026-04-18T00:00:00.000Z'),
    });
    mockPrismaService.procurementSku.update.mockResolvedValue({
      id: 'sku-1',
      ingredientId: 'ingredient-1',
      name: '山姆猪里脊',
      brand: null,
      productModel: '1kg/包',
      purchaseChannel: '山姆',
      supplierName: null,
      purchaseUnit: '包',
      purchaseToBaseRatio: 1000,
      currentPurchasePrice: { toNumber: () => 76.5 },
      referencePurchasePrice: null,
      referencePricePerPurchaseUnit: null,
      displayUnit: '包',
      sourceTier: 'MARKET_PREMIUM',
      notes: null,
      isDefault: false,
      isActive: true,
      sortOrder: 0,
      safetyStock: null,
      reorderPoint: null,
      targetStock: null,
      createdAt: new Date('2026-04-19T00:00:00.000Z'),
    });

    await service.rollbackCurrentPurchasePrice(
      'sku-1',
      'history-1',
      'admin-2',
    );

    expect(mockPrismaService.procurementSku.update).toHaveBeenCalledWith({
      where: { id: 'sku-1' },
      data: { currentPurchasePrice: 76.5 },
    });
    expect(mockPrismaService.procurementSkuPriceHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        procurementSkuId: 'sku-1',
        ingredientId: 'ingredient-1',
        oldPrice: 88,
        newPrice: 76.5,
        source: 'ROLLBACK',
        rollbackFromHistoryId: 'history-1',
        operatorId: 'admin-2',
      }),
    });
  });
});
