import {
  buildTfdaNutritionProfile,
  type TfdaNutrientRow,
} from 'src/domain/nutrition-governance/tfda-normalize';

const rows = (
  items: Array<[string, string, number]>,
  dataType: '樣品平均值' | '樣品基本資料' = '樣品基本資料',
): TfdaNutrientRow[] =>
  items.map(([name, unit, value]) => ({ name, unit, value, dataType }));

const food = (inputRows: TfdaNutrientRow[]) => ({
  foodCode: 'x',
  name: 'x',
  nameEn: null,
  category: null,
  refuseRate: null,
  rows: inputRows,
});

describe('buildTfdaNutritionProfile', () => {
  it('宏量/矿物质/维生素按目录单位落位', () => {
    const p = buildTfdaNutritionProfile({
      foodCode: 'J0200201',
      name: '雙髻鯊',
      nameEn: 'Hammerhead shark',
      category: '魚貝類',
      refuseRate: 62.2,
      rows: rows([
        ['熱量', 'kcal', 117],
        ['粗蛋白', 'g', 20.1],
        ['鈣', 'mg', 9],
        ['維生素E總量', 'mg', 2],
        ['維生素D總量(IU)', 'IU', 40],
        ['維生素K1', 'ug', 1],
        ['維生素K2', 'ug', 2],
      ]),
    });

    expect(p.macros.energyKcal).toBe(117);
    expect(p.macros.crudeProtein).toBeCloseTo(20.1);
    expect(p.minerals.calcium).toBe(9);
    expect(p.vitamins.vitaminE).toBeCloseTo(2.98); // ×1.49
    expect(p.vitamins.vitaminD).toBe(40);
    expect(p.vitamins.vitaminK).toBe(3);
    expect(p.meta.externalId).toBe('TFDA:J0200201');
    expect(p.meta.sourceType).toBe('TFDA');
    expect(p.meta.sourceCode).toBe('TFDA');
    expect(p.meta.sourceProvider).toBe('Taiwan Food and Drug Administration');
    expect(p.meta.sourceTitle).toBe(
      'Taiwan Food Nutrition Database (TFDA) 2026-10',
    );
    expect(p.meta.sourceVersion).toBe('TFDA_2026_10');
    expect(p.meta.confidenceLevel).toBe('MEDIUM');
    expect(p.meta.rawBasisType).toBe('PER_100_G');
  });

  it('氨基酸 mg→g、EPA 保持 mg', () => {
    const p = buildTfdaNutritionProfile(
      food(
        rows([
          ['精胺酸(Arg)', 'mg', 1200],
          ['亞麻油酸(18:2)', 'mg', 500],
          ['廿碳五烯酸(20:5)', 'mg', 30],
        ]),
      ),
    );

    expect(p.aminoAcids.arginine).toBeCloseTo(1.2);
    expect(p.fattyAcids.linoleicAcid).toBeCloseTo(0.5);
    expect(p.fattyAcids.epa).toBe(30);
  });

  it('平均值优先于基本資料', () => {
    const p = buildTfdaNutritionProfile(
      food([
        { name: '鈣', unit: 'mg', value: 10, dataType: '樣品基本資料' },
        { name: '鈣', unit: 'mg', value: 99, dataType: '樣品平均值' },
      ]),
    );

    expect(p.minerals.calcium).toBe(99);
  });

  it('空/未知营养素忽略，不补 0', () => {
    const p = buildTfdaNutritionProfile(
      food(rows([['不存在的营养素', 'mg', 5]])),
    );

    expect(p.minerals.calcium).toBeNull();
    expect(p.macros.crudeProtein).toBeNull();
  });

  it('同一数据类别里重复出现只取第一条', () => {
    const p = buildTfdaNutritionProfile(
      food([
        { name: '鈣', unit: 'mg', value: 10, dataType: '樣品平均值' },
        { name: '鈣', unit: 'mg', value: 99, dataType: '樣品平均值' },
      ]),
    );

    expect(p.minerals.calcium).toBe(10);
  });

  it('维生素 A 没有 IU 总量时用視網醇當量(RE) ×3.33', () => {
    const p = buildTfdaNutritionProfile(
      food(rows([['視網醇當量(RE)', 'ug', 30]])),
    );

    expect(p.vitamins.vitaminA).toBeCloseTo(99.9);
  });

  it('维生素 A 同时有 IU 与 RE 时只用 IU，不叠加', () => {
    const p = buildTfdaNutritionProfile(
      food(
        rows([
          ['維生素A總量(IU)', 'IU', 120],
          ['視網醇當量(RE)', 'ug', 30],
        ]),
      ),
    );

    expect(p.vitamins.vitaminA).toBe(120);
  });

  it('维生素 D 没有 IU 总量时用 µg ×40', () => {
    const p = buildTfdaNutritionProfile(
      food(rows([['維生素D總量(ug)', 'ug', 0.5]])),
    );

    expect(p.vitamins.vitaminD).toBeCloseTo(20);
  });

  it('维生素 E 没有總量时用 α-生育酚当量 ×1.49', () => {
    const p = buildTfdaNutritionProfile(
      food(rows([['α-維生素E當量(α-TE)', 'mg', 2]])),
    );

    expect(p.vitamins.vitaminE).toBeCloseTo(2.98);
  });

  it('饱和脂肪缺失时用脂肪酸S總量 mg÷1000', () => {
    const p = buildTfdaNutritionProfile(
      food(rows([['脂肪酸S總量', 'mg', 1500]])),
    );

    expect(p.fattyAcids.saturatedFattyAcids).toBeCloseTo(1.5);
  });

  it('飽和脂肪存在时不使用脂肪酸S總量', () => {
    const p = buildTfdaNutritionProfile(
      food(
        rows([
          ['飽和脂肪', 'g', 2.5],
          ['脂肪酸S總量', 'mg', 2500],
        ]),
      ),
    );

    expect(p.fattyAcids.saturatedFattyAcids).toBeCloseTo(2.5);
  });

  it('sourceForms 记录来源营养素名与换算前后单位', () => {
    const p = buildTfdaNutritionProfile(food(rows([['維生素E總量', 'mg', 2]])));

    const sourceForm = p.meta.sourceForms?.['vitamins.vitaminE'];
    expect(sourceForm?.sourceNutrientName).toBe('維生素E總量');
    expect(sourceForm?.originalValue).toBe(2);
    expect(sourceForm?.originalUnit).toBe('mg');
    expect(sourceForm?.canonicalValue).toBeCloseTo(2.98);
    expect(sourceForm?.canonicalUnit).toBe('IU');
    expect(sourceForm?.basisType).toBe('PER_100_G');
  });

  it('维生素 K 由 K1/K2 相加，sourceForm 记两个来源项', () => {
    const p = buildTfdaNutritionProfile(
      food(
        rows([
          ['維生素K1', 'ug', 1],
          ['維生素K2', 'ug', 2],
        ]),
      ),
    );

    const sourceForm = p.meta.sourceForms?.['vitamins.vitaminK'];
    expect(p.vitamins.vitaminK).toBe(3);
    expect(sourceForm?.sourceNutrientName).toBe('維生素K1 + 維生素K2');
    expect(sourceForm?.originalValue).toBeNull();
    expect(sourceForm?.canonicalValue).toBe(3);
    expect(sourceForm?.basisType).toBe('PER_100_G');
  });

  it('refuseRate 留在输入里，不写进 profile', () => {
    const p = buildTfdaNutritionProfile({
      ...food(rows([['熱量', 'kcal', 117]])),
      refuseRate: 62.2,
    });

    expect(p.meta).not.toHaveProperty('refuseRate');
    expect(JSON.stringify(p)).not.toContain('refuseRate');
  });
});
