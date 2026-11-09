import { callDeepSeekJson } from '../../../src/application/recipe-designer/deepseek-chat';
import { CitationRegistry } from '../../../src/application/recipe-designer/agent/citation-registry';
import {
  citationGatePassed,
  isStructuralLine,
  judgeAnswer,
  rewriteAnswer,
} from '../../../src/application/recipe-designer/agent/citation-judge';

jest.mock('../../../src/application/recipe-designer/deepseek-chat', () => ({
  callDeepSeekJson: jest.fn(),
}));

const mockedCall = callDeepSeekJson as jest.Mock;

beforeEach(() => {
  mockedCall.mockReset();
});

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


describe('rewriteAnswer 修订器', () => {
  it('把未引用临床结论交给修订器，并保留引用表', async () => {
    mockedCall.mockResolvedValueOnce({ answer: '修订后：血磷 5.2 超过 2 期目标 [K1]。' });
    const registry = new CitationRegistry();
    registry.register(passage());
    const result = await rewriteAnswer({
      config: CONFIG,
      answer: '原文',
      uncited: [{ claim: '血磷 5.2 不属于 IRIS 2 期', kind: 'clinical' }],
      registry,
    });
    expect(result.answer).toContain('修订后');
    expect(mockedCall).toHaveBeenCalledTimes(1);
    const payload = mockedCall.mock.calls[0][0];
    expect(payload.userPayload.uncitedClinical).toHaveLength(1);
    expect(payload.userPayload.availableCitations[0].citationId).toBe('K1');
  });

  it('只有"引用不支持"的结论时也触发修订', async () => {
    mockedCall.mockResolvedValueOnce({ answer: '修订后：该结论待核对。' });
    const result = await rewriteAnswer({
      config: CONFIG,
      answer: '原文',
      uncited: [],
      unsupported: [{ claim: '零食≤10%', reason: '原文没写阈值' }],
      registry: new CitationRegistry(),
    });
    expect(result.answer).toContain('修订后');
    expect(mockedCall).toHaveBeenCalledTimes(1);
    expect(
      mockedCall.mock.calls[0][0].userPayload.unsupportedClaims,
    ).toEqual([{ claim: '零食≤10%', reason: '原文没写阈值' }]);
  });

  it('没有未引用结论时不调模型', async () => {
    const result = await rewriteAnswer({
      config: CONFIG,
      answer: '原文',
      uncited: [],
      registry: new CitationRegistry(),
    });
    expect(result.answer).toBe('原文');
    expect(mockedCall).not.toHaveBeenCalled();
  });
});


describe('citationGatePassed', () => {
  it('未引用、无效引用、unsupported 都为 0，且全部临床 claim 都判过，才通过', () => {
    expect(
      citationGatePassed({
        uncitedClinicalClaims: 0,
        invalidCitationCount: 0,
        notCheckable: 0,
        unsupported: 0,
        judgedClaims: 1,
        citedClinicalClaims: 1,
      }),
    ).toBe(true);
    expect(
      citationGatePassed({
        uncitedClinicalClaims: 0,
        invalidCitationCount: 0,
        notCheckable: 0,
        unsupported: 1,
        judgedClaims: 1,
        citedClinicalClaims: 1,
      }),
    ).toBe(false);
    expect(
      citationGatePassed({
        uncitedClinicalClaims: 1,
        invalidCitationCount: 0,
        notCheckable: 0,
        unsupported: 0,
        judgedClaims: 1,
        citedClinicalClaims: 1,
      }),
    ).toBe(false);
  });
});



describe('citationGatePassed 覆盖率', () => {
  it('有带引用临床 claim 未判时不通过', () => {
    expect(
      citationGatePassed({
        uncitedClinicalClaims: 0,
        invalidCitationCount: 0,
        notCheckable: 0,
        unsupported: 0,
        judgedClaims: 6,
        citedClinicalClaims: 15,
      }),
    ).toBe(false);
  });
});


describe('isStructuralLine', () => {
  it('标题与表格行不算临床结论', () => {
    expect(isStructuralLine('### 1) CKD 2 期膳食磷目标（已查证）')).toBe(true);
    expect(isStructuralLine('| 鸡胸 | 150 g | 煮 |')).toBe(true);
    expect(isStructuralLine('|---|---|')).toBe(true);
    expect(isStructuralLine('')).toBe(true);
  });

  it('正文结论仍要判', () => {
    expect(isStructuralLine('膳食磷目标为 0.2–0.5% DM [K1]。')).toBe(false);
    expect(isStructuralLine('钙磷比 0.14，远低于 1–2。')).toBe(false);
  });
});
