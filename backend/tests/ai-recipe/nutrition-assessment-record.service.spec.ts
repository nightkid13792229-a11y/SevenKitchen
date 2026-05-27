import { NotFoundException } from '@nestjs/common';
import { ConstraintSynthesisService } from '../../src/application/ai-recipe/constraint-synthesis.service';
import { NutritionAssessmentRecordService } from '../../src/application/ai-recipe/nutrition-assessment-record.service';
import { NutritionAssessmentService } from '../../src/application/ai-recipe/nutrition-assessment.service';

describe('NutritionAssessmentRecordService', () => {
  const prisma: any = {
    dog: { findUnique: jest.fn() },
    dogNutritionAssessment: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const knowledgeBaseService: any = {
    listActiveRulePackages: jest.fn(),
  };

  const createService = () =>
    new NutritionAssessmentRecordService(
      prisma,
      knowledgeBaseService,
      new NutritionAssessmentService(),
      new ConstraintSynthesisService(),
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a real assessment for an existing dog', async () => {
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      currentWeightKg: 12,
      bcsScore: 8,
      activityLevel: 'LOW',
    });
    knowledgeBaseService.listActiveRulePackages.mockResolvedValue([
      {
        code: 'WEIGHT_MANAGEMENT',
        versions: [{ requiredFields: ['targetWeightKg', 'dietHistory'] }],
      },
    ]);
    prisma.dogNutritionAssessment.create.mockImplementation(
      async (args: any) => args.data,
    );
    const service = createService();

    const result = await service.createAssessment({
      dogId: 'dog-1',
      createdBy: 'admin-1',
      prompt: '请评估减重食谱',
      confirmedInputs: {
        dietHistory: '鸡肉鲜食',
        targetWeightKg: 10,
      },
    });

    expect(prisma.dog.findUnique).toHaveBeenCalledWith({
      where: { id: 'dog-1' },
      select: {
        id: true,
        currentWeightKg: true,
        bcsScore: true,
        activityLevel: true,
      },
    });
    expect(prisma.dogNutritionAssessment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: expect.any(String),
        dogId: 'dog-1',
        createdBy: 'admin-1',
        status: 'DRAFT',
        resultStatus: 'NEEDS_MANUAL_REVIEW',
      }),
    });
    expect(result.inputSummary).toEqual(
      expect.objectContaining({
        dogId: 'dog-1',
        currentWeightKg: 12,
        bcsScore: 8,
        activityLevel: 'LOW',
        prompt: '请评估减重食谱',
        confirmedInputs: {
          dietHistory: '鸡肉鲜食',
          targetWeightKg: 10,
        },
      }),
    );
    expect(result.managementPlan.enabledRulePackages).toEqual([
      'WEIGHT_MANAGEMENT',
    ]);
    expect(result.constraintSet).toEqual(
      expect.objectContaining({
        dogId: 'dog-1',
        assessmentId: result.id,
        rulePackages: ['WEIGHT_MANAGEMENT'],
        resultStatus: 'NEEDS_MANUAL_REVIEW',
      }),
    );
  });

  it('rejects assessment creation for a missing dog', async () => {
    prisma.dog.findUnique.mockResolvedValue(null);
    const service = createService();

    await expect(
      service.createAssessment({
        dogId: 'missing-dog',
        createdBy: 'admin-1',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.dogNutritionAssessment.create).not.toHaveBeenCalled();
  });

  it('returns a persisted assessment with evidence and session summaries', async () => {
    const assessment = {
      id: 'assessment-1',
      evidenceItems: [],
      sessions: [],
    };
    prisma.dogNutritionAssessment.findUnique.mockResolvedValue(assessment);
    const service = createService();

    const result = await service.getAssessment('assessment-1');

    expect(prisma.dogNutritionAssessment.findUnique).toHaveBeenCalledWith({
      where: { id: 'assessment-1' },
      include: {
        evidenceItems: { orderBy: { createdAt: 'asc' } },
        sessions: {
          select: {
            id: true,
            status: true,
            resultStatus: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    expect(result).toBe(assessment);
  });

  it('rejects lookup for a missing assessment', async () => {
    prisma.dogNutritionAssessment.findUnique.mockResolvedValue(null);
    const service = createService();

    await expect(service.getAssessment('missing-assessment')).rejects.toThrow(
      NotFoundException,
    );
  });
});
