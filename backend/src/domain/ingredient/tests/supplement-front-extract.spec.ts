import { extractFrontFields } from '../supplement-front-extract';

describe('extractFrontFields · 商品页截图', () => {
  it('认中文「规格：8 盎司（227 克）」', () => {
    const fields = extractFrontFields(
      '品牌：NOW\n产品名：Taurine Powder\n规格：8 盎司（227 克）\n剂型：粉',
    );
    expect(fields.productModel).toBe('8 盎司（227 克）');
    expect(fields.physicalForm).toBe('POWDER');
    expect(fields.unitDisplayLabel).toBe('g');
  });
});
