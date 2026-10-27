import {
  buildDogDesignInsight,
  buildDogHistoryRecipes,
  buildSameOrderHistoryRecipes,
} from '../../../src/domain/recipe-designer/dog-design-insight';

/**
 * 设计器要看到这只狗「到底吃过哪些食谱」（2026-10-22）。
 *
 * 线索有两个来源：
 *  - 已完成的鲜食订单明细（OrderItem.recipeSnapshot 里的食谱名）；
 *  - 已经关联了正式食谱（Recipe）的定制单。
 * 已取消订单不算“用过”，空名字不展示；同一份食谱多次出现只保留最近一次。
 */
describe('DogDesignInsight · 历史食谱清单', () => {
  it('把已完成鲜食订单的食谱快照映射成历史记录，并归一化营养明细', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: {
            id: 'recipe-1',
            version: 2,
            name: '鸡肉南瓜鲜食',
            nutrition_detailed_data: {
              report: {
                ingredientRows: [
                  { ingredientName: ' 鸡胸肉 ', amountLabel: ' 120g ' },
                  { ingredientName: '南瓜', amountLabel: '80g' },
                ],
                macroRows: [
                  {
                    name: ' 蛋白质 ',
                    dryMatterLabel: ' 52.3% ',
                    energyPercentLabel: '38.1%',
                    weightPercentLabel: '12.4%',
                  },
                ],
              },
            },
            items: [{ ingredient_id: 'ing-1', name: '鸡胸肉' }],
          },
          order: {
            status: 'COMPLETED',
            createdAt: '2026-09-01T02:00:00.000Z',
            paidAt: '2026-09-01T01:00:00.000Z',
          },
        },
        {
          id: 'oi-2',
          // 老快照可能只有标题、没有 id
          recipeSnapshot: { recipeTitle: '鸭肉紫薯鲜食' },
          order: {
            status: 'SHIPPED',
            createdAt: '2026-08-05T00:00:00.000Z',
          },
        },
      ],
      [],
    );

    expect(result).toEqual([
      {
        id: 'recipe-1',
        name: '鸡肉南瓜鲜食',
        kind: 'FINISHED',
        date: '2026-09-01T01:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [
          { name: '鸡胸肉', amount: '120g' },
          { name: '南瓜', amount: '80g' },
        ],
        macros: [
          {
            name: '蛋白质',
            dryMatter: '52.3%',
            energyPercent: '38.1%',
            weightPercent: '12.4%',
          },
        ],
      },
      {
        id: 'oi-2',
        name: '鸭肉紫薯鲜食',
        kind: 'FINISHED',
        date: '2026-08-05T00:00:00.000Z',
        status: 'SHIPPED',
        ingredients: [],
        macros: [],
      },
    ]);
    // 只返回归一化明细，不把快照/营养报告的原始结构带出来
    expect(JSON.stringify(result)).not.toContain('nutrition_detailed_data');
    expect(JSON.stringify(result)).not.toContain('ingredientRows');
    expect(JSON.stringify(result)).not.toContain('macroRows');
    expect(JSON.stringify(result)).not.toContain('example_weight');
    expect(JSON.stringify(result)).not.toContain('recipeSnapshot');
    expect(Object.keys(result[0]).sort()).toEqual([
      'date',
      'id',
      'ingredients',
      'kind',
      'macros',
      'name',
      'status',
    ]);
  });

  it('营养报告缺失时，鲜食明细回退到快照 items 并带示例重量', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: {
            id: 'recipe-1',
            name: '牛肉鲜食',
            items: [
              { ingredient_id: 'ing-1', name: '牛肉', example_weight: 150 },
              { ingredient_id: 'ing-2', name: '南瓜' },
            ],
          },
          order: { status: 'COMPLETED', createdAt: '2026-09-01T00:00:00.000Z' },
        },
      ],
      [],
    );

    expect(result[0].ingredients).toEqual([
      { name: '牛肉', amount: '150g' },
      { name: '南瓜', amount: '' },
    ]);
    // 宏量没有其它数据源，缺失就是空数组
    expect(result[0].macros).toEqual([]);
  });

  it('把关联了正式食谱的定制单映射成历史记录，优先用交付时间', () => {
    const result = buildDogHistoryRecipes(
      [],
      [
        {
          id: 'cro-1',
          // 2026-10-28：只有「已完成」的定制单进历史
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          deliveredAt: '2026-10-05T00:00:00.000Z',
          recipe: {
            id: 'recipe-9',
            name: '定制鲜食 A',
            nutritionDetailedData: {
              report: {
                ingredientRows: [
                  { ingredientName: '鸭肉', amountLabel: '100g' },
                ],
                macroRows: [
                  {
                    name: '脂肪',
                    dryMatterLabel: '24.0%',
                    energyPercentLabel: '41.5%',
                    weightPercentLabel: '8.2%',
                  },
                ],
              },
            },
            items: [{ exampleWeight: 100, ingredient: { name: '鸭肉' } }],
          },
        },
        {
          id: 'cro-2',
          status: 'COMPLETED',
          createdAt: '2026-09-20T00:00:00.000Z',
          deliveredAt: null,
          recipe: {
            id: 'recipe-10',
            name: '定制鲜食 B',
            // 无营养报告时回退食谱项
            nutritionDetailedData: null,
            items: [
              { exampleWeight: 90, ingredient: { name: ' 火鸡肉 ' } },
              { exampleWeight: null, ingredient: { name: '红薯' } },
            ],
          },
        },
      ],
    );

    expect(result).toEqual([
      {
        id: 'recipe-9',
        name: '定制鲜食 A',
        kind: 'CUSTOM',
        date: '2026-10-05T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [{ name: '鸭肉', amount: '100g' }],
        macros: [
          {
            name: '脂肪',
            dryMatter: '24.0%',
            energyPercent: '41.5%',
            weightPercent: '8.2%',
          },
        ],
      },
      {
        id: 'recipe-10',
        name: '定制鲜食 B',
        kind: 'CUSTOM',
        date: '2026-09-20T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [
          { name: '火鸡肉', amount: '90g' },
          { name: '红薯', amount: '' },
        ],
        macros: [],
      },
    ]);
  });

  it('排除已取消订单、未关联食谱的定制单与空名字', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-cancelled',
          recipeSnapshot: { id: 'recipe-x', name: '被取消的鲜食' },
          order: { status: 'CANCELLED', createdAt: '2026-09-10T00:00:00.000Z' },
        },
        {
          id: 'oi-empty',
          recipeSnapshot: { id: 'recipe-empty', name: '   ' },
          order: { status: 'COMPLETED', createdAt: '2026-09-10T00:00:00.000Z' },
        },
        {
          id: 'oi-null',
          recipeSnapshot: null,
          order: { status: 'COMPLETED', createdAt: '2026-09-10T00:00:00.000Z' },
        },
      ],
      [
        {
          id: 'cro-cancelled',
          status: 'CANCELLED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: { id: 'recipe-y', name: '被取消的定制' },
        },
        {
          id: 'cro-no-recipe',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: null,
        },
        {
          id: 'cro-empty',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: { id: 'recipe-z', name: '' },
        },
      ],
    );

    expect(result).toEqual([]);
  });

  it('按日期倒序排列，没有日期的排在最后', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: { id: 'recipe-1', name: '较新的鲜食' },
          order: { status: 'COMPLETED', createdAt: '2026-09-20T00:00:00.000Z' },
        },
        {
          id: 'oi-2',
          recipeSnapshot: { id: 'recipe-2', name: '较旧的鲜食' },
          order: { status: 'COMPLETED', createdAt: '2026-08-01T00:00:00.000Z' },
        },
        {
          id: 'oi-3',
          recipeSnapshot: { id: 'recipe-3', name: '没有日期的鲜食' },
          order: { status: 'PAID' },
        },
      ],
      [
        {
          id: 'cro-1',
          // 只有完成的定制单进历史（2026-10-28）
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: { id: 'recipe-4', name: '最新的定制' },
        },
      ],
    );

    expect(result.map((row) => row.name)).toEqual([
      '最新的定制',
      '较新的鲜食',
      '较旧的鲜食',
      '没有日期的鲜食',
    ]);
    expect(result[result.length - 1].date).toBeNull();
  });

  it('同一份食谱（按身份或名字）只保留最近一次使用，明细跟随保留的那一次', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: {
            id: 'recipe-1',
            name: '鸡肉鲜食',
            nutrition_detailed_data: {
              report: {
                ingredientRows: [
                  { ingredientName: '旧配方鸡肉', amountLabel: '100g' },
                ],
                macroRows: [
                  {
                    name: '蛋白质',
                    dryMatterLabel: '50.0%',
                    energyPercentLabel: '40.0%',
                    weightPercentLabel: '10.0%',
                  },
                ],
              },
            },
          },
          order: {
            status: 'COMPLETED',
            paidAt: '2026-08-01T00:00:00.000Z',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        },
        {
          id: 'oi-2',
          recipeSnapshot: {
            id: 'recipe-1',
            version: 3,
            name: '鸡肉鲜食',
            nutrition_detailed_data: {
              report: {
                ingredientRows: [
                  { ingredientName: '新配方鸡肉', amountLabel: '120g' },
                ],
                macroRows: [
                  {
                    name: '蛋白质',
                    dryMatterLabel: '55.0%',
                    energyPercentLabel: '42.0%',
                    weightPercentLabel: '11.0%',
                  },
                ],
              },
            },
          },
          order: {
            status: 'SHIPPED',
            paidAt: '2026-09-15T00:00:00.000Z',
            createdAt: '2026-09-15T00:00:00.000Z',
          },
        },
        {
          id: 'oi-3',
          recipeSnapshot: { recipeTitle: '鸭肉鲜食' },
          order: {
            status: 'COMPLETED',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        },
        {
          id: 'oi-4',
          recipeSnapshot: { recipeName: '鸭肉鲜食' },
          order: {
            status: 'COMPLETED',
            createdAt: '2026-07-20T00:00:00.000Z',
          },
        },
      ],
      [
        {
          id: 'cro-1',
          status: 'DELIVERED',
          createdAt: '2026-09-01T00:00:00.000Z',
          recipe: {
            id: 'recipe-1',
            name: '鸡肉鲜食',
            items: [{ exampleWeight: 80, ingredient: { name: '旧定制鸡肉' } }],
          },
        },
        {
          id: 'cro-2',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: {
            id: 'recipe-1',
            name: '鸡肉鲜食',
            items: [
              { exampleWeight: 130, ingredient: { name: '新定制鸡肉' } },
            ],
          },
        },
      ],
    );

    expect(result).toEqual([
      {
        id: 'recipe-1',
        name: '鸡肉鲜食',
        kind: 'CUSTOM',
        date: '2026-10-01T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [{ name: '新定制鸡肉', amount: '130g' }],
        macros: [],
      },
      {
        id: 'recipe-1',
        name: '鸡肉鲜食',
        kind: 'FINISHED',
        date: '2026-09-15T00:00:00.000Z',
        status: 'SHIPPED',
        ingredients: [{ name: '新配方鸡肉', amount: '120g' }],
        macros: [
          {
            name: '蛋白质',
            dryMatter: '55.0%',
            energyPercent: '42.0%',
            weightPercent: '11.0%',
          },
        ],
      },
      {
        id: 'oi-4',
        name: '鸭肉鲜食',
        kind: 'FINISHED',
        date: '2026-07-20T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [],
        macros: [],
      },
    ]);
  });

  /**
   * 2026-10-28：私密 Recipe 行是活行（改名、重新生成快照都会就地覆盖它），
   * 历史必须读**交付快照**，否则「历史里写着鸭肉、点开原料还是兔里脊」。
   */
  it('★ 定制单优先用交付快照的名字 / 原料 / 宏量，而不是被改过的活行', () => {
    const [entry] = buildDogHistoryRecipes(
      [],
      [
        {
          id: 'cro-1',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          deliveredAt: '2026-10-02T00:00:00.000Z',
          // 活行：改名 + 换原料之后的样子
          recipe: {
            id: 'recipe-2',
            name: '鸭肉高蛋白定制餐',
            items: [
              { exampleWeight: 150, ingredient: { name: '鸭胸' } },
            ],
          },
          // 交付快照：交付那一刻的真实内容
          deliveredSnapshot: {
            recipe: {
              name: '兔肉高蛋白定制餐',
              items: [
                { name: '兔里脊', weightG: 155 },
                { name: '燕麦', weightG: 10 },
              ],
            },
            nutrition: {
              reportRows: [
                {
                  key: 'crudeProtein',
                  name: '蛋白质',
                  dryMatterLabel: '52.85%',
                  energyPercentLabel: '43.23%',
                  weightPercentLabel: '14.21%',
                },
              ],
            },
          },
        },
      ],
    );

    expect(entry.name).toBe('兔肉高蛋白定制餐');
    expect(entry.ingredients).toEqual([
      { name: '兔里脊', amount: '155g' },
      { name: '燕麦', amount: '10g' },
    ]);
    expect(entry.macros).toEqual([
      {
        name: '蛋白质',
        dryMatter: '52.85%',
        energyPercent: '43.23%',
        weightPercent: '14.21%',
      },
    ]);
  });

  /**
   * 老板 2026-10-28 口径：交付 ≠ 吃过。
   * 顾客不认可、正在改的那份可能连一顿都没做过，不能算「历史」。
   */
  it('★ 只交付、还没完成的定制单不算历史（正在调整的那一份）', () => {
    const result = buildDogHistoryRecipes(
      [],
      [
        {
          id: 'cro-delivered',
          status: 'DELIVERED',
          createdAt: '2026-10-27T15:00:00.000Z',
          deliveredAt: '2026-10-27T15:15:00.000Z',
          recipe: { id: 'recipe-rabbit', name: '兔肉高蛋白定制餐' },
        },
        {
          id: 'cro-completed',
          status: 'COMPLETED',
          createdAt: '2026-09-01T00:00:00.000Z',
          deliveredAt: '2026-09-02T00:00:00.000Z',
          recipe: { id: 'recipe-old', name: '以前在用的一份' },
        },
      ],
    );

    expect(result.map((row) => row.name)).toEqual(['以前在用的一份']);
  });

  it('没有任何历史时返回空数组', () => {
    expect(buildDogHistoryRecipes([], [])).toEqual([]);
    expect(buildDogHistoryRecipes()).toEqual([]);
  });

  it('在设计洞察的顶层输出 historyRecipes', () => {
    const insight = buildDogDesignInsight({
      dog: { id: 'dog-1', name: '旺财' },
      seriesList: [],
      orderItems: [
        {
          id: 'oi-1',
          recipeSnapshot: { id: 'recipe-1', name: '鸡肉鲜食' },
          order: { status: 'COMPLETED', createdAt: '2026-09-01T00:00:00.000Z' },
        },
      ],
      customRecipeOrders: [
        {
          id: 'cro-1',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: { id: 'recipe-2', name: '定制鲜食' },
        },
      ],
      lifeStageLabel: '成犬期',
    });

    expect(insight.historyRecipes).toEqual([
      {
        id: 'recipe-2',
        name: '定制鲜食',
        kind: 'CUSTOM',
        date: '2026-10-01T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [],
        macros: [],
      },
      {
        id: 'recipe-1',
        name: '鸡肉鲜食',
        kind: 'FINISHED',
        date: '2026-09-01T00:00:00.000Z',
        status: 'COMPLETED',
        ingredients: [],
        macros: [],
      },
    ]);
  });
});

describe('DogDesignInsight · 本单其他食谱（2026-10-22）', () => {
  it('READY 用私密食谱营养报告，EDITING 回退到草稿原料', () => {
    const result = buildSameOrderHistoryRecipes([
      {
        id: 'slot-ready',
        name: 'Foxy定制 · 第一份',
        status: 'READY',
        updatedAt: '2026-10-22T03:00:00.000Z',
        recipe: {
          name: 'Foxy定制 · 第一份',
          nutritionDetailedData: {
            report: {
              ingredientRows: [{ ingredientName: '鸡胸肉', amountLabel: '120g' }],
              macroRows: [
                {
                  name: '粗蛋白',
                  dryMatterLabel: '52.3%',
                  energyPercentLabel: '38.1%',
                  weightPercentLabel: '12.4%',
                },
              ],
            },
          },
          items: [{ exampleWeight: 120, ingredient: { name: '鸡胸肉' } }],
        },
        designItems: [{ name: '西兰花', weightG: 30 }],
      },
      {
        id: 'slot-editing',
        name: 'Foxy定制 · 第二份',
        status: 'EDITING',
        updatedAt: '2026-10-22T02:00:00.000Z',
        recipe: null,
        designItems: [
          { name: '火鸡胸', weightG: 100 },
          { name: '南瓜', weightG: 50 },
        ],
      },
    ]);

    expect(result).toEqual([
      {
        id: 'slot-ready',
        name: 'Foxy定制 · 第一份',
        kind: 'ORDER',
        date: '2026-10-22T03:00:00.000Z',
        status: 'READY',
        ingredients: [{ name: '鸡胸肉', amount: '120g' }],
        macros: [
          {
            name: '粗蛋白',
            dryMatter: '52.3%',
            energyPercent: '38.1%',
            weightPercent: '12.4%',
          },
        ],
      },
      {
        id: 'slot-editing',
        name: 'Foxy定制 · 第二份',
        kind: 'ORDER',
        date: '2026-10-22T02:00:00.000Z',
        status: 'EDITING',
        ingredients: [
          { name: '火鸡胸', amount: '100g' },
          { name: '南瓜', amount: '50g' },
        ],
        macros: [],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('nutritionDetailedData');
  });

  it('洞察同时返回历史食谱和本单其他食谱，互不覆盖', () => {
    const insight = buildDogDesignInsight({
      dog: { id: 'dog-1', name: 'Foxy' },
      seriesList: [],
      orderItems: [],
      lifeStageLabel: '成犬期',
      customRecipeOrders: [],
      sameOrderRecipes: [
        {
          id: 'slot-1',
          name: '本单第一份',
          status: 'READY',
          updatedAt: '2026-10-22T03:00:00.000Z',
          designItems: [{ name: '鸡胸肉', weightG: 100 }],
        },
      ],
    });

    expect(insight.historyRecipes).toEqual([]);
    expect(insight.sameOrderRecipes).toHaveLength(1);
    expect(insight.sameOrderRecipes[0]).toMatchObject({
      kind: 'ORDER',
      name: '本单第一份',
      ingredients: [{ name: '鸡胸肉', amount: '100g' }],
    });
  });
});
