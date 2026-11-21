import { RecipeDraftPort } from '../../../src/application/recipe-designer/agent/draft-port';
import { executeTool } from '../../../src/application/recipe-designer/agent/tools';

const readiness = {
  draftId: 'draft-1',
  ready: false,
  blockers: [{ code: 'PRODUCTION_STEPS_REQUIRED', message: '请先写制作步骤' }],
  warnings: [],
  summary: {},
};

function context(port: Record<string, jest.Mock>) {
  return {
    port,
    catalog: {} as any,
    knowledge: {} as any,
    onAsk: jest.fn(),
  } as any;
}

describe('read_launch_readiness / finish 工具', () => {
  it('read_launch_readiness 读端口并返回阻断项', async () => {
    const port = {
      readLaunchReadiness: jest.fn().mockResolvedValue(readiness),
    };

    const outcome = (await executeTool(
      'read_launch_readiness',
      {},
      context(port),
    )) as any;

    expect(outcome.ok).toBe(true);
    expect(outcome.data).toEqual(readiness);
    expect(outcome.summary).toContain('还有阻断');
    expect(port.readLaunchReadiness).toHaveBeenCalled();
  });

  it('finish 返回完成摘要和上线检查，供完成卡片使用', async () => {
    const port = {
      readLaunchReadiness: jest.fn().mockResolvedValue(readiness),
    };

    const outcome = (await executeTool(
      'finish',
      { summary: '配方已定稿' },
      context(port),
    )) as any;

    expect(outcome.ok).toBe(true);
    expect(outcome.data).toEqual({
      summary: '配方已定稿',
      readiness,
    });
    expect(outcome.summary).toContain('设计完成');
  });

  it('RecipeDraftPort.readLaunchReadiness 走草稿的上线检查', async () => {
    const getDraftLaunchReadiness = jest.fn().mockResolvedValue(readiness);
    const port = new RecipeDraftPort(
      { getDraftLaunchReadiness } as any,
      { userId: 'u1' } as any,
      'draft-1',
    );

    await expect(port.readLaunchReadiness()).resolves.toEqual(readiness);
    expect(getDraftLaunchReadiness).toHaveBeenCalledWith('draft-1', {
      userId: 'u1',
    });
  });
});
