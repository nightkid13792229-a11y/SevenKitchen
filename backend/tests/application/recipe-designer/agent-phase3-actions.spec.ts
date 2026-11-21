import { RecipeAgentService } from '../../../src/application/recipe-designer/agent/recipe-agent.service';

function createService(session: any) {
  const service = Object.create(RecipeAgentService.prototype) as any;
  service.designer = {
    getDraft: jest.fn().mockResolvedValue({ contentRevision: 5 }),
    addItem: jest.fn().mockResolvedValue({ id: 'item-new' }),
    restoreFromAgentSnapshot: jest
      .fn()
      .mockResolvedValue({ contentRevision: 6 }),
  };
  service.prisma = {
    recipeDesignAgentSession: {
      findFirst: jest.fn().mockResolvedValue(session),
      findUnique: jest.fn().mockResolvedValue(session),
      update: jest.fn().mockResolvedValue({}),
    },
    recipeDesignAgentSnapshot: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'snap-1',
        snapshot: {
          version: 1,
          runStartRevision: 4,
          runEndRevision: 5,
          draft: { id: 'draft-1', items: [] },
        },
      }),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  service.appendMessage = jest.fn().mockResolvedValue(undefined);
  service.logger = { warn: jest.fn() };
  return service as RecipeAgentService;
}

const actor = { userId: 'u1', role: 'ADMIN' };

describe('RecipeAgentService 第三阶段动作', () => {
  it('选材卡逐项勾选只保留勾中的食材，空清单拒绝', async () => {
    const service = createService({
      id: 's1',
      phase: 'SELECT',
      selectionConfirmedAt: null,
      selection: {
        summary: '清单',
        items: [
          { kind: 'FOOD', name: '鸡胸肉', reason: '蛋白' },
          { kind: 'FOOD', name: '南瓜', reason: '纤维' },
        ],
      },
    });

    const result = await service.updateSelectionItems('draft-1', actor, [
      '鸡胸肉',
    ]);

    expect(result.items.map((item) => item.name)).toEqual(['鸡胸肉']);
    expect(result.confirmed).toBe(false);
    await expect(
      service.updateSelectionItems('draft-1', actor, []),
    ).rejects.toThrow('至少要保留一条选材');
  });

  it('补剂提案 ACCEPT 才写入配方；DECLINE 不写', async () => {
    const proposal = {
      items: [
        {
          nutritionFoodId: 'nf-zinc',
          name: '锌片',
          weightG: 1,
          fieldPath: 'minerals.zinc',
          unit: 'mg',
          reason: '评估缺口',
        },
      ],
    };
    const service = createService({
      id: 's1',
      phase: 'DESIGN',
      supplementProposal: proposal,
    });

    await service.decideSupplementProposal('draft-1', actor, 'ACCEPT');
    expect((service as any).designer.addItem).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        nutritionFoodId: 'nf-zinc',
        supplementTargets: [{ fieldPath: 'minerals.zinc', unit: 'mg' }],
      }),
      expect.anything(),
    );
    const update =
      (service as any).prisma.recipeDesignAgentSession.update.mock.calls[0][0];
    expect(update.data.status).toBe('WAITING_USER');
    expect(update.data.supplementProposal).not.toEqual(proposal);
  });

  it('补剂提案 DECLINE 不调用 addItem', async () => {
    const service = createService({
      id: 's1',
      phase: 'DESIGN',
      supplementProposal: {
        items: [
          {
            nutritionFoodId: 'nf-zinc',
            name: '锌片',
            weightG: 1,
            fieldPath: 'minerals.zinc',
            reason: '评估缺口',
          },
        ],
      },
    });

    await service.decideSupplementProposal('draft-1', actor, 'DECLINE');
    expect((service as any).designer.addItem).not.toHaveBeenCalled();
  });

  it('运行后没人工改过才能撤销；撤销走快照恢复', async () => {
    const service = createService({
      id: 's1',
      designRecipeId: 'draft-1',
      status: 'WAITING_USER',
    });

    const result = await service.revertRun('s1', actor);

    expect((service as any).designer.restoreFromAgentSnapshot).toHaveBeenCalledWith(
      'draft-1',
      expect.any(Object),
      expect.anything(),
    );
    expect(result).toEqual({ reverted: true, contentRevision: 6 });
  });
});
