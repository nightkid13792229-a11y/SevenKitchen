import {
  extractAvoidTerms,
  itemMatchesAvoidTerm,
} from '../../../src/domain/recipe-designer/avoid-terms';

describe('extractAvoidTerms', () => {
  it('extracts the avoid list from a custom order note', () => {
    const terms = extractAvoidTerms([
      '不吃发物，牛、羊、鸡、鸡蛋不吃，低敏抗炎优先。',
    ]);

    expect(terms).toEqual(expect.arrayContaining(['牛', '羊', '鸡', '蛋']));
  });

  it('extracts terms from a medical treatment note without treating the recommended foods as avoid', () => {
    const terms = extractAvoidTerms([
      '不吃牛羊鸡肉和鸡蛋，多吃兔、猪里脊、鱼肉',
    ]);

    expect(terms).toEqual(expect.arrayContaining(['牛', '羊', '鸡', '蛋']));
    expect(terms).not.toContain('兔');
    expect(terms).not.toContain('猪');
    expect(terms).not.toContain('鱼');
  });

  it('ignores a purely positive recommendation', () => {
    expect(extractAvoidTerms(['多吃兔、猪里脊、鱼肉'])).toEqual([]);
  });

  it('keeps the negative part when a clause mixes both', () => {
    const terms = extractAvoidTerms(['不吃鸡但可以吃鱼']);
    expect(terms).toContain('鸡');
    expect(terms).not.toContain('鱼');
  });

  it('does not flag eggshell powder or methionine as egg', () => {
    expect(itemMatchesAvoidTerm('鸡蛋壳粉', '蛋')).toBe(false);
    expect(itemMatchesAvoidTerm('鸡蛋壳粉', '鸡')).toBe(false);
    expect(itemMatchesAvoidTerm('蛋氨酸锌', '蛋')).toBe(false);
  });

  it('still flags real chicken liver and whole egg', () => {
    expect(itemMatchesAvoidTerm('鸡肝', '鸡')).toBe(true);
    expect(itemMatchesAvoidTerm('鸡蛋', '蛋')).toBe(true);
  });

  it('does not treat taurine as beef', () => {
    expect(extractAvoidTerms(['不吃牛磺酸'])).not.toContain('牛');
  });

  it('does not treat protein as egg', () => {
    expect(extractAvoidTerms(['不吃高蛋白'])).not.toContain('蛋');
  });

  it('does not treat emulsification as dairy', () => {
    expect(extractAvoidTerms(['不吃乳化剂'])).not.toContain('乳');
  });

  it('does not treat milk as beef', () => {
    const terms = extractAvoidTerms(['不喝牛奶']);
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
