import {
  assertRejectNote,
  canEdit,
  isWithinTolerance,
} from 'src/application/inventory/stocktake-rules';

describe('stocktake rules', () => {
  it('克/毫升的容差下限是 50', () => {
    expect(isWithinTolerance(40, 1000, 'G')).toBe(true);
    expect(isWithinTolerance(60, 1000, 'G')).toBe(false);
    expect(isWithinTolerance(40, 1000, 'ML')).toBe(true);
  });

  it('数量大时按 2% 算', () => {
    expect(isWithinTolerance(150, 10000, 'G')).toBe(true);
    expect(isWithinTolerance(250, 10000, 'G')).toBe(false);
  });

  it('粒/片的容差下限是 2', () => {
    expect(isWithinTolerance(2, 100, 'PCS')).toBe(true);
    expect(isWithinTolerance(3, 100, 'PCS')).toBe(false);
  });

  it('负差按绝对值算', () => {
    expect(isWithinTolerance(-40, 1000, 'G')).toBe(true);
    expect(isWithinTolerance(-300, 1000, 'G')).toBe(false);
  });

  it('只有草稿可编辑', () => {
    expect(canEdit('DRAFT')).toBe(true);
    expect(canEdit('SUBMITTED')).toBe(false);
    expect(canEdit('APPLIED')).toBe(false);
    expect(canEdit('REJECTED')).toBe(false);
  });

  it('驳回必须填原因', () => {
    expect(() => assertRejectNote(false, '  ')).toThrow('驳回');
    expect(() => assertRejectNote(false, '数量差太多')).not.toThrow();
    expect(() => assertRejectNote(true)).not.toThrow();
  });
});
