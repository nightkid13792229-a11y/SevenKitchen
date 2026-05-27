import {
  KnowledgeSourceStatus,
  NutritionRulePackageStatus,
} from '@prisma/client';
import { KnowledgeBaseService } from '../../src/application/ai-recipe/knowledge-base.service';

describe('KnowledgeBaseService', () => {
  const prisma: any = {
    knowledgeSource: {
      findMany: jest.fn(),
    },
    nutritionRulePackage: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns active knowledge sources ordered by name', async () => {
    prisma.knowledgeSource.findMany.mockResolvedValue([
      { code: 'FEDIAF_2025', name: 'FEDIAF Nutritional Guidelines' },
    ]);
    const service = new KnowledgeBaseService(prisma);

    const result = await service.listActiveSources();

    expect(prisma.knowledgeSource.findMany).toHaveBeenCalledWith({
      where: { status: KnowledgeSourceStatus.ACTIVE },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
    expect(result).toEqual([
      { code: 'FEDIAF_2025', name: 'FEDIAF Nutritional Guidelines' },
    ]);
  });

  it('returns active rule packages with active versions', async () => {
    const mockPackages = [
      { code: 'WEIGHT_MANAGEMENT', versions: [{ version: 1 }] },
    ];
    prisma.nutritionRulePackage.findMany.mockResolvedValue(mockPackages);
    const service = new KnowledgeBaseService(prisma);

    const result = await service.listActiveRulePackages();

    expect(prisma.nutritionRulePackage.findMany).toHaveBeenCalledWith({
      where: {
        status: NutritionRulePackageStatus.ACTIVE,
        versions: { some: { isActive: true } },
      },
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { version: 'desc' },
        },
        sources: { include: { knowledgeSource: true } },
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });
    expect(result).toEqual(mockPackages);
  });
});
