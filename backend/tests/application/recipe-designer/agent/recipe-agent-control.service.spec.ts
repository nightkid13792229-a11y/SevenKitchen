import { BadRequestException } from '@nestjs/common';
import { RecipeAgentControlService } from 'src/application/recipe-designer/agent/recipe-agent-control.service';

const DRAFT = {
  draftId: 'draft-1',
  name: '低脂鸡肉饭',
  contentRevision: 7,
  items: [
    { category: 'PROTEIN' },
    { category: 'ORGAN' },
    { category: 'MUSHROOM' },
    { category: 'NUTS' },
    { category: 'OIL' },
    { category: 'FRUIT' },
  ],
};

function makeSessionService() {
  return {
    appendMessage: jest.fn().mockResolvedValue({ id: 'm1' }),
    transitionStatus: jest.fn().mockResolvedValue(true),
  };
}

function makeApprovalService() {
  return {
    request: jest.fn().mockResolvedValue({ id: 'approval-1' }),
    getApprovalState: jest.fn().mockResolvedValue({
      approvedException: false,
      confirmedOmissions: [],
    }),
  };
}

function makePrisma() {
  return {
    recipeDesignAgentSnapshot: {
      create: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
    },
  };
}

function makePort(draft: unknown = DRAFT) {
  return {
    getDraft: jest.fn().mockResolvedValue(draft),
  };
}

function makeService(options: { draft?: unknown } = {}) {
  const sessionService = makeSessionService();
  const approvalService = makeApprovalService();
  const prisma = makePrisma();
  const port = makePort(options.draft);

  const service = new RecipeAgentControlService(
    sessionService as any,
    approvalService as any,
    prisma as any,
    port as any,
    'session-1',
    'draft-1',
  );

  return { service, sessionService, approvalService, prisma, port };
}

describe('RecipeAgentControlService', () => {
  it('askUser 把带编号的问题写进对话并置 WAITING_USER', async () => {
    const { service, sessionService } = makeService();

    await service.askUser({
      questions: [
        { question: '主蛋白用鸡胸还是三文鱼？', options: ['鸡胸', '三文鱼'] },
        { question: '需要加坚果吗？' },
      ],
    });

    expect(sessionService.appendMessage).toHaveBeenCalledTimes(1);
    const message = sessionService.appendMessage.mock.calls[0][0];
    expect(message).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        role: 'ASSISTANT',
      }),
    );
    expect(message.content).toContain(
      '1. 主蛋白用鸡胸还是三文鱼？（可选：鸡胸 / 三文鱼）',
    );
    expect(message.content).toContain('2. 需要加坚果吗？');
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      'session-1',
      ['RUNNING'],
      'WAITING_USER',
    );
    // 先抢状态再写对话：状态没抢到（会话已停止 / 结束）就不该再追加消息。
    expect(
      sessionService.transitionStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(sessionService.appendMessage.mock.invocationCallOrder[0]);
  });

  it('askUser 在会话已停止（状态没抢到）时不写对话', async () => {
    const { service, sessionService } = makeService();
    sessionService.transitionStatus.mockResolvedValue(false);

    await service.askUser({ questions: [{ question: '还在吗？' }] });

    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      'session-1',
      ['RUNNING'],
      'WAITING_USER',
    );
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
  });

  it('COMPLIANCE 映射为 COMPLIANCE_EXCEPTION，原样带 detail 并写对话', async () => {
    const { service, approvalService, sessionService } = makeService();

    await service.requestException({
      type: 'COMPLIANCE',
      reason: '急性胰腺炎恢复期，医生要求脂肪更低',
      detail: '医生建议脂肪供能比低于 15%',
    });

    expect(approvalService.request).toHaveBeenCalledWith({
      sessionId: 'session-1',
      type: 'COMPLIANCE_EXCEPTION',
      reason: '急性胰腺炎恢复期，医生要求脂肪更低',
      detail: '医生建议脂肪供能比低于 15%',
    });
    expect(sessionService.appendMessage).toHaveBeenCalledTimes(1);
    const message = sessionService.appendMessage.mock.calls[0][0];
    expect(message.role).toBe('ASSISTANT');
    expect(message.content).toContain('approval-1');
  });

  it('CATEGORY_OMISSION 从当前草稿算缺类，不解析模型传的 detail', async () => {
    const { service, approvalService, port, sessionService } = makeService();

    await service.requestException({
      type: 'CATEGORY_OMISSION',
      reason: '这份菜谱刻意不加主食和蔬菜',
      detail: '{"categories":["PROTEIN"]}',
    });

    expect(port.getDraft).toHaveBeenCalledWith('draft-1');
    expect(approvalService.request).toHaveBeenCalledWith({
      sessionId: 'session-1',
      type: 'CATEGORY_OMISSION',
      reason: '这份菜谱刻意不加主食和蔬菜',
      detail: { categories: ['AQUATIC', 'CARB', 'VEGETABLE'] },
    });
    expect(sessionService.appendMessage).toHaveBeenCalledTimes(1);
    const message = sessionService.appendMessage.mock.calls[0][0];
    expect(message.content).toContain('approval-1');
  });

  it('CATEGORY_OMISSION 没有缺类时抛 BadRequest，不发审批也不写对话', async () => {
    const completeDraft = {
      ...DRAFT,
      items: [
        { category: 'PROTEIN' },
        { category: 'ORGAN' },
        { category: 'AQUATIC' },
        { category: 'CARB' },
        { category: 'VEGETABLE' },
        { category: 'MUSHROOM' },
        { category: 'NUTS' },
        { category: 'OIL' },
      ],
    };
    const { service, approvalService, sessionService } = makeService({
      draft: completeDraft,
    });

    await expect(
      service.requestException({
        type: 'CATEGORY_OMISSION',
        reason: '想确认一下',
        detail: '无',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.requestException({
        type: 'CATEGORY_OMISSION',
        reason: '想确认一下',
        detail: '无',
      }),
    ).rejects.toThrow('当前没有缺类需要确认');

    expect(approvalService.request).not.toHaveBeenCalled();
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
  });

  it('旧会话兼容：finishDraft 用当前 contentRevision 写快照、置 COMPLETED 并写交付卡', async () => {
    const { service, prisma, sessionService } = makeService();

    await service.finishDraft({
      summary: '低脂鸡肉饭已完成，七类只缺 CARB / VEGETABLE。',
      warnings: ['缺 CARB：没有主食', '缺 VEGETABLE：没有蔬菜'],
    });

    expect(prisma.recipeDesignAgentSnapshot.create).toHaveBeenCalledWith({
      data: {
        designRecipeId: 'draft-1',
        sessionId: 'session-1',
        contentRevision: 7,
        snapshot: {
          draft: DRAFT,
          summary: '低脂鸡肉饭已完成，七类只缺 CARB / VEGETABLE。',
          warnings: ['缺 CARB：没有主食', '缺 VEGETABLE：没有蔬菜'],
        },
      },
    });
    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      'session-1',
      ['RUNNING'],
      'COMPLETED',
    );
    // 先抢状态，再取草稿 / 写快照 / 写交付卡：停止后不再产生重复快照。
    expect(
      sessionService.transitionStatus.mock.invocationCallOrder[0],
    ).toBeLessThan(
      prisma.recipeDesignAgentSnapshot.create.mock.invocationCallOrder[0],
    );
    expect(
      prisma.recipeDesignAgentSnapshot.create.mock.invocationCallOrder[0],
    ).toBeLessThan(sessionService.appendMessage.mock.invocationCallOrder[0]);

    expect(sessionService.appendMessage).toHaveBeenCalledTimes(1);
    const message = sessionService.appendMessage.mock.calls[0][0];
    expect(message.role).toBe('ASSISTANT');
    expect(message.content).toContain('低脂鸡肉饭已完成');
    expect(message.content).toContain('缺 CARB：没有主食');
    expect(message.content).toContain('缺 VEGETABLE：没有蔬菜');
  });

  it('旧会话兼容：finishDraft 在会话已停止（状态没抢到）时不写快照也不写交付卡', async () => {
    const { service, prisma, sessionService, port } = makeService();
    sessionService.transitionStatus.mockResolvedValue(false);

    await service.finishDraft({ summary: '已完成', warnings: [] });

    expect(sessionService.transitionStatus).toHaveBeenCalledWith(
      'session-1',
      ['RUNNING'],
      'COMPLETED',
    );
    expect(port.getDraft).not.toHaveBeenCalled();
    expect(prisma.recipeDesignAgentSnapshot.create).not.toHaveBeenCalled();
    expect(sessionService.appendMessage).not.toHaveBeenCalled();
  });

  it('getApprovalState 委托审批服务并带上当前会话', async () => {
    const { service, approvalService } = makeService();
    const state = {
      approvedException: true,
      confirmedOmissions: ['CARB' as const],
    };
    approvalService.getApprovalState.mockResolvedValue(state);

    await expect(service.getApprovalState()).resolves.toBe(state);
    expect(approvalService.getApprovalState).toHaveBeenCalledWith('session-1');
  });
});
