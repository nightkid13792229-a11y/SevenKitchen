import { findNutritionField } from 'src/domain/ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from 'src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from 'src/domain/ingredient/types';
import {
  CFCT_MICRO_FIELD_MAP,
  mergeCfctMicro,
} from 'src/domain/nutrition-governance/cfct-micro-enrich';

function buildExisting(): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.macros.moisture = 11.2;
  profile.macros.crudeProtein = 12.4;
  profile.minerals.calcium = 20;
  profile.vitamins.vitaminC = 5;
  profile.vitamins.vitaminB12 = 1.4;
  profile.aminoAcids.leucine = 1.2;
  profile.fattyAcids.epa = 30;
  profile.customItems.push({
    name: '胆固醇',
    value: 12,
    unit: 'mg',
    canonicalFieldPath: null,
  });
  profile.meta.sourceType = 'CFCT';
  profile.meta.sourceCode = 'CFCT';
  profile.meta.externalId = 'CFCT:031207';
  profile.meta.sampleState = 'RAW';
  profile.meta.sourceForms = {
    'macros.crudeProtein': {
      sourceNutrientName: 'protein',
      originalValue: 12.4,
      originalUnit: 'g',
      canonicalValue: 12.4,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    },
    'vitamins.vitaminC': {
      sourceNutrientName: 'vitaminC',
      originalValue: 5,
      originalUnit: 'mg',
      canonicalValue: 5,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    },
  };
  profile.meta.conversionNotes = {
    'macros.crudeProtein': 'keep me',
  };
  return profile;
}

function snapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('CFCT_MICRO_FIELD_MAP', () => {
  it('3 个微量成分映射到 vitamins 目录字段，单位与营养字段目录一致', () => {
    expect(CFCT_MICRO_FIELD_MAP).toEqual({
      choline: { field: 'choline', unit: 'mg' },
      biotin: { field: 'vitaminB7', unit: 'μg' },
      pantothenicAcid: { field: 'vitaminB5', unit: 'mg' },
    });

    for (const mapping of Object.values(CFCT_MICRO_FIELD_MAP)) {
      expect(findNutritionField(`vitamins.${mapping.field}`)?.unit).toBe(
        mapping.unit,
      );
    }
  });
});

describe('mergeCfctMicro', () => {
  it('把胆碱 / 生物素 / 泛酸写入 vitamins tab', () => {
    const { profile, filled, skipped } = mergeCfctMicro(buildExisting(), {
      choline: 18.4,
      biotin: 8,
      pantothenicAcid: 3.2,
    });

    expect(profile.vitamins.choline).toBe(18.4);
    expect(profile.vitamins.vitaminB7).toBe(8);
    expect(profile.vitamins.vitaminB5).toBe(3.2);
    expect(filled).toEqual(['choline', 'vitaminB7', 'vitaminB5']);
    expect(skipped).toEqual([]);
  });

  it('在 meta.sourceForms 里按 vitamins.<field> 记录原值与原始 / 目录单位', () => {
    const input = {
      choline: 18.4,
      biotin: 8,
      pantothenicAcid: 3.2,
    };

    const { profile } = mergeCfctMicro(buildExisting(), input);
    const sourceForms = profile.meta.sourceForms ?? {};

    expect(sourceForms['vitamins.choline']).toEqual({
      sourceNutrientName: 'choline',
      originalValue: 18.4,
      originalUnit: 'mg',
      canonicalValue: 18.4,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
    expect(sourceForms['vitamins.vitaminB7']).toEqual({
      sourceNutrientName: 'biotin',
      originalValue: 8,
      originalUnit: 'μg',
      canonicalValue: 8,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
    expect(sourceForms['vitamins.vitaminB5']).toEqual({
      sourceNutrientName: 'pantothenicAcid',
      originalValue: 3.2,
      originalUnit: 'mg',
      canonicalValue: 3.2,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('macros / minerals / fattyAcids / aminoAcids / 其它 vitamins 与 meta 原样保留', () => {
    const existing = buildExisting();

    const { profile } = mergeCfctMicro(existing, {
      choline: 18.4,
      biotin: 8,
    });

    expect(profile.macros.moisture).toBe(11.2);
    expect(profile.macros.crudeProtein).toBe(12.4);
    expect(profile.minerals.calcium).toBe(20);
    expect(profile.vitamins.vitaminC).toBe(5);
    expect(profile.vitamins.vitaminB12).toBe(1.4);
    expect(profile.aminoAcids.leucine).toBe(1.2);
    expect(profile.fattyAcids.epa).toBe(30);
    expect(profile.customItems).toEqual(existing.customItems);
    expect(profile.meta.sourceType).toBe('CFCT');
    expect(profile.meta.sourceCode).toBe('CFCT');
    expect(profile.meta.externalId).toBe('CFCT:031207');
    expect(profile.meta.sampleState).toBe('RAW');
    expect(profile.meta.conversionNotes).toEqual({
      'macros.crudeProtein': 'keep me',
    });

    const sourceForms = profile.meta.sourceForms ?? {};
    expect(sourceForms['macros.crudeProtein']).toEqual(
      existing.meta.sourceForms!['macros.crudeProtein'],
    );
    expect(sourceForms['vitamins.vitaminC']).toEqual(
      existing.meta.sourceForms!['vitamins.vitaminC'],
    );
    expect(sourceForms['vitamins.choline']).toBeDefined();
    expect(sourceForms['vitamins.vitaminB7']).toBeDefined();
    expect(sourceForms['vitamins.vitaminB5']).toBeUndefined();
    expect(profile.meta.sourceForms?.['vitamins.vitaminC']).toEqual({
      sourceNutrientName: 'vitaminC',
      originalValue: 5,
      originalUnit: 'mg',
      canonicalValue: 5,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('未知 key 只跳过，不写进 profile', () => {
    const { profile, filled, skipped } = mergeCfctMicro(buildExisting(), {
      vitaminB12: 1.4,
      totalCholine: 200,
      choline: 18.4,
    });

    expect(filled).toEqual(['choline']);
    expect(skipped).toEqual(['vitaminB12', 'totalCholine']);
    expect(profile.vitamins).not.toHaveProperty('totalCholine');
    expect(profile.vitamins.vitaminB12).toBe(1.4);
    expect(profile.meta.sourceForms?.['vitamins.totalCholine']).toBeUndefined();
    expect(profile.meta.sourceForms?.['vitamins.vitaminB12']).toBeUndefined();
  });

  it('null / 负数 / NaN / Infinity 一律忽略，0 是有效值', () => {
    const existing = buildExisting();
    existing.vitamins.choline = 50;

    const { profile, filled, skipped } = mergeCfctMicro(existing, {
      choline: -1,
      biotin: null as unknown as number,
      pantothenicAcid: Number.NaN,
    });

    expect(filled).toEqual([]);
    expect(skipped).toEqual([]);
    expect(profile.vitamins.choline).toBe(50);
    expect(profile.vitamins.vitaminB7).toBeNull();
    expect(profile.vitamins.vitaminB5).toBeNull();
    expect(profile.meta.sourceForms?.['vitamins.choline']).toBeUndefined();

    const zeros = mergeCfctMicro(existing, {
      choline: 0,
      biotin: Number.POSITIVE_INFINITY,
      pantothenicAcid: Number.NEGATIVE_INFINITY,
    });

    expect(zeros.filled).toEqual(['choline']);
    expect(zeros.profile.vitamins.choline).toBe(0);
    expect(zeros.profile.vitamins.vitaminB7).toBeNull();
    expect(zeros.profile.vitamins.vitaminB5).toBeNull();
    expect(zeros.profile.meta.sourceForms?.['vitamins.choline']).toEqual({
      sourceNutrientName: 'choline',
      originalValue: 0,
      originalUnit: 'mg',
      canonicalValue: 0,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('meta.sourceForms 缺失时也能安全创建', () => {
    const existing = createEmptyNutritionProfile();
    delete existing.meta.sourceForms;

    const { profile } = mergeCfctMicro(existing, { biotin: 16.3 });

    expect(profile.vitamins.vitaminB7).toBe(16.3);
    expect(profile.meta.sourceForms?.['vitamins.vitaminB7']).toEqual({
      sourceNutrientName: 'biotin',
      originalValue: 16.3,
      originalUnit: 'μg',
      canonicalValue: 16.3,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('纯函数：不修改 existing / micro', () => {
    const existing = buildExisting();
    const before = snapshot(existing);
    const micro = { choline: 18.4, biotin: 8 };
    const microBefore = snapshot(micro);

    const { profile } = mergeCfctMicro(existing, micro);

    expect(profile).not.toBe(existing);
    expect(profile.vitamins).not.toBe(existing.vitamins);
    expect(profile.meta).not.toBe(existing.meta);
    expect(snapshot(existing)).toEqual(before);
    expect(snapshot(micro)).toEqual(microBefore);
    expect(existing.vitamins.choline).toBeNull();
    expect(existing.vitamins.vitaminB7).toBeNull();
    expect(existing.meta.sourceForms?.['vitamins.choline']).toBeUndefined();
    expect(existing.meta.sourceForms?.['vitamins.vitaminB7']).toBeUndefined();
  });

  it('空输入返回等价副本，filled / skipped 都为空', () => {
    const existing = buildExisting();
    const before = snapshot(existing);

    const { profile, filled, skipped } = mergeCfctMicro(existing, {});

    expect(profile).not.toBe(existing);
    expect(profile).toEqual(existing);
    expect(filled).toEqual([]);
    expect(skipped).toEqual([]);
    expect(snapshot(existing)).toEqual(before);
  });
});
