import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createEmptyNutritionProfile } from 'src/domain/ingredient/nutrition-profile.utils';
import type { NutritionProfileV2 } from 'src/domain/ingredient/types';
import { buildCnfNutritionProfile } from 'src/domain/nutrition-governance/cnf-normalize';
import type { CnfCodeMapEntry } from 'src/domain/nutrition-governance/cnf-normalize';
import {
  diffCnfProfileFields,
  mergeCnfProfile,
} from 'src/domain/nutrition-governance/cnf-profile-merge';

const codeMap = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'scripts/data/usda-nutrient-nbr-to-fdc-id.json'),
    'utf8',
  ),
) as Record<string, CnfCodeMapEntry>;

/** 验收项 4 确认漏映射、本次补上的 8 个 CNF 编码。 */
const GAP_AMOUNTS = [
  { nutrientCode: '205', value: 12.5 }, // 碳水
  { nutrientCode: '291', value: 3.2 }, // 总膳食纤维
  { nutrientCode: '401', value: 4.1 }, // 维生素 C
  { nutrientCode: '417', value: 0.023 }, // 叶酸
  { nutrientCode: '421', value: 15.7 }, // 胆碱
  { nutrientCode: '606', value: 1.9 }, // 饱和脂肪酸
  { nutrientCode: '645', value: 0.8 }, // 单不饱和脂肪酸
  { nutrientCode: '646', value: 0.6 }, // 多不饱和脂肪酸
] as const;

function buildCnf(
  amounts: ReadonlyArray<{ nutrientCode: string; value: number }>,
) {
  return buildCnfNutritionProfile({
    amounts: [...amounts],
    codeMap,
    food: { foodCode: '1507', description: 'Apricot, dried' },
  });
}

function buildExisting(): NutritionProfileV2 {
  const existing = createEmptyNutritionProfile();
  existing.meta.sourceType = 'CNF';
  existing.meta.sourceCode = 'CNF';
  existing.meta.sourceTitle = 'Canadian Nutrient File (CNF) 2026';
  existing.meta.sourceProvider = 'Health Canada';
  existing.meta.sourceVersion = 'CNF_2026_14TH';
  existing.meta.externalId = 'CNF:1507';
  existing.meta.confidenceLevel = 'MEDIUM';
  existing.meta.sampleState = 'RAW';
  existing.meta.rawBasisType = 'PER_100_G';
  existing.meta.sourceForms = {
    'macros.crudeProtein': { originalValue: 20, originalUnit: 'g' },
    'macros.energyKcal': { originalValue: 100, originalUnit: 'kcal' },
  };
  existing.meta.conversionNotes = {
    'macros.crudeProtein': 'protein note',
  };
  existing.meta.fieldDisplayUnits = { 'vitamins.choline': 'mg' };
  existing.macros.energyKcal = 100;
  existing.macros.crudeProtein = 20;
  existing.macros.crudeFat = 5;
  existing.minerals.calcium = 120;
  existing.minerals.iron = 1.2;
  existing.vitamins.vitaminB12 = 1.5;
  existing.customItems.push({
    name: 'Organic acid, total',
    value: 1,
    unit: 'g',
    rawBasisType: 'PER_100_G',
  });
  return existing;
}

describe('mergeCnfProfile', () => {
  it('把碳水/纤维/维生素C/叶酸/胆碱/饱和·单不饱和·多不饱和脂肪酸写进对应 tab', () => {
    const merged = mergeCnfProfile(buildExisting(), buildCnf(GAP_AMOUNTS));

    expect(merged.macros.carbohydrate).toBeCloseTo(12.5);
    expect(merged.macros.fiber).toBeCloseTo(3.2);
    expect(merged.vitamins.vitaminC).toBeCloseTo(4.1);
    expect(merged.vitamins.vitaminB9).toBeCloseTo(0.023);
    expect(merged.vitamins.choline).toBeCloseTo(15.7);
    expect(merged.fattyAcids.saturatedFattyAcids).toBeCloseTo(1.9);
    expect(merged.fattyAcids.monounsaturatedFattyAcids).toBeCloseTo(0.8);
    expect(merged.fattyAcids.polyunsaturatedFattyAcids).toBeCloseTo(0.6);
  });

  it('existing 已有的能量/蛋白/脂肪/矿物质/维生素不被清掉', () => {
    const existing = buildExisting();
    const merged = mergeCnfProfile(existing, buildCnf(GAP_AMOUNTS));

    expect(merged.macros.energyKcal).toBe(100);
    expect(merged.macros.crudeProtein).toBe(20);
    expect(merged.macros.crudeFat).toBe(5);
    expect(merged.minerals.calcium).toBe(120);
    expect(merged.minerals.iron).toBe(1.2);
    expect(merged.vitamins.vitaminB12).toBe(1.5);
    expect(merged.customItems).toHaveLength(1);
  });

  it('built 里为 null 的字段不会清空 existing', () => {
    const existing = buildExisting();
    existing.vitamins.vitaminC = 12;
    // built 只用 205/291 两个编码：其余字段（含维生素 C、能量）都是 null。
    const built = buildCnf([
      { nutrientCode: '205', value: 12.5 },
      { nutrientCode: '291', value: 3.2 },
    ]);

    expect(built.vitamins.vitaminC).toBeNull();
    expect(built.macros.energyKcal).toBeNull();

    const merged = mergeCnfProfile(existing, built);
    expect(merged.vitamins.vitaminC).toBe(12);
    expect(merged.macros.energyKcal).toBe(100);
    expect(merged.macros.crudeProtein).toBe(20);
    expect(merged.macros.carbohydrate).toBeCloseTo(12.5);
  });

  it('meta.sourceForms / conversionNotes 只合并真正拷贝的字段，未拷贝字段保持 existing', () => {
    const existing = buildExisting();
    const built = buildCnf(GAP_AMOUNTS);
    built.meta.sourceForms ??= {};
    built.meta.conversionNotes ??= {};
    // 人为塞一条“字段值为 null 但带元数据”的条目：没有真正拷贝，不能合并进来。
    built.meta.sourceForms['vitamins.vitaminD'] = {
      originalValue: 99,
      originalUnit: 'IU',
    };
    built.meta.conversionNotes['vitamins.vitaminD'] = 'should not be merged';
    built.meta.conversionNotes['macros.carbohydrate'] = 'carbohydrate note';

    const merged = mergeCnfProfile(existing, built);

    // 拷贝字段的元数据来自 built。
    expect(merged.meta.sourceForms!['macros.carbohydrate']).toEqual(
      built.meta.sourceForms['macros.carbohydrate'],
    );
    expect(
      merged.meta.sourceForms!['macros.carbohydrate'].originalValue,
    ).toBeCloseTo(12.5);
    expect(merged.meta.conversionNotes!['macros.carbohydrate']).toBe(
      'carbohydrate note',
    );

    // 未拷贝字段（built 里为 null）的元数据不合并。
    expect(merged.meta.sourceForms!['vitamins.vitaminD']).toBeUndefined();
    expect(merged.meta.conversionNotes!['vitamins.vitaminD']).toBeUndefined();

    // existing 自己的元数据原样保留（built 里没有 crudeProtein）。
    expect(merged.meta.sourceForms!['macros.crudeProtein']).toEqual({
      originalValue: 20,
      originalUnit: 'g',
    });
    expect(merged.meta.conversionNotes!['macros.crudeProtein']).toBe(
      'protein note',
    );
    expect(merged.meta.fieldDisplayUnits).toEqual({ 'vitamins.choline': 'mg' });
  });

  it('built 的空 originalUnit / sourceNutrientName 用 existing 补回，不把已有单位抹成空串', () => {
    const existing = buildExisting();
    existing.vitamins.vitaminC = 5;
    existing.meta.sourceForms!['vitamins.vitaminC'] = {
      sourceNutrientId: 1162,
      sourceNutrientName: 'Vitamin C',
      originalValue: 5,
      originalUnit: 'mg',
    };
    const built = buildCnf([{ nutrientCode: '401', value: 4.1 }]);
    // 重建路径拿不到 CNF 原始单位，built 的 originalUnit 是空串。
    expect(built.meta.sourceForms!['vitamins.vitaminC'].originalUnit).toBe('');

    const merged = mergeCnfProfile(existing, built);
    expect(merged.meta.sourceForms!['vitamins.vitaminC'].originalUnit).toBe(
      'mg',
    );
    expect(
      merged.meta.sourceForms!['vitamins.vitaminC'].sourceNutrientName,
    ).toBe('Vitamin C');
    // 数值仍以 built 为准。
    expect(
      merged.meta.sourceForms!['vitamins.vitaminC'].originalValue,
    ).toBeCloseTo(4.1);
    expect(merged.vitamins.vitaminC).toBeCloseTo(4.1);
  });

  it('meta 的 sampleState / sourceTitle / externalId 等与 customItems 原样保留', () => {
    const existing = buildExisting();
    const merged = mergeCnfProfile(existing, buildCnf(GAP_AMOUNTS));

    expect(merged.meta.sampleState).toBe('RAW');
    expect(merged.meta.sourceTitle).toBe('Canadian Nutrient File (CNF) 2026');
    expect(merged.meta.sourceProvider).toBe('Health Canada');
    expect(merged.meta.sourceVersion).toBe('CNF_2026_14TH');
    expect(merged.meta.externalId).toBe('CNF:1507');
    expect(merged.meta.confidenceLevel).toBe('MEDIUM');
    expect(merged.meta.rawBasisType).toBe('PER_100_G');
    expect(merged.meta.sourceType).toBe('CNF');
    expect(merged.customItems).toEqual(existing.customItems);
  });

  it('纯函数：不修改 existing / built', () => {
    const existing = buildExisting();
    const built = buildCnf(GAP_AMOUNTS);
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const builtSnapshot = JSON.parse(JSON.stringify(built));

    const merged = mergeCnfProfile(existing, built);

    expect(merged).not.toBe(existing);
    expect(merged.meta).not.toBe(existing.meta);
    expect(JSON.parse(JSON.stringify(existing))).toEqual(existingSnapshot);
    expect(JSON.parse(JSON.stringify(built))).toEqual(builtSnapshot);
  });

  it('重复合并是幂等的', () => {
    const built = buildCnf(GAP_AMOUNTS);
    const once = mergeCnfProfile(buildExisting(), built);
    const twice = mergeCnfProfile(once, built);
    expect(twice).toEqual(once);
  });
});

describe('diffCnfProfileFields', () => {
  it('列出新增有值的字段，且不含未变化的字段', () => {
    const existing = buildExisting();
    const merged = mergeCnfProfile(existing, buildCnf(GAP_AMOUNTS));
    const diff = diffCnfProfileFields(existing, merged);

    expect(diff.gained).toEqual(
      expect.arrayContaining([
        'macros.carbohydrate',
        'macros.fiber',
        'vitamins.vitaminC',
        'vitamins.vitaminB9',
        'vitamins.choline',
        'fattyAcids.saturatedFattyAcids',
        'fattyAcids.monounsaturatedFattyAcids',
        'fattyAcids.polyunsaturatedFattyAcids',
      ]),
    );
    expect(diff.gained).toHaveLength(8);
    expect(diff.changed.sort()).toEqual([...diff.gained].sort());
    expect(diff.changed).not.toContain('macros.energyKcal');
    expect(diff.changed).not.toContain('macros.crudeProtein');
    expect(diff.changed).not.toContain('minerals.calcium');
  });

  it('值变化但原本就有值时不记为 gained', () => {
    const existing = buildExisting();
    existing.macros.carbohydrate = 99;
    const merged = mergeCnfProfile(existing, buildCnf(GAP_AMOUNTS));
    const diff = diffCnfProfileFields(existing, merged);

    expect(diff.changed).toContain('macros.carbohydrate');
    expect(diff.gained).not.toContain('macros.carbohydrate');
  });
});

describe('CNF 映射表（验收项 4）', () => {
  it('8 个缺失编码分别指向预期的 USDA FDC id 与营养素名', () => {
    const expected: Record<string, { fdcId: number; name: string }> = {
      '205': { fdcId: 1005, name: 'Carbohydrate, by difference' },
      '291': { fdcId: 1079, name: 'Fiber, total dietary' },
      '401': { fdcId: 1162, name: 'Vitamin C, total ascorbic acid' },
      '417': { fdcId: 1177, name: 'Folate, total' },
      '421': { fdcId: 1180, name: 'Choline, total' },
      '606': { fdcId: 1258, name: 'Fatty acids, total saturated' },
      '645': { fdcId: 1292, name: 'Fatty acids, total monounsaturated' },
      '646': { fdcId: 1293, name: 'Fatty acids, total polyunsaturated' },
    };

    for (const [code, entry] of Object.entries(expected)) {
      expect(codeMap[code]).toEqual(entry);
    }
  });
});
