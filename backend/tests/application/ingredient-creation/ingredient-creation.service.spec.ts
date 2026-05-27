import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IngredientCreationService } from '../../../src/application/ingredient-creation/ingredient-creation.service';

function createPrismaMock() {
  return {
    ingredient: {
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
      update: jest.fn(),
    },
    ingredientCreationDraftProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
});
