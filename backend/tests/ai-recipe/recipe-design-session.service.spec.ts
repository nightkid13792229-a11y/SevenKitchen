import { RecipeDesignSessionService } from '../../src/application/ai-recipe/recipe-design-session.service';
import { AiRecipeResultStatus } from '../../src/domain/ai-recipe/enums';

describe('RecipeDesignSessionService', () => {
  const prisma: any = {
    agentRecipeDesignSession: { create: jest.fn() },
    agentRecipeDesignMessage: { create: jest.fn() },
    agentRecipeDesignCandidate: { create: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates an open session for an assessment', async () => {
    prisma.agentRecipeDesignSession.create.mockResolvedValue({
      id: 'session-1',
      status: 'OPEN',
    });
    const service = new RecipeDesignSessionService(prisma);

    const result = await service.createSession({
      assessmentId: 'assessment-1',
      createdBy: 'admin-1',
    });

    expect(result.id).toBe('session-1');
    expect(prisma.agentRecipeDesignSession.create).toHaveBeenCalledWith({
      data: {
        assessmentId: 'assessment-1',
        createdBy: 'admin-1',
        status: 'OPEN',
      },
    });
  });

  it('stores draft candidates with result status', async () => {
    prisma.agentRecipeDesignCandidate.create.mockResolvedValue({
      id: 'candidate-1',
    });
    const service = new RecipeDesignSessionService(prisma);

    await service.createCandidate({
      sessionId: 'session-1',
      label: '初稿',
      recipeDraft: { items: [] },
      calculation: { fediaf: 'not-run' },
      resultStatus: AiRecipeResultStatus.LIMITED_DRAFT,
      changeSummary: { reason: '缺少营养数据' },
    });

    expect(prisma.agentRecipeDesignCandidate.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        label: '初稿',
        recipeDraft: { items: [] },
        calculation: { fediaf: 'not-run' },
        resultStatus: 'LIMITED_DRAFT',
        changeSummary: { reason: '缺少营养数据' },
      },
    });
  });

  it('stores messages with default metadata', async () => {
    prisma.agentRecipeDesignMessage.create.mockResolvedValue({
      id: 'message-1',
    });
    const service = new RecipeDesignSessionService(prisma);

    await service.addMessage({
      sessionId: 'session-1',
      role: 'ADMIN',
      content: '请生成配方初稿',
    });

    expect(prisma.agentRecipeDesignMessage.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        role: 'ADMIN',
        content: '请生成配方初稿',
        metadata: {},
      },
    });
  });

  it('rejects invalid nested JSON payloads before storing candidates', async () => {
    const service = new RecipeDesignSessionService(prisma);

    await expect(
      service.createCandidate({
        sessionId: 'session-1',
        label: '初稿',
        recipeDraft: { items: [{ value: BigInt(1) }] } as any,
        calculation: { fediaf: 'not-run' },
        resultStatus: AiRecipeResultStatus.LIMITED_DRAFT,
        changeSummary: { reason: '缺少营养数据' },
      }),
    ).rejects.toThrow('Invalid JSON payload');

    expect(prisma.agentRecipeDesignCandidate.create).not.toHaveBeenCalled();
  });

  it('omits undefined nested object properties before storing candidates', async () => {
    prisma.agentRecipeDesignCandidate.create.mockResolvedValue({
      id: 'candidate-1',
    });
    const service = new RecipeDesignSessionService(prisma);

    await service.createCandidate({
      sessionId: 'session-1',
      label: '初稿',
      recipeDraft: {
        items: [{ name: 'chicken', notes: undefined }],
        omitted: undefined,
      } as any,
      calculation: { fediaf: 'not-run' },
      resultStatus: AiRecipeResultStatus.LIMITED_DRAFT,
      changeSummary: { reason: '缺少营养数据', optional: undefined } as any,
    });

    expect(prisma.agentRecipeDesignCandidate.create).toHaveBeenCalledWith({
      data: {
        sessionId: 'session-1',
        label: '初稿',
        recipeDraft: { items: [{ name: 'chicken' }] },
        calculation: { fediaf: 'not-run' },
        resultStatus: 'LIMITED_DRAFT',
        changeSummary: { reason: '缺少营养数据' },
      },
    });
  });
});
