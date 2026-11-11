import {
  PURCHASE_UNIT_FALLBACK,
  PURCHASE_UNIT_SEED,
  isMultipackUnit,
  parsePurchaseUnitOption,
  resolvePurchaseUnitCode,
  unitsForBaseUnit,
} from '../purchase-unit-catalog';

const g = PURCHASE_UNIT_FALLBACK.G;

describe('unitsForBaseUnit', () => {
  it('只返回适用该基准单位的项，按 sortOrder 升序', () => {
    const codes = unitsForBaseUnit(g, 'G').map((u) => u.code);
    expect(codes).toContain('份');
    expect(codes).not.toContain('卷');
    const orders = unitsForBaseUnit(g, 'G').map((u) => u.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('箱/桶/提/件/组 标记为整件', () => {
    const multipack = unitsForBaseUnit(g, 'G')
      .filter((u) => u.multipack)
      .map((u) => u.code);
    expect(multipack).toEqual(expect.arrayContaining(['箱', '桶', '提', '件']));
  });

  it('包装单位排在计量单位前面', () => {
    const codes = unitsForBaseUnit(g, 'G').map((u) => u.code);
    expect(codes.indexOf('袋')).toBeLessThan(codes.indexOf('斤'));
  });
});

describe('resolvePurchaseUnitCode', () => {
  it.each([
    ['公斤', 'kg'],
    ['千克', 'kg'],
    ['盒 ', '盒'],
    ['  箱', '箱'],
  ])('%s → %s', (input, expected) => {
    expect(resolvePurchaseUnitCode(g, input, 'G')).toBe(expected);
  });

  it('毫升只在毫升记账的原料里认', () => {
    expect(resolvePurchaseUnitCode(g, '毫升', 'G')).toBeNull();
    expect(resolvePurchaseUnitCode(PURCHASE_UNIT_FALLBACK.ML, '毫升', 'ML')).toBe('ml');
  });

  it('字典外的单位返回 null，不猜、不抛错', () => {
    expect(resolvePurchaseUnitCode(g, '挂', 'G')).toBeNull();
  });

  it('该基准单位不允许的单位返回 null', () => {
    expect(resolvePurchaseUnitCode(g, '卷', 'G')).toBeNull();
  });

  it('空值返回 null', () => {
    expect(resolvePurchaseUnitCode(g, '', 'G')).toBeNull();
    expect(resolvePurchaseUnitCode(g, null, 'G')).toBeNull();
  });
});

describe('isMultipackUnit', () => {
  it('箱是整件，袋不是', () => {
    expect(isMultipackUnit(g, '箱')).toBe(true);
    expect(isMultipackUnit(g, '袋')).toBe(false);
  });

  it('提/件 也算整件（改造前这两个字永远匹配不到白名单）', () => {
    expect(isMultipackUnit(PURCHASE_UNIT_SEED, '提')).toBe(true);
    expect(isMultipackUnit(PURCHASE_UNIT_SEED, '件')).toBe(true);
  });

  it('认不出的单位不当整件，避免误拦', () => {
    expect(isMultipackUnit(g, '挂')).toBe(false);
  });
});

describe('parsePurchaseUnitOption', () => {
  it('解析数据库项', () => {
    expect(
      parsePurchaseUnitOption({
        code: '箱',
        sortOrder: 20,
        extra: { baseUnits: ['G'], aliases: ['整箱'], kind: 'PACKAGING', multipack: true },
      }),
    ).toEqual({
      code: '箱',
      baseUnits: ['G'],
      aliases: ['整箱'],
      kind: 'PACKAGING',
      multipack: true,
      sortOrder: 20,
    });
  });

  it('没有 baseUnits 的坏数据跳过', () => {
    expect(parsePurchaseUnitOption({ code: '挂', extra: {} })).toBeNull();
  });
});
