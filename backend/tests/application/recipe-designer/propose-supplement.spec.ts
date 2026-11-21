import { executeTool } from '../../../src/application/recipe-designer/agent/tools';
import { normalizeSupplementProposal } from '../../../src/application/recipe-designer/agent/propose-supplement';

describe('补剂提案工具', () => {
  it('归一化 1–3 项补剂，保留 fieldPath 与克数', () => {
    const proposal = normalizeSupplementProposal({
      summary: '评估缺口',
      items: [
        {
          nutritionFoodId: 'nf-zinc',
          name: '锌片',
          weightG: 1,
          fieldPath: 'minerals.zinc',
          unit: 'mg',
          reason: '锌不足',
        },
      ],
    });

    expect(proposal).toEqual({
      summary: '评估缺口',
      items: [
        {
          nutritionFoodId: 'nf-zinc',
          name: '锌片',
          weightG: 1,
          fieldPath: 'minerals.zinc',
          unit: 'mg',
          reason: '锌不足',
        },
      ],
    });
  });

  it('空提案拒绝', () => {
    expect(() => normalizeSupplementProposal({ items: [] })).toThrow(
      '补剂提案需要 1–3 项',
    );
  });

  it('工具返回提案但不写草稿', async () => {
    const context = {
      port: {} as any,
      catalog: {} as any,
      knowledge: {} as any,
      onAsk: jest.fn(),
    };
    const outcome = (await executeTool(
      'propose_supplement',
      {
        items: [
          {
            nutritionFoodId: 'nf-zinc',
            name: '锌片',
            weightG: 1,
            fieldPath: 'minerals.zinc',
            reason: '锌不足',
          },
        ],
      },
      context,
    )) as any;

    expect(outcome.ok).toBe(true);
    expect(outcome.data.items).toHaveLength(1);
    expect(outcome.summary).toContain('补剂提案');
  });
});
