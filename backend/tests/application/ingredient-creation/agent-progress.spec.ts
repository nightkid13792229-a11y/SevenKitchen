import { trackAgentProgress } from 'src/application/ingredient-creation/agent-progress';

const sets = () => ({
  seenSignatures: new Set<string>(),
  seenSourceRecordIds: new Set<string>(),
});

describe('trackAgentProgress', () => {
  it('同一工具同一参数第二次不算进展', () => {
    const s = sets();
    expect(
      trackAgentProgress({
        progress: undefined,
        signature: 'getRecord:1',
        ...s,
      }),
    ).toBe(true);
    expect(
      trackAgentProgress({
        progress: undefined,
        signature: 'getRecord:1',
        ...s,
      }),
    ).toBe(false);
  });

  it('同工具不同参数每次都是新信息', () => {
    const s = sets();
    expect(
      trackAgentProgress({
        progress: undefined,
        signature: 'getRecord:1',
        ...s,
      }),
    ).toBe(true);
    expect(
      trackAgentProgress({
        progress: undefined,
        signature: 'getRecord:2',
        ...s,
      }),
    ).toBe(true);
    expect(
      trackAgentProgress({
        progress: undefined,
        signature: 'getRecord:3',
        ...s,
      }),
    ).toBe(true);
  });

  it('重复调用但带回新来源 id 仍算进展', () => {
    const s = sets();
    trackAgentProgress({
      progress: undefined,
      signature: 'search:x',
      ...s,
    });
    expect(
      trackAgentProgress({
        progress: { sourceRecordIds: ['src-1'] },
        signature: 'search:x',
        ...s,
      }),
    ).toBe(true);
  });

  it('写入字段永远算进展', () => {
    const s = sets();
    trackAgentProgress({
      progress: undefined,
      signature: 'update:x',
      ...s,
    });
    expect(
      trackAgentProgress({
        progress: { writtenFieldPaths: ['ingredient.name'] },
        signature: 'update:x',
        ...s,
      }),
    ).toBe(true);
  });
});
