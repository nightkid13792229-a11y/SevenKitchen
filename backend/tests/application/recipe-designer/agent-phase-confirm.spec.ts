import { ConflictException } from '@nestjs/common';
import { RecipeAgentService } from '../../../src/application/recipe-designer/agent/recipe-agent.service';

/**
 * 三阶段确认闸：阶段推进只能由确认动作触发。
 */
describe('RecipeAgentService confirm stages', () => {
  function createService(session: any) {
    const service = Object.create(RecipeAgentService.prototype) as any;
    service.designer = { getDraft: jest.fn().mockResolvedValue({}) };
    service.prisma = {
      recipeDesignAgentSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    service.active = new Set<string>();
    service.pendingStageStart = new Map<string, any>();
    service.start = jest.fn().mockResolvedValue({ sessionId: 's1' });
    return service as RecipeAgentService;
  }

  it('moves PLAN to SELECT only after approval', async () => {
    const service = createService({
      id: 's1',
      phase: 'PLAN',
      plan: { summary: 'x' },
      selection: null,
    });

    const result = await service.confirmPlan(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('SELECT');
    expect(
      (service as any).prisma.recipeDesignAgentSession.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phase: 'SELECT' }),
      }),
    );
    expect((service as any).start).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true, draftId: 'draft-1' }),
    );
  });

  it('keeps the current phase on CONTINUE', async () => {
    const service = createService({
      id: 's1',
      phase: 'PLAN',
      plan: { summary: 'x' },
      selection: null,
    });

    const result = await service.confirmPlan(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'CONTINUE',
    );

    expect(result.phase).toBe('PLAN');
    expect(
      (service as any).prisma.recipeDesignAgentSession.update,
    ).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phase: 'SELECT' }),
      }),
    );
    expect((service as any).start).not.toHaveBeenCalled();
  });

  it('refuses to approve PLAN without a submitted plan', async () => {
    const service = createService({
      id: 's1',
      phase: 'PLAN',
      plan: null,
      selection: null,
    });

    await expect(
      service.confirmPlan(
        'draft-1',
        { userId: 'u1', role: 'ADMIN' },
        'APPROVE',
      ),
    ).rejects.toThrow('还没有提交营养方案');
  });

  it('moves SELECT to DESIGN only after approval', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      plan: { summary: 'x' },
      selection: { summary: 'y', items: [] },
    });

    const result = await service.confirmSelection(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('DESIGN');
  });

  it('refuses to approve SELECT without a submitted selection', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      plan: { summary: 'x' },
      selection: null,
    });

    await expect(
      service.confirmSelection(
        'draft-1',
        { userId: 'u1', role: 'ADMIN' },
        'APPROVE',
      ),
    ).rejects.toThrow('还没有提交选材候选');
  });

  it('re-confirms a revised plan in DESIGN without demoting the phase', async () => {
    const service = createService({
      id: 's1',
      phase: 'DESIGN',
      plan: { summary: 'x' },
      planConfirmedAt: null,
      selection: { summary: 'y', items: [] },
      selectionConfirmedAt: new Date(),
    });

    const result = await service.confirmPlan(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('DESIGN');
    expect(
      (service as any).prisma.recipeDesignAgentSession.update,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          phase: 'DESIGN',
          planConfirmedAt: expect.any(Date),
        }),
      }),
    );
    expect((service as any).start).toHaveBeenCalledWith(
      expect.objectContaining({ silent: true, draftId: 'draft-1' }),
    );
  });

  it('does not restart when the plan is already confirmed in DESIGN', async () => {
    const service = createService({
      id: 's1',
      phase: 'DESIGN',
      plan: { summary: 'x' },
      planConfirmedAt: new Date(),
      selection: { summary: 'y', items: [] },
      selectionConfirmedAt: new Date(),
    });

    const result = await service.confirmPlan(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('DESIGN');
    expect((service as any).start).not.toHaveBeenCalled();
  });

  it('does not restart when the selection is already confirmed in DESIGN', async () => {
    const service = createService({
      id: 's1',
      phase: 'DESIGN',
      plan: { summary: 'x' },
      planConfirmedAt: new Date(),
      selection: { summary: 'y', items: [] },
      selectionConfirmedAt: new Date(),
    });

    const result = await service.confirmSelection(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('DESIGN');
    expect((service as any).start).not.toHaveBeenCalled();
  });

  it('queues the next stage instead of throwing 409 when a run still holds the lock', async () => {
    const service = createService({
      id: 's1',
      phase: 'PLAN',
      plan: { summary: 'x' },
      selection: null,
    });
    (service as any).start = jest
      .fn()
      .mockRejectedValue(new ConflictException('这个草稿已经有一个 AI 运行'));

    const result = await service.confirmPlan(
      'draft-1',
      { userId: 'u1', role: 'ADMIN' },
      'APPROVE',
    );

    expect(result.phase).toBe('SELECT');
    expect((service as any).pendingStageStart.get('draft-1')).toEqual(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});
