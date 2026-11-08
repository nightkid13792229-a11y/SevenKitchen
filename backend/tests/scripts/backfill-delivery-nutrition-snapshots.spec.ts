import {
  runDeliveryNutritionBackfill,
  type DeliveryNutritionBackfillCounters,
} from '../../scripts/backfill-delivery-nutrition-snapshots';

/**
 * 交付快照回填脚本 · 行为测试（2026-11-08）
 *
 * ## 为什么必须测它
 *
 * 它是整个改动里**唯一会写生产数据**的东西：跑错一次就是把"改后的报告"
 * 当成"交付那一刻的报告"冻进老订单，而且再跑一遍也看不出来。
 *
 * ## 锁四件事
 *
 * ① 幂等：跑第二遍不许再写；
 * ② 不覆盖：已有 `report`（哪怕是个空对象）不重写；
 * ③ v2 语义：新快照里 `report: null` 是"当场就没有报告"，不许补；
 * ④ 冲突：交付后改过配方（宏量表对不上）时，不许把当前报告补进去。
 */

const silentLogger = { info: () => {}, error: () => {} };

function sourceWithReport() {
  return {
    standard: 'FEDIAF_2025',
    scenario: 'EARLY_GROWTH_REPRODUCTION',
    summary: { protein_dm_pct: 38.23 },
    report: {
      ingredientRows: [{ ingredientName: '鸡胸肉', weightPercentLabel: '70%' }],
      macroRows: [
        {
          key: 'crudeProtein',
          name: '蛋白质',
          dryMatterLabel: '38.23%',
          energyPercentLabel: '31.26%',
          weightPercentLabel: '10.22%',
        },
      ],
      energyDensityRows: [{ label: '每公斤配方', value: '3620 kcal/kg' }],
      nutrientSections: {
        minerals: {
          key: 'minerals',
          title: '微量元素',
          dryMatterHeader: '/100gDM',
          rows: [{ name: '钙', currentLabel: '2192' }],
        },
      },
    },
  };
}

/** 老快照：v1、营养块里只有 standard/energy */
function legacySnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    recipe: { recipeId: 'CR1', name: '豆豆的食谱', items: [] },
    feeding: {},
    nutrition: {
      standard: 'FEDIAF_2025',
      energyDensityKcalPerKg: 3620,
      ...overrides,
    },
    shopping: { lines: [], totalNetG: 0 },
    supplements: [],
    steps: [],
    generatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function target(
  label: string,
  snapshot: unknown,
  save = jest.fn().mockResolvedValue(undefined),
) {
  return {
    label,
    contentSnapshot: snapshot,
    recipe: {
      name: '豆豆的食谱',
      nutritionDetailedData: sourceWithReport(),
    },
    save,
  };
}

function counters(result: DeliveryNutritionBackfillCounters) {
  return result;
}

describe('runDeliveryNutritionBackfill', () => {
  it('★ 老快照（v1）缺报告 → 补上，且只碰 nutrition 下缺的键', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const item = target('单份 v1', legacySnapshot(), save);

    const result = await runDeliveryNutritionBackfill({
      targets: [item],
      apply: true,
      logger: silentLogger,
    });

    expect(counters(result).applied).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);

    const next = save.mock.calls[0][0] as any;
    expect(next.nutrition.report.nutrientSections.minerals.rows[0].name).toBe('钙');
    expect(next.nutrition.scenario).toBe('EARLY_GROWTH_REPRODUCTION');
    // 报告"按哪个标准算的"也一起补，缺了报告头会跟表里的限值打架
    expect(next.nutrition.reportStandard).toBe('FEDIAF_2025');
    // 原有字段原样保留
    expect(next.nutrition.standard).toBe('FEDIAF_2025');
    expect(next.nutrition.energyDensityKcalPerKg).toBe(3620);
    expect(next.recipe.name).toBe('豆豆的食谱');
  });

  it('★ 幂等：写完之后再跑一遍，一次都不写', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const item = target('单份 v1', legacySnapshot(), save);

    await runDeliveryNutritionBackfill({
      targets: [item],
      apply: true,
      logger: silentLogger,
    });
    const afterFirst = save.mock.calls[0][0] as any;

    const secondSave = jest.fn().mockResolvedValue(undefined);
    const result = await runDeliveryNutritionBackfill({
      targets: [target('单份 v1 · 第二次', afterFirst, secondSave)],
      apply: true,
      logger: silentLogger,
    });

    expect(secondSave).not.toHaveBeenCalled();
    expect(result.alreadyComplete).toBe(1);
    expect(result.applied).toBe(0);
  });

  it('★ v2 语义：report 显式为 null 时不许补（那是"当场就没有报告"）', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    // v2 快照该有的都齐了：只有 report 显式为 null（交付当场就没有报告）
    const snapshot = {
      ...legacySnapshot({
        macros: { proteinPercent: 38.23 },
        reportRows: sourceWithReport().report.macroRows,
        report: null,
        scenario: null,
      }),
      schemaVersion: 2,
    };

    const result = await runDeliveryNutritionBackfill({
      targets: [target('v2 无报告', snapshot, save)],
      apply: true,
      logger: silentLogger,
    });

    expect(save).not.toHaveBeenCalled();
    expect(result.alreadyComplete).toBe(1);
    expect(result.missingReport).toBe(1);
  });

  it('★ 交付后改过配方（宏量表对不上）→ 跳过报告，不拿当前数据充数', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const snapshot = legacySnapshot({
      macros: { proteinPercent: 38.23 },
      reportRows: [
        {
          key: 'crudeProtein',
          name: '蛋白质',
          dryMatterLabel: '30.00%',
          energyPercentLabel: '28.00%',
          weightPercentLabel: '9.00%',
        },
      ],
    });

    const result = await runDeliveryNutritionBackfill({
      targets: [target('改过配方', snapshot, save)],
      apply: true,
      logger: silentLogger,
    });

    expect(result.conflicts).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('宏量表一致（交付后没改过）→ 正常补报告', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const snapshot = legacySnapshot({
      macros: { proteinPercent: 38.23 },
      reportRows: sourceWithReport().report.macroRows,
    });

    const result = await runDeliveryNutritionBackfill({
      targets: [target('没改过', snapshot, save)],
      apply: true,
      logger: silentLogger,
    });

    expect(result.conflicts).toBe(0);
    expect(result.applied).toBe(1);
  });

  it('食谱没有营养数据 → 记 noSourceData，不写库', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const item = {
      ...target('没有营养数据', legacySnapshot(), save),
      recipe: { name: '空食谱', nutritionDetailedData: null },
    };

    const result = await runDeliveryNutritionBackfill({
      targets: [item],
      apply: true,
      logger: silentLogger,
    });

    expect(result.noSourceData).toBe(1);
    expect(save).not.toHaveBeenCalled();
  });

  it('单条失败不影响其余（错误隔离）', async () => {
    const failing = target(
      '会失败的',
      legacySnapshot(),
      jest.fn().mockRejectedValue(new Error('boom')),
    );
    const goodSave = jest.fn().mockResolvedValue(undefined);
    const good = target('正常的', legacySnapshot(), goodSave);

    const result = await runDeliveryNutritionBackfill({
      targets: [failing, good],
      apply: true,
      logger: silentLogger,
    });

    expect(result.errors).toBe(1);
    expect(result.applied).toBe(1);
    expect(goodSave).toHaveBeenCalledTimes(1);
  });

  it('预演模式一行都不写', async () => {
    const save = jest.fn().mockResolvedValue(undefined);

    const result = await runDeliveryNutritionBackfill({
      targets: [target('预演', legacySnapshot(), save)],
      apply: false,
      logger: silentLogger,
    });

    expect(result.eligible).toBe(1);
    expect(result.applied).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });
});
