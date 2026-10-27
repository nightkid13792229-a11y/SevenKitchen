import { buildRecipeCoverPrompt } from 'src/application/recipe-designer/zhipu-image';

/**
 * 封面提示词（2026-10-27 质量调优）
 *
 * 生产实测第一版：模型画出了大块深红生肉 + 生蛋黄 + 一小块南瓜，
 * 燕麦几乎看不见，碗底被裁掉 —— 和「熟鲜食」的品牌感相反。
 * 这组测试把「熟食 / 45° / 碗完整 / 禁止生肉」这些关键约束钉住。
 */
describe('buildRecipeCoverPrompt', () => {
  it('写清熟食、45 度、碗完整与禁止生肉/猫粮罐头', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      foodNames: ['鸭肉', '南瓜', '燕麦'],
    });

    expect(prompt).toContain('gently cooked');
    expect(prompt).toContain('45-degree');
    expect(prompt).toContain('fully visible');
    expect(prompt).toContain('generous margin');
    expect(prompt).toContain('No raw meat');
    expect(prompt).toContain('no kibble');
    expect(prompt).toContain('no canned food');
    expect(prompt).toContain('鸭肉, 南瓜, 燕麦');
    expect(prompt).toContain('鸭肉南瓜燕麦');
  });

  it('食材里没有蛋时明确禁止画蛋；有蛋时不禁止', () => {
    expect(
      buildRecipeCoverPrompt({
        recipeName: '鸭肉南瓜燕麦',
        foodNames: ['鸭肉', '南瓜', '燕麦'],
      }),
    ).toContain('No egg.');

    expect(
      buildRecipeCoverPrompt({
        recipeName: '鸡肉鸡蛋餐',
        foodNames: ['鸡肉', '鸡蛋'],
      }),
    ).not.toContain('No egg.');
  });

  it('没有食材也能生成（只用菜名，不崩）', () => {
    const prompt = buildRecipeCoverPrompt({ recipeName: '鸡肉南瓜' });

    expect(prompt).toContain('鸡肉南瓜');
    expect(prompt).not.toContain('Inside the bowl:');
  });
});
