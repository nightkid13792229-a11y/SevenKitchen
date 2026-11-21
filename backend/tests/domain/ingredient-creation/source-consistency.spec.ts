import type {
  NutritionEvidenceEntry,
  ProfileDraft,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import {
  checkProfileSourceConsistency,
  collectSourceConsistencyValues,
  readSourceBasis,
  type SourceConsistencyRecord,
} from '../../../src/domain/ingredient-creation/source-consistency';

function entry(
  fieldPath: string,
  finalValue: number | null,
  overrides: Partial<NutritionEvidenceEntry> = {},
): NutritionEvidenceEntry {
  return {
    fieldPath,
    finalValue,
    unit: 'g',
    status: 'DIRECT',
    sourceRecordId: 'src-1',
    sourceValue: null,
    sourceUnit: null,
    formula: null,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides,
  };
}

function profile(entries: NutritionEvidenceEntry[]): ProfileDraft {
  return {
    preparationState: 'RAW',
    sourceRecordId: 'src-1',
    entries,
    notes: null,
  };
}

function record(
  values: Record<string, number>,
  basis: SourceConsistencyRecord['basis'] = 'PER_100_G',
): SourceConsistencyRecord {
  return { id: 'src-1', basis, values };
}

function recordsOf(
  source: SourceConsistencyRecord,
): Map<string, SourceConsistencyRecord> {
  return new Map([[source.id, source]]);
}

describe('readSourceBasis', () => {
  it('没有 meta 的旧记录按每 100g 处理', () => {
    expect(readSourceBasis({ macros: { crudeProtein: 10 } })).toBe('PER_100_G');
  });

  it('识别每份 / 每 100ml / 每 1g / 其它口径', () => {
    expect(readSourceBasis({ meta: { rawBasisType: 'PER_SERVING' } })).toBe(
      'PER_SERVING',
    );
    expect(readSourceBasis({ meta: { rawBasisType: 'PER_100_ML' } })).toBe(
      'PER_100_ML',
    );
    // 每 1g 是「每 100g 的 1/100」，可以等价换算，不能当「口径不明」硬拦。
    expect(readSourceBasis({ meta: { rawBasisType: 'PER_1_G' } })).toBe(
      'PER_1_G',
    );
    expect(readSourceBasis({ meta: { rawBasisType: 'PER_1_ML' } })).toBe(
      'PER_1_ML',
    );
    expect(readSourceBasis({ meta: { rawBasisType: 'PER_KG' } })).toBe(
      'OTHER',
    );
  });
});

describe('collectSourceConsistencyValues', () => {
  it('只收集目录内、有值的字段', () => {
    const values = collectSourceConsistencyValues({
      macros: { crudeProtein: 25, crudeFat: null },
      minerals: { iron: 12 },
    });
    expect(values['macros.crudeProtein']).toBe(25);
    expect(values['minerals.iron']).toBe(12);
    expect(values['macros.crudeFat']).toBeUndefined();
  });
});

describe('checkProfileSourceConsistency', () => {
  it('数值与来源一致：不报问题', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 25)])],
      recordsOf(record({ 'macros.crudeProtein': 25 })),
    );
    expect(items).toEqual([]);
  });

  it('来源记录不存在：拦死', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 25)])],
      new Map(),
    );
    expect(items.map((item) => item.code)).toContain('SOURCE_RECORD_MISSING');
  });

  it('来源口径不是每 100g：拦死', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 25)])],
      recordsOf(record({ 'macros.crudeProtein': 25 }, 'PER_SERVING')),
    );
    expect(items.map((item) => item.code)).toContain(
      'SOURCE_BASIS_NOT_PER_100G',
    );
  });

  it('来源里没有这个字段：拦死', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 25)])],
      recordsOf(record({ 'macros.crudeFat': 5 })),
    );
    expect(items.map((item) => item.code)).toContain('SOURCE_FIELD_MISSING');
  });

  it('数值与来源不一致：拦死，并写出两边数值', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 45)])],
      recordsOf(record({ 'macros.crudeProtein': 25 })),
    );
    const mismatch = items.find(
      (item) => item.code === 'SOURCE_VALUE_MISMATCH',
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain('45');
    expect(mismatch?.message).toContain('25');
  });

  it('人工改过的值不参与对源', () => {
    const items = checkProfileSourceConsistency(
      [
        profile([
          entry('macros.crudeProtein', 45, {
            status: 'MANUAL',
            confirmedBy: 'HUMAN_REVIEW',
          }),
        ]),
      ],
      recordsOf(record({ 'macros.crudeProtein': 25 })),
    );
    expect(items).toEqual([]);
  });

  it('有值但没有来源、也不是人工：拦死', () => {
    const items = checkProfileSourceConsistency(
      [
        profile([
          entry('macros.crudeProtein', 25, {
            sourceRecordId: null,
          }),
        ]),
      ],
      recordsOf(record({ 'macros.crudeProtein': 25 })),
    );
    expect(items.map((item) => item.code)).toContain('SOURCE_FIELD_MISSING');
  });

  it('允许 0.5% 的四舍五入误差，超过就拦', () => {
    const ok = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 100.4)])],
      recordsOf(record({ 'macros.crudeProtein': 100 })),
    );
    expect(ok).toEqual([]);

    const bad = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 101)])],
      recordsOf(record({ 'macros.crudeProtein': 100 })),
    );
    expect(bad.map((item) => item.code)).toContain('SOURCE_VALUE_MISMATCH');
  });
});

describe('来源口径换算与人工档案豁免', () => {
  it('每 1g 的来源按 ×100 等价比较：不再误拦', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 25)])],
      recordsOf(record({ 'macros.crudeProtein': 0.25 }, 'PER_1_G')),
    );
    expect(items).toEqual([]);
  });

  it('每 1g 来源换算后对不上：拦死，并写出换算后的来源值', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.crudeProtein', 26)])],
      recordsOf(record({ 'macros.crudeProtein': 0.25 }, 'PER_1_G')),
    );
    const mismatch = items.find(
      (item) => item.code === 'SOURCE_VALUE_MISMATCH',
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.message).toContain('26');
    expect(mismatch?.message).toContain('25');
  });

  it('每 1ml 仍按口径不符拦死，但文案写真实口径', () => {
    const items = checkProfileSourceConsistency(
      [profile([entry('macros.moisture', 80)])],
      recordsOf(record({ 'macros.moisture': 0.8 }, 'PER_1_ML')),
    );
    expect(items.map((item) => item.code)).toContain(
      'SOURCE_BASIS_NOT_PER_100G',
    );
    expect(items[0]?.message).toContain('PER_1_ML');
  });

  it('全部字段都是人工核对值时，来源口径不影响授权', () => {
    const items = checkProfileSourceConsistency(
      [
        profile([
          entry('macros.crudeProtein', 25, {
            status: 'MANUAL',
            confirmedBy: 'HUMAN_REVIEW',
          }),
          entry('macros.moisture', 70, {
            status: 'MANUAL',
            confirmedBy: 'HUMAN_REVIEW',
          }),
        ]),
      ],
      recordsOf(record({ 'macros.crudeProtein': 25 }, 'PER_SERVING')),
    );
    expect(items).toEqual([]);
  });

  it('人工 + AI 混在一份档案里：口径不符仍然拦（AI 那格没有出处）', () => {
    const items = checkProfileSourceConsistency(
      [
        profile([
          entry('macros.crudeProtein', 25, {
            status: 'MANUAL',
            confirmedBy: 'HUMAN_REVIEW',
          }),
          entry('macros.moisture', 70),
        ]),
      ],
      recordsOf(record({ 'macros.moisture': 70 }, 'PER_SERVING')),
    );
    expect(items.map((item) => item.code)).toContain(
      'SOURCE_BASIS_NOT_PER_100G',
    );
  });
});
