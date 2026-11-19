import { extractJsonObject, parseAdvice } from '../../../application/ingredient-creation/supplement-form-advice.service';

describe('extractJsonObject', () => {
  it('去掉 ```json 围栏和前言', () => {
    const text = '好的，结果如下：\n```json\n{"a":1}\n```\n以上。';
    expect(extractJsonObject(text)).toBe('{"a":1}');
  });

  it('没有花括号就报错', () => {
    expect(() => extractJsonObject('我不知道')).toThrow();
  });
});

describe('parseAdvice', () => {
  const base = {
    nutrientKey: 'minerals.copper',
    nutrientLabel: '铜',
  };

  it('认不出的 verdict 一律按证据不足，不许悄悄变成推荐', () => {
    const result = parseAdvice(
      JSON.stringify({
        options: [{ level: 'OXIDE', verdict: 'MAYBE', reason: 'x', citations: [] }],
      }),
      base.nutrientKey,
      base.nutrientLabel,
    );
    expect(result.options[0]!.verdict).toBe('NO_EVIDENCE');
  });

  it('认不出的档位落到 OTHER', () => {
    const result = parseAdvice(
      JSON.stringify({ options: [{ level: 'SUPER_FORM', verdict: 'AVOID' }] }),
      base.nutrientKey,
      base.nutrientLabel,
    );
    expect(result.options[0]!.level).toBe('OTHER');
  });

  it('缺 documentId 或页码的引用直接丢掉', () => {
    const result = parseAdvice(
      JSON.stringify({
        options: [
          {
            level: 'OXIDE',
            verdict: 'AVOID',
            citations: [
              { documentId: 'doc', page: 3, quote: 'q' },
              { documentId: '', page: 3, quote: 'q' },
              { documentId: 'doc', page: 0, quote: 'q' },
            ],
          },
        ],
      }),
      base.nutrientKey,
      base.nutrientLabel,
    );
    expect(result.options[0]!.citations).toHaveLength(1);
  });

  it('缺 options 直接报错，不要拿半份结果糊弄', () => {
    expect(() => parseAdvice('{"gaps":[]}', base.nutrientKey, base.nutrientLabel)).toThrow();
  });

  it('推荐档位只能是四档之一', () => {
    const result = parseAdvice(
      JSON.stringify({ options: [], recommendedLevel: 'BEST' }),
      base.nutrientKey,
      base.nutrientLabel,
    );
    expect(result.recommendedLevel).toBeNull();
  });
});
