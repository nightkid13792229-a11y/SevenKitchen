import { RecipeAgentService } from '../../../src/application/recipe-designer/agent/recipe-agent.service';

function createService(session: any) {
  const service = Object.create(RecipeAgentService.prototype) as any;
  service.designer = { getDraft: jest.fn().mockResolvedValue({}) };
  service.prisma = {
    recipeDesignAgentSession: {
      findFirst: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  service.logger = { warn: jest.fn() };
  service.active = new Set<string>();
  service.pendingStageStart = new Map<string, any>();
  service.start = jest.fn().mockResolvedValue({ sessionId: 's1' });
  return service as RecipeAgentService;
}

const actor = { userId: 'u1', role: 'ADMIN' };

describe('选材清单硬边界', () => {
  const missingSelection = {
    summary: 'x',
    items: [
      { kind: 'FOOD', name: '鲭鱼', reason: 'x', dataStatus: 'MISSING' },
      { kind: 'FOOD', name: '大米', reason: 'x', dataStatus: 'AVAILABLE' },
    ],
  };
  const availableSelection = {
    summary: 'x',
    items: [
      { kind: 'FOOD', name: '青花鱼', reason: 'x', dataStatus: 'AVAILABLE' },
      { kind: 'FOOD', name: '大米', reason: 'x', dataStatus: 'AVAILABLE' },
    ],
  };

  it('有未匹配项时不能保存选中清单', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      selectionConfirmedAt: null,
      selection: missingSelection,
    });

    await expect(
      service.updateSelectionItems('draft-1', actor, ['鲭鱼', '大米']),
    ).rejects.toThrow('不能保存选中清单');
  });

  it('全部可用时才能保存', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      selectionConfirmedAt: null,
      selection: availableSelection,
    });

    const result = await service.updateSelectionItems('draft-1', actor, [
      '青花鱼',
      '大米',
    ]);
    expect(result.items).toHaveLength(2);
    expect(
      (service as any).prisma.recipeDesignAgentSession.update,
    ).toHaveBeenCalled();
  });

  it('有未匹配项时不能确认进入 DESIGN', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      selectionConfirmedAt: null,
      selection: missingSelection,
    });

    await expect(
      service.confirmSelection('draft-1', actor, 'APPROVE'),
    ).rejects.toThrow('不能进入配方编辑');
    expect((service as any).start).not.toHaveBeenCalled();
  });

  it('全部可用时才能确认进入 DESIGN', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      selectionConfirmedAt: null,
      selection: availableSelection,
    });

    const result = await service.confirmSelection(
      'draft-1',
      actor,
      'APPROVE',
    );
    expect(result.phase).toBe('DESIGN');
    expect((service as any).start).toHaveBeenCalled();
  });
});
