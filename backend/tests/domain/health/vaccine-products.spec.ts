import { recommendProductsForStep } from 'src/domain/health/vaccine-products';


/**
 * 多联苗要看**每个成分各自的起始周龄**（2026-10-12 老板第 2 问）
 *
 * 老板："第一针核心疫苗，常见疫苗推荐里面，为什么会有卫佳捌呢？
 *        卫佳捌含有钩端螺旋体，在第一针来打卫佳捌的话，钩端螺旋体是不是
 *        起不到什么作用呢？"
 * —— 对 ✓：6 周龄那一针里，钩端部分没意义 ✗（钩端首免 8 周龄才起 ✓）。
 */
describe('推荐产品 · 多联苗的每个成分都要够龄', () => {
  it('🔴 6 周龄的核心首免：不推含钩端的卫佳捌', () => {
    const names = recommendProductsForStep('core', 6).map((p) => p.name);

    expect(names).not.toContain('卫佳捌');
    // ⚠️ 海博莱那支的 minWeeks 是 null ✓ —— 曾经因此绕过检查 ✗，这里一起钉住 ✓
    expect(names).not.toContain('海博莱犬四联加钩端');
    expect(names.length).toBeGreaterThan(0);
  });

  it('10 周龄的核心那一针：钩端够龄了，卫佳捌可以出现', () => {
    const names = recommendProductsForStep('core', 10).map((p) => p.name);

    expect(names).toContain('卫佳捌');
  });

  it('钩端那一步照旧推含钩端的产品（不受影响）', () => {
    const names = recommendProductsForStep('lepto', 10).map((p) => p.name);

    expect(names.length).toBeGreaterThan(0);
  });
});
