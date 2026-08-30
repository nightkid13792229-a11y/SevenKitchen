import { normalizeSuggestionResult } from '../../../src/application/recipe-designer/ai-design-suggestion.service';

describe('normalizeSuggestionResult', () => {
  it('normalizes a well-formed AI response', () => {
    const result = normalizeSuggestionResult(
      {
        summary: '低脂高纤维方向',
        ingredientSuggestions: [
          { name: '南瓜', reason: '富含纤维' },
          { name: '三文鱼', reason: '优质蛋白' },
        ],
        avoidIngredients: [{ name: '鸡皮', reason: '高脂' }],
        nutritionFocus: [{ point: '控制脂肪', reason: '胰腺炎史' }],
        supplementSuggestions: [{ name: '鱼油', reason: '补充 EPA/DHA' }],
        reuseSuggestions: [{ name: '牛肉', reason: '既往接受良好' }],
        warnings: ['体重信息缺失'],
      },
      { provider: 'deepseek' },
    );

    expect(result.provider).toBe('deepseek');
    expect(result.summary).toBe('低脂高纤维方向');
    expect(result.ingredientSuggestions).toHaveLength(2);
    expect(result.avoidIngredients[0].name).toBe('鸡皮');
    expect(result.nutritionFocus[0].point).toBe('控制脂肪');
    expect(result.supplementSuggestions[0].name).toBe('鱼油');
    expect(result.reuseSuggestions[0].name).toBe('牛肉');
    expect(result.warnings).toEqual(['体重信息缺失']);
  });

  it('guards against malformed lists and adds a warning', () => {
    const result = normalizeSuggestionResult(
      { summary: '', ingredientSuggestions: 'not-a-list' },
      { provider: 'deepseek' },
    );
    expect(result.summary).toBe('暂无总结');
    expect(result.ingredientSuggestions).toEqual([]);
    expect(result.warnings).toContain('AI 未返回食材建议，请人工设计');
  });

  it('drops empty-named suggestion entries', () => {
    const result = normalizeSuggestionResult(
      {
        ingredientSuggestions: [{ name: '', reason: 'x' }, { reason: 'y' }],
        avoidIngredients: undefined,
        nutritionFocus: undefined,
        supplementSuggestions: undefined,
        reuseSuggestions: undefined,
      },
      { provider: 'deepseek' },
    );
    expect(result.ingredientSuggestions).toEqual([]);
    expect(result.avoidIngredients).toEqual([]);
  });
});
