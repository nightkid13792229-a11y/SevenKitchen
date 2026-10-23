import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RecipeAgentApprovalService } from 'src/application/recipe-designer/agent/recipe-agent-approval.service';

function makePrisma() {
  return {
    recipeDesignAgentApproval: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'a1', ...data })),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const requestedAt = new Date('2026-10-24T00:00:00.000Z');

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    sessionId: 's1',
    type: 'COMPLIANCE_EXCEPTION',
    status: 'PENDING',
    reason: '急性胰腺炎发病期',
    detail: null,
    requestedAt,
    decidedAt: null,
    decidedBy: null,
    ...overrides,
  };
}

describe('RecipeAgentApprovalService', () => {
  it('缺类审批的 categories 必须是合法七类', async () => {
    const service = new RecipeAgentApprovalService(makePrisma() as any);

    await expect(
      service.request({
        sessionId: 's1',
        type: 'CATEGORY_OMISSION',
        reason: '无谷',
        detail: { categories: ['BOGUS'] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.request({
        sessionId: 's1',
        type: 'CATEGORY_OMISSION',
        reason: '无谷',
        detail: { categories: [] },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.request({
        sessionId: 's1',
        type: 'CATEGORY_OMISSION',
        reason: '无谷',
        detail: {},
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('重复缺类去重后写入', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);

    const record = await service.request({
      sessionId: 's1',
      type: 'CATEGORY_OMISSION',
      reason: '无谷',
      detail: { categories: ['CARB', 'CARB'] },
    });

    expect(prisma.recipeDesignAgentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: { categories: ['CARB'] },
        status: 'PENDING',
      }),
    });
    expect(record.id).toBe('a1');
    expect(record.status).toBe('PENDING');
  });

  it('只有 PENDING 能决定', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'APPROVED',
    });
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.decide('a1', { status: 'APPROVED', decidedBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.recipeDesignAgentApproval.updateMany).not.toHaveBeenCalled();
  });

  it('getApprovalState 只认 APPROVED', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findMany.mockResolvedValue([
      { type: 'COMPLIANCE_EXCEPTION', status: 'APPROVED', detail: null },
      {
        type: 'CATEGORY_OMISSION',
        status: 'APPROVED',
        detail: { categories: ['CARB', 'MUSHROOM'] },
      },
      { type: 'CATEGORY_OMISSION', status: 'REJECTED', detail: { categories: ['OIL'] } },
    ]);
    const service = new RecipeAgentApprovalService(prisma as any);

    const state = await service.getApprovalState('s1');

    expect(prisma.recipeDesignAgentApproval.findMany).toHaveBeenCalledWith({
      where: { sessionId: 's1', status: 'APPROVED' },
    });
    expect(state.approvedException).toBe(true);
    expect(state.confirmedOmissions).toEqual(['CARB', 'MUSHROOM']);
  });

  it('request 拒绝空白或超长理由', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.request({
        sessionId: 's1',
        type: 'COMPLIANCE_EXCEPTION',
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.request({
        sessionId: 's1',
        type: 'COMPLIANCE_EXCEPTION',
        reason: 'x'.repeat(501),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.recipeDesignAgentApproval.create).not.toHaveBeenCalled();
  });

  it('decide 找不到审批时抛 NotFound', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.decide('missing', { status: 'APPROVED', decidedBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipeDesignAgentApproval.updateMany).not.toHaveBeenCalled();
  });

  it('getApprovalState 忽略 PENDING 与 REJECTED', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findMany.mockResolvedValue([
      {
        type: 'COMPLIANCE_EXCEPTION',
        status: 'PENDING',
        detail: { note: '待批' },
      },
      {
        type: 'CATEGORY_OMISSION',
        status: 'REJECTED',
        detail: { categories: ['OIL'] },
      },
    ]);
    const service = new RecipeAgentApprovalService(prisma as any);

    const state = await service.getApprovalState('s1');

    expect(state).toEqual({ approvedException: false, confirmedOmissions: [] });
  });

  it('request 把 categories 规范化到七类顺序', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);

    await service.request({
      sessionId: 's1',
      type: 'CATEGORY_OMISSION',
      reason: '菌藻不足',
      detail: { categories: ['MUSHROOM', 'CARB'] },
    });

    expect(prisma.recipeDesignAgentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: { categories: ['CARB', 'MUSHROOM'] },
      }),
    });
  });

  it('decide 通过时写 decidedAt / decidedBy 并返回记录', async () => {
    const prisma = makePrisma();
    const row = pendingRow({
      detail: { note: '急性期' },
    });
    const decidedAt = new Date('2026-10-24T01:00:00.000Z');
    const decided = pendingRow({
      detail: { note: '急性期' },
      status: 'APPROVED',
      decidedAt,
      decidedBy: 'admin-1',
    });
    prisma.recipeDesignAgentApproval.findUnique
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(decided);
    const service = new RecipeAgentApprovalService(prisma as any);

    const record = await service.decide('a1', {
      status: 'APPROVED',
      decidedBy: ' admin-1 ',
    });

    expect(prisma.recipeDesignAgentApproval.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', status: 'PENDING' },
      data: {
        status: 'APPROVED',
        decidedAt: expect.any(Date),
        decidedBy: 'admin-1',
      },
    });
    expect(record).toMatchObject({
      id: 'a1',
      sessionId: 's1',
      type: 'COMPLIANCE_EXCEPTION',
      status: 'APPROVED',
      decidedBy: 'admin-1',
      decidedAt,
    });
  });

  it('并发决定时 updateMany 未命中且已是终态 → Conflict', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findUnique
      .mockResolvedValueOnce(pendingRow())
      .mockResolvedValueOnce(pendingRow({ status: 'APPROVED' }));
    prisma.recipeDesignAgentApproval.updateMany.mockResolvedValue({ count: 0 });
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.decide('a1', { status: 'APPROVED', decidedBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('并发决定时 updateMany 未命中且记录消失 → NotFound', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findUnique
      .mockResolvedValueOnce(pendingRow())
      .mockResolvedValueOnce(null);
    prisma.recipeDesignAgentApproval.updateMany.mockResolvedValue({ count: 0 });
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.decide('a1', { status: 'APPROVED', decidedBy: 'admin-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('decide 只接受 APPROVED / REJECTED', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);

    await expect(
      service.decide('a1', {
        status: 'PENDING' as any,
        decidedBy: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.recipeDesignAgentApproval.findUnique).not.toHaveBeenCalled();
  });

  it('getApprovalState 忽略畸形 detail，不抛异常', async () => {
    const prisma = makePrisma();
    prisma.recipeDesignAgentApproval.findMany.mockResolvedValue([
      { type: 'CATEGORY_OMISSION', status: 'APPROVED', detail: null },
      {
        type: 'CATEGORY_OMISSION',
        status: 'APPROVED',
        detail: 'not-json{',
      },
      {
        type: 'CATEGORY_OMISSION',
        status: 'APPROVED',
        detail: { categories: 'CARB' },
      },
      {
        type: 'CATEGORY_OMISSION',
        status: 'APPROVED',
        detail: { categories: ['BOGUS', 42, null, 'OIL'] },
      },
      { type: 'CATEGORY_OMISSION', status: 'APPROVED', detail: ['CARB'] },
    ]);
    const service = new RecipeAgentApprovalService(prisma as any);

    const state = await service.getApprovalState('s1');

    expect(state.approvedException).toBe(false);
    expect(state.confirmedOmissions).toEqual(['OIL']);
  });

  it('COMPLIANCE_EXCEPTION 的 detail 原样保存、理由去空白', async () => {
    const prisma = makePrisma();
    const service = new RecipeAgentApprovalService(prisma as any);
    const detail = { basis: '急性胰腺炎发病期', attachmentIds: ['f1'] };

    await service.request({
      sessionId: 's1',
      type: 'COMPLIANCE_EXCEPTION',
      reason: '  急性胰腺炎发病期  ',
      detail,
    });

    expect(prisma.recipeDesignAgentApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'COMPLIANCE_EXCEPTION',
        reason: '急性胰腺炎发病期',
        detail,
        status: 'PENDING',
      }),
    });
  });
});
