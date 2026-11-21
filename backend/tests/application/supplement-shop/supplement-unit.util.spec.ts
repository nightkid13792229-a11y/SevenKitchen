import { BadRequestException } from '@nestjs/common';
import {
  isSupplementUnitOneToOne,
  toSupplementBaseQuantity,
} from '../../../src/application/supplement-shop/supplement-unit.util';

describe('补剂单位 1:1 校验', () => {
  it('平勺按 PCS 1:1，不换算成克', () => {
    expect(isSupplementUnitOneToOne('平勺', 'PCS')).toBe(true);
    expect(isSupplementUnitOneToOne('片', 'PCS')).toBe(true);
    expect(toSupplementBaseQuantity('平勺', 2, 'PCS', '海藻粉')).toBe(2);
  });

  it('g / ml 各自匹配', () => {
    expect(isSupplementUnitOneToOne('g', 'G')).toBe(true);
    expect(isSupplementUnitOneToOne('ml', 'ML')).toBe(true);
    expect(isSupplementUnitOneToOne('g', 'ML')).toBe(false);
  });

  it('G 与平勺互不匹配，直接拒绝', () => {
    expect(isSupplementUnitOneToOne('平勺', 'G')).toBe(false);
    expect(() =>
      toSupplementBaseQuantity('平勺', 1, 'G', '海藻粉'),
    ).toThrow(BadRequestException);
  });

  it('胶囊按个计，和粒/片一样 1:1', () => {
    expect(isSupplementUnitOneToOne('胶囊', 'PCS')).toBe(true);
  });
  it('份不是 1:1 单位', () => {
    expect(isSupplementUnitOneToOne('份', 'PCS')).toBe(false);
  });
});
