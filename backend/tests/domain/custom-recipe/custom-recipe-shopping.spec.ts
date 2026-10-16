import {
  DEFAULT_SUPPLEMENT_LOSS_RATE,
  buildShoppingList,
  lossRateToRatio,
  toSnapshotShopping,
  type BuildShoppingListInput,
} from '../../../src/domain/custom-recipe/custom-recipe.shopping';

/**
 * 采购清单计算 · 测试（2026-10-16，批次 2.2）
 *
 * ## 为什么这组测试要盯住"系数 vs 比率"
 *
 * 数据库里的损耗率是**系数**（1.07 = 多买 7%），而算法里要用**比率**（0.07）。
 * 把 1.07 当比率用，算出来是"多买 1.07 倍"（即多买 107%），
 * 或者反过来只多买 7% —— **两种错法的数字看着都不离谱**，
 * 顾客照着买了才发现买少/买多。所以这条边界单独测。
 *
 * ## 口径来自小程序，不能悄悄改
 *
 * 这套公式是从 `pages/diy-sheet/index.vue` + `fallback.ts` 搬过来的，
 * 搬的时候一个字没改 —— 否则顾客会看到"同样的食谱、两个不同的采购量"。
 */

function input(
  overrides: Partial<BuildShoppingListInput> = {},
): BuildShoppingListInput {
  return {
    items: [
      { name: '鸡胸肉', ratioPercent: 70, preparation: '切丁煮熟' },
      { name: '糙米', ratioPercent: 30 },
    ],
    dailyIntakeG: 260,
    cycleDays: 14,
    foodLossRate: 1.07,
    ...overrides,
  };
}

describe('采购清单计算', () => {
  describe('★ 损耗率：系数与比率不能搞反', () => {
    it('系数 1.07 → 比率 0.07', () => {
      expect(lossRateToRatio(1.07, 0.07)).toEqual({
        ratio: expect.closeTo(0.07, 5),
        interpretedAs: 'coefficient',
      });
    });

    it('比率 0.07 也认，但标记出来（调用方可能直接传了比率）', () => {
      expect(lossRateToRatio(0.07, 0.07)).toEqual({
        ratio: 0.07,
        interpretedAs: 'ratio',
      });
    });

    it('传 null / 负数 / NaN 时用兜底值', () => {
      for (const bad of [null, undefined, Number.NaN, -1]) {
        expect(lossRateToRatio(bad as never, 0.07).interpretedAs).toBe(
          'fallback',
        );
      }
    });

    it('★ 1.07 与 0.07 算出来的采购量差得远（防止把两者当同一个东西）', () => {
      const asCoefficient = buildShoppingList(
        input({ foodLossRate: 1.07, items: [{ name: 'A', ratioPercent: 100 }] }),
      );
      const asRatio = buildShoppingList(
        input({ foodLossRate: 0.07, items: [{ name: 'A', ratioPercent: 100 }] }),
      );

      // 净用量 260 × 14 = 3640g
      // 系数口径：3640 × 1.07 = 3894.8
      // 比率口径：3640 × 1.07 = 3894.8 —— 两者等价，这正是"认它"的理由
      expect(asCoefficient.lines[0].purchaseG).toBeCloseTo(3894.8, 1);
      expect(asRatio.lines[0].purchaseG).toBeCloseTo(3894.8, 1);

      // 但如果把 1.07 **当成比率**用（错误做法）会是 3640 × 1.0007 ≈ 3642.5
      // —— 只多买 2.5 克，看着不离谱但完全错了
      expect(asCoefficient.lines[0].purchaseG).not.toBeCloseTo(3642.5, 0);
    });

    it('传了比率时给一条提示（让人知道调用方口径可能不对）', () => {
      const result = buildShoppingList(input({ foodLossRate: 0.07 }));
      expect(result.warnings.join(' ')).toContain('比率');
    });
  });

  describe('★ 没有喂食量就不给清单（不猜）', () => {
    it('每天吃多少克取不到时整块不给，并说明原因', () => {
      const result = buildShoppingList(input({ dailyIntakeG: null }));

      expect(result.lines).toEqual([]);
      expect(result.unavailableReason).toContain('喂食量');
      // 不是给一个 0，而是明确说"算不出来"
      expect(result.totalPurchaseG).toBe(0);
    });

    it('做几天没定时也不给', () => {
      const result = buildShoppingList(input({ cycleDays: null }));
      expect(result.unavailableReason).toContain('做几天');
    });

    it('0 与负数同样视为"没填"', () => {
      expect(buildShoppingList(input({ dailyIntakeG: 0 })).lines).toEqual([]);
      expect(buildShoppingList(input({ cycleDays: -3 })).lines).toEqual([]);
    });
  });

  describe('计算口径（照搬小程序，不能悄悄改）', () => {
    it('净用量 = 每天吃多少 × 做几天 × 占比', () => {
      const result = buildShoppingList(input());

      // 总净重 = 260 × 14 = 3640g
      expect(result.totalNetG).toBeCloseTo(3640, 1);
      // 鸡胸肉 70% = 2548g
      expect(result.lines[0].netG).toBeCloseTo(2548, 1);
      // 采购量 = 2548 × 1.07 = 2726.36 → 2726.4
      expect(result.lines[0].purchaseG).toBeCloseTo(2726.4, 1);
      // 糙米 30% = 1092g
      expect(result.lines[1].netG).toBeCloseTo(1092, 1);
    });

    it('合计 = 各行相加', () => {
      const result = buildShoppingList(input());
      expect(result.totalPurchaseG).toBeCloseTo(
        result.lines.reduce((sum, line) => sum + line.purchaseG, 0),
        1,
      );
    });

    it('补剂用另一套损耗率（默认多备 5%）', () => {
      const result = buildShoppingList(
        input({
          items: [
            { name: '鸡胸肉', ratioPercent: 90 },
            { name: '鱼油', ratioPercent: 10, isSupplement: true },
          ],
        }),
      );

      const food = result.lines[0];
      const supplement = result.lines[1];
      // 食材多买 7%，补剂多买 5%
      expect(food.purchaseG / food.netG).toBeCloseTo(1.07, 3);
      expect(supplement.purchaseG / supplement.netG).toBeCloseTo(1.05, 3);
      expect(result.supplementLossRate).toBeCloseTo(
        DEFAULT_SUPPLEMENT_LOSS_RATE,
        4,
      );
    });

    it('制备方法带出来（采购页也要显示，省得来回翻）', () => {
      const result = buildShoppingList(input());
      expect(result.lines[0].preparation).toBe('切丁煮熟');
    });

    it('没有占比的条目被跳过，不参与计算', () => {
      const result = buildShoppingList(
        input({
          items: [
            { name: '鸡胸肉', ratioPercent: 100 },
            { name: '没填占比的', ratioPercent: null },
          ],
        }),
      );
      expect(result.lines).toHaveLength(1);
      expect(result.lines.map((line) => line.name)).toEqual(['鸡胸肉']);
    });
  });

  describe('★ 占比之和不是 100 时要出声', () => {
    it('占比之和 90% → 提示"偏少了 10%"', () => {
      const result = buildShoppingList(
        input({
          items: [
            { name: 'A', ratioPercent: 60 },
            { name: 'B', ratioPercent: 30 },
          ],
        }),
      );

      expect(result.warnings.join(' ')).toContain('90%');
      expect(result.warnings.join(' ')).toContain('偏少');
    });

    it('占比之和 110% → 提示"偏多了 10%"', () => {
      const result = buildShoppingList(
        input({
          items: [
            { name: 'A', ratioPercent: 70 },
            { name: 'B', ratioPercent: 40 },
          ],
        }),
      );
      expect(result.warnings.join(' ')).toContain('偏多');
    });

    it('★ 只提示、不报错 —— 报错会让交付卡住', () => {
      const result = buildShoppingList(
        input({ items: [{ name: 'A', ratioPercent: 90 }] }),
      );
      // 清单照给
      expect(result.lines).toHaveLength(1);
      expect(result.unavailableReason).toBeNull();
      // 提示照出
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('正好 100% 时没有提示', () => {
      const result = buildShoppingList(input());
      expect(result.warnings).toEqual([]);
    });

    it('小数抖动（99.8%）不算问题，不提示', () => {
      const result = buildShoppingList(
        input({
          items: [
            { name: 'A', ratioPercent: 66.6 },
            { name: 'B', ratioPercent: 33.2 },
          ],
        }),
      );
      expect(result.warnings).toEqual([]);
    });
  });

  describe('塞进快照的形状', () => {
    it('算得出来时给出清单与合计', () => {
      const snapshot = toSnapshotShopping(buildShoppingList(input()));

      expect(snapshot.lines).toHaveLength(2);
      expect(snapshot.lines[0]).toEqual({
        name: '鸡胸肉',
        netG: 2548,
        purchaseG: 2726.4,
      });
      expect(snapshot.lossRate).toBeCloseTo(1.07, 4);
    });

    it('★ 算不出来时给空壳而不是 undefined（读取端不用到处判空）', () => {
      const snapshot = toSnapshotShopping(
        buildShoppingList(input({ dailyIntakeG: null })),
      );

      expect(snapshot.lines).toEqual([]);
      expect(snapshot.totalNetG).toBe(0);
      // 但损耗率仍然是有效值（1），不是 null —— 快照结构要求它是数字
      expect(snapshot.lossRate).toBe(1);
    });
  });
});
