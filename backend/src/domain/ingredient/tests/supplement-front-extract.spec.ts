import { extractFrontFields } from '../supplement-front-extract';

describe('extractFrontFields', () => {
  it('软胶囊瓶：品牌、规格、剂型、单位都对上', () => {
    const text = 'NOW FOODS\nCopper Bisglycinate\n120 Softgels\nSupplement Facts';
    const fields = extractFrontFields(text);
    expect(fields.brandCandidate).toBe('NOW FOODS');
    expect(fields.productModel).toBe('120 Softgels');
    expect(fields.physicalForm).toBe('CAPSULE');
    expect(fields.unitDisplayLabel).toBe('粒');
  });

  it('片剂：单位是「片」', () => {
    const fields = extractFrontFields('Carlson\nChelated Copper\n250 Tablets');
    expect(fields.physicalForm).toBe('TABLET');
    expect(fields.unitDisplayLabel).toBe('片');
    expect(fields.productModel).toBe('250 Tablets');
  });

  it('粉剂与液体各归各的', () => {
    expect(extractFrontFields('Zinc Powder').unitDisplayLabel).toBe('平勺');
    expect(extractFrontFields('Vitamin D3 Liquid Drops 30 ml').unitDisplayLabel).toBe('ml');
  });

  it('认不出剂型就三样都给 null，不猜', () => {
    const fields = extractFrontFields('Copper');
    expect(fields.physicalForm).toBeNull();
    expect(fields.unitDisplayLabel).toBeNull();
    expect(fields.productModel).toBeNull();
  });

  it('第一行带数字或太长，不当品牌', () => {
    expect(extractFrontFields('120 Softgels').brandCandidate).toBeNull();
    expect(
      extractFrontFields('这是一个非常长的标题这一行明显不是品牌名应该有二十多个字').brandCandidate,
    ).toBeNull();
  });

  it('成分表标题不当品牌', () => {
    expect(extractFrontFields('Supplement Facts\nCopper 2mg').brandCandidate).toBeNull();
  });
});
