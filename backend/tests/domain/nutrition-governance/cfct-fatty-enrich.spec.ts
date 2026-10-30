import { findNutritionField } from 'src/domain/ingredient/nutrition-field-catalog';
import { createEmptyNutritionProfile } from 'src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from 'src/domain/ingredient/types';
import {
  CFCT_FATTY_FIELD_UNITS,
  mergeCfctFatty,
} from 'src/domain/nutrition-governance/cfct-fatty-enrich';

const GRAM_FIELDS = [
  'saturatedFattyAcids',
  'monounsaturatedFattyAcids',
  'polyunsaturatedFattyAcids',
  'linoleicAcid',
  'alphaLinolenicAcid',
  'arachidonicAcid',
] as const;

const MILLIGRAM_FIELDS = ['epa', 'dpa', 'dha'] as const;

function buildExisting(): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.macros.moisture = 11.2;
  profile.macros.crudeProtein = 12.4;
  profile.minerals.calcium = 20;
  profile.vitamins.vitaminC = 5;
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
  profile.meta.externalId = 'CFCT:011501';
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
    'aminoAcids.leucine': {
      sourceNutrientName: 'leucine',
      originalValue: 1200,
      originalUnit: 'mg',
      canonicalValue: 1.2,
      canonicalUnit: 'g',
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

describe('CFCT_FATTY_FIELD_UNITS', () => {
  it('9 个目录字段的单位与营养字段目录一致：前 6 个 g，EPA/DPA/DHA 为 mg', () => {
    expect(CFCT_FATTY_FIELD_UNITS).toEqual({
      saturatedFattyAcids: 'g',
      monounsaturatedFattyAcids: 'g',
      polyunsaturatedFattyAcids: 'g',
      linoleicAcid: 'g',
      alphaLinolenicAcid: 'g',
      arachidonicAcid: 'g',
      epa: 'mg',
      dpa: 'mg',
      dha: 'mg',
    });

    for (const [fieldKey, unit] of Object.entries(CFCT_FATTY_FIELD_UNITS)) {
      expect(findNutritionField(`fattyAcids.${fieldKey}`)?.unit).toBe(unit);
    }
  });
});

describe('mergeCfctFatty', () => {
  it('把 9 个脂肪酸值写入 fattyAcids tab', () => {
    const existing = buildExisting();

    const { profile, filled, skipped } = mergeCfctFatty(existing, {
      saturatedFattyAcids: 0.1,
      monounsaturatedFattyAcids: 0.2,
      polyunsaturatedFattyAcids: 0.3,
      linoleicAcid: 0.05,
      alphaLinolenicAcid: 0.01,
      arachidonicAcid: 0.02,
      epa: 220.8,
      dpa: 50.4,
      dha: 544.8,
    });

    expect(profile.fattyAcids.saturatedFattyAcids).toBe(0.1);
    expect(profile.fattyAcids.monounsaturatedFattyAcids).toBe(0.2);
    expect(profile.fattyAcids.polyunsaturatedFattyAcids).toBe(0.3);
    expect(profile.fattyAcids.linoleicAcid).toBe(0.05);
    expect(profile.fattyAcids.alphaLinolenicAcid).toBe(0.01);
    expect(profile.fattyAcids.arachidonicAcid).toBe(0.02);
    expect(profile.fattyAcids.epa).toBe(220.8);
    expect(profile.fattyAcids.dpa).toBe(50.4);
    expect(profile.fattyAcids.dha).toBe(544.8);
    expect(filled).toEqual([
      'saturatedFattyAcids',
      'monounsaturatedFattyAcids',
      'polyunsaturatedFattyAcids',
      'linoleicAcid',
      'alphaLinolenicAcid',
      'arachidonicAcid',
      'epa',
      'dpa',
      'dha',
    ]);
    expect(skipped).toEqual([]);
  });

  it('在 meta.sourceForms 里保留原值，并按 g / mg 记录原始单位与目录单位', () => {
    const existing = buildExisting();
    const input = {
      saturatedFattyAcids: 0.1,
      monounsaturatedFattyAcids: 0.2,
      polyunsaturatedFattyAcids: 0.3,
      linoleicAcid: 0.05,
      alphaLinolenicAcid: 0.01,
      arachidonicAcid: 0.02,
      epa: 220.8,
      dpa: 50.4,
      dha: 544.8,
    };

    const { profile } = mergeCfctFatty(existing, input);
    const sourceForms = profile.meta.sourceForms ?? {};

    for (const fieldKey of GRAM_FIELDS) {
      expect(sourceForms[`fattyAcids.${fieldKey}`]).toEqual({
        sourceNutrientName: fieldKey,
        originalValue: input[fieldKey],
        originalUnit: 'g',
        canonicalValue: input[fieldKey],
        canonicalUnit: 'g',
        basisType: 'PER_100_G',
      } satisfies NutritionSourceForm);
    }

    for (const fieldKey of MILLIGRAM_FIELDS) {
      expect(sourceForms[`fattyAcids.${fieldKey}`]).toEqual({
        sourceNutrientName: fieldKey,
        originalValue: input[fieldKey],
        originalUnit: 'mg',
        canonicalValue: input[fieldKey],
        canonicalUnit: 'mg',
        basisType: 'PER_100_G',
      } satisfies NutritionSourceForm);
    }
  });

  it('macros / minerals / vitamins / aminoAcids / customItems / 其它 meta 原样保留', () => {
    const existing = buildExisting();

    const { profile } = mergeCfctFatty(existing, {
      saturatedFattyAcids: 0.1,
      epa: 220.8,
    });

    expect(profile.macros.moisture).toBe(11.2);
    expect(profile.macros.crudeProtein).toBe(12.4);
    expect(profile.minerals.calcium).toBe(20);
    expect(profile.vitamins.vitaminC).toBe(5);
    expect(profile.aminoAcids.leucine).toBe(1.2);
    expect(profile.customItems).toEqual(existing.customItems);
    expect(profile.meta.sourceType).toBe('CFCT');
    expect(profile.meta.sourceCode).toBe('CFCT');
    expect(profile.meta.externalId).toBe('CFCT:011501');
    expect(profile.meta.sampleState).toBe('RAW');
    expect(profile.meta.conversionNotes).toEqual({
      'macros.crudeProtein': 'keep me',
    });

    const sourceForms = profile.meta.sourceForms ?? {};
    expect(sourceForms['macros.crudeProtein']).toEqual(
      existing.meta.sourceForms!['macros.crudeProtein'],
    );
    expect(sourceForms['aminoAcids.leucine']).toEqual(
      existing.meta.sourceForms!['aminoAcids.leucine'],
    );
    expect(sourceForms['fattyAcids.saturatedFattyAcids']).toBeDefined();
    expect(sourceForms['fattyAcids.epa']).toBeDefined();
  });

  it('目录外的脂肪酸 key 只跳过，不写进 profile', () => {
    const { profile, filled, skipped } = mergeCfctFatty(buildExisting(), {
      myristicAcid: 0.5,
      totalFA: 3.2,
      epa: 220.8,
    });

    expect(filled).toEqual(['epa']);
    expect(skipped).toEqual(['myristicAcid', 'totalFA']);
    expect(profile.fattyAcids).not.toHaveProperty('myristicAcid');
    expect(profile.fattyAcids).not.toHaveProperty('totalFA');
    expect(
      profile.meta.sourceForms?.['fattyAcids.myristicAcid'],
    ).toBeUndefined();
  });

  it('null / 负数 / NaN / Infinity 一律忽略，0 是有效值', () => {
    const existing = buildExisting();

    const { profile, filled, skipped } = mergeCfctFatty(existing, {
      saturatedFattyAcids: null as unknown as number,
      monounsaturatedFattyAcids: -1,
      polyunsaturatedFattyAcids: Number.NaN,
      linoleicAcid: Number.POSITIVE_INFINITY,
      alphaLinolenicAcid: Number.NEGATIVE_INFINITY,
      arachidonicAcid: 0,
      epa: -0.1,
      dha: undefined as unknown as number,
    });

    expect(filled).toEqual(['arachidonicAcid']);
    expect(skipped).toEqual([]);
    expect(profile.fattyAcids.saturatedFattyAcids).toBeNull();
    expect(profile.fattyAcids.monounsaturatedFattyAcids).toBeNull();
    expect(profile.fattyAcids.polyunsaturatedFattyAcids).toBeNull();
    expect(profile.fattyAcids.linoleicAcid).toBeNull();
    expect(profile.fattyAcids.alphaLinolenicAcid).toBeNull();
    expect(profile.fattyAcids.arachidonicAcid).toBe(0);
    // 无效值不能覆盖已有的有效值。
    expect(profile.fattyAcids.epa).toBe(30);
    expect(profile.fattyAcids.dha).toBeNull();
    expect(profile.meta.sourceForms?.['fattyAcids.arachidonicAcid']).toEqual({
      sourceNutrientName: 'arachidonicAcid',
      originalValue: 0,
      originalUnit: 'g',
      canonicalValue: 0,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    });
  });

  it('meta.sourceForms 缺失时也能安全创建', () => {
    const existing = createEmptyNutritionProfile();
    delete existing.meta.sourceForms;

    const { profile } = mergeCfctFatty(existing, { dha: 544.8 });

    expect(profile.fattyAcids.dha).toBe(544.8);
    expect(profile.meta.sourceForms?.['fattyAcids.dha']).toEqual({
      sourceNutrientName: 'dha',
      originalValue: 544.8,
      originalUnit: 'mg',
      canonicalValue: 544.8,
      canonicalUnit: 'mg',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('纯函数：不修改 existing，原脂肪酸值在入参里保持不变', () => {
    const existing = buildExisting();
    const before = snapshot(existing);
    const fatty = {
      saturatedFattyAcids: 0.1,
      epa: 220.8,
    };
    const fattyBefore = snapshot(fatty);

    const { profile } = mergeCfctFatty(existing, fatty);

    expect(profile).not.toBe(existing);
    expect(snapshot(existing)).toEqual(before);
    expect(snapshot(fatty)).toEqual(fattyBefore);
    expect(existing.fattyAcids.saturatedFattyAcids).toBeNull();
    expect(existing.fattyAcids.epa).toBe(30);
    expect(
      existing.meta.sourceForms?.['fattyAcids.saturatedFattyAcids'],
    ).toBeUndefined();
  });

  it('空输入返回等价副本，filled / skipped 都为空', () => {
    const existing = buildExisting();
    const before = snapshot(existing);

    const { profile, filled, skipped } = mergeCfctFatty(existing, {});

    expect(profile).not.toBe(existing);
    expect(profile).toEqual(existing);
    expect(filled).toEqual([]);
    expect(skipped).toEqual([]);
    expect(snapshot(existing)).toEqual(before);
  });
});
