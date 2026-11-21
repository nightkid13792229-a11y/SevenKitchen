import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';

describe('RecipeDraftPort.writeCopy', () => {
  function createPort(overrides: Record<string, jest.Mock> = {}) {
    const designer = {
      getDraft: jest.fn().mockResolvedValue({ series: { id: 'series-1' } }),
      renameSeries: jest.fn().mockResolvedValue({}),
      updateDraftPresentation: jest.fn().mockResolvedValue({}),
      updateDraft: jest.fn().mockResolvedValue({}),
      ...overrides,
    };
    return {
      port: new RecipeDraftPort(designer as any, {} as any, 'draft-1'),
      designer,
    };
  }

  it('命中违规词时在写库前就报错', async () => {
    const { port, designer } = createPort();

    await expect(
      port.writeCopy({ description: '本配方可以治疗肾病' }),
    ).rejects.toMatchObject({ code: 'COPY_COMPLIANCE' });
    expect(designer.getDraft).not.toHaveBeenCalled();
    expect(designer.updateDraftPresentation).not.toHaveBeenCalled();
  });

  it('名称超过 12 个字时提前报错', async () => {
    const { port } = createPort();

    await expect(
      port.writeCopy({ name: '低脂鸡胸南瓜营养主食定制餐' }),
    ).rejects.toMatchObject({ code: 'NAME_TOO_LONG' });
  });

  it('合法文案写名称和展示资料', async () => {
    const { port, designer } = createPort();

    const changed = await port.writeCopy({
      name: '低脂鸭肉南瓜',
      coverTitle: '鲜肉低脂日常',
      sellingPoint: '鲜肉配方，日常维持',
      description: '鸭肉与南瓜搭配，适合日常喂养。',
    });

    expect(changed).toEqual(['名称', '封面标题', '卖点', '描述']);
    expect(designer.renameSeries).toHaveBeenCalledWith(
      'series-1',
      { name: '低脂鸭肉南瓜' },
      {},
    );
    expect(designer.updateDraftPresentation).toHaveBeenCalledWith(
      'draft-1',
      {
        coverTitle: '鲜肉低脂日常',
        sellingPoint: '鲜肉配方，日常维持',
        description: '鸭肉与南瓜搭配，适合日常喂养。',
      },
      {},
    );
  });
});
