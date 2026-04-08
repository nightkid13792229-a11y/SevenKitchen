import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('ProcurementSkuService', () => {
  let service: ProcurementSkuService;
  const mockPrismaService = {
    procurementSku: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
  });

  it('batchFindActive groups active procurement skus by ingredient id ordered by sortOrder', async () => {
    mockPrismaService.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-2',
        ingredientId: 'ingredient-1',
        name: '京东鸡胸 500g/袋',
        brand: null,
        productModel: null,
        purchaseChannel: '京东冷链',
        referencePricePerPurchaseUnit: { toNumber: () => 21.5 },
        displayUnit: '袋',
        notes: null,
        isActive: true,
        sortOrder: 2,
        createdAt: new Date('2026-04-03T00:00:02.000Z'),
        updatedAt: new Date('2026-04-03T00:00:02.000Z'),
      },
      {
        id: 'sku-1',
        ingredientId: 'ingredient-1',
        name: '京东鸡胸 1kg/袋',
        brand: null,
        productModel: null,
        purchaseChannel: '京东冷链',
        referencePricePerPurchaseUnit: { toNumber: () => 39.9 },
        displayUnit: '袋',
        notes: null,
        isActive: true,
        sortOrder: 1,
        createdAt: new Date('2026-04-03T00:00:01.000Z'),
        updatedAt: new Date('2026-04-03T00:00:01.000Z'),
      },
    ]);

    await expect(service.batchFindActive(['ingredient-1'])).resolves.toEqual({
      'ingredient-1': [
        {
          id: 'sku-1',
          ingredientId: 'ingredient-1',
          name: '京东鸡胸 1kg/袋',
          brand: null,
          productModel: null,
          purchaseChannel: '京东冷链',
          referencePricePerPurchaseUnit: 39.9,
          displayUnit: '袋',
          notes: null,
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'sku-2',
          ingredientId: 'ingredient-1',
          name: '京东鸡胸 500g/袋',
          brand: null,
          productModel: null,
          purchaseChannel: '京东冷链',
          referencePricePerPurchaseUnit: 21.5,
          displayUnit: '袋',
          notes: null,
          isActive: true,
          sortOrder: 2,
        },
      ],
    });

    expect(mockPrismaService.procurementSku.findMany).toHaveBeenCalledWith({
      where: {
        ingredientId: { in: ['ingredient-1'] },
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
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
        displayUnit: data.displayUnit,
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
        displayUnit: ' ',
        notes: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        brand: null,
        productModel: null,
        purchaseChannel: null,
        displayUnit: null,
        notes: null,
      }),
    );
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
});
