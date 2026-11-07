import { Test, TestingModule } from '@nestjs/testing';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { IngredientCostHistoryService } from '../../../src/application/ingredient/ingredient-cost-history.service';
import { INGREDIENT_REPOSITORY } from '../../../src/application/ingredient/ingredient.service';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { IngredientPriceAnchorService } from '../../../src/application/ingredient/ingredient-price-anchor.service';
import { PURCHASE_RECORD_REPOSITORY } from '../../../src/application/purchasing/purchasing.service.tokens';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('IngredientPricingService', () => {
  let service: IngredientPricingService;

  const mockPrismaService = {
    ingredientPriceChange: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    procurementSku: {
      findMany: jest.fn(),
    },
  } as any;

  const mockIngredientRepository = {
    findByIds: jest.fn(),
    update: jest.fn(),
    updateEffectivePrice: jest.fn(),
  } as any;

  const mockPurchaseRecordRepository = {
    findByIngredientId: jest.fn(),
    findById: jest.fn(),
    findByPurchaseListId: jest.fn(),
  } as any;

  const mockGlobalConfigService = {
    getGlobalConfig: jest.fn(),
  } as any;

  const mockProcurementSkuService = {
    applyCurrentPurchasePrice: jest.fn(),
  } as any;

  // 2026-11-06：价格写入闸的基准价来自历史采购中位数，这里默认给空，
  // 等价于「没有历史采购」→ 闸门退回上一次生效价。
  const mockPriceAnchorService = {
    resolveAnchors: jest.fn().mockResolvedValue(new Map()),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientPricingService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: INGREDIENT_REPOSITORY,
          useValue: mockIngredientRepository,
        },
        {
          provide: PURCHASE_RECORD_REPOSITORY,
          useValue: mockPurchaseRecordRepository,
        },
        {
          provide: GlobalConfigService,
          useValue: mockGlobalConfigService,
        },
        {
          provide: ProcurementSkuService,
          useValue: mockProcurementSkuService,
        },
        {
          provide: IngredientPriceAnchorService,
          useValue: mockPriceAnchorService,
        },
        {
          provide: IngredientCostHistoryService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(IngredientPricingService);
    jest.clearAllMocks();
    mockPriceAnchorService.resolveAnchors.mockResolvedValue(new Map());
  });

  it('预览写入闸：幅度超过阈值时提前标出会被挂起', async () => {
    mockPrismaService.ingredientPriceChange.findMany
      .mockResolvedValueOnce([
        {
          id: 'change-high',
          ingredientId: 'ingredient-1',
          ingredientName: '猪里脊',
          reimbursementId: 'reimbursement-1',
          purchaseRecordId: 'purchase-record-1',
          sourceQuantity: { toNumber: () => 0.4 },
          sourcePricePerPurchaseUnit: { toNumber: () => 33.74 },
          previousCurrentPricePerPurchaseUnit: { toNumber: () => 12.38 },
          previousEffectivePrice: { toNumber: () => 12.38 },
          proposedEffectivePrice: { toNumber: () => 33.74 },
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          deltaRate: { toNumber: () => 1.726 },
          status: 'PENDING',
          reviewComment: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date('2026-11-07T00:00:00.000Z'),
          ingredient: { purchaseUnit: '斤' },
        },
      ])
      .mockResolvedValueOnce([]);

    mockIngredientRepository.findByIds.mockResolvedValue([
      { id: 'ingredient-1', purchaseToBaseRatio: 500 },
    ]);
    mockPurchaseRecordRepository.findByIngredientId.mockResolvedValue([]);
    mockGlobalConfigService.getGlobalConfig.mockResolvedValue({
      ingredientPriceAutoApproveThreshold: 0.1,
    });

    const result =
      await service.getPriceChangesForReimbursement('reimbursement-1');

    expect(result[0].gatePreviewAction).toBe('HOLD');
    expect(result[0].gatePreviewReason).toContain('10%');
    // 预判不是「已判定」：gateAction 仍然为空
    expect(result[0].gateAction).toBeNull();
  });

  it('converts decimal source quantities to numbers in reimbursement views', async () => {
    mockPrismaService.ingredientPriceChange.findMany
      .mockResolvedValueOnce([
        {
          id: 'change-1',
          ingredientId: 'ingredient-1',
          ingredientName: '西兰花',
          reimbursementId: 'reimbursement-1',
          purchaseRecordId: 'purchase-record-1',
          sourceQuantity: { toNumber: () => 0.69 },
          sourcePricePerPurchaseUnit: { toNumber: () => 6.03 },
          previousCurrentPricePerPurchaseUnit: { toNumber: () => 5.99 },
          previousEffectivePrice: { toNumber: () => 5.99 },
          proposedEffectivePrice: { toNumber: () => 6.03 },
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          deltaRate: { toNumber: () => 0.0067 },
          status: 'PENDING',
          reviewComment: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date('2026-04-14T00:00:00.000Z'),
          ingredient: {
            purchaseUnit: 'kg',
          },
        },
      ])
      .mockResolvedValueOnce([]);

    mockIngredientRepository.findByIds.mockResolvedValue([
      {
        id: 'ingredient-1',
        purchaseToBaseRatio: 1000,
      },
    ]);
    mockPurchaseRecordRepository.findByIngredientId.mockResolvedValue([]);
    mockGlobalConfigService.getGlobalConfig.mockResolvedValue({
      ingredientPriceAutoApproveThreshold: 0.08,
    });

    const result =
      await service.getPriceChangesForReimbursement('reimbursement-1');

    expect(result).toHaveLength(1);
    expect(result[0].sourceQuantity).toBe(0.69);
  });

  it('uses actual base quantity to create reimbursement price changes in ingredient purchase units', async () => {
    mockPrismaService.ingredientPriceChange.deleteMany.mockResolvedValue({
      count: 0,
    });
    mockPrismaService.ingredientPriceChange.createMany.mockResolvedValue({
      count: 1,
    });
    mockPrismaService.ingredientPriceChange.findMany.mockResolvedValue([]);
    mockPurchaseRecordRepository.findByPurchaseListId.mockResolvedValue([
      {
        id: 'purchase-record-1',
        ingredientId: 'ingredient-1',
        actualQuantity: 3375,
        actualBaseQuantity: 3375,
        actualCost: 101,
      },
    ]);
    mockIngredientRepository.findByIds.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '猪里脊',
        currentPricePerPurchaseUnit: 30,
        purchaseToBaseRatio: 1000,
        getEffectivePricePerPurchaseUnit: () => 30,
      },
    ]);
    mockGlobalConfigService.getGlobalConfig.mockResolvedValue({
      ingredientPriceAutoApproveThreshold: 0.08,
    });

    await service.syncPendingChangesForReimbursement('reimbursement-1', [
      'purchase-list-1',
    ]);

    expect(
      mockPrismaService.ingredientPriceChange.createMany,
    ).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          ingredientId: 'ingredient-1',
          purchaseRecordId: 'purchase-record-1',
          sourceQuantity: 3.375,
          // 6 位小数：101 元 / 3375g × 1000 = 29.925926 元/kg（原来被截成 29.93）
          sourcePricePerPurchaseUnit: 29.925926,
          proposedEffectivePrice: 29.925926,
        }),
      ],
    });
  });

  it('updates linked procurement sku current purchase price when reimbursement price changes are approved', async () => {
    mockPrismaService.ingredientPriceChange.findMany.mockResolvedValue([
      {
        id: 'change-1',
        ingredientId: 'ingredient-1',
        ingredientName: '牛霖',
        reimbursementId: 'reimbursement-1',
        purchaseRecordId: 'purchase-record-1',
        sourceQuantity: { toNumber: () => 2 },
        sourcePricePerPurchaseUnit: { toNumber: () => 76.5 },
        previousCurrentPricePerPurchaseUnit: { toNumber: () => 80 },
        previousEffectivePrice: { toNumber: () => 80 },
        proposedEffectivePrice: { toNumber: () => 76.5 },
        appliedCurrentPricePerPurchaseUnit: null,
        appliedEffectivePricePerPurchaseUnit: null,
        deltaRate: { toNumber: () => -0.0438 },
        status: 'PENDING',
        reviewComment: null,
        reviewedById: null,
        reviewedAt: null,
        createdAt: new Date('2026-04-14T00:00:00.000Z'),
      },
    ]);
    mockIngredientRepository.findByIds.mockResolvedValue([
      {
        id: 'ingredient-1',
        purchaseToBaseRatio: 1000,
      },
    ]);
    mockPurchaseRecordRepository.findById.mockResolvedValue({
      id: 'purchase-record-1',
      procurementSkuId: 'sku-1',
      actualBaseQuantity: 3375,
      actualCost: 101,
    });
    mockPrismaService.procurementSku.findMany.mockResolvedValue([
      {
        id: 'sku-1',
        purchaseToBaseRatio: 1000,
      },
    ]);

    await service.applyApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
      '审核通过',
    );

    expect(
      mockProcurementSkuService.applyCurrentPurchasePrice,
    ).toHaveBeenCalledWith(
      'sku-1',
      29.93,
      expect.objectContaining({
        source: 'REIMBURSEMENT',
        reimbursementId: 'reimbursement-1',
        purchaseRecordId: 'purchase-record-1',
        operatorId: 'admin-1',
      }),
    );
  });

  it('采购折算价与基准价相差超过 5 倍时，写入闸直接拒绝（2026-11-04 小米事故口径）', async () => {
    // 事故背景：小米曾被写成 38.30 元/g，而正常价是 0.018652 元/g。
    // 2026-11-06 起「离谱价」的判断从自动审核挪到了写入闸，
    // 对自动审核、人工放行两条路径都生效，不会被绕过。
    mockIngredientRepository.findByIds.mockResolvedValue([
      {
        id: 'ingredient-1',
        name: '小米',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 0.018652,
        getEffectivePricePerPurchaseUnit: () => 0.018652,
      },
    ]);
    // 前序用例可能给 findById 设过实现（clearAllMocks 不清实现），这里显式置空，
    // 让拟定价直接取 sourcePricePerPurchaseUnit = 38.3。
    mockPurchaseRecordRepository.findById.mockResolvedValue(undefined);
    mockPrismaService.ingredientPriceChange.update.mockResolvedValue({});

    await (service as any).applyPriceChanges(
      [
        {
          id: 'change-1',
          ingredientId: 'ingredient-1',
          reimbursementId: 'reimbursement-1',
          purchaseRecordId: 'purchase-record-1',
          sourceQuantity: { toNumber: () => 1.565217 },
          sourcePricePerPurchaseUnit: { toNumber: () => 38.3 },
          previousCurrentPricePerPurchaseUnit: { toNumber: () => 0.018652 },
          previousEffectivePrice: { toNumber: () => 0.018652 },
          proposedEffectivePrice: { toNumber: () => 38.3 },
          appliedCurrentPricePerPurchaseUnit: null,
          appliedEffectivePricePerPurchaseUnit: null,
          deltaRate: { toNumber: () => 2052.3 },
          status: 'PENDING',
          reviewComment: null,
          reviewedById: null,
          reviewedAt: null,
          createdAt: new Date(),
        },
      ],
      null,
      null,
    );

    expect(mockIngredientRepository.update).not.toHaveBeenCalled();
    const updateCall = mockPrismaService.ingredientPriceChange.update.mock.calls
      .map((call: any[]) => call[0])
      .find((arg: any) => arg?.where?.id === 'change-1');
    expect(updateCall).toBeDefined();
    expect(updateCall.data.status).toBe('REJECTED');
    expect(updateCall.data.gateAction).toBe('REJECT');
    expect(updateCall.data.gateReason).toContain('倍');
  });

  // 2026-11-08：基准改用「档案当前生效价」，阈值 10%
  const buildGateChange = (proposedPrice: number) => ({
    id: 'change-gate',
    ingredientId: 'ingredient-gate',
    reimbursementId: 'reimbursement-1',
    purchaseRecordId: 'purchase-record-gate',
    sourceQuantity: { toNumber: () => 1 },
    sourcePricePerPurchaseUnit: { toNumber: () => proposedPrice },
    previousCurrentPricePerPurchaseUnit: { toNumber: () => 10 },
    previousEffectivePrice: { toNumber: () => 10 },
    proposedEffectivePrice: { toNumber: () => proposedPrice },
    appliedCurrentPricePerPurchaseUnit: null,
    appliedEffectivePricePerPurchaseUnit: null,
    deltaRate: { toNumber: () => (proposedPrice - 10) / 10 },
    status: 'PENDING',
    reviewComment: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
  });

  const runGate = async (proposedPrice: number) => {
    mockIngredientRepository.findByIds.mockResolvedValue([
      {
        id: 'ingredient-gate',
        name: '测试原料',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 10,
        getEffectivePricePerPurchaseUnit: () => 10,
      },
    ]);
    mockPurchaseRecordRepository.findById.mockResolvedValue(undefined);
    mockPrismaService.ingredientPriceChange.update.mockResolvedValue({});
    mockIngredientRepository.update.mockClear();
    // 2026-11-08 起生产阈值是 10%
    mockGlobalConfigService.getGlobalConfig.mockResolvedValue({
      ingredientPriceAutoApproveThreshold: 0.1,
    });

    await (service as any).applyPriceChanges(
      [buildGateChange(proposedPrice)],
      null,
      null,
    );

    const updateCall = mockPrismaService.ingredientPriceChange.update.mock.calls
      .map((call: any[]) => call[0])
      .find((arg: any) => arg?.where?.id === 'change-gate');
    return updateCall;
  };

  it('相对档案价 9%（阈值 10% 内）直接生效', async () => {
    const updateCall = await runGate(10.9);

    expect(updateCall.data.status).toBe('APPROVED');
    expect(updateCall.data.gateAction).toBe('APPLY');
    expect(mockIngredientRepository.update).toHaveBeenCalled();
  });

  it('相对档案价 11%（超过 10%）挂起，价格不写', async () => {
    const updateCall = await runGate(11.1);

    expect(updateCall.data.gateAction).toBe('HOLD');
    expect(updateCall.data.gateReason).toContain('10%');
    expect(mockIngredientRepository.update).not.toHaveBeenCalled();
  });

  it('闸门不再看历史中位数：中位数再离谱，也按档案价判定', async () => {
    // 历史中位数 50（相对档案价 10 是 5 倍），但本单只比档案价贵 9%
    mockPriceAnchorService.resolveAnchors.mockResolvedValue(
      new Map([['ingredient-gate', 50]]),
    );

    const updateCall = await runGate(10.9);

    expect(updateCall.data.status).toBe('APPROVED');
    expect(updateCall.data.gateAction).toBe('APPLY');
  });

});
