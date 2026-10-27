import { buildRecipeCoverPrompt } from 'src/application/recipe-designer/zhipu-image';

/**
 * 封面提示词（2026-10-27 老板口径）
 *
 * · 「部位/状态/预处理」原样传，不拆；
 * · 物料状态不是生，也按生画；
 * · 不出现任何文字；商业美食摄影；陈列自由；只做弱调色统一；
 * · 视觉分量大致符合占比；不再塞系列名。
 */
describe('buildRecipeCoverPrompt', () => {
  const ingredients = [
    {
      name: '鸭胸肉',
      preparationMethod: '鸭胸/熟/去皮',
      ratioPercent: 45,
    },
    {
      name: '南瓜',
      preparationMethod: '生/去皮切块',
      ratioPercent: 30,
    },
    { name: '燕麦', preparationMethod: '生', ratioPercent: 25 },
  ];

  it('原样带上部位/状态/预处理的整串，不拆分', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
    });

    expect(prompt).toContain('鸭胸肉（鸭胸/熟/去皮） 45%');
    expect(prompt).toContain('南瓜（生/去皮切块） 30%');
    expect(prompt).toContain('燕麦（生） 25%');
  });

  it('状态不是生也按生画：有明确的 raw 覆盖说明', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
    });

    expect(prompt).toContain('raw and freshly prepped');
    expect(prompt).toContain('Even if a description mentions a cooked or dried state');
    expect(prompt).toContain('show the ingredient raw and fresh');
    expect(prompt).toContain('No cooked/seared/grilled/stewed look');
  });

  it('不塞系列名，避免模型画标题', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
    });

    expect(prompt).not.toContain('鸭肉南瓜燕麦');
  });

  it('商业摄影 + 陈列自由 + 弱调色统一 + 无文字', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
    });

    expect(prompt).toContain('Commercial food photography');
    expect(prompt).toContain('Arrange and style the scene freely');
    expect(prompt).toContain('warm neutral color grading');
    expect(prompt).toContain('No text');
    expect(prompt).toContain('keep the ingredients inside the frame');
  });

  it('食材里没有蛋时明确禁止画蛋；有蛋时不禁止', () => {
    expect(
      buildRecipeCoverPrompt({
        recipeName: '鸭肉南瓜燕麦',
        ingredients,
      }),
    ).toContain('No egg.');

    expect(
      buildRecipeCoverPrompt({
        recipeName: '鸡肉鸡蛋餐',
        ingredients: [{ name: '鸡蛋', preparationMethod: '生', ratioPercent: 100 }],
      }),
    ).not.toContain('No egg.');
  });

  it('很多食材时也不会超过智谱 1000 字符上限', () => {
    const many = Array.from({ length: 16 }, (_, index) => ({
      name: `食材${index + 1}号`,
      preparationMethod: '部位/生/去皮切块去骨',
      ratioPercent: 100 / 16,
    }));

    const prompt = buildRecipeCoverPrompt({
      recipeName: '很多食材',
      ingredients: many,
    });

    expect(prompt.length).toBeLessThanOrEqual(1000);
  });

  it('有画面描述时走固定模板：不再出现原始中文名和百分比', () => {
    const prompt = buildRecipeCoverPrompt({
      recipeName: '鸭肉南瓜燕麦',
      ingredients,
      visualBrief:
        'a generous hero portion of a pale-pink duck breast, skin removed; ' +
        'a moderate amount of a mound of pale oat groats',
    });

    expect(prompt).toContain(
      'a generous hero portion of a pale-pink duck breast',
    );
    expect(prompt).not.toContain('鸭胸肉');
    expect(prompt).not.toContain('45%');
    expect(prompt).not.toContain('16:9');
    expect(prompt).toContain('light oak kitchen table');
    expect(prompt).toContain('All ingredients are visible');
    expect(prompt).toContain('No text');
    expect(prompt.length).toBeLessThanOrEqual(1000);
  });

  it('没有食材数据时也能生成（不崩）', () => {
    const prompt = buildRecipeCoverPrompt({ recipeName: '鸡肉南瓜' });

    expect(prompt).toContain('Commercial food photography');
    expect(prompt).not.toContain('Show every ingredient below');
  });
});
