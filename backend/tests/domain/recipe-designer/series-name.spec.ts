import {
  RECIPE_NAME_MAX_LENGTH,
  RecipeNameLengthError,
  assertRecipeNameLength,
  countRecipeNameLength,
} from 'src/domain/recipe-designer/series-name';

describe('食谱名称长度规则', () => {
  it('上限是 12', () => {
    expect(RECIPE_NAME_MAX_LENGTH).toBe(12);
  });

  it('正好 12 字必须通过（老菜「十字花科全谷物三文鱼鸡肉」就是 12 字）', () => {
    expect(() =>
      assertRecipeNameLength('十字花科全谷物三文鱼鸡肉'),
    ).not.toThrow();
    expect(countRecipeNameLength('十字花科全谷物三文鱼鸡肉')).toBe(12);
  });

  it('13 字拒绝，且错误信息里带当前字数', () => {
    expect(() => assertRecipeNameLength('十字花科全谷物三文鱼鸡肉啊')).toThrow(
      RecipeNameLengthError,
    );
    expect(() => assertRecipeNameLength('十字花科全谷物三文鱼鸡肉啊')).toThrow(
      /当前 13 字/,
    );
  });

  it('返回去掉首尾空格的名称', () => {
    expect(assertRecipeNameLength('  三文鱼｜南瓜  ')).toBe('三文鱼｜南瓜');
  });

  it('空格不计入长度（先 trim 再数）', () => {
    expect(countRecipeNameLength('   短名   ')).toBe(2);
  });

  it('数字和符号也按 1 个字算', () => {
    expect(countRecipeNameLength('均衡营养｜三文鱼5号')).toBe(10);
  });
});
