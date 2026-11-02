import { describe, expect, it } from 'vitest';
import {
  computePurchaseToBaseRatio,
  validateProcurementSkuForm,
} from './procurement-sku-form';

const baseOptions = {
  purchaseUnits: ['g', 'kg', '袋', '箱'],
  baseUnitText: '克',
};

const validState = {
  name: '沃集鲜 糙米 1kg',
  purchaseChannel: '沃尔玛',
  purchaseUnit: '袋',
  packCount: 1,
  netContentPerPack: 1000,
  currentPurchasePrice: 14.99,
};

describe('computePurchaseToBaseRatio', () => {
  it('件数乘每件净含量得出换算，24×330 得 7920', () => {
    expect(
      computePurchaseToBaseRatio({ packCount: 24, netContentPerPack: 330 }),
    ).toBe(7920);
  });

  it('单件就是净含量本身', () => {
    expect(
      computePurchaseToBaseRatio({ packCount: 1, netContentPerPack: 1000 }),
    ).toBe(1000);
  });

  it('缺值时返回 0，调用方据此拦住保存', () => {
    expect(
      computePurchaseToBaseRatio({ packCount: null, netContentPerPack: 1000 }),
    ).toBe(0);
  });
});

describe('validateProcurementSkuForm', () => {
  it('填全了就能保存', () => {
    expect(validateProcurementSkuForm(validState, baseOptions)).toEqual({
      ok: true,
    });
  });

  it('件数或净含量为空时不允许保存', () => {
    const result = validateProcurementSkuForm(
      { ...validState, packCount: null, netContentPerPack: null },
      baseOptions,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toEqual(
        expect.arrayContaining(['packCount', 'netContentPerPack']),
      );
    }
  });

  it('采购单位不在允许清单里时不通过', () => {
    const result = validateProcurementSkuForm(
      { ...validState, purchaseUnit: '提' },
      baseOptions,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toContain(
        'purchaseUnit',
      );
    }
  });

  it('商品名和渠道为空时给出对应错误', () => {
    const result = validateProcurementSkuForm(
      { ...validState, name: '   ', purchaseChannel: '' },
      baseOptions,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toEqual(
        expect.arrayContaining(['name', 'purchaseChannel']),
      );
    }
  });

  it('净含量为 0 时不通过（不能靠 0 混过去）', () => {
    const result = validateProcurementSkuForm(
      { ...validState, netContentPerPack: 0 },
      baseOptions,
    );

    expect(result.ok).toBe(false);
  });
});
