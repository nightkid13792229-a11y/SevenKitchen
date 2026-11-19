import { extractAvoidTerms } from '../../../src/domain/recipe-designer/avoid-terms';

describe('extractAvoidTerms', () => {
  it('extracts the avoid list from a custom order note', () => {
    const terms = extractAvoidTerms([
      '不吃发物，牛、羊、鸡、鸡蛋不吃，低敏抗炎优先。',
    ]);

    expect(terms).toEqual(expect.arrayContaining(['牛', '羊', '鸡', '蛋']));
  });

  it('extracts terms from a medical treatment note', () => {
    const terms = extractAvoidTerms([
      '不吃牛羊鸡肉和鸡蛋，多吃兔、猪里脊、鱼肉',
    ]);

    expect(terms).toEqual(expect.arrayContaining(['牛', '羊', '鸡', '蛋']));
  });

  it('does not treat taurine as beef', () => {
    expect(extractAvoidTerms(['补充牛磺酸'])).not.toContain('牛');
  });

  it('does not treat protein as egg', () => {
    expect(extractAvoidTerms(['粗蛋白 30%'])).not.toContain('蛋');
  });

  it('does not treat emulsification as dairy', () => {
    expect(extractAvoidTerms(['乳化工艺'])).not.toContain('乳');
  });

  it('does not treat milk as beef', () => {
    const terms = extractAvoidTerms(['牛奶']);
    expect(terms).not.toContain('牛');
    expect(terms).toContain('奶');
  });

  it('still finds beef when both beef and milk are mentioned', () => {
    const terms = extractAvoidTerms(['牛肉和牛奶都不吃']);
    expect(terms).toContain('牛');
    expect(terms).toContain('奶');
  });

  it('returns an empty list for blank input', () => {
    expect(extractAvoidTerms([null, '', '   '])).toEqual([]);
  });
});
