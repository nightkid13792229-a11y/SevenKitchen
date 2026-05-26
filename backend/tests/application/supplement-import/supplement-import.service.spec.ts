import { BadRequestException } from '@nestjs/common';
import { SupplementImportService } from '../../../src/application/supplement-import/supplement-import.service';
import type { NormalizedSupplementImportDraft } from '../../../src/application/supplement-import/supplement-import.types';
import type { RequestUser } from '../../../src/interfaces/auth/request-user.interface';

describe('SupplementImportService', () => {
  let service: SupplementImportService;

  const prisma = {
    $transaction: jest.fn(),
    ingredient: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    supplementImportDraft: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const agentConfigService = {
    getEnabledSupplementImportConfigForUse: jest.fn(),
  };
  const agentClient = {
    recognize: jest.fn(),
  };
  const cosService = {
    uploadImage: jest.fn(),
  };

  const adminUser: RequestUser = {
    userId: 'admin-1',
    customerId: 'admin-1',
    role: 'ADMIN',
  };

  const enabledConfig = {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    visionModel: 'gpt-4.1-mini',
    textModel: 'gpt-4.1-mini',
    temperature: 0.1,
    timeoutMs: 30000,
    maxRetries: 1,
    promptVersion: 'supplement-import-v1',
    schemaVersion: 'supplement-import-schema-v1',
    snapshot: { id: 'cfg-1', provider: 'OPENAI_COMPATIBLE' },
  };

  const extractedOceanIodinePayload = {
    ingredient: {
      name: '海藻碘片',
      brand: 'Ocean',
      productSpec: '90片',
      baseUnit: 'PCS',
      unitDisplayLabel: '片',
      weightG: 0.5,
      addTiming: 'BEFORE_MEAL',
      productionLossRate: 1.05,
      categoryType: 'MINERAL',
      notes: '随餐',
    },
    nutrition: {
      rawBasisType: 'PER_SERVING',
      servingWeightG: 0.5,
      sampleState: 'RAW',
      items: [{ name: 'Iodine', value: 150, unit: 'μg', confidence: 0.98 }],
    },
    rawOcrText: 'Ocean 海藻碘片',
    risks: [],
    modelUsage: { prompt_tokens: 10, completion_tokens: 20 },
  };

  const normalizedReadyDraft: NormalizedSupplementImportDraft = {
    ingredient: {
      name: '海藻碘片',
      type: 'SUPPLEMENT',
      brand: 'Ocean',
      productSpec: '90片',
      baseUnit: 'PCS',
      unitDisplayLabel: '片',
      weightG: 0.5,
      addTiming: 'BEFORE_MEAL',
      productionLossRate: 1.05,
      categoryType: 'MINERAL',
    },
    nutritionProfile: {
      meta: {
        rawBasisType: 'PER_SERVING',
        servingWeightG: 0.5,
        sourceType: 'LABEL',
        attachments: ['https://cdn.example.com/a.jpg'],
        confidenceLevel: 'HIGH',
      },
      macros: {},
      minerals: { iodine: 150 },
      vitamins: {},
      fattyAcids: {},
      aminoAcids: {},
      customItems: [],
    } as any,
    rejectedNutritionItems: [],
    duplicateCandidates: [],
    duplicateResolution: { action: 'CREATE_NEW' },
    riskFlags: [],
  };

  const createdRecord = {
    id: 'draft-1',
    status: 'RECOGNIZING',
    imageUrls: [
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
    ],
    validationErrors: [],
    duplicateCandidates: [],
    normalizedDraft: null,
    createdBy: 'admin-1',
    createdAt: new Date('2026-05-27T00:00:00.000Z'),
    updatedAt: new Date('2026-05-27T00:00:00.000Z'),
  };

  const reviewRecord = {
    ...createdRecord,
    status: 'NEEDS_REVIEW',
    normalizedDraft: {
      ...normalizedReadyDraft,
      duplicateCandidates: [
        {
          ingredientId: 'ing-1',
          matchType: 'EXACT',
          name: '海藻碘片',
          brand: 'Ocean',
          productSpec: '90片',
        },
      ],
      duplicateResolution: null,
    },
    duplicateCandidates: [
      {
        ingredientId: 'ing-1',
        matchType: 'EXACT',
        name: '海藻碘片',
        brand: 'Ocean',
        productSpec: '90片',
      },
    ],
    validationErrors: [
      {
        code: 'DUPLICATE_RESOLUTION_REQUIRED',
        message: '精确重复项必须选择更新已有补剂',
        level: 'BLOCKING',
      },
    ],
    aiExtractedData: extractedOceanIodinePayload,
    rawOcrText: 'Ocean 海藻碘片',
    modelUsage: { prompt_tokens: 10, completion_tokens: 20 },
  };

  const readyRecordForCreate = {
    ...createdRecord,
    status: 'READY_TO_CONFIRM',
    normalizedDraft: normalizedReadyDraft,
    validationErrors: [],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    service = new SupplementImportService(
      prisma as any,
      agentConfigService as any,
      agentClient as any,
      cosService as any,
    );
  });

  it('refuses draft creation when Agent is disabled', async () => {
    agentConfigService.getEnabledSupplementImportConfigForUse.mockRejectedValue(
      new Error('补剂识别 Agent 未启用'),
    );

    await expect(
      service.createDraft(
        { imageUrls: ['https://cdn.example.com/a.jpg'] },
        adminUser,
      ),
    ).rejects.toThrow('补剂识别 Agent 未启用');
    expect(prisma.supplementImportDraft.create).not.toHaveBeenCalled();
  });

  it('stores recognized normalized draft with validation errors and duplicate candidates', async () => {
    agentConfigService.getEnabledSupplementImportConfigForUse.mockResolvedValue(
      enabledConfig,
    );
    agentClient.recognize.mockResolvedValue(extractedOceanIodinePayload);
    prisma.ingredient.findMany.mockResolvedValue([
      { id: 'ing-1', name: '海藻碘片', brand: 'Ocean', productModel: '90片' },
    ]);
    prisma.supplementImportDraft.create.mockResolvedValue(createdRecord);
    prisma.supplementImportDraft.update.mockResolvedValue(reviewRecord);

    const result = await service.createDraft(
      {
        imageUrls: [
          'https://cdn.example.com/a.jpg',
          'https://cdn.example.com/b.jpg',
        ],
      },
      adminUser,
    );

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.duplicateCandidates[0].matchType).toBe('EXACT');
    expect(prisma.supplementImportDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'RECOGNIZING',
          createdBy: 'admin-1',
        }),
      }),
    );
    expect(prisma.supplementImportDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-1' },
        data: expect.objectContaining({
          status: 'NEEDS_REVIEW',
          duplicateCandidates: expect.arrayContaining([
            expect.objectContaining({ matchType: 'EXACT' }),
          ]),
          validationErrors: expect.arrayContaining([
            expect.objectContaining({
              code: 'DUPLICATE_RESOLUTION_REQUIRED',
            }),
          ]),
        }),
      }),
    );
  });

  it('confirms a complete new draft into Ingredient', async () => {
    prisma.supplementImportDraft.findUnique.mockResolvedValue(
      readyRecordForCreate,
    );
    prisma.supplementImportDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.create.mockResolvedValue({ id: 'new-ing-1' });
    prisma.supplementImportDraft.update.mockResolvedValue({
      ...readyRecordForCreate,
      status: 'CONFIRMED',
      confirmedIngredientId: 'new-ing-1',
      confirmedBy: 'admin-1',
      confirmedAt: new Date('2026-05-27T00:00:00.000Z'),
    });
    const result = await service.confirmDraft('draft-1', adminUser);

    expect(prisma.ingredient.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SUPPLEMENT',
          brand: 'Ocean',
          productModel: '90片',
          nutritionProfile: expect.objectContaining({
            meta: expect.objectContaining({ sourceType: 'LABEL' }),
          }),
        }),
      }),
    );
    expect(result.confirmedIngredientId).toBe('new-ing-1');
  });

  it('rejects confirmation when persisted draft is incomplete', async () => {
    prisma.supplementImportDraft.findUnique.mockResolvedValue({
      ...readyRecordForCreate,
      normalizedDraft: {
        ...normalizedReadyDraft,
        ingredient: { ...normalizedReadyDraft.ingredient, brand: '' },
      },
    });

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('returns already confirmed drafts idempotently without writing another ingredient', async () => {
    const confirmedRecord = {
      ...readyRecordForCreate,
      status: 'CONFIRMED',
      confirmedIngredientId: 'new-ing-1',
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(confirmedRecord);

    const result = await service.confirmDraft('draft-1', adminUser);

    expect(result).toBe(confirmedRecord);
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    expect(prisma.supplementImportDraft.updateMany).not.toHaveBeenCalled();
  });

  it('rejects failed or review drafts without writing an ingredient', async () => {
    prisma.supplementImportDraft.findUnique.mockResolvedValue({
      ...readyRecordForCreate,
      status: 'FAILED',
    });

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      '当前草稿状态不可确认',
    );
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('does not create an ingredient when the ready status guard loses a retry race', async () => {
    prisma.supplementImportDraft.findUnique.mockResolvedValue(
      readyRecordForCreate,
    );
    prisma.supplementImportDraft.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      '草稿状态已变化',
    );
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('updates existing ingredients with label-owned fields only', async () => {
    const updateDraft = {
      ...readyRecordForCreate,
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'EXACT' }],
      normalizedDraft: {
        ...normalizedReadyDraft,
        duplicateResolution: {
          action: 'UPDATE_EXISTING',
          ingredientId: 'ing-1',
        },
        duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'EXACT' }],
      },
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(updateDraft);
    prisma.supplementImportDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 1 });
    prisma.supplementImportDraft.update.mockResolvedValue({
      ...updateDraft,
      status: 'CONFIRMED',
      confirmedIngredientId: 'ing-1',
    });

    await service.confirmDraft('draft-1', adminUser);

    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
      where: { id: 'ing-1', type: 'SUPPLEMENT' },
      data: expect.objectContaining({
        name: '海藻碘片',
        brand: 'Ocean',
        productModel: '90片',
        baseUnit: 'PCS',
        unitDisplayLabel: '片',
        weightG: 0.5,
        properties: expect.objectContaining({
          category_type: 'MINERAL',
          add_timing: 'BEFORE_MEAL',
          production_loss_rate: 1.05,
        }),
        nutritionProfile: expect.any(Object),
      }),
    });
    expect(prisma.ingredient.updateMany).toHaveBeenCalledWith(
      expect.not.objectContaining({
        data: expect.objectContaining({
          procurementStrategy: expect.anything(),
          diyEnabled: expect.anything(),
          procurementEnabled: expect.anything(),
          purchaseUnit: expect.anything(),
          purchaseToBaseRatio: expect.anything(),
          currentPricePerPurchaseUnit: expect.anything(),
        }),
      }),
    );
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('rejects forged update-existing targets that are not in server duplicate candidates', async () => {
    const forgedDraft = {
      ...readyRecordForCreate,
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'EXACT' }],
      normalizedDraft: {
        ...normalizedReadyDraft,
        duplicateResolution: {
          action: 'UPDATE_EXISTING',
          ingredientId: 'unrelated-supplement-id',
        },
        duplicateCandidates: [
          { ingredientId: 'unrelated-supplement-id', matchType: 'EXACT' },
        ],
      },
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(forgedDraft);

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.supplementImportDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.update).not.toHaveBeenCalled();
  });

  it('rejects update-existing targets when the server draft has no duplicate candidates', async () => {
    const forgedDraft = {
      ...readyRecordForCreate,
      duplicateCandidates: [],
      normalizedDraft: {
        ...normalizedReadyDraft,
        duplicateResolution: {
          action: 'UPDATE_EXISTING',
          ingredientId: 'forged-supplement-id',
        },
        duplicateCandidates: [
          { ingredientId: 'forged-supplement-id', matchType: 'POSSIBLE' },
        ],
      },
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(forgedDraft);

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.supplementImportDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects update-existing targets that are not in possible server duplicate candidates', async () => {
    const forgedDraft = {
      ...readyRecordForCreate,
      duplicateCandidates: [{ ingredientId: 'ing-1', matchType: 'POSSIBLE' }],
      normalizedDraft: {
        ...normalizedReadyDraft,
        duplicateResolution: {
          action: 'UPDATE_EXISTING',
          ingredientId: 'forged-supplement-id',
        },
        duplicateCandidates: [
          { ingredientId: 'forged-supplement-id', matchType: 'POSSIBLE' },
        ],
      },
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(forgedDraft);

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      BadRequestException,
    );

    expect(prisma.supplementImportDraft.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects update-existing confirmation when the target is not a supplement ingredient', async () => {
    const updateDraft = {
      ...readyRecordForCreate,
      duplicateCandidates: [{ ingredientId: 'food-1', matchType: 'EXACT' }],
      normalizedDraft: {
        ...normalizedReadyDraft,
        duplicateResolution: {
          action: 'UPDATE_EXISTING',
          ingredientId: 'food-1',
        },
        duplicateCandidates: [{ ingredientId: 'food-1', matchType: 'EXACT' }],
      },
    };
    prisma.supplementImportDraft.findUnique.mockResolvedValue(updateDraft);
    prisma.supplementImportDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.confirmDraft('draft-1', adminUser)).rejects.toThrow(
      '目标补剂原料不存在',
    );

    expect(prisma.ingredient.update).not.toHaveBeenCalled();
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects malformed normalized drafts during update with BadRequestException', async () => {
    prisma.supplementImportDraft.findUnique.mockResolvedValue(
      readyRecordForCreate,
    );

    await expect(
      service.updateDraft(
        'draft-1',
        { normalizedDraft: { ingredient: null } as any },
        adminUser,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.supplementImportDraft.update).not.toHaveBeenCalled();
  });

  it.each([
    ['duplicateCandidates', { duplicateCandidates: [null] }],
    ['riskFlags', { riskFlags: [null] }],
    [
      'duplicateResolution',
      { duplicateResolution: { action: 'UPDATE_EXISTING', ingredientId: 123 } },
    ],
  ])(
    'rejects malformed normalized draft %s fields before validation',
    async (_field, patch) => {
      prisma.supplementImportDraft.findUnique.mockResolvedValue(
        readyRecordForCreate,
      );

      await expect(
        service.updateDraft(
          'draft-1',
          {
            normalizedDraft: {
              ...normalizedReadyDraft,
              ...patch,
            } as any,
          },
          adminUser,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.supplementImportDraft.update).not.toHaveBeenCalled();
    },
  );
});
