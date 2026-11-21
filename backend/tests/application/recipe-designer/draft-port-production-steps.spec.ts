import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

describe('RecipeDraftPort writeProductionSteps', () => {
  it('只传 instruction，由端口补序号与空的时间/温度/设备', async () => {
    const updateDraftProductionSteps = jest.fn().mockResolvedValue({
      draftId: 'draft-1',
      productionSteps: [{}, {}],
    });
    const designer = { updateDraftProductionSteps };
    const access = { userId: 'u1', role: 'ADMIN' } as any;
    const port = new RecipeDraftPort(designer as any, access, 'draft-1');

    const result = await port.writeProductionSteps([
      { instruction: '将肉类、蔬菜分别打碎。' },
      { instruction: '备注：冷冻保存 -18℃，保质期 6 个月。' },
    ]);

    expect(result).toEqual({ stepCount: 2 });
    expect(updateDraftProductionSteps).toHaveBeenCalledWith(
      'draft-1',
      {
        steps: [
          {
            sortOrder: 1,
            instruction: '将肉类、蔬菜分别打碎。',
            durationMinutes: null,
            temperatureC: null,
            equipment: null,
          },
          {
            sortOrder: 2,
            instruction: '备注：冷冻保存 -18℃，保质期 6 个月。',
            durationMinutes: null,
            temperatureC: null,
            equipment: null,
          },
        ],
      },
      access,
    );
  });

  it('把 instruction 两端空格去掉', async () => {
    const updateDraftProductionSteps = jest.fn().mockResolvedValue({
      draftId: 'draft-1',
      productionSteps: [{}],
    });
    const port = new RecipeDraftPort(
      { updateDraftProductionSteps } as any,
      {} as any,
      'draft-1',
    );

    await port.writeProductionSteps([{ instruction: '  混合均匀。  ' }]);

    expect(updateDraftProductionSteps.mock.calls[0][1].steps[0].instruction).toBe(
      '混合均匀。',
    );
  });
});
