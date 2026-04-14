import { Test, TestingModule } from '@nestjs/testing';
import { GlobalConfigService } from '../../../src/application/config/global-config.service';
import { IngredientPricingService } from '../../../src/application/ingredient/ingredient-pricing.service';
import { INGREDIENT_REPOSITORY } from '../../../src/application/ingredient/ingredient.service';
import { PURCHASE_RECORD_REPOSITORY } from '../../../src/application/purchasing/purchasing.service.tokens';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('IngredientPricingService', () => {
  let service: IngredientPricingService;

  const mockPrismaService = {
    ingredientPriceChange: {
      findMany: jest.fn(),
    },
  } as any;

  const mockIngredientRepository = {
    findByIds: jest.fn(),
  } as any;

  const mockPurchaseRecordRepository = {
    findByIngredientId: jest.fn(),
  } as any;

  const mockGlobalConfigService = {
    getGlobalConfig: jest.fn(),
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
});
