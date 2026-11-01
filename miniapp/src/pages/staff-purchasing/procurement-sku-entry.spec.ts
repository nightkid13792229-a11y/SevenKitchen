import { describe, expect, it } from 'vitest';
import { canAddProcurementSku } from './procurement-sku-entry';

describe('canAddProcurementSku', () => {
  it('食材可以新增采购商品', () => {
    expect(canAddProcurementSku('FOOD')).toBe(true);
  });

  it('补剂和包材不行（后端也只允许食材）', () => {
    expect(canAddProcurementSku('SUPPLEMENT')).toBe(false);
    expect(canAddProcurementSku('PACKAGING')).toBe(false);
  });

  it('没有类型信息时默认不显示入口，免得点了报错', () => {
    expect(canAddProcurementSku(undefined)).toBe(false);
    expect(canAddProcurementSku(null)).toBe(false);
  });
});
