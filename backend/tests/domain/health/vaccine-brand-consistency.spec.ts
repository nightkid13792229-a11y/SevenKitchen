import { describe, expect, it } from '@jest/globals';
import { checkBrandConsistency } from 'src/domain/health/vaccine-products';

/**
 * 品牌一致性检查（2026-10-09 老板定）。
 *
 * 它要抓的是这种错（实测真的发生了）：
 *   贴纸「宠必威锐必威」被读成「英特威®瑞比克」✗ ——
 *   而「瑞比克」是**勃林格**的，文字里的品牌却是「英特威」✗ → 对不上 ✓
 *
 * 为什么不能靠模型复核：实测"同一个模型再审一遍"抓不住"同一个模型看错字" ✗
 * （两次错得一模一样）。这条检查是**纯代码、确定性**的 ✓。
 */
describe('品牌一致性检查', () => {
  it('🔴 抓得住实测那次错：文字写英特威，匹配到的却是勃林格的瑞比克', () => {
    const result = checkBrandConsistency('英特威®瑞比克', '瑞比克');

    expect(result.conflict).toBe(true);
    expect(result.textBrand).toBe('英特威');
    expect(result.productBrand).toContain('勃林格');
  });

  it('品牌对得上就不报（英特威确实有优免康）', () => {
    expect(checkBrandConsistency('英特威® 优免康', '宠必威优免康').conflict).toBe(false);
  });

  it('文字里没有品牌词时不报（"狂犬""犬四联"这种我们判不了）', () => {
    expect(checkBrandConsistency('狂犬', '瑞比克').conflict).toBe(false);
    expect(checkBrandConsistency('犬四联', '犬四联（中牧江西）').conflict).toBe(false);
  });

  it('带商标符号、空格、大小写都不影响判断', () => {
    expect(checkBrandConsistency('ZOETIS® 卫佳捌', '卫佳捌').conflict).toBe(false);
    expect(checkBrandConsistency('VIRBAC 卫佳捌', '卫佳捌').conflict).toBe(true);
  });

  it('匹配不到的产品不报（没有基准可比）', () => {
    expect(checkBrandConsistency('宠派纯® 狂犬病灭活疫苗', '').conflict).toBe(false);
  });
});
