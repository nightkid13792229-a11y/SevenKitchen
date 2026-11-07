import { Test, TestingModule } from '@nestjs/testing';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/**
 * 食材成本流水（2026-11-07 成本口径归位）。
 *
 * 这张表回答「这个成本数是怎么来的」：建档初始化、报销覆盖、手工改价、口径迁移。
 * 只有服务自己写它，所以这里只测两件事：写得对不对（精度、来源、事务）、
 * 读出来能不能看懂（操作人名、时间）。
 */
describe('IngredientCostHistoryService', () => {
  let service: IngredientCostHistoryService;

  const create = jest.fn();
  const findMany = jest.fn();

  const mockPrisma = {
    ingredientPriceHistory: { create },
    $transaction: undefined,
  } as any;

  beforeEach(async () => {
    jest.resetAllMocks();
    create.mockResolvedValue({ id: 'h1' });
    findMany.mockResolvedValue([]);

    mockPrisma.ingredientPriceHistory = { create, findMany };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCostHistoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(IngredientCostHistoryService);
  });

  it('写一条初始化流水：老成本为空、新成本落库', async () => {
    await service.record({
      ingredientId: 'i1',
      oldCost: null,
      newCost: 0.0798,
      source: 'INIT_FROM_SKU',
      procurementSkuId: 'sku1',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'i1',
        oldCostPerBaseUnit: null,
        newCostPerBaseUnit: 0.0798,
        source: 'INIT_FROM_SKU',
        procurementSkuId: 'sku1',
      }),
    });
  });

  it('极小的成本不会被四舍五入成 0（盐这类 0.000008 元/g 是常态）', async () => {
    await service.record({
      ingredientId: 'i1',
      oldCost: 0,
      newCost: 0.000008,
      source: 'REIMBURSEMENT',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ newCostPerBaseUnit: 0.000008 }),
    });
  });

  it('超过 6 位的小数按 6 位取整（与 numeric(14,6) 对齐）', async () => {
    await service.record({
      ingredientId: 'i1',
      oldCost: null,
      newCost: 0.079812345,
      source: 'MANUAL',
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ newCostPerBaseUnit: 0.079812 }),
    });
  });

  it('传了事务就用事务里的 client（不能绕过调用方的事务）', async () => {
    const txCreate = jest.fn().mockResolvedValue({ id: 'h2' });

    await service.record({
      ingredientId: 'i1',
      oldCost: 0.1,
      newCost: 0.2,
      source: 'INIT_FROM_SKU',
      tx: { ingredientPriceHistory: { create: txCreate } } as any,
    });

    expect(txCreate).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('列表按时间倒序返回，并带出操作人名字', async () => {
    findMany.mockResolvedValue([
      {
        id: 'h1',
        oldCostPerBaseUnit: null,
        newCostPerBaseUnit: 0.0798,
        source: 'INIT_FROM_SKU',
        note: '建档',
        createdAt: new Date('2026-11-07T10:00:00Z'),
        operator: { nickname: '张三' },
      },
    ]);

    const rows = await service.list('i1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ingredientId: 'i1' },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(rows[0]).toMatchObject({
      id: 'h1',
      oldCostPerBaseUnit: null,
      newCostPerBaseUnit: 0.0798,
      source: 'INIT_FROM_SKU',
      operatorName: '张三',
    });
  });
});
