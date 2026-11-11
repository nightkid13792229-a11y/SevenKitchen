import { auditSkuRows } from '../packaging-audit';

const base = {
  id: 'sku-1',
  name: '厨房纸',
  ingredientName: '厨房纸',
  purchaseUnit: '箱',
  baseUnit: 'G',
  allowedUnits: ['箱', '袋', '盒'],
  productModel: null as string | null,
};

describe('auditSkuRows', () => {
  it('倍数与层级不符 → RATIO_MISMATCH', () => {
    const findings = auditSkuRows([
      {
        ...base,
        // 层级算出来 5000，落库却只有 500 —— 典型的"有人绕过服务层改过倍数"
        purchaseToBaseRatio: 500,
        packaging: { links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' },
      },
    ]);
    expect(findings.map((f) => f.kind)).toContain('RATIO_MISMATCH');
  });

  it('倍数与层级一致时不报', () => {
    const findings = auditSkuRows([
      {
        ...base,
        purchaseToBaseRatio: 5000,
        packaging: { links: [{ count: 10, unit: '捆' }], amount: 500, amountUnit: 'G' },
      },
    ]);
    expect(findings).toEqual([]);
  });

  it('老商品没有层级 → PACKAGING_MISSING', () => {
    const findings = auditSkuRows([
      { ...base, purchaseToBaseRatio: 1000, packaging: null },
    ]);
    expect(findings.map((f) => f.kind)).toEqual(['PACKAGING_MISSING']);
  });

  it('采购单位不在字典 → UNIT_OUT_OF_DICT', () => {
    const findings = auditSkuRows([
      {
        ...base,
        purchaseUnit: '提',
        purchaseToBaseRatio: 100,
        packaging: { links: [], amount: 100, amountUnit: 'G' },
      },
    ]);
    expect(findings.map((f) => f.kind)).toContain('UNIT_OUT_OF_DICT');
  });

  it('规格原文与层级矛盾 → TEXT_CONFLICT', () => {
    const findings = auditSkuRows([
      {
        ...base,
        productModel: '24×330ml',
        purchaseToBaseRatio: 1590,
        packaging: { links: [], amount: 1590, amountUnit: 'G' },
      },
    ]);
    expect(findings.map((f) => f.kind)).toContain('TEXT_CONFLICT');
  });

  it('规格原文读不出数字时不误报', () => {
    const findings = auditSkuRows([
      {
        ...base,
        productModel: '1kg/袋',
        purchaseToBaseRatio: 1000,
        packaging: { links: [], amount: 1000, amountUnit: 'G' },
      },
    ]);
    expect(findings).toEqual([]);
  });
});
