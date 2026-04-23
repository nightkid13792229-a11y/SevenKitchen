import { Test, TestingModule } from '@nestjs/testing';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { INGREDIENT_REPOSITORY } from '../../../src/application/ingredient/ingredient.service';
import { ProcurementSkuService } from '../../../src/application/ingredient/procurement-sku.service';
import { PURCHASE_RECORD_REPOSITORY } from '../../../src/application/purchasing/purchasing.service.tokens';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('IngredientPricingService', () => {
  let service: IngredientPricingService;

  const mockPrismaService = {
    ingredientPriceChange: {
      findMany: jest.fn(),
      update: jest.fn(),
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
  } as any;

  const mockGlobalConfigService = {
    getGlobalConfig: jest.fn(),
  } as any;

  const mockProcurementSkuService = {
    applyCurrentPurchasePrice: jest.fn(),
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
      ],
    }).compile();

    service = module.get(IngredientPricingService);
    jest.clearAllMocks();
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
    });

    await service.applyApprovedChangesForReimbursement(
      'reimbursement-1',
      'admin-1',
      '审核通过',
    );

    expect(mockProcurementSkuService.applyCurrentPurchasePrice).toHaveBeenCalledWith(
      'sku-1',
      76.5,
      expect.objectContaining({
        source: 'REIMBURSEMENT',
        reimbursementId: 'reimbursement-1',
        purchaseRecordId: 'purchase-record-1',
        operatorId: 'admin-1',
      }),
    );
  });
});
