import { BadRequestException, ConflictException } from '@nestjs/common';
import { RecipeAgentSessionService } from 'src/application/recipe-designer/agent/recipe-agent-session.service';

function makePrisma() {
  const tx = {
    recipeDesignAgentMessage: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seq: 3 } }),
      create: jest.fn().mockResolvedValue({ id: 'm1', seq: 4 }),
    },
  };
  const prisma = {
    recipeDesignAgentSession: {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    recipeDesignAgentMessage: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seq: 3 } }),
      create: jest.fn().mockResolvedValue({ id: 'm1', seq: 4 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, tx };
}

describe('RecipeAgentSessionService', () => {
  it('appendMessage 用 max(seq)+1，并在事务里创建', async () => {
    const { prisma, tx } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.appendMessage({
      sessionId: 's1',
      role: 'ASSISTANT',
      content: 'hi',
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.recipeDesignAgentMessage.aggregate).toHaveBeenCalledWith({
      where: { sessionId: 's1' },
      _max: { seq: true },
    });
    expect(tx.recipeDesignAgentMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 's1',
        seq: 4,
        role: 'ASSISTANT',
        content: 'hi',
      }),
    });
    expect(prisma.recipeDesignAgentMessage.create).not.toHaveBeenCalled();
  });

  it('listMessages 按 seq 升序、支持 afterSeq', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.listMessages('s1', 2);
    expect(prisma.recipeDesignAgentMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: 's1', seq: { gt: 2 } },
      orderBy: { seq: 'asc' },
    });
  });

  it('recordUsage 是累加', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    await service.recordUsage('s1', 100, 20);
    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        promptTokens: { increment: 100 },
        completionTokens: { increment: 20 },
      },
    });
  });

  it('有活跃会话时 assertNoActiveRun 抛冲突', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.findFirst.mockResolvedValue({ id: 's1' });
    const service = new RecipeAgentSessionService(prisma as any);
    await expect(service.assertNoActiveRun('draft-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('getLatestSession 取该草稿最近一次会话（不看状态，停止的也要）', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.findFirst.mockResolvedValue({
      id: 's1',
      designRecipeId: 'draft-1',
      status: 'STOPPED',
      skillName: 'recipe-design',
      skillVersion: 'v1',
      stepCount: 3,
      promptTokens: 100,
      completionTokens: 20,
      runStartStepCount: 1,
      runStartPromptTokens: 40,
      runStartCompletionTokens: 8,
      startedAt: new Date(),
      endedAt: new Date(),
      lastError: null,
      createdBy: 'user-1',
    });
    const service = new RecipeAgentSessionService(prisma as any);

    const session = await service.getLatestSession('draft-1');

    expect(prisma.recipeDesignAgentSession.findFirst).toHaveBeenCalledWith({
      where: { designRecipeId: 'draft-1' },
      orderBy: { startedAt: 'desc' },
    });
    expect(session?.id).toBe('s1');
    expect(session?.runStartStepCount).toBe(1);
    expect(session?.runStartPromptTokens).toBe(40);
  });

  it('beginRunCounters 把本轮起点记成当前累计', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.findUnique.mockResolvedValue({
      stepCount: 7,
      promptTokens: 900,
      completionTokens: 120,
    });
    const service = new RecipeAgentSessionService(prisma as any);

    await service.beginRunCounters('s1');

    expect(prisma.recipeDesignAgentSession.findUnique).toHaveBeenCalledWith({
      where: { id: 's1' },
      select: {
        stepCount: true,
        promptTokens: true,
        completionTokens: true,
      },
    });
    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        runStartStepCount: 7,
        runStartPromptTokens: 900,
        runStartCompletionTokens: 120,
      },
    });
  });

  it('markInterruptedRuns 只把 RUNNING 改成 INTERRUPTED', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);
    const count = await service.markInterruptedRuns();
    expect(count).toBe(2);
    expect(prisma.recipeDesignAgentSession.updateMany).toHaveBeenCalledWith({
      where: { status: 'RUNNING' },
      data: expect.objectContaining({ status: 'INTERRUPTED' }),
    });
  });

  it('createSession 记录 skill 名称与版本，默认 RUNNING', async () => {
    const { prisma } = makePrisma();
    const startedAt = new Date('2026-10-24T00:00:00.000Z');
    const session = {
      id: 's1',
      designRecipeId: 'draft-1',
      status: 'RUNNING',
      skillName: 'draft-recipe',
      skillVersion: 'v1',
      stepCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      startedAt,
      endedAt: null,
      lastError: null,
      createdBy: 'u1',
    };
    prisma.recipeDesignAgentSession.create.mockResolvedValue(session);

    const service = new RecipeAgentSessionService(prisma as any);
    const result = await service.createSession({
      designRecipeId: 'draft-1',
      createdBy: 'u1',
      skillName: 'draft-recipe',
      skillVersion: 'v1',
    });

    expect(prisma.recipeDesignAgentSession.create).toHaveBeenCalledWith({
      data: {
        designRecipeId: 'draft-1',
        createdBy: 'u1',
        skillName: 'draft-recipe',
        skillVersion: 'v1',
        status: 'RUNNING',
      },
    });
    expect(result).toEqual(session);
  });

  it('updateStatus COMPLETED 设置 endedAt', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);

    await service.updateStatus('s1', 'COMPLETED', '模型超时');

    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        status: 'COMPLETED',
        endedAt: expect.any(Date),
        lastError: '模型超时',
      },
    });
  });

  it('updateStatus WAITING_USER 清空 endedAt', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);

    await service.updateStatus('s1', 'WAITING_USER');

    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { status: 'WAITING_USER', endedAt: null, lastError: null },
    });
  });

  it('transitionStatus 只在 from 状态匹配时更新，返回 true', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new RecipeAgentSessionService(prisma as any);

    const updated = await service.transitionStatus(
      's1',
      ['WAITING_USER'],
      'RUNNING',
    );

    expect(updated).toBe(true);
    expect(prisma.recipeDesignAgentSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: { in: ['WAITING_USER'] } },
      data: { status: 'RUNNING', endedAt: null, lastError: null },
    });
  });

  it('transitionStatus 条件不匹配时返回 false，不走无条件的 update', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.updateMany.mockResolvedValue({ count: 0 });
    const service = new RecipeAgentSessionService(prisma as any);

    const updated = await service.transitionStatus(
      's1',
      ['WAITING_USER'],
      'RUNNING',
    );

    expect(updated).toBe(false);
    expect(prisma.recipeDesignAgentSession.update).not.toHaveBeenCalled();
  });

  it('transitionStatus 终态写 endedAt 和 lastError', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new RecipeAgentSessionService(prisma as any);

    await service.transitionStatus(
      's1',
      ['RUNNING', 'WAITING_USER'],
      'FAILED',
      '模型超时',
    );

    expect(prisma.recipeDesignAgentSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: 's1',
        status: { in: ['RUNNING', 'WAITING_USER'] },
      },
      data: {
        status: 'FAILED',
        endedAt: expect.any(Date),
        lastError: '模型超时',
      },
    });
  });

  it('transitionStatus 进入完成等非失败状态时清除上一轮错误', async () => {
    const { prisma } = makePrisma();
    prisma.recipeDesignAgentSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new RecipeAgentSessionService(prisma as any);

    await service.transitionStatus('s1', ['RUNNING'], 'COMPLETED');

    expect(prisma.recipeDesignAgentSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', status: { in: ['RUNNING'] } },
      data: { status: 'COMPLETED', endedAt: expect.any(Date), lastError: null },
    });
  });

  it('recordUsage 拒绝小数与溢出的 token 数', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);

    await expect(service.recordUsage('s1', 1.5, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.recordUsage('s1', 1e15, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.recipeDesignAgentSession.update).not.toHaveBeenCalled();
  });

  it('recordUsage 接受 0 与 1000 这类合法 token 数', async () => {
    const { prisma } = makePrisma();
    const service = new RecipeAgentSessionService(prisma as any);

    await service.recordUsage('s1', 0, 1000);

    expect(prisma.recipeDesignAgentSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        promptTokens: { increment: 0 },
        completionTokens: { increment: 1000 },
      },
    });
  });
});
