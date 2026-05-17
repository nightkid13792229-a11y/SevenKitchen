import { PrismaBreedHealthRiskRepository } from 'src/infrastructure/repositories/prisma-breed-health-risk.repository';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from 'src/domain/dog/breed-health-risk.entity';

describe('PrismaBreedHealthRiskRepository', () => {
  const findMany = jest.fn();
  const prisma = {
    breedHealthRisk: { findMany },
  } as any;

  beforeEach(() => {
    findMany.mockReset();
  });

  it('returns only published risks with visible sources for one breed', async () => {
    findMany.mockResolvedValue([
      {
        id: 'risk-1',
        breedId: 'breed-1',
        conditionId: 'condition-1',
        attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
        oneLineSummary: '该品种资料中较常被提及的骨骼关节关注项。',
        breedSpecificReason: '大型犬资料中常见。',
        displayOrder: 1,
        isPublished: true,
        condition: {
          id: 'condition-1',
          nameCn: '髋关节发育不良',
          nameEn: 'Hip Dysplasia',
          aliases: ['CHD'],
          category: '骨骼关节',
          summary: '髋关节相关疾病。',
          commonSigns: ['后肢跛行'],
          screeningAdvice: '可与兽医讨论髋关节检查。',
          careAdvice: '出现疼痛或跛行请咨询兽医。',
          isActive: true,
        },
        sources: [
          {
            id: 'source-1',
            riskId: 'risk-1',
            sourceType: BreedHealthRiskSourceType.OFA_CHIC,
            sourceName: 'OFA CHIC',
            publisher: 'Orthopedic Foundation for Animals',
            title: 'Breed screening recommendation',
            url: 'https://ofa.org/diseases/',
            accessedAt: new Date('2026-05-17T00:00:00.000Z'),
            note: null,
          },
        ],
      },
    ]);

    const repository = new PrismaBreedHealthRiskRepository(prisma);
    const risks = await repository.findPublishedByBreedId('breed-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        breedId: 'breed-1',
        isPublished: true,
        condition: { isActive: true },
        sources: { some: {} },
      },
      include: {
        condition: true,
        sources: {
          orderBy: [{ sourceType: 'asc' }, { sourceName: 'asc' }],
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    expect(risks).toHaveLength(1);
    expect(risks[0].condition.nameCn).toBe('髋关节发育不良');
    expect(risks[0].sources[0].sourceType).toBe(BreedHealthRiskSourceType.OFA_CHIC);
  });
});
