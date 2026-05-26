import { BadRequestException } from '@nestjs/common';
import { SupplementImportService } from '../../../src/application/supplement-import/supplement-import.service';
import type { NormalizedSupplementImportDraft } from '../../../src/application/supplement-import/supplement-import.types';
import type { RequestUser } from '../../../src/interfaces/auth/request-user.interface';

describe('SupplementImportService', () => {
  let service: SupplementImportService;

  const prisma = {
    ingredient: {
      findMany: jest.fn(),
    },
    supplementImportDraft: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const agentConfigService = {
    getEnabledSupplementImportConfigForUse: jest.fn(),
  };
  const agentClient = {
    recognize: jest.fn(),
  };
  const ingredientService = {
    createIngredient: jest.fn(),
    updateIngredient: jest.fn(),
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
    jest.clearAllMocks();
    service = new SupplementImportService(
      prisma as any,
      agentConfigService as any,
      agentClient as any,
      ingredientService as any,
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
    prisma.supplementImportDraft.update.mockResolvedValue({
      ...readyRecordForCreate,
      status: 'CONFIRMED',
      confirmedIngredientId: 'new-ing-1',
      confirmedBy: 'admin-1',
      confirmedAt: new Date('2026-05-27T00:00:00.000Z'),
    });
    ingredientService.createIngredient.mockResolvedValue({ id: 'new-ing-1' });

    const result = await service.confirmDraft('draft-1', adminUser);

    expect(ingredientService.createIngredient).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SUPPLEMENT',
        brand: 'Ocean',
        productModel: '90片',
        nutritionProfile: expect.objectContaining({
          meta: expect.objectContaining({ sourceType: 'LABEL' }),
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
    expect(ingredientService.createIngredient).not.toHaveBeenCalled();
  });
});
