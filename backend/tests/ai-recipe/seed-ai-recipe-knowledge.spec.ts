import { KnowledgeSourceStatus } from '@prisma/client';
import { seedAiRecipeKnowledge } from '../../prisma/seed-ai-recipe-knowledge';

describe('seedAiRecipeKnowledge', () => {
  function createPrismaMock() {
    return {
      knowledgeSource: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      nutritionRulePackage: {
        findUnique: jest.fn().mockResolvedValue({ id: 'package-1' }),
        create: jest.fn(),
      },
      nutritionRuleVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'version-1' }),
        create: jest.fn(),
      },
    };
  }

  it('creates missing knowledge sources as active', async () => {
    const prisma = createPrismaMock();
    prisma.knowledgeSource.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'existing-source' });

    await seedAiRecipeKnowledge(prisma as any);

    expect(prisma.knowledgeSource.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: 'FEDIAF_2025',
        status: KnowledgeSourceStatus.ACTIVE,
      }),
    });
  });

  it('does not rewrite existing knowledge sources on rerun', async () => {
    const prisma = createPrismaMock();
    prisma.knowledgeSource.findUnique.mockResolvedValue({
      id: 'source-1',
      code: 'FEDIAF_2025',
      status: 'RETIRED',
    });

    await seedAiRecipeKnowledge(prisma as any);

    expect(prisma.knowledgeSource.create).not.toHaveBeenCalled();
  });
});
