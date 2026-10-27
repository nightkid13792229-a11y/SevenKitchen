import { findNutritionField } from 'src/domain/ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from 'src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from 'src/domain/ingredient/types';
import {
  CFCT_EXTRA_FIELD_MAP,
  mergeCfctExtra,
} from 'src/domain/nutrition-governance/cfct-extra-enrich';

function buildExisting(): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.macros.moisture = 11.2;
  profile.macros.crudeProtein = 12.4;
  profile.minerals.calcium = 20;
  profile.minerals.iodine = 25;
  profile.vitamins.vitaminC = 5;
  profile.vitamins.choline = 18.4;
  profile.vitamins.vitaminB9 = 40;
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
  profile.meta.externalId = 'CFCT:043218';
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
    'minerals.iodine': {
      sourceNutrientName: 'iodine',
      originalValue: 25,
      originalUnit: 'μg',
      canonicalValue: 25,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    },
    'vitamins.vitaminB9': {
      sourceNutrientName: 'folate',
      originalValue: 40,
      originalUnit: 'μg',
      canonicalValue: 40,
      canonicalUnit: 'μg',
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

describe('CFCT_EXTRA_FIELD_MAP', () => {
  it('碘映射到 minerals.iodine，叶酸映射到 vitamins.vitaminB9，单位与目录一致', () => {
    expect(CFCT_EXTRA_FIELD_MAP).toEqual({
      iodine: { tab: 'minerals', field: 'iodine', unit: 'μg' },
      folate: { tab: 'vitamins', field: 'vitaminB9', unit: 'μg' },
    });

    for (const mapping of Object.values(CFCT_EXTRA_FIELD_MAP)) {
      const field = findNutritionField(`${mapping.tab}.${mapping.field}`);
      expect(field?.tabKey).toBe(mapping.tab);
      expect(field?.unit).toBe(mapping.unit);
    }
  });
});

describe('mergeCfctExtra', () => {
  it('把碘写入 minerals.iodine、叶酸写入 vitamins.vitaminB9', () => {
    const { profile, filled, skipped } = mergeCfctExtra(buildExisting(), {
      iodine: 0.8,
      folate: 7.2,
    });

    expect(profile.minerals.iodine).toBe(0.8);
    expect(profile.vitamins.vitaminB9).toBe(7.2);
    expect(filled).toEqual(['iodine', 'vitaminB9']);
    expect(skipped).toEqual([]);
  });

  it('在 meta.sourceForms 里按 <tab>.<field> 记录原始 key、原值和 µg 单位', () => {
    const { profile } = mergeCfctExtra(buildExisting(), {
      iodine: 0.8,
      folate: 7.2,
    });
    const sourceForms = profile.meta.sourceForms ?? {};

    expect(sourceForms['minerals.iodine']).toEqual({
      sourceNutrientName: 'iodine',
      originalValue: 0.8,
      originalUnit: 'μg',
      canonicalValue: 0.8,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
    expect(sourceForms['vitamins.vitaminB9']).toEqual({
      sourceNutrientName: 'folate',
      originalValue: 7.2,
      originalUnit: 'μg',
      canonicalValue: 7.2,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('macros / fattyAcids / aminoAcids / 胆碱 / 其它 minerals / vitamins / meta 原样保留', () => {
    const existing = buildExisting();

    const { profile } = mergeCfctExtra(existing, {
      iodine: 0.8,
      folate: 7.2,
    });

    expect(profile.macros.moisture).toBe(11.2);
    expect(profile.macros.crudeProtein).toBe(12.4);
    expect(profile.minerals.calcium).toBe(20);
    expect(profile.vitamins.vitaminC).toBe(5);
    expect(profile.vitamins.choline).toBe(18.4);
    expect(profile.aminoAcids.leucine).toBe(1.2);
    expect(profile.fattyAcids.epa).toBe(30);
    expect(profile.customItems).toEqual(existing.customItems);
    expect(profile.meta.sourceType).toBe('CFCT');
    expect(profile.meta.sourceCode).toBe('CFCT');
    expect(profile.meta.externalId).toBe('CFCT:043218');
    expect(profile.meta.sampleState).toBe('RAW');
    expect(profile.meta.conversionNotes).toEqual({
      'macros.crudeProtein': 'keep me',
    });

    const sourceForms = profile.meta.sourceForms ?? {};
    expect(sourceForms['macros.crudeProtein']).toEqual(
      existing.meta.sourceForms!['macros.crudeProtein'],
    );
    expect(sourceForms['minerals.iodine']).toEqual({
      sourceNutrientName: 'iodine',
      originalValue: 0.8,
      originalUnit: 'μg',
      canonicalValue: 0.8,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
    expect(sourceForms['vitamins.vitaminB9']).toEqual({
      sourceNutrientName: 'folate',
      originalValue: 7.2,
      originalUnit: 'μg',
      canonicalValue: 7.2,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('未知 key 只跳过，不写进 profile', () => {
    const { profile, filled, skipped } = mergeCfctExtra(buildExisting(), {
      selenium: 10,
      vitaminB12: 1.4,
      iodine: 0.8,
    });

    expect(filled).toEqual(['iodine']);
    expect(skipped).toEqual(['selenium', 'vitaminB12']);
    expect(profile.minerals.selenium).toBeNull();
    expect(profile.vitamins.vitaminB12).toBeNull();
    expect(profile.meta.sourceForms?.['minerals.selenium']).toBeUndefined();
    expect(profile.meta.sourceForms?.['vitamins.vitaminB12']).toBeUndefined();
  });

  it('null / 负数 / NaN / Infinity 一律忽略，0 是有效值', () => {
    const existing = buildExisting();

    const ignored = mergeCfctExtra(existing, {
      iodine: -1,
      folate: null as unknown as number,
    });

    expect(ignored.filled).toEqual([]);
    expect(ignored.skipped).toEqual([]);
    expect(ignored.profile.minerals.iodine).toBe(25);
    expect(ignored.profile.vitamins.vitaminB9).toBe(40);

    const nonFinite = mergeCfctExtra(existing, {
      iodine: Number.NaN,
      folate: Number.POSITIVE_INFINITY,
    });

    expect(nonFinite.filled).toEqual([]);
    expect(nonFinite.profile.minerals.iodine).toBe(25);
    expect(nonFinite.profile.vitamins.vitaminB9).toBe(40);

    const zeros = mergeCfctExtra(existing, {
      iodine: 0,
      folate: 0,
    });

    expect(zeros.filled).toEqual(['iodine', 'vitaminB9']);
    expect(zeros.profile.minerals.iodine).toBe(0);
    expect(zeros.profile.vitamins.vitaminB9).toBe(0);
    expect(zeros.profile.meta.sourceForms?.['minerals.iodine']).toEqual({
      sourceNutrientName: 'iodine',
      originalValue: 0,
      originalUnit: 'μg',
      canonicalValue: 0,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
    expect(zeros.profile.meta.sourceForms?.['vitamins.vitaminB9']).toEqual({
      sourceNutrientName: 'folate',
      originalValue: 0,
      originalUnit: 'μg',
      canonicalValue: 0,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('meta.sourceForms 缺失时也能安全创建', () => {
    const existing = createEmptyNutritionProfile();
    delete existing.meta.sourceForms;

    const { profile } = mergeCfctExtra(existing, { folate: 7.2 });

    expect(profile.vitamins.vitaminB9).toBe(7.2);
    expect(profile.meta.sourceForms?.['vitamins.vitaminB9']).toEqual({
      sourceNutrientName: 'folate',
      originalValue: 7.2,
      originalUnit: 'μg',
      canonicalValue: 7.2,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('纯函数：不修改 existing / values', () => {
    const existing = buildExisting();
    const before = snapshot(existing);
    const values = { iodine: 0.8, folate: 7.2 };
    const valuesBefore = snapshot(values);

    const { profile } = mergeCfctExtra(existing, values);

    expect(profile).not.toBe(existing);
    expect(profile.minerals).not.toBe(existing.minerals);
    expect(profile.vitamins).not.toBe(existing.vitamins);
    expect(profile.meta).not.toBe(existing.meta);
    expect(snapshot(existing)).toEqual(before);
    expect(snapshot(values)).toEqual(valuesBefore);
    expect(existing.minerals.iodine).toBe(25);
    expect(existing.vitamins.vitaminB9).toBe(40);
    expect(existing.meta.sourceForms?.['minerals.iodine']).toEqual({
      sourceNutrientName: 'iodine',
      originalValue: 25,
      originalUnit: 'μg',
      canonicalValue: 25,
      canonicalUnit: 'μg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('空输入返回等价副本，filled / skipped 都为空', () => {
    const existing = buildExisting();
    const before = snapshot(existing);

    const { profile, filled, skipped } = mergeCfctExtra(existing, {});

    expect(profile).not.toBe(existing);
    expect(profile).toEqual(existing);
    expect(filled).toEqual([]);
    expect(skipped).toEqual([]);
    expect(snapshot(existing)).toEqual(before);
  });
});
