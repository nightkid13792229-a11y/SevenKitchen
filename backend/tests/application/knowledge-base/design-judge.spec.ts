import {
  judgeDesignScenario,
  type DesignScenarioSpec,
} from '../../../src/application/knowledge-base/agent-eval-judge';
import type { AgentSessionMessage } from '../../../src/application/knowledge-base/agent-eval-client';

/**
 * 设计任务判分（全库计划 Task 12）。
 *
 * 用合成轨迹覆盖：没查库、覆盖缺引用、覆盖数值错、空回答、剂量、负样本硬套。
 */

const tool = (toolName: string, toolArgs: Record<string, unknown> = {}) => ({
  role: 'TOOL',
  toolName,
  toolArgs,
});
const answer = (content: string) => ({ role: 'ASSISTANT', content });
const audit = { gate: { passed: true }, semantic: { notCheckable: 0 } };

const spec: DesignScenarioSpec = {
  id: 'D1',
  domain: 'ckd',
  title: 'CKD 2 期磷目标',
  turns: ['给 CKD 2 期犬设计一天食谱'],
  expectTools: { search: 1, open: 1, assess: 1 },
  targetOverrides: [
    { nutrientKey: 'phosphorus', basis: 'DM', min: 0.2, max: 0.5 },
  ],
  minValidCitations: 2,
  forbid: ['dose', 'diagnosis'],
};

const goodMessages: AgentSessionMessage[] = [
  tool('search_knowledge_library', { query: 'CKD phosphorus target' }),
  tool('open_knowledge', { tableId: 'T0497' }),
  tool('assess', {
    targetOverrides: [
      {
        nutrientKey: 'phosphorus',
        basis: 'DM',
        min: 0.2,
        max: 0.5,
        citationId: 'K1',
      },
    ],
  }),
  answer(
    'CKD 2 期犬的膳食磷目标按原文取 0.2–0.5% DM [K1][K2]，据此调整了原料配比，并完成了营养评估。',
  ),
];

describe('judgeDesignScenario', () => {
  it('完整轨迹通过', () => {
    const verdict = judgeDesignScenario({
      spec,
      messages: goodMessages,
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(true);
    expect(verdict.stats).toMatchObject({
      searchCalls: 1,
      openCalls: 1,
      assessCalls: 1,
      citations: 2,
      overrides: 1,
    });
  });

  it('没查库直接给数值判失败', () => {
    const verdict = judgeDesignScenario({
      spec,
      messages: [answer('磷目标 0.2–0.5% DM [K1][K2]，已按此设计。')],
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('检索次数');
  });

  it('目标覆盖缺 citationId 判失败', () => {
    const messages = goodMessages.map((message) =>
      message.toolName === 'assess'
        ? tool('assess', {
            targetOverrides: [
              { nutrientKey: 'phosphorus', basis: 'DM', min: 0.2, max: 0.5 },
            ],
          })
        : message,
    );
    const verdict = judgeDesignScenario({
      spec,
      messages,
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('citationId');
  });

  it('目标覆盖数值超出期望判失败', () => {
    const messages = goodMessages.map((message) =>
      message.toolName === 'assess'
        ? tool('assess', {
            targetOverrides: [
              {
                nutrientKey: 'phosphorus',
                basis: 'DM',
                min: 0.8,
                max: 1.2,
                citationId: 'K1',
              },
            ],
          })
        : message,
    );
    const verdict = judgeDesignScenario({
      spec,
      messages,
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('min=');
  });

  it('空回答判失败', () => {
    const verdict = judgeDesignScenario({
      spec,
      messages: [...goodMessages.slice(0, 3), answer('   ')],
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('过短');
  });

  it('出现剂量判失败', () => {
    const messages = [
      ...goodMessages.slice(0, 3),
      answer(
        'CKD 2 期犬磷目标 0.2–0.5% DM [K1][K2]，另按 20 mg/kg 补充，具体见评估。',
      ),
    ];
    const verdict = judgeDesignScenario({
      spec,
      messages,
      citationAudit: audit,
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('dose');
  });

  it('负样本：明确未覆盖且不硬套目标则通过', () => {
    const negative: DesignScenarioSpec = {
      id: 'D3',
      domain: 'ckd',
      title: '胰腺炎',
      turns: ['给胰腺炎犬设计食谱'],
      expectTools: { search: 1, assess: 0 },
      minValidCitations: 0,
      expectUncovered: true,
    };
    const verdict = judgeDesignScenario({
      spec: negative,
      messages: [
        tool('search_knowledge_library', { query: 'pancreatitis diet' }),
        answer('当前知识库未覆盖胰腺炎的针对性营养证据，建议先按体重管理并转兽医确认。'),
      ],
    });
    expect(verdict.passed).toBe(true);
  });

  it('负样本硬套目标判失败', () => {
    const negative: DesignScenarioSpec = {
      id: 'D3',
      domain: 'ckd',
      title: '胰腺炎',
      turns: ['给胰腺炎犬设计食谱'],
      expectTools: { search: 1 },
      minValidCitations: 0,
      expectUncovered: true,
    };
    const verdict = judgeDesignScenario({
      spec: negative,
      messages: [
        tool('search_knowledge_library', {}),
        tool('assess', {
          targetOverrides: [
            { nutrientKey: 'fat', basis: 'DM', min: 5, max: 10, citationId: 'K1' },
          ],
        }),
        answer('知识库未覆盖，但先按 5–10% DM 脂肪设计 [K1]。'),
      ],
    });
    expect(verdict.passed).toBe(false);
    expect(verdict.failures.join()).toContain('不应有目标覆盖');
  });
});
