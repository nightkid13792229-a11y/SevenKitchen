import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildCnfNutritionProfile,
  mergeCnfMinerals,
} from 'src/domain/nutrition-governance/cnf-normalize';

const codeMap = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'scripts/data/usda-nutrient-nbr-to-fdc-id.json'),
    'utf8',
  ),
);

describe('buildCnfNutritionProfile', () => {
  it('把 301/303/315 归进矿物质，且单位不改数值', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [
        { nutrientCode: '203', value: 20.5 },
        { nutrientCode: '301', value: 120 },
        { nutrientCode: '303', value: 1.2 },
        { nutrientCode: '315', value: 8.4 }, // µg 硒
      ],
      codeMap,
      food: { foodCode: '1507', description: 'Apricot, dried' },
    });
    expect(profile.macros.crudeProtein).toBeCloseTo(20.5);
    expect(profile.minerals.calcium).toBeCloseTo(120);
    expect(profile.minerals.iron).toBeCloseTo(1.2);
    expect(profile.minerals.selenium).toBeCloseTo(8.4);
    expect(profile.meta.externalId).toBe('CNF:1507');
    expect(profile.meta.sourceType).toBe('CNF');
    expect(profile.meta.sourceCode).toBe('CNF');
    expect(profile.meta.sourceProvider).toBe('Health Canada');
    expect(profile.meta.sourceTitle).toBe('Canadian Nutrient File (CNF) 2026');
    expect(profile.meta.sourceVersion).toBe('CNF_2026_14TH');
    expect(profile.meta.confidenceLevel).toBe('MEDIUM');
  });

  it('翻不出的编码直接忽略，不抛错', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [{ nutrientCode: '99999', value: 1 }],
      codeMap,
      food: { foodCode: 'x', description: 'x' },
    });
    expect(profile.minerals.calcium).toBeNull();
  });

  it('同一编码重复出现时取第一个值，不累加', () => {
    const profile = buildCnfNutritionProfile({
      amounts: [
        { nutrientCode: '301', value: 100 },
        { nutrientCode: '301', value: 200 },
      ],
      codeMap,
      food: { foodCode: 'x', description: 'x' },
    });
    expect(profile.minerals.calcium).toBeCloseTo(100);
  });
});

describe('mergeCnfMinerals', () => {
  const built = buildCnfNutritionProfile({
    amounts: [{ nutrientCode: '301', value: 120 }],
    codeMap,
    food: { foodCode: '1507', description: 'Apricot, dried' },
  });

  function buildExisting() {
    const existing = buildCnfNutritionProfile({
      amounts: [{ nutrientCode: '203', value: 20 }],
      codeMap,
      food: { foodCode: '1507', description: 'Apricot, dried' },
    });
    existing.macros.crudeProtein = 20;
    existing.vitamins.vitaminC = 5;
    Object.assign(existing.meta, { sampleState: 'DRIED' });
    existing.meta.externalId = 'CNF:1507';
    existing.meta.sourceForms = {
      'macros.crudeProtein': { originalValue: 20, originalUnit: 'g' },
      'vitamins.vitaminC': { originalValue: 5, originalUnit: 'mg' },
      'minerals.calcium': { originalValue: 1, originalUnit: 'mg' },
    };
    existing.meta.conversionNotes = { 'macros.crudeProtein': 'protein note' };
    existing.minerals.calcium = 1;
    return existing;
  }

  it('existing 为 null 时直接返回 built', () => {
    expect(mergeCnfMinerals(null, built)).toBe(built);
  });

  it('只替换 minerals 与矿物质来源元数据，其它字段保持原样', () => {
    const existing = buildExisting();
    const existingSnapshot = JSON.parse(JSON.stringify(existing));
    const builtSnapshot = JSON.parse(JSON.stringify(built));

    const merged = mergeCnfMinerals(existing, built);

    expect(merged).not.toBe(existing);
    expect(merged.minerals.calcium).toBeCloseTo(120);
    expect(
      merged.meta.sourceForms!['minerals.calcium'].originalValue,
    ).toBeCloseTo(120);
    expect(merged.macros.crudeProtein).toBe(20);
    expect(merged.vitamins.vitaminC).toBe(5);
    expect(merged.meta.sampleState).toBe('DRIED');
    expect(merged.meta.externalId).toBe('CNF:1507');
    expect(merged.meta.sourceForms!['macros.crudeProtein'].originalUnit).toBe(
      'g',
    );
    expect(merged.meta.conversionNotes!['macros.crudeProtein']).toBe(
      'protein note',
    );

    // 纯函数：两个入参都没有被修改。
    expect(JSON.parse(JSON.stringify(existing))).toEqual(existingSnapshot);
    expect(JSON.parse(JSON.stringify(built))).toEqual(builtSnapshot);
  });

  it('重复合并是幂等的', () => {
    const once = mergeCnfMinerals(buildExisting(), built);
    const twice = mergeCnfMinerals(once, built);
    expect(twice).toEqual(once);
  });
});
