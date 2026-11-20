import {
  buildFoodCandidateDigest,
  buildSelectionSynthesisMessages,
} from '../../../src/application/recipe-designer/agent/selection-synthesis';
import type { DeepSeekToolsMessage } from '../../../src/application/recipe-designer/deepseek-tools-chat';

function foodTool(data: unknown): DeepSeekToolsMessage {
  return {
    role: 'tool',
    tool_call_id: 't1',
    content: JSON.stringify({ ok: true, data }),
  };
}

describe('selection synthesis fallback context', () => {
  it('builds a deduplicated candidate digest from find_food results', () => {
    const digest = buildFoodCandidateDigest([
      foodTool([
        {
          name: '猪里脊',
          category: 'MEAT',
          preparationState: '生',
          ingredientId: 'ing-1',
          nutritionFoodId: 'nf-1',
        },
        {
          name: '猪里脊',
          category: 'MEAT',
          ingredientId: 'ing-1',
        },
      ]),
      foodTool([]),
    ]);

    expect(digest).toContain('名称=猪里脊');
    expect(digest).toContain('ingredientId=ing-1');
    expect(digest.match(/名称=猪里脊/g)).toHaveLength(1);
  });

  it('includes the confirmed plan, candidates and no-supplement instruction', () => {
    const messages = buildSelectionSynthesisMessages({
      systemPrompt: 'system',
      phaseLine: 'select',
      userMessage: '选材',
      planJson: '{"summary":"plan"}',
      designContextJson: '{"dog":"x"}',
      candidateDigest: '- 名称=猪里脊',
    });

    const text = messages.map((m) => String(m.content)).join('\n');
    expect(text).toContain('已确认营养方案');
    expect(text).toContain('find_food');
    expect(text).toContain('只列 FOOD，不要列补剂');
    expect(text).toContain('系统会按名称匹配原料库');
  });
});
