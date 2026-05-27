import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IngredientCreationService } from '../../../src/application/ingredient-creation/ingredient-creation.service';

function createPrismaMock() {
  return {
    ingredient: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    nutritionFood: {
      upsert: jest.fn(),
    },
    nutritionFoodMapping: {
      create: jest.fn(),
    },
    ingredientCreationJob: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationMessage: {
      create: jest.fn(),
    },
    ingredientCreationDraft: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    ingredientCreationDraftProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

const primaryNutritionProfile = {
  macros: { energyKcal: 120 },
  meta: { rawBasisType: 'PER_100_G' },
};

function createDraftProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'profile-1',
    role: 'PRIMARY',
    sourceFoodName: 'Duck, breast, raw',
    sourceFoodNameEn: 'Duck, breast, raw',
    sourceType: 'USDA',
    sourceKey: 'USDA:123',
    suggestedDisplayNameZh: '鸭胸肉（生）',
    nutritionData: primaryNutritionProfile,
    preparationState: 'RAW',
    preparationStateLabel: '生',
    ediblePortionLabel: '可食部',
    processingLabel: '未加工',
    sortOrder: 0,
    agentRationale: '主档案',
    ...overrides,
  };
}

function createReadyDraft(overrides: Record<string, any> = {}) {
  return {
    id: 'draft-1',
    jobId: 'job-1',
    status: 'READY_FOR_REVIEW',
    suggestedName: '鸭胸肉',
    baseUnit: 'G',
    unitDisplayLabel: 'g',
    procurementStrategy: 'DAILY_PURCHASE',
    diyEnabled: true,
    procurementEnabled: false,
    notes: 'Agent 草稿',
    job: { id: 'job-1', createdBy: 'staff-1' },
    profiles: [createDraftProfile()],
    ...overrides,
  };
}

function createConfirmTransactionMock() {
  return {
    ingredient: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'ingredient-1' }),
    },
    nutritionFood: {
      upsert: jest.fn().mockResolvedValue({ id: 'food-1' }),
    },
    nutritionFoodMapping: {
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
    },
    ingredientCreationDraft: {
      findUnique: jest.fn().mockResolvedValue(createReadyDraft()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({
        id: 'draft-1',
        status: 'CONFIRMED',
        confirmedIngredientId: 'ingredient-1',
      }),
    },
    ingredientCreationJob: {
      update: jest.fn().mockResolvedValue({ id: 'job-1', status: 'CONFIRMED' }),
    },
  };
}

describe('IngredientCreationService', () => {
  it('creates a draft job without creating a formal ingredient', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.create.mockResolvedValue({
      id: 'job-1',
      requestText: '新增鸭胸肉',
      status: 'DRAFTING',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.createJob({
      requestText: '  新增鸭胸肉  ',
      userId: 'staff-1',
    });

    expect(prisma.ingredientCreationJob.create).toHaveBeenCalledWith({
      data: {
        createdBy: 'staff-1',
        requestText: '新增鸭胸肉',
        status: 'DRAFTING',
        currentStage: '已创建任务',
        progress: 0,
        messages: {
          create: [
            {
              role: 'USER',
              content: '新增鸭胸肉',
            },
            {
              role: 'SYSTEM',
              content: '已创建 AI 新增食材任务，等待 Agent 开始研究。',
            },
          ],
        },
      },
      include: expect.objectContaining({
        messages: expect.objectContaining({
          orderBy: { createdAt: 'asc' },
        }),
        draft: expect.objectContaining({
          include: expect.objectContaining({
            profiles: expect.objectContaining({
              orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
            }),
          }),
        }),
      }),
    });
    expect(prisma.ingredient.create).not.toHaveBeenCalled();
    expect(prisma.nutritionFood.upsert).not.toHaveBeenCalled();
    expect(prisma.nutritionFoodMapping.create).not.toHaveBeenCalled();
    expect(result.id).toBe('job-1');
  });

  it('rejects empty job requests', async () => {
    const service = new IngredientCreationService(createPrismaMock() as any);

    await expect(
      service.createJob({ requestText: '   ', userId: 'staff-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('limits staff users to their own job detail', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      createdBy: 'staff-2',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.getJobDetail('job-1', { userId: 'staff-1', role: 'STAFF' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws not found when job detail is missing', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue(null);
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.getJobDetail('missing-job', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('filters job list for staff users and includes drafts newest first', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findMany.mockResolvedValue([]);
    const service = new IngredientCreationService(prisma as any);

    await service.listJobs({ userId: 'staff-1', role: 'STAFF' });

    expect(prisma.ingredientCreationJob.findMany).toHaveBeenCalledWith({
      where: { createdBy: 'staff-1' },
      include: { draft: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('allows admins to list all jobs', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findMany.mockResolvedValue([]);
    const service = new IngredientCreationService(prisma as any);

    await service.listJobs({ userId: 'admin-1', role: 'ADMIN' });

    expect(prisma.ingredientCreationJob.findMany).toHaveBeenCalledWith({
      where: {},
      include: { draft: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('allows admins to edit draft metadata', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'READY_FOR_REVIEW',
      job: { id: 'job-1', createdBy: 'staff-1' },
    });
    prisma.ingredientCreationDraft.update.mockResolvedValue({
      id: 'draft-1',
      suggestedName: '鸭胸肉',
      notes: '优先水煮熟档案',
    });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.updateDraft(
      'draft-1',
      { suggestedName: '  鸭胸肉  ', notes: '优先水煮熟档案' },
      { userId: 'admin-1', role: 'ADMIN' },
    );

    expect(prisma.ingredientCreationDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: {
        suggestedName: '鸭胸肉',
        notes: '优先水煮熟档案',
      },
      include: expect.objectContaining({
        profiles: expect.objectContaining({
          orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }],
        }),
      }),
    });
    expect(result.suggestedName).toBe('鸭胸肉');
  });

  it('rejects edits to confirmed drafts', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'CONFIRMED',
      job: { id: 'job-1', createdBy: 'staff-1' },
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraft(
        'draft-1',
        { notes: '调整备注' },
        { userId: 'admin-1', role: 'ADMIN' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationDraft.update).not.toHaveBeenCalled();
  });

  it('rejects edits to rejected drafts', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'REJECTED',
      job: { id: 'job-1', createdBy: 'staff-1' },
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraft(
        'draft-1',
        { notes: '调整备注' },
        { userId: 'admin-1', role: 'ADMIN' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationDraft.update).not.toHaveBeenCalled();
  });

  it('rejects empty draft metadata patches', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraft.findUnique.mockResolvedValue({
      id: 'draft-1',
      status: 'DRAFT',
      job: { id: 'job-1', createdBy: 'staff-1' },
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraft(
        'draft-1',
        {},
        { userId: 'admin-1', role: 'ADMIN' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationDraft.update).not.toHaveBeenCalled();
  });

  it('rejects empty user messages', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      createdBy: 'staff-1',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.addUserMessage(
        'job-1',
        { content: '   ' },
        { userId: 'staff-1', role: 'STAFF' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationMessage.create).not.toHaveBeenCalled();
  });

  it('records question answers with payload and resumes source search', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique
      .mockResolvedValueOnce({
        id: 'job-1',
        status: 'WAITING_USER',
        createdBy: 'staff-1',
        waitingQuestion: '需要生档案还是熟档案？',
        messages: [],
        draft: null,
      })
      .mockResolvedValueOnce({
        id: 'job-1',
        status: 'SEARCHING_SOURCES',
        createdBy: 'staff-1',
        waitingQuestion: null,
        messages: [],
        draft: null,
      });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.answerQuestion(
      'job-1',
      { content: '  两种都需要  ' },
      { userId: 'staff-1', role: 'STAFF' },
    );

    expect(prisma.ingredientCreationMessage.create).toHaveBeenCalledWith({
      data: {
        jobId: 'job-1',
        role: 'USER',
        content: '两种都需要',
        payload: { answerTo: '需要生档案还是熟档案？' },
      },
    });
    expect(prisma.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'SEARCHING_SOURCES',
        waitingQuestion: null,
        currentStage: '已收到回答，等待 Agent 继续研究',
      },
    });
    expect(result.status).toBe('SEARCHING_SOURCES');
  });

  it('rejects question answers unless the job is waiting for the user', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      waitingQuestion: null,
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.answerQuestion(
        'job-1',
        { content: '两种都需要' },
        { userId: 'staff-1', role: 'STAFF' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationMessage.create).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationJob.update).not.toHaveBeenCalled();
  });

  it('allows admins to edit draft profile metadata and omits undefined fields', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraftProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      draft: {
        status: 'READY_FOR_REVIEW',
      },
    });
    prisma.ingredientCreationDraftProfile.update.mockResolvedValue({
      id: 'profile-1',
      role: 'SECONDARY',
      preparationState: null,
      sortOrder: 2,
    });
    const service = new IngredientCreationService(prisma as any);

    const result = await service.updateDraftProfile(
      'profile-1',
      {
        role: 'SECONDARY',
        suggestedDisplayNameZh: undefined,
        preparationState: null,
        sortOrder: 2,
      },
      { userId: 'admin-1', role: 'ADMIN' },
    );

    expect(prisma.ingredientCreationDraftProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      include: expect.objectContaining({
        draft: expect.any(Object),
      }),
    });
    expect(prisma.ingredientCreationDraftProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: {
        role: 'SECONDARY',
        preparationState: null,
        sortOrder: 2,
      },
    });
    expect(result.role).toBe('SECONDARY');
  });

  it('rejects draft profile edits from non-admin users', async () => {
    const prisma = createPrismaMock();
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraftProfile(
        'profile-1',
        { sortOrder: 2 },
        { userId: 'staff-1', role: 'STAFF' },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.ingredientCreationDraftProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.ingredientCreationDraftProfile.update).not.toHaveBeenCalled();
  });

  it('throws not found when draft profile is missing', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraftProfile.findUnique.mockResolvedValue(null);
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraftProfile(
        'missing-profile',
        { sortOrder: 2 },
        { userId: 'admin-1', role: 'ADMIN' },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.ingredientCreationDraftProfile.update).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMED', 'REJECTED'])(
    'rejects draft profile edits when the draft is %s',
    async (status) => {
      const prisma = createPrismaMock();
      prisma.ingredientCreationDraftProfile.findUnique.mockResolvedValue({
        id: 'profile-1',
        draft: { status },
      });
      const service = new IngredientCreationService(prisma as any);

      await expect(
        service.updateDraftProfile(
          'profile-1',
          { sortOrder: 2 },
          { userId: 'admin-1', role: 'ADMIN' },
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.ingredientCreationDraftProfile.update).not.toHaveBeenCalled();
    },
  );

  it('rejects empty draft profile patches', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationDraftProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      draft: {
        status: 'DRAFT',
      },
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.updateDraftProfile(
        'profile-1',
        {},
        { userId: 'admin-1', role: 'ADMIN' },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.ingredientCreationDraftProfile.update).not.toHaveBeenCalled();
  });

  it('rejects reruns after the ingredient creation job is confirmed', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'CONFIRMED',
      createdBy: 'staff-1',
      messages: [],
      draft: null,
    });
    const agentService = {
      runJob: jest.fn(),
    };
    const service = new IngredientCreationService(
      prisma as any,
      agentService as any,
    );

    await expect(
      service.rerunDraft('job-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.rerunDraft('job-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('已确认任务不能重新运行');
    expect(agentService.runJob).not.toHaveBeenCalled();
  });

  it('rejects reruns with a clear error when the agent service is not registered', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      messages: [],
      draft: null,
    });
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.rerunDraft('job-1', { userId: 'staff-1', role: 'STAFF' }),
    ).rejects.toThrow('AI 新增食材 Agent 服务未注册');
  });

  it('rejects reruns when a review draft already exists without calling the agent', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'READY_FOR_REVIEW',
      createdBy: 'staff-1',
      messages: [],
      draft: {
        id: 'draft-1',
        status: 'READY_FOR_REVIEW',
      },
    });
    const agentService = {
      runJob: jest.fn(),
    };
    const service = new IngredientCreationService(
      prisma as any,
      agentService as any,
    );

    await expect(
      service.rerunDraft('job-1', { userId: 'staff-1', role: 'STAFF' }),
    ).rejects.toThrow('已有草稿，请编辑或拒绝后重新创建任务');
    expect(agentService.runJob).not.toHaveBeenCalled();
  });

  it('reruns the draft through the registered agent service after permission checks', async () => {
    const prisma = createPrismaMock();
    prisma.ingredientCreationJob.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'DRAFTING',
      createdBy: 'staff-1',
      messages: [],
      draft: null,
    });
    const agentService = {
      runJob: jest.fn().mockResolvedValue({ id: 'draft-1' }),
    };
    const service = new IngredientCreationService(
      prisma as any,
      agentService as any,
    );

    const result = await service.rerunDraft('job-1', {
      userId: 'staff-1',
      role: 'STAFF',
    });

    expect(agentService.runJob).toHaveBeenCalledWith('job-1');
    expect(result).toEqual({ id: 'draft-1' });
  });

  it('confirms a ready draft into a formal ingredient and nutrition mappings', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    const result = await service.confirmDraft('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });

    expect(tx.ingredientCreationDraft.findUnique).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      include: {
        job: true,
        profiles: { orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }] },
      },
    });
    expect(tx.ingredientCreationDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', status: 'READY_FOR_REVIEW' },
      data: {
        status: 'CONFIRMED',
        confirmedBy: 'admin-1',
        confirmedAt: expect.any(Date),
      },
    });
    expect(tx.ingredient.findFirst).toHaveBeenCalledWith({
      where: {
        name: '鸭胸肉',
        brand: null,
        productModel: null,
      },
      select: { id: true },
    });
    expect(tx.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: '鸭胸肉',
        type: 'FOOD',
        procurementStrategy: 'DAILY_PURCHASE',
        diyEnabled: true,
        procurementEnabled: false,
        brand: null,
        productModel: null,
        purchaseChannel: null,
        notes: 'Agent 草稿',
        baseUnit: 'G',
        unitDisplayLabel: 'g',
        nutritionProfile: primaryNutritionProfile,
        purchaseUnit: 'g',
        purchaseToBaseRatio: 1,
        currentPricePerPurchaseUnit: 0,
        effectivePricePerPurchaseUnit: 0,
        properties: {},
      }),
    });
    expect(tx.nutritionFood.upsert).toHaveBeenCalledWith({
      where: {
        name_dataSource_version: {
          name: 'Duck, breast, raw',
          dataSource: 'USDA',
          version: 1,
        },
      },
      create: expect.objectContaining({
        name: 'Duck, breast, raw',
        nameEn: 'Duck, breast, raw',
        displayNameZh: '鸭胸肉（生）',
        displayNameZhSource: 'AI_DRAFT_REVIEWED',
        displayNameZhReviewedAt: expect.any(Date),
        displayNameZhReviewedBy: 'admin-1',
        category: 'OTHER',
        dataSource: 'USDA',
        externalId: 'USDA:123',
        version: 1,
        status: 'VERIFIED',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '可食部',
        processingLabel: '未加工',
        nutritionData: primaryNutritionProfile,
        notes: 'AI 新增食材草稿确认',
        verifiedBy: 'admin-1',
        verifiedAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        displayNameZh: '鸭胸肉（生）',
        displayNameZhSource: 'AI_DRAFT_REVIEWED',
        displayNameZhReviewedAt: expect.any(Date),
        displayNameZhReviewedBy: 'admin-1',
        status: 'VERIFIED',
        preparationState: 'RAW',
        preparationStateLabel: '生',
        ediblePortionLabel: '可食部',
        processingLabel: '未加工',
        nutritionData: primaryNutritionProfile,
        verifiedBy: 'admin-1',
        verifiedAt: expect.any(Date),
      }),
    });
    expect(tx.nutritionFoodMapping.create).toHaveBeenCalledWith({
      data: {
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-1',
        isPrimary: true,
        yieldRate: 1,
        notes: 'AI 新增食材草稿确认',
      },
    });
    expect(tx.ingredientCreationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'CONFIRMED',
        currentStage: '已确认创建正式标准原料',
        progress: 100,
        completedAt: expect.any(Date),
      },
    });
    expect(tx.ingredientCreationDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: {
        confirmedIngredientId: 'ingredient-1',
      },
    });
    expect(result.status).toBe('CONFIRMED');
  });

  it('prevents non-admin confirmation', async () => {
    const prisma = createPrismaMock();
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'staff-1', role: 'STAFF' }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.ingredientCreationDraft.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws not found when confirming a missing draft', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('missing-draft', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.confirmDraft('missing-draft', {
        userId: 'admin-1',
        role: 'ADMIN',
      }),
    ).rejects.toThrow('新增食材草稿不存在');
    expect(tx.ingredientCreationDraft.updateMany).not.toHaveBeenCalled();
  });

  it('rejects confirmation unless the draft is ready for review', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(
      createReadyDraft({ status: 'DRAFT' }),
    );
    tx.ingredientCreationDraft.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('只有待审核草稿可以确认入库');
    expect(tx.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects confirmation when the draft has no primary profile', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(
      createReadyDraft({
        profiles: [createDraftProfile({ id: 'profile-2', role: 'SECONDARY' })],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('确认入库必须且只能包含一个主营养档案');
    expect(tx.ingredientCreationDraft.updateMany).not.toHaveBeenCalled();
    expect(tx.ingredient.create).not.toHaveBeenCalled();
  });

  it('prevents confirmation when a standard ingredient already exists', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredient.findFirst.mockResolvedValue({ id: 'ingredient-existing' });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('标准原料已存在：鸭胸肉');
    expect(tx.ingredientCreationDraft.updateMany).toHaveBeenCalledWith({
      where: { id: 'draft-1', status: 'READY_FOR_REVIEW' },
      data: {
        status: 'CONFIRMED',
        confirmedBy: 'admin-1',
        confirmedAt: expect.any(Date),
      },
    });
    expect(tx.ingredient.create).not.toHaveBeenCalled();
    expect(tx.nutritionFood.upsert).not.toHaveBeenCalled();
    expect(tx.nutritionFoodMapping.create).not.toHaveBeenCalled();
    expect(tx.ingredientCreationJob.update).not.toHaveBeenCalled();
    expect(tx.ingredientCreationDraft.update).not.toHaveBeenCalled();
  });

  it('marks secondary profile mappings as non-primary', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.nutritionFood.upsert
      .mockResolvedValueOnce({ id: 'food-primary' })
      .mockResolvedValueOnce({ id: 'food-secondary' });
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(
      createReadyDraft({
        profiles: [
          createDraftProfile(),
          createDraftProfile({
            id: 'profile-2',
            role: 'SECONDARY',
            sourceFoodName: 'Duck, breast, cooked',
            sourceFoodNameEn: 'Duck, breast, cooked',
            sourceType: null,
            sourceKey: null,
            suggestedDisplayNameZh: '鸭胸肉（熟）',
            preparationState: 'COOKED',
            preparationStateLabel: '熟',
            processingLabel: '水煮',
            sortOrder: 1,
          }),
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await service.confirmDraft('draft-1', {
      userId: 'admin-1',
      role: 'ADMIN',
    });

    expect(tx.nutritionFood.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          name_dataSource_version: {
            name: 'Duck, breast, cooked',
            dataSource: 'MANUAL',
            version: 1,
          },
        },
      }),
    );
    expect(tx.nutritionFoodMapping.create).toHaveBeenNthCalledWith(2, {
      data: {
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'food-secondary',
        isPrimary: false,
        yieldRate: 1,
        notes: 'AI 新增食材草稿确认',
      },
    });
  });

  it('rejects confirmation when the atomic draft claim loses the race', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('只有待审核草稿可以确认入库');
    expect(tx.ingredient.create).not.toHaveBeenCalled();
    expect(tx.nutritionFoodMapping.create).not.toHaveBeenCalled();
  });

  it('rejects confirmation when the draft has multiple primary profiles', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(
      createReadyDraft({
        profiles: [
          createDraftProfile({ id: 'profile-1' }),
          createDraftProfile({
            id: 'profile-2',
            sourceFoodName: 'Duck, breast, cooked',
            sourceFoodNameEn: 'Duck, breast, cooked',
            suggestedDisplayNameZh: '鸭胸肉（熟）',
          }),
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('确认入库必须且只能包含一个主营养档案');
    expect(tx.ingredientCreationDraft.updateMany).not.toHaveBeenCalled();
    expect(tx.ingredient.create).not.toHaveBeenCalled();
  });

  it('rejects confirmation when draft profiles target the same nutrition food identity', async () => {
    const prisma = createPrismaMock();
    const tx = createConfirmTransactionMock();
    tx.ingredientCreationDraft.findUnique.mockResolvedValue(
      createReadyDraft({
        profiles: [
          createDraftProfile(),
          createDraftProfile({
            id: 'profile-2',
            role: 'SECONDARY',
            sourceFoodName: 'Duck, breast, raw',
            sourceType: 'USDA',
            sourceKey: 'USDA:456',
            suggestedDisplayNameZh: '鸭胸肉重复档案',
          }),
        ],
      }),
    );
    prisma.$transaction.mockImplementation(async (callback) => callback(tx));
    const service = new IngredientCreationService(prisma as any);

    await expect(
      service.confirmDraft('draft-1', { userId: 'admin-1', role: 'ADMIN' }),
    ).rejects.toThrow('草稿包含重复营养档案，请先合并或删除重复档案');
    expect(tx.ingredientCreationDraft.updateMany).not.toHaveBeenCalled();
    expect(tx.ingredient.create).not.toHaveBeenCalled();
    expect(tx.nutritionFoodMapping.create).not.toHaveBeenCalled();
  });
});
