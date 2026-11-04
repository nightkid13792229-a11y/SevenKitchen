import { callDeepSeekJson } from '../../../src/application/recipe-designer/deepseek-chat';
import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';
import { judgeAnswer } from '../../../src/application/recipe-designer/agent/citation-judge';

jest.mock('../../../src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: jest.fn(),
}));

const mockedCall = callDeepSeekJson as jest.Mock;

function passage() {
  return {
    id: 'p1',
    text: 'Keep phosphorus <4.6 mg/dL.',
    truncated: false,
    sourceId: 'SACN5',
    sourceName: '小动物临床营养学（第5版）',
    documentId: 'sacn5-chapters-SACN5-37',
    documentTitle: 'SACN5_37.pdf',
    sectionId: 's1',
    sectionTitle: '787 Chronic Kidney Disease',
    pageStart: 17,
    score: 1,
  } as any;
}

const CONFIG = {
  baseUrl: 'http://example',
  model: 'main',
  reviewModel: 'judge',
  apiKey: 'key',
  requestTimeoutMs: 1000,
};

describe('judgeAnswer 两遍裁判', () => {
  it('先找未引用临床 claim，再判带引用的 claim', async () => {
    mockedCall
      .mockResolvedValueOnce({
        claims: [
          {
            text: 'IRIS 目标 <4.6 mg/dL [K1]',
            kind: 'clinical',
            citationIds: ['K1'],
          },
          {
            text: '血磷 5.2 不属于 IRIS 2 期',
            kind: 'clinical',
            citationIds: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        verdict: 'supported',
        reason: '原文给出目标',
        quote: 'Keep phosphorus <4.6 mg/dL.',
      });

    const registry = new CitationRegistry();
    registry.register(passage());
    const audit = await judgeAnswer({
      config: CONFIG,
      answer:
        'IRIS 目标 <4.6 mg/dL [K1]。血磷 5.2 不属于 IRIS 2 期。',
      registry,
    });

    expect(audit.totalClaims).toBe(2);
    expect(audit.clinicalClaims).toBe(2);
    expect(audit.citedClinicalClaims).toBe(1);
    expect(audit.uncitedClinicalClaims).toBe(1);
    expect(audit.uncitedClinical[0].claim).toContain('不属于 IRIS 2 期');
    expect(audit.supported).toBe(1);
    expect(mockedCall).toHaveBeenCalledTimes(2);
  });
});

describe('judgeAnswer 兜底', () => {
  it('裁判漏掉未引用数字句时，后端仍标为 uncited', async () => {
    mockedCall
      .mockResolvedValueOnce({
        claims: [
          {
            text: 'IRIS 目标 <4.6 mg/dL [K1]',
            kind: 'clinical',
            citationIds: ['K1'],
          },
        ],
      })
      .mockResolvedValueOnce({
        verdict: 'supported',
        reason: '原文给出目标',
        quote: 'Keep phosphorus <4.6 mg/dL.',
      });

    const registry = new CitationRegistry();
    registry.register(passage());
    const audit = await judgeAnswer({
      config: CONFIG,
      answer: 'IRIS 目标 <4.6 mg/dL [K1]。血磷 5.2 不属于 IRIS 2 期。',
      registry,
    });

    expect(audit.uncitedClinicalClaims).toBe(1);
    expect(audit.uncitedClinical[0].claim).toContain('5.2');
  });
});
