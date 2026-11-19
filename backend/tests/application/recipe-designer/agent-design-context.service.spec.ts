import { RecipeDesignerService } from '../../../src/application/recipe-designer/recipe-designer.service';

/**
 * getAgentDesignContext 的映射测试。
 *
 * 不构造整个 Service（依赖太多），只把 prisma / getDraft 换成 mock，
 * 验证：路径判定、订单/狗狗读取、附件 id、缺失清单、CATALOG 不读狗。
 */
describe('RecipeDesignerService.getAgentDesignContext', () => {
  function createService(prisma: any, draft: any) {
    const service = Object.create(RecipeDesignerService.prototype) as any;
    service.prisma = prisma;
    service.cosService = undefined;
    service.getDraft = jest.fn().mockResolvedValue(draft);
    return service as RecipeDesignerService;
  }

  function basePrisma() {
    return {
      customRecipeOrder: { findUnique: jest.fn() },
      dog: { findUnique: jest.fn() },
      dogBreed: { findUnique: jest.fn() },
      medicalRecord: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      checkupRecord: { findMany: jest.fn().mockResolvedValue([]) },
      allergyRecord: { findMany: jest.fn().mockResolvedValue([]) },
      allergyReport: { findMany: jest.fn().mockResolvedValue([]) },
      weightRecord: { findMany: jest.fn().mockResolvedValue([]) },
      weightGoalPlan: { findFirst: jest.fn().mockResolvedValue(null) },
      dogDietPreference: { findMany: jest.fn().mockResolvedValue([]) },
    };
  }

  const orderDraft = {
    id: 'draft-1',
    customerDogId: 'dog-1',
    series: { id: 'series-1', designMode: 'ORDER', orderId: 'order-uuid' },
  };

  it('reads the bound order, dog and all records', async () => {
    const prisma = basePrisma();
    prisma.customRecipeOrder.findUnique.mockResolvedValue({
      id: 'order-uuid',
      orderId: 'CR202611198532',
      dogId: 'dog-1',
      status: 'IN_PROGRESS',
      recipeQuantity: 2,
      targetGoal: 'MAINTAIN',
      needsHealthManagement: false,
      additionalNotes: '不吃发物，牛、羊、鸡、鸡蛋不吃',
      allergies: [],
      allergyText: null,
      allergyStatus: 'NO_ALLERGY',
      medicalConditions: [],
      preferredIngredients: [],
      dislikedIngredients: [],
      currentFoodMain: 'HOMEMADE',
      currentFoodOther: null,
      changeReasons: [],
      changeReasonOther: null,
      stomachConditions: ['NORMAL'],
      stomachOther: null,
      requestedProteinCodes: [],
    });
    prisma.dog.findUnique.mockResolvedValue({
      name: '舒客',
      breedId: 'breed-1',
      customBreedName: null,
      birthday: new Date('2014-03-17T00:00:00Z'),
      gender: 'MALE',
      isNeutered: true,
      currentWeightKg: 5.8,
      weightUpdatedAt: null,
      bcsScore: 5,
      bcsScoreConfirmedAt: null,
      activityLevel: 'LOW',
      mealsPerDay: 2,
      medicalHistory: null,
      allergyFoods: null,
      pickyFoods: null,
      preferredFoods: null,
      healthTagOverrides: {},
    });
    prisma.dogBreed.findUnique.mockResolvedValue({ name: '比熊' });
    prisma.medicalRecord.findMany.mockResolvedValue([
      {
        id: 'm1',
        visitDate: new Date('2026-11-12T00:00:00Z'),
        chiefComplaint: '脾脏破裂',
        diagnosis: '血管肉瘤',
        status: 'TREATING',
        labValues: 'WBC 14.61',
        treatment: '不吃牛羊鸡肉和鸡蛋',
        exams: '血常规',
        vitals: '体温 37.8',
        medications: ['溃速平'],
        followUpDate: null,
        notes: null,
        attachments: ['https://img.example.com/a.jpg'],
      },
    ]);

    const service = createService(prisma, orderDraft);
    const context = await service.getAgentDesignContext('draft-1', {} as any);

    expect(context.mode).toBe('ORDER');
    expect(context.order?.orderNo).toBe('CR202611198532');
    expect(context.order?.quantity).toBe(2);
    expect(context.dog?.name).toBe('舒客');
    expect(context.dog?.breedName).toBe('比熊');
    expect(context.medicalRecords).toHaveLength(1);
    expect(context.medicalRecords[0].attachmentIds).toEqual(['MEDICAL:m1:0']);
    expect(context.attachments[0]).toMatchObject({
      id: 'MEDICAL:m1:0',
      kind: 'IMAGE',
      url: 'https://img.example.com/a.jpg',
    });
    expect(context.counts.images).toBe(1);
    expect(context.missing).toEqual(
      expect.arrayContaining(['体检记录', '过敏记录', '体重记录']),
    );
    expect(context.unavailableReason).toBeNull();
  });

  it('returns a CATALOG context without reading a dog', async () => {
    const prisma = basePrisma();
    const draft = {
      id: 'draft-2',
      customerDogId: null,
      series: { id: 'series-2', designMode: 'CATALOG', orderId: null },
    };

    const service = createService(prisma, draft);
    const context = await service.getAgentDesignContext('draft-2', {} as any);

    expect(context.mode).toBe('CATALOG');
    expect(context.order).toBeNull();
    expect(context.dog).toBeNull();
    expect(context.counts.attachments).toBe(0);
    expect(prisma.dog.findUnique).not.toHaveBeenCalled();
  });

  it('explains why an ORDER draft has no context', async () => {
    const prisma = basePrisma();
    prisma.customRecipeOrder.findUnique.mockResolvedValue(null);

    const service = createService(prisma, orderDraft);
    const context = await service.getAgentDesignContext('draft-1', {} as any);

    expect(context.unavailableReason).toContain('订单不存在或已删除');
  });
});
