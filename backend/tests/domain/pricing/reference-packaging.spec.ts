import {
  REFERENCE_PACK_SPEC_G,
  resolveReferencePackCount,
} from 'src/domain/pricing/reference-packaging';

describe('参考价标准分装 · resolveReferencePackCount', () => {
  it('标准袋是 100g', () => {
    expect(REFERENCE_PACK_SPEC_G).toBe(100);
  });

  it('起订量 1000g → 10 袋', () => {
    expect(resolveReferencePackCount(1000)).toBe(10);
  });

  it('起订量调成 1500g → 15 袋', () => {
    expect(resolveReferencePackCount(1500)).toBe(15);
  });

  it('起订量不是整百时四舍五入（1250g → 13 袋）', () => {
    expect(resolveReferencePackCount(1250)).toBe(13);
  });

  it('小于一袋的极端值至少算 1 袋', () => {
    expect(resolveReferencePackCount(50)).toBe(1);
    expect(resolveReferencePackCount(0)).toBe(1);
    expect(resolveReferencePackCount(Number.NaN)).toBe(1);
  });

  it('袋规非法时退化成 1 袋，不返回 Infinity', () => {
    expect(resolveReferencePackCount(1000, 0)).toBe(1);
    expect(resolveReferencePackCount(1000, Number.NaN)).toBe(1);
  });
});
