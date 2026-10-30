import { findNutritionField } from 'src/domain/ingredient/nutrition-field-catalog';
import { getNutritionSourceDefinition } from 'src/domain/ingredient/nutrition-source-contract';
import {
  buildKoreaNutritionProfile,
  KOREA_NUTRIENT_MAP,
  type KoreaFoodInput,
  type KoreaNutrientValue,
} from 'src/domain/nutrition-governance/korea-normalize';

const nutrient = (value: number, unit: string): KoreaNutrientValue => ({
  value,
  unit,
});

const nutrients = (
  entries: Array<[header: string, value: number, unit: string]>,
): Record<string, KoreaNutrientValue> =>
  Object.fromEntries(
    entries.map(([header, value, unit]) => [header, nutrient(value, unit)]),
  );

const food = (
  entries: Array<[header: string, value: number, unit: string]>,
  overrides: Partial<KoreaFoodInput> = {},
): KoreaFoodInput => ({
  index: '1',
  code: 'K001',
  nameKo: '테스트 식품',
  nameEn: 'Test food',
  scientificName: null,
  foodGroup: '곡류',
  source: '국가표준식품성분표',
  refuseRate: null,
  nutrients: nutrients(entries),
  ...overrides,
});

describe('buildKoreaNutritionProfile', () => {
  it('keeps energy, protein and calcium in catalog units', () => {
    const profile = buildKoreaNutritionProfile(
      food([
        ['에너지', 372, 'kcal'],
        ['단백질', 9.4, 'g'],
        ['칼슘', 12, 'mg'],
      ]),
    );

    expect(profile.macros.energyKcal).toBe(372);
    expect(profile.macros.crudeProtein).toBeCloseTo(9.4);
    expect(profile.minerals.calcium).toBe(12);
    expect(profile.meta.rawBasisType).toBe('PER_100_G');
    expect(findNutritionField('macros.energyKcal')?.unit).toBe('kcal');
  });

  it('matches headers after collapsing whitespace', () => {
    const profile = buildKoreaNutritionProfile(
      food([['총  식이섬유', 5.5, 'g']]),
    );

    expect(profile.macros.fiber).toBeCloseTo(5.5);
  });

  it('keeps selenium and iodine in micrograms without conversion', () => {
    const profile = buildKoreaNutritionProfile(
      food([
        ['셀레늄', 12.3, 'µg'],
        ['요오드', 4.56, 'µg'],
      ]),
    );

    expect(profile.minerals.selenium).toBeCloseTo(12.3);
    expect(profile.minerals.iodine).toBeCloseTo(4.56);
  });

  it('converts taurine from mg to g', () => {
    const profile = buildKoreaNutritionProfile(food([['타우린', 120, 'mg']]));

    expect(profile.aminoAcids.taurine).toBeCloseTo(0.12);
  });

  it('converts vitamin A, D and E from source units to IU', () => {
    const profile = buildKoreaNutritionProfile(
      food([
        ['비타민 A', 300, 'µg'],
        ['비타민 D', 2.5, 'µg'],
        ['비타민 E', 2, 'mg'],
      ]),
    );

    expect(profile.vitamins.vitaminA).toBeCloseTo(999); // ×3.33
    expect(profile.vitamins.vitaminD).toBeCloseTo(100); // ×40
    expect(profile.vitamins.vitaminE).toBeCloseTo(2.98); // ×1.49
  });

  it('keeps total, soluble and insoluble fiber in separate fields', () => {
    const profile = buildKoreaNutritionProfile(
      food([
        ['총 식이섬유', 5.5, 'g'],
        ['수용성 식이섬유', 1.2, 'g'],
        ['불용성 식이섬유', 3.4, 'g'],
      ]),
    );

    expect(profile.macros.fiber).toBeCloseTo(5.5);
    expect(profile.macros.solubleFiber).toBeCloseTo(1.2);
    expect(profile.macros.insolubleFiber).toBeCloseTo(3.4);
  });

  it('maps the real 10.4 sheet headers that wrap before parentheses', () => {
    // 官方表头在 Excel 里换行：空白折叠后括号前会留下一个空格，映射表必须按
    // **真实表头**写，否则 B9 / 亚油酸 / α-亚麻酸 / 花生四烯酸 / EPA / DPA / DHA
    // 会全部静默漏掉（2026-10 实测 300,372 个数值格）。
    const profile = buildKoreaNutritionProfile(
      food([
        ['엽산_ 엽산당량', 24, 'μg'],
        ['리놀레산 (18:2(n-6))', 2764.5, 'mg'],
        ['알파 리놀렌산 (18:3 (n-3))', 79.27, 'mg'],
        ['아라키돈산 (20:4(n-6))', 12, 'mg'],
        ['에이코사 펜타에노산 (20:5(n-3))', 30, 'mg'],
        ['도코사 펜타에노산 (22:5(n-3))', 20, 'mg'],
        ['도코사 헥사에노산 (22:6(n-3))', 40, 'mg'],
      ]),
    );

    // 叶酸：目录与 RDA 都是 µg，不换算。
    expect(profile.vitamins.vitaminB9).toBeCloseTo(24);
    // 亚油酸 / α-亚麻酸 / 花生四烯酸：mg → g（÷1000）。
    expect(profile.fattyAcids.linoleicAcid).toBeCloseTo(2.7645);
    expect(profile.fattyAcids.alphaLinolenicAcid).toBeCloseTo(0.07927);
    expect(profile.fattyAcids.arachidonicAcid).toBeCloseTo(0.012);
    // EPA / DPA / DHA：目录本身就是 mg，不再除。
    expect(profile.fattyAcids.epa).toBe(30);
    expect(profile.fattyAcids.dpa).toBe(20);
    expect(profile.fattyAcids.dha).toBe(40);
  });

  it('builds a profile when the English name is missing', () => {
    const profile = buildKoreaNutritionProfile(
      food([['에너지', 100, 'kcal']], { nameEn: null }),
    );

    expect(profile.macros.energyKcal).toBe(100);
    expect(profile.meta.externalId).toBe('KO_RDA:K001');
  });

  it('leaves missing nutrients null and never fills them with zero', () => {
    const profile = buildKoreaNutritionProfile(food([['에너지', 0, 'kcal']]));

    // 明确的 0 是有效值，必须保留。
    expect(profile.macros.energyKcal).toBe(0);
    // 未出现在表里的营养素保持 null，不能补 0。
    expect(profile.macros.crudeProtein).toBeNull();
    expect(profile.macros.solubleFiber).toBeNull();
    expect(profile.minerals.calcium).toBeNull();
    expect(profile.minerals.selenium).toBeNull();
    expect(profile.vitamins.vitaminA).toBeNull();
    expect(profile.aminoAcids.taurine).toBeNull();
  });

  it('treats non-finite nutrient values as missing', () => {
    const profile = buildKoreaNutritionProfile(
      food([
        ['단백질', Number.NaN, 'g'],
        ['칼슘', Number.POSITIVE_INFINITY, 'mg'],
      ]),
    );

    expect(profile.macros.crudeProtein).toBeNull();
    expect(profile.minerals.calcium).toBeNull();
  });

  it('writes registered KO_RDA meta and resolves the source code', () => {
    const profile = buildKoreaNutritionProfile(food([['에너지', 100, 'kcal']]));

    expect(profile.meta.sourceType).toBe('KO_RDA');
    expect(profile.meta.sourceTitle).toBe(
      'Korean Standard Food Composition DB 10.4',
    );
    expect(profile.meta.sourceVersion).toBe('RDA_DB_10_4');
    expect(profile.meta.externalId).toBe('KO_RDA:K001');
    expect(profile.meta.confidenceLevel).toBe('MEDIUM');

    const definition = getNutritionSourceDefinition(profile.meta.sourceCode);
    expect(definition).toEqual({
      sourceKind: 'FOOD_DATABASE',
      sourceCode: 'KO_RDA_FOOD_COMPOSITION_TABLE',
      sourceProvider: 'Rural Development Administration, Republic of Korea',
    });
    expect(profile.meta.sourceProvider).toBe(definition?.sourceProvider);
  });

  it('does not put the refuse rate into the profile', () => {
    const profile = buildKoreaNutritionProfile(
      food([['에너지', 100, 'kcal']], { refuseRate: 62.2 }),
    );

    expect(JSON.stringify(profile)).not.toContain('62.2');
    expect(profile.meta.sourceDetail ?? null).toBeNull();
  });

  it('maps every entry to a unique nutrition catalog field', () => {
    const fieldPaths = KOREA_NUTRIENT_MAP.map(
      (mapping) => `${mapping.tabKey}.${mapping.fieldKey}`,
    );

    expect(KOREA_NUTRIENT_MAP).toHaveLength(58);
    expect(new Set(fieldPaths).size).toBe(fieldPaths.length);

    for (const fieldPath of fieldPaths) {
      expect(findNutritionField(fieldPath)).toBeDefined();
    }
  });
});
