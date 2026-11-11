import { Test } from '@nestjs/testing';
import {
  INVENTORY_REPOSITORY,
  InventoryService,
} from 'src/application/inventory/inventory.service';
import { PRODUCTION_BATCH_REPOSITORY } from 'src/application/production/production.service';
import { PrismaService } from 'src/infrastructure/prisma.service';

/**
 * 员工端「领用/报废记录」的数据来源：后台与小程序共用 listAdjustments。
 * 这里守住三件事：分类/状态原样返回、待复核筛选生效、分页上限被夹住。
 */
describe('InventoryService listAdjustments', () => {
  let service: InventoryService;
  let prisma: any;

  const row = (overrides: Record<string, any> = {}) => ({
    id: 'adj-1',
    ingredientId: 'i1',
    procurementSkuId: null,
    adjustmentMode: 'DELTA',
    quantityBeforeG: 1000,
    quantityAfterG: 800,
    deltaG: -200,
    reason: '内部领用',
    note: '试餐',
    category: 'INTERNAL_USE',
    reviewStatus: 'NONE',
    costAmount: 5.2,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    reversesAdjustmentId: null,
    createdAt: new Date('2026-11-11T09:00:00.000Z'),
    ingredient: {
      name: '鸡胸肉',
      baseUnit: 'G',
      unitDisplayLabel: '克',
    },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      inventoryAdjustment: {
        findMany: jest.fn().mockResolvedValue([row()]),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: INVENTORY_REPOSITORY,
          useValue: {
            recordEntries: jest.fn(),
            existsBySourceAndIngredient: jest.fn(),
            existsBySourceVersionAndIngredient: jest.fn(),
            getCurrentBalanceByIngredient: jest.fn(),
            findBySource: jest.fn(),
          },
        },
        { provide: PRODUCTION_BATCH_REPOSITORY, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  it('返回原料名、单位、分类、复核状态与驳回原因', async () => {
    prisma.inventoryAdjustment.findMany.mockResolvedValue([
      row({
        category: 'DAMAGED',
        reviewStatus: 'REJECTED',
        reviewNote: '照片不清楚',
        costAmount: 80,
      }),
    ]);

    const [item] = await service.listAdjustments({ limit: 50 });

    expect(item).toEqual(
      expect.objectContaining({
        ingredientName: '鸡胸肉',
        stockUnitLabel: '克',
        category: 'DAMAGED',
        reviewStatus: 'REJECTED',
        reviewNote: '照片不清楚',
        costAmount: 80,
        deltaG: -200,
      }),
    );
  });

  it('只看待复核时把状态条件下推到查询', async () => {
    await service.listAdjustments({ pending: true, limit: 10 });

    expect(prisma.inventoryAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reviewStatus: 'PENDING' }),
        take: 10,
      }),
    );
  });

  it('分页上限夹在 200 以内，防止一次拉爆', async () => {
    await service.listAdjustments({ limit: 5000 });
    expect(prisma.inventoryAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });
});
