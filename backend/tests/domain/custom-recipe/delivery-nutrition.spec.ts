import {
  readDeliveryMacroRows,
  readDeliveryMacros,
  readDeliveryNutritionReport,
  readDeliveryScenario,
} from '../../../src/domain/custom-recipe/delivery-nutrition';

/**
 * 交付快照 · 核心营养取数口径（2026-11-07）
 *
 * 这组用例锁的是**事故本身**：交付端曾按 camelCase 去
 * `Recipe.nutritionDetailedData` 里取，而库里存的是 snake_case，
 * 结果 8 项全空 → `macros: null` → 交付页只剩「核心营养成分」标题。
 *
 * 所以固定用**生产上真实的形状**做夹具（2026-11-07 那份交付的原文），
 * 不是编一个好看的 payload。
 */

const SUMMARY = {
  moisture_pct: 73.28,
  protein_dm_pct: 38.23,
  fat_dm_pct: 12.44,
  fiber_dm_pct: 2.27,
  ash_dm_pct: 3.75,
  carbs_dm_pct: 43.1,
  ca_p_ratio: 1.35,
  energy_density_kcal_per_kg: 1144,
};

/** 生产上 `Recipe.nutritionDetailedData` 的真实形状：summary 既铺在顶层、也在 summary 里 */
const PRODUCTION_SHAPE = {
  ...SUMMARY,
  source: 'SETAR_RECIPE_DESIGNER',
  schemaVersion: 1,
  standard: 'FEDIAF_2025',
  summary: SUMMARY,
  report: {
    macroRows: [
      {
        key: 'crudeProtein',
        name: '蛋白质',
        dryMatterLabel: '38.23%',
        energyPercentLabel: '31.26%',
        weightPercentLabel: '10.22%',
      },
      {
        key: 'moisture',
        name: '水分',
        dryMatterLabel: '-',
        energyPercentLabel: '-',
        weightPercentLabel: '73.28%',
      },
    ],
  },
};

describe('readDeliveryMacros', () => {
  it('★ 认库里的 snake_case：8 项一个都不能少', () => {
    expect(readDeliveryMacros(PRODUCTION_SHAPE)).toEqual({
      proteinPercent: 38.23,
      fatPercent: 12.44,
      ashPercent: 3.75,
      moisturePercent: 73.28,
      crudeFiberPercent: 2.27,
      carbohydratePercent: 43.1,
      energyDensityKcalPerKg: 1144,
      calciumPhosphorusRatio: 1.35,
    });
  });

  it('只有顶层、没有 summary 也能取到（老数据的另一种铺法）', () => {
    expect(readDeliveryMacros({ ...SUMMARY })).toMatchObject({
      proteinPercent: 38.23,
      calciumPhosphorusRatio: 1.35,
    });
  });

  it('已经映射成 camelCase 的输入仍然认（不回归接口形状）', () => {
    expect(
      readDeliveryMacros({
        proteinPercent: 38.23,
        moisturePercent: 73.28,
        energyDensityKcalPerKg: 1144,
      }),
    ).toEqual({
      proteinPercent: 38.23,
      fatPercent: null,
      ashPercent: null,
      moisturePercent: 73.28,
      crudeFiberPercent: null,
      carbohydratePercent: null,
      energyDensityKcalPerKg: 1144,
      calciumPhosphorusRatio: null,
    });
  });

  it('一项都没有时返回 null —— 不给前端一个「8 个 null」的块', () => {
    expect(readDeliveryMacros({})).toBeNull();
    expect(readDeliveryMacros({ summary: {} })).toBeNull();
    expect(readDeliveryMacros(null)).toBeNull();
    expect(readDeliveryMacros('not-an-object')).toBeNull();
  });

  it('NaN / 字符串不当数字用（缺失就是缺失）', () => {
    expect(
      readDeliveryMacros({
        protein_dm_pct: Number.NaN,
        fat_dm_pct: '12.44' as unknown as number,
        ash_dm_pct: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });

  it('部分缺失只影响该项（不把整块判成空）', () => {
    expect(readDeliveryMacros({ protein_dm_pct: 38.23 })).toMatchObject({
      proteinPercent: 38.23,
      fatPercent: null,
      ashPercent: null,
    });
  });
});

describe('readDeliveryMacroRows', () => {
  it('只留渲染要的 4 个字段（key 可选）', () => {
    expect(readDeliveryMacroRows(PRODUCTION_SHAPE)).toEqual([
      {
        key: 'crudeProtein',
        name: '蛋白质',
        dryMatterLabel: '38.23%',
        energyPercentLabel: '31.26%',
        weightPercentLabel: '10.22%',
      },
      {
        key: 'moisture',
        name: '水分',
        dryMatterLabel: '-',
        energyPercentLabel: '-',
        weightPercentLabel: '73.28%',
      },
    ]);
  });

  it('没有报告 / 空行时给 null', () => {
    expect(readDeliveryMacroRows({ ...SUMMARY })).toBeNull();
    expect(readDeliveryMacroRows({ report: { macroRows: [] } })).toBeNull();
    expect(readDeliveryMacroRows({ report: { macroRows: [{ name: '  ' }] } })).toBeNull();
    expect(readDeliveryMacroRows(null)).toBeNull();
  });
});


/**
 * 完整营养报告冻结（2026-11-08）
 *
 * 交付页新加了「营养报告」入口，报告的**版本**必须跟交付那一版一致：
 * 私密定制食谱原地更新、版本号恒为 1，所以只能交付时整份冻结进快照。
 */
const FULL_REPORT_SHAPE = {
  ...PRODUCTION_SHAPE,
  scenario: 'EARLY_GROWTH_REPRODUCTION',
  report: {
    ingredientRows: [
      {
        ingredientName: '鸡胸肉',
        amountLabel: '320g',
        concentrationLabel: '-',
        weightPercentLabel: '32.00%',
        // 库里可能多出来的键，不该进快照
        internalRatio: 0.32,
      },
    ],
    macroRows: [
      { key: 'crudeProtein', name: '蛋白质', dryMatterLabel: '38.23%', energyPercentLabel: '31.26%', weightPercentLabel: '10.22%' },
    ],
    energyDensityRows: [
      { label: '每公斤配方', value: '1144 kcal/kg' },
      { label: '每公斤干物质', value: '4096 kcal/kg DM' },
    ],
    nutrientSections: {
      minerals: {
        title: '微量元素',
        dryMatterHeader: '/100gDM',
        rows: [
          { key: 'calcium', name: '钙', unit: 'mg', minLabel: '1000', maxLabel: '2500', currentLabel: '2192', dryMatterLabel: '2192', status: 'COMPLIANT' },
        ],
      },
      vitamins: {
        title: '维生素',
        dryMatterHeader: '/100gDM',
        rows: [],
      },
      aminoAcids: {
        title: '氨基酸',
        dryMatterHeader: '/100gDM',
        rows: [
          { key: 'lysine', name: '赖氨酸', unit: 'g', currentLabel: '1.2' },
        ],
      },
      // 未知分区：不认
      unknownSection: { title: '未知', dryMatterHeader: '', rows: [{ name: 'x' }] },
    },
  },
};

describe('readDeliveryNutritionReport', () => {
  it('★ 整份报告只留渲染字段（多余的键不进快照契约）', () => {
    const report = readDeliveryNutritionReport(FULL_REPORT_SHAPE);

    expect(report).toEqual({
      ingredientRows: [
        {
          ingredientName: '鸡胸肉',
          amountLabel: '320g',
          concentrationLabel: '-',
          weightPercentLabel: '32.00%',
        },
      ],
      macroRows: [
        {
          key: 'crudeProtein',
          name: '蛋白质',
          dryMatterLabel: '38.23%',
          energyPercentLabel: '31.26%',
          weightPercentLabel: '10.22%',
        },
      ],
      energyDensityRows: [
        { label: '每公斤配方', value: '1144 kcal/kg' },
        { label: '每公斤干物质', value: '4096 kcal/kg DM' },
      ],
      nutrientSections: {
        minerals: {
          title: '微量元素',
          dryMatterHeader: '/100gDM',
          rows: [
            {
              key: 'calcium',
              name: '钙',
              unit: 'mg',
              minLabel: '1000',
              maxLabel: '2500',
              currentLabel: '2192',
              dryMatterLabel: '2192',
              status: 'COMPLIANT',
            },
          ],
        },
        aminoAcids: {
          title: '氨基酸',
          dryMatterHeader: '/100gDM',
          rows: [{ key: 'lysine', name: '赖氨酸', unit: 'g', currentLabel: '1.2' }],
        },
      },
    });
  });

  it('没有报告 / 空报告都给 null（前端据此隐藏入口）', () => {
    // 只有 summary 和宏量行的老数据不等于"有完整报告"
    expect(readDeliveryNutritionReport({ ...SUMMARY })).toBeNull();
    expect(readDeliveryNutritionReport(null)).toBeNull();
    expect(readDeliveryNutritionReport({ report: {} })).toBeNull();
    expect(readDeliveryNutritionReport({ report: { nutrientSections: { minerals: { rows: [] } } } })).toBeNull();
  });

  it('只有部分分区也能用（缺的分区不写空壳）', () => {
    const report = readDeliveryNutritionReport({
      report: { nutrientSections: { vitamins: { title: '维生素', rows: [{ name: '维生素 E', currentLabel: '1000' }] } } },
    });

    expect(Object.keys(report?.nutrientSections ?? {})).toEqual(['vitamins']);
  });
});

describe('readDeliveryScenario', () => {
  it('读出场景，空值给 null', () => {
    expect(readDeliveryScenario({ scenario: 'EARLY_GROWTH_REPRODUCTION' })).toBe('EARLY_GROWTH_REPRODUCTION');
    expect(readDeliveryScenario({ scenario: '   ' })).toBeNull();
    expect(readDeliveryScenario({})).toBeNull();
    expect(readDeliveryScenario(null)).toBeNull();
  });
});
