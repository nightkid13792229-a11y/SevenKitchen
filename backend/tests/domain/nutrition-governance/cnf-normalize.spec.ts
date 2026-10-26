import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildCnfNutritionProfile } from 'src/domain/nutrition-governance/cnf-normalize';

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
