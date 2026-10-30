import { createEmptyNutritionProfile } from 'src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfileV2,
  NutritionSourceForm,
} from 'src/domain/ingredient/types';
import {
  CFCT_AMINO_FIELD_MAP,
  mergeCfctAmino,
} from 'src/domain/nutrition-governance/cfct-amino-enrich';

function buildExisting(): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.macros.moisture = 11.2;
  profile.macros.crudeProtein = 12.4;
  profile.minerals.calcium = 20;
  profile.vitamins.vitaminC = 5;
  profile.fattyAcids.epa = 30;
  profile.aminoAcids.leucine = 1.2;
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

describe('CFCT_AMINO_FIELD_MAP', () => {
  it('只映射 CFCT 氨基酸表里确实存在、且目录收录的 15 个字段', () => {
    expect(CFCT_AMINO_FIELD_MAP).toEqual({
      isoleucine: 'isoleucine',
      leucine: 'leucine',
      lysine: 'lysine',
      methionine: 'methionine',
      cystine: 'cystine',
      phenylalanine: 'phenylalanine',
      tyrosine: 'tyrosine',
      threonine: 'threonine',
      tryptophan: 'tryptophan',
      valine: 'valine',
      histidine: 'histidine',
      arginine: 'arginine',
      glutamicAcid: 'glutamicAcid',
      glycine: 'glycine',
      proline: 'proline',
    });
    expect(CFCT_AMINO_FIELD_MAP.alanine).toBeUndefined();
    expect(CFCT_AMINO_FIELD_MAP.asparticAcid).toBeUndefined();
    expect(CFCT_AMINO_FIELD_MAP.serine).toBeUndefined();
    // 目录里有 taurine，但 CFCT 氨基酸表没有牛磺酸列，不能凭空造来源。
    expect(CFCT_AMINO_FIELD_MAP.taurine).toBeUndefined();
  });
});

describe('mergeCfctAmino', () => {
  it('把 mg/100g 换算成 g/100g（826 mg → 0.826 g）', () => {
    const existing = buildExisting();

    const { profile, filled, skipped } = mergeCfctAmino(existing, {
      isoleucine: 826,
      glutamicAcid: 8168,
      cystine: 418.123456,
    });

    expect(profile.aminoAcids.isoleucine).toBeCloseTo(0.826, 6);
    expect(profile.aminoAcids.glutamicAcid).toBeCloseTo(8.168, 6);
    // 目录 g 值保留 4 位小数。
    expect(profile.aminoAcids.cystine).toBe(0.4181);
    expect(filled).toEqual(['isoleucine', 'glutamicAcid', 'cystine']);
    expect(skipped).toEqual([]);
  });

  it('在 meta.sourceForms 里保留原始列名、mg 原值与 g 换算结果', () => {
    const { profile } = mergeCfctAmino(buildExisting(), {
      isoleucine: 826,
    });

    const sourceForm = profile.meta.sourceForms?.['aminoAcids.isoleucine'];
    expect(sourceForm).toEqual({
      sourceNutrientName: 'isoleucine',
      originalValue: 826,
      originalUnit: 'mg',
      canonicalValue: 0.826,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    });
  });

  it('只新增氨基酸，macros / vitamins / minerals / fattyAcids / meta 原样保留', () => {
    const existing = buildExisting();
    const before = snapshot(existing);

    const { profile } = mergeCfctAmino(existing, {
      isoleucine: 826,
      proline: 2872,
    });

    expect(profile).not.toBe(existing);
    expect(profile.macros.moisture).toBe(11.2);
    expect(profile.macros.crudeProtein).toBe(12.4);
    expect(profile.minerals.calcium).toBe(20);
    expect(profile.vitamins.vitaminC).toBe(5);
    expect(profile.fattyAcids.epa).toBe(30);
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
    expect(sourceForms['aminoAcids.isoleucine']).toBeDefined();
    expect(sourceForms['aminoAcids.proline']).toBeDefined();

    // 纯函数：入参没有被改写。
    expect(snapshot(existing)).toEqual(before);
    expect(existing.aminoAcids.isoleucine).toBeNull();
    expect(
      existing.meta.sourceForms?.['aminoAcids.isoleucine'],
    ).toBeUndefined();
  });

  it('目录外的 alanine / asparticAcid / serine 只跳过，不写进 profile', () => {
    const { profile, filled, skipped } = mergeCfctAmino(buildExisting(), {
      alanine: 596,
      asparticAcid: 783,
      serine: 979,
      isoleucine: 826,
    });

    expect(filled).toEqual(['isoleucine']);
    expect(skipped).toEqual(['alanine', 'asparticAcid', 'serine']);
    expect(profile.aminoAcids).not.toHaveProperty('alanine');
    expect(profile.aminoAcids).not.toHaveProperty('asparticAcid');
    expect(profile.aminoAcids).not.toHaveProperty('serine');
    expect(profile.meta.sourceForms?.['aminoAcids.alanine']).toBeUndefined();
  });

  it('null / 负数 / NaN / Infinity 一律忽略，0 是有效值', () => {
    const existing = buildExisting();

    const { profile, filled, skipped } = mergeCfctAmino(existing, {
      isoleucine: null as unknown as number,
      leucine: -1,
      methionine: Number.NaN,
      cystine: Number.POSITIVE_INFINITY,
      valine: 0,
    });

    expect(filled).toEqual(['valine']);
    expect(skipped).toEqual([]);
    expect(profile.aminoAcids.isoleucine).toBeNull();
    // 无效值不能覆盖已有的有效值。
    expect(profile.aminoAcids.leucine).toBe(1.2);
    expect(profile.aminoAcids.methionine).toBeNull();
    expect(profile.aminoAcids.cystine).toBeNull();
    expect(profile.aminoAcids.valine).toBe(0);
    expect(profile.meta.sourceForms?.['aminoAcids.valine']).toEqual({
      sourceNutrientName: 'valine',
      originalValue: 0,
      originalUnit: 'mg',
      canonicalValue: 0,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    });
  });

  it('meta.sourceForms 缺失时也能安全创建', () => {
    const existing = createEmptyNutritionProfile();
    delete existing.meta.sourceForms;

    const { profile } = mergeCfctAmino(existing, { glycine: 729 });

    expect(profile.aminoAcids.glycine).toBeCloseTo(0.729, 6);
    expect(profile.meta.sourceForms?.['aminoAcids.glycine']).toEqual({
      sourceNutrientName: 'glycine',
      originalValue: 729,
      originalUnit: 'mg',
      canonicalValue: 0.729,
      canonicalUnit: 'g',
      basisType: 'PER_100_G',
    } satisfies NutritionSourceForm);
  });

  it('空输入返回等价副本，filled / skipped 都为空', () => {
    const existing = buildExisting();
    const before = snapshot(existing);

    const { profile, filled, skipped } = mergeCfctAmino(existing, {});

    expect(profile).not.toBe(existing);
    expect(profile).toEqual(existing);
    expect(filled).toEqual([]);
    expect(skipped).toEqual([]);
    expect(snapshot(existing)).toEqual(before);
  });
});
