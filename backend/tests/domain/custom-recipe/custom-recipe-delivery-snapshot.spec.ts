import {
  DELIVERY_ITEM_CODES,
  SNAPSHOT_SCHEMA_VERSION,
  buildDeliverySnapshot,
  resolveDeliveryItems,
  type BuildSnapshotInput,
} from '../../../src/domain/custom-recipe/custom-recipe.delivery';

/**
 * 交付内容快照 · 测试（2026-10-16，批次 1.6）
 *
 * ## 为什么这组测试要写得这么细
 *
 * 快照是**给出去就收不回来**的东西：顾客手机上那一版一旦发出去，
 * 之后改结构会让老交付渲染不出来。所以：
 *
 *   · 结构必须**逐字段**锁死（漏一个字段 = 某类交付会显示空白）
 *   · 缺失值必须是 `null` 而不是 `0`（`0 g` 会让顾客以为"这道食谱不含脂肪"）
 *   · 交付物清单必须同时看**配置**与**实际有没有内容**
 */

function input(overrides: Partial<BuildSnapshotInput> = {}): BuildSnapshotInput {
  return {
    recipe: {
      recipeId: 'RP20261016-001',
      name: '豆豆的减重维持食谱',
      coverImageUrl: 'https://example.com/cover.jpg',
      internalId: 'r-uuid-1',
      items: [
        { name: '鸡胸肉', weightG: 320, ratioPercent: 32, preparation: '切丁煮熟' },
        { name: '糙米', weightG: 180, ratioPercent: 18 },
      ],
    },
    feeding: {
      dailyIntakeG: 260,
      mealsPerDay: 2,
      perMealG: 130,
      cycleDays: 14,
    },
    nutrition: {
      standard: 'FEDIAF_2025',
      energyDensityKcalPerKg: 3620,
      /*
       * 2026-10-18：删掉 `plainConclusion`（需求 2.4.3 明确要求从快照类型删）。
       * 它在数据库里根本没有对应字段，交付时也从未传过值 —— 是个**死字段**。
       * 合并后的那句话写在 `sellingPoint` 里。
       */
    },
    shopping: {
      // 2026-10-18 · 需求 2.4.3：采购量与损耗不再进快照，输入里也就不给了
      lines: [
        { name: '鸡胸肉', netG: 320 },
        { name: '糙米', netG: 180 },
      ],
    },
    supplements: [
      { name: '鱼油', totalG: 14, perKgG: 3.1, brand: '某某牌', timing: '出锅前' },
    ],
    steps: ['鸡胸肉切丁，冷水下锅煮 12 分钟', '糙米提前浸泡 2 小时'],
    storage: '分装冷冻，7 天内吃完',
    now: new Date('2026-10-16T10:00:00+08:00'),
    ...overrides,
  };
}

describe('交付内容快照', () => {
  describe('结构', () => {
    it('★ 逐字段锁死结构（漏字段 = 某类交付会显示空白）', () => {
      const snapshot = buildDeliverySnapshot(input());

      expect(Object.keys(snapshot).sort()).toEqual(
        [
          'schemaVersion',
          'recipe',
          'feeding',
          'nutrition',
          'shopping',
          'supplements',
          'steps',
          'storage',
          'generatedAt',
        ].sort(),
      );

      // 2026-10-18 新增 sellingPoint（封面下方那句话）与 dog（封面叠的狗信息）
      expect(Object.keys(snapshot.recipe).sort()).toEqual(
        [
          'recipeId',
          'name',
          'coverImageUrl',
          'internalId',
          'sellingPoint',
          'dog',
          'items',
        ].sort(),
      );
      expect(Object.keys(snapshot.feeding).sort()).toEqual(
        ['dailyIntakeG', 'mealsPerDay', 'perMealG', 'cycleDays'].sort(),
      );
      expect(Object.keys(snapshot.nutrition).sort()).toEqual(
        [
          'standard',
          'energyDensityKcalPerKg',
          'macros',
        ].sort(),
      );
      expect(Object.keys(snapshot.shopping).sort()).toEqual(
        // 2026-10-18 · 需求 2.4.3：采购量与损耗已从快照删除
        ['lines', 'totalNetG'].sort(),
      );
    });

    it('带上结构版本号 —— 将来改结构时老快照还能按老版本渲染', () => {
      const snapshot = buildDeliverySnapshot(input());
      expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
      expect(SNAPSHOT_SCHEMA_VERSION).toBe(1);
    });

    it('generatedAt 是可注入的（便于测试与回填时用真实交付时间）', () => {
      const snapshot = buildDeliverySnapshot(input());
      expect(snapshot.generatedAt).toBe(
        new Date('2026-10-16T10:00:00+08:00').toISOString(),
      );
    });
  });

  describe('★ 缺失值必须是 null，不是 0', () => {
    it('没填喂食参数时全是 null（0 g 会让顾客以为"不用喂"）', () => {
      const snapshot = buildDeliverySnapshot(
        input({ feeding: null, nutrition: null, shopping: null }),
      );

      expect(snapshot.feeding).toEqual({
        dailyIntakeG: null,
        mealsPerDay: null,
        perMealG: null,
        cycleDays: null,
      });
      expect(snapshot.nutrition.energyDensityKcalPerKg).toBeNull();
      expect(snapshot.nutrition.standard).toBeNull();
    });

    it('NaN / Infinity / 非数字一律变成 null（不能漏给前端）', () => {
      const snapshot = buildDeliverySnapshot(
        input({
          feeding: {
            dailyIntakeG: Number.NaN,
            mealsPerDay: Number.POSITIVE_INFINITY,
            perMealG: 'abc' as unknown as number,
            cycleDays: 2,
          },
        }),
      );

      expect(snapshot.feeding.dailyIntakeG).toBeNull();
      expect(snapshot.feeding.mealsPerDay).toBeNull();
      expect(snapshot.feeding.perMealG).toBeNull();
      expect(snapshot.feeding.cycleDays).toBe(2);
    });

    it('没有食材明细时 items 是空数组，不是 undefined', () => {
      const snapshot = buildDeliverySnapshot(
        input({ recipe: { recipeId: 'R1', name: '测试', items: [] } }),
      );
      expect(snapshot.recipe.items).toEqual([]);
      expect(snapshot.recipe.coverImageUrl).toBeNull();
      expect(snapshot.recipe.internalId).toBeNull();
    });

    it('没有步骤时是空数组（前端不用判 undefined）', () => {
      const snapshot = buildDeliverySnapshot(
        input({ steps: null, supplements: null }),
      );
      expect(snapshot.steps).toEqual([]);
      expect(snapshot.supplements).toEqual([]);
    });
  });

  describe('采购清单的合计', () => {
    it('合计 = 各行相加，保留 1 位小数', () => {
      const snapshot = buildDeliverySnapshot(
        input({
          shopping: {
            lines: [
              { name: 'A', netG: 100.15 },
              { name: 'B', netG: 200.27 },
            ],
          },
        }),
      );

      expect(snapshot.shopping.lines[0].netG).toBe(100.2);
      /**
       * 合计是**各行取整后相加**：100.2 + 200.3 = 300.5。
       *
       * （我第一版把这里写成了 300.4 —— 是我自己心算错了，不是代码错。
       *   留着这段备注是因为"期望值算错"比"代码算错"更常见，
       *   看到测试红了先怀疑期望值。）
       */
      expect(snapshot.shopping.totalNetG).toBe(300.5);
    });

    it('没有明细时合计是 0（这里 0 是对的：确实一样都不用买）', () => {
      const snapshot = buildDeliverySnapshot(
        input({ shopping: { lines: [] } }),
      );
      expect(snapshot.shopping.totalNetG).toBe(0);
    });

    /**
     * ⚠️ 2026-10-18：这条用例删掉了。
     *
     * 它锁的是「没有损耗率时快照里记 1，而不是偷偷用 1.07」——
     * 但需求 2.4.3 已把 `lossRate` **从快照里删了**（交付页不再展示采购量，
     * 损耗率也就没有消费方了）。
     *
     * 那条业务判断（"没有依据时不要凭空加 7%"）**没有消失**，
     * 它现在落在 `custom-recipe.shopping.ts` 的 `lossRateToRatio` 里 ——
     * 那才是真正算净用量/采购量的地方，快照只是把结果记下来。
     */
  });

  describe('补充剂', () => {
    it('保留品牌与添加时机；数值缺失给 null', () => {
      const snapshot = buildDeliverySnapshot(
        input({
          supplements: [
            { name: '鱼油', totalG: 14, perKgG: 3.1, brand: '某某牌', timing: '出锅前' },
            { name: '钙粉', totalG: null },
          ],
        }),
      );

      expect(snapshot.supplements[0]).toMatchObject({
        name: '鱼油',
        totalG: 14,
        perKgG: 3.1,
        brand: '某某牌',
        timing: '出锅前',
      });
      expect(snapshot.supplements[1].totalG).toBeNull();
      expect(snapshot.supplements[1].perKgG).toBeNull();
    });
  });
});

describe('交付物清单', () => {
  const allAvailable = {
    hasRecipe: true,
    hasShoppingSop: true,
    hasNutritionReport: true,
  };

  it('配置里开了、内容也有 → 三样都出现', () => {
    const items = resolveDeliveryItems(
      [
        DELIVERY_ITEM_CODES.RECIPE,
        DELIVERY_ITEM_CODES.SHOPPING_SOP,
        DELIVERY_ITEM_CODES.NUTRITION_REPORT,
      ],
      allAvailable,
    );

    expect(items.map((item) => item.code)).toEqual([
      'RECIPE',
      'SHOPPING_SOP',
      'NUTRITION_REPORT',
    ]);
    for (const item of items) {
      expect(item.label).toBeTruthy();
      expect(item.available).toBe(true);
    }
  });

  it('★ 配置里开了、但这一版**没有内容** → 不出现（点开是空白比不显示更糟）', () => {
    const items = resolveDeliveryItems(
      [
        DELIVERY_ITEM_CODES.RECIPE,
        DELIVERY_ITEM_CODES.SHOPPING_SOP,
        DELIVERY_ITEM_CODES.NUTRITION_REPORT,
      ],
      {
        hasRecipe: true,
        hasShoppingSop: false, // 没有食材明细
        hasNutritionReport: false, // 还没跑营养评估
      },
    );

    expect(items.map((item) => item.code)).toEqual(['RECIPE']);
  });

  it('配置里关了、内容有 → 也不出现（配置是老板的开关）', () => {
    const items = resolveDeliveryItems(
      [DELIVERY_ITEM_CODES.RECIPE],
      allAvailable,
    );

    expect(items.map((item) => item.code)).toEqual(['RECIPE']);
  });

  it('配置为空 → 一样都不交付（后台配错时不该硬塞）', () => {
    expect(resolveDeliveryItems([], allAvailable)).toEqual([]);
  });

  it('配置里是未知的码 → 忽略，不崩', () => {
    const items = resolveDeliveryItems(
      ['SOMETHING_NEW', DELIVERY_ITEM_CODES.RECIPE],
      allAvailable,
    );
    expect(items.map((item) => item.code)).toEqual(['RECIPE']);
  });

  it('顺序稳定（食谱 → 采购单 → 报告），不随配置顺序乱跳', () => {
    const ordered = resolveDeliveryItems(
      [
        DELIVERY_ITEM_CODES.NUTRITION_REPORT,
        DELIVERY_ITEM_CODES.SHOPPING_SOP,
        DELIVERY_ITEM_CODES.RECIPE,
      ],
      allAvailable,
    );
    expect(ordered.map((item) => item.code)).toEqual([
      'RECIPE',
      'SHOPPING_SOP',
      'NUTRITION_REPORT',
    ]);
  });
});
