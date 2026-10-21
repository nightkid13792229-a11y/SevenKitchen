import {
  buildDogDesignInsight,
  buildDogHistoryRecipes,
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
  it('把已完成鲜食订单的食谱快照映射成历史记录', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: {
            id: 'recipe-1',
            version: 2,
            name: '鸡肉南瓜鲜食',
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
      },
      {
        id: 'oi-2',
        name: '鸭肉紫薯鲜食',
        kind: 'FINISHED',
        date: '2026-08-05T00:00:00.000Z',
        status: 'SHIPPED',
      },
    ]);
    // 不把快照里的食材明细带出来
    expect(JSON.stringify(result)).not.toContain('鸡胸肉');
    expect(JSON.stringify(result)).not.toContain('items');
  });

  it('把关联了正式食谱的定制单映射成历史记录，优先用交付时间', () => {
    const result = buildDogHistoryRecipes(
      [],
      [
        {
          id: 'cro-1',
          status: 'DELIVERED',
          createdAt: '2026-10-01T00:00:00.000Z',
          deliveredAt: '2026-10-05T00:00:00.000Z',
          recipe: { id: 'recipe-9', name: '定制鲜食 A' },
        },
        {
          id: 'cro-2',
          status: 'COMPLETED',
          createdAt: '2026-09-20T00:00:00.000Z',
          deliveredAt: null,
          recipe: { id: 'recipe-10', name: '定制鲜食 B' },
        },
      ],
    );

    expect(result).toEqual([
      {
        id: 'recipe-9',
        name: '定制鲜食 A',
        kind: 'CUSTOM',
        date: '2026-10-05T00:00:00.000Z',
        status: 'DELIVERED',
      },
      {
        id: 'recipe-10',
        name: '定制鲜食 B',
        kind: 'CUSTOM',
        date: '2026-09-20T00:00:00.000Z',
        status: 'COMPLETED',
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
          status: 'DELIVERED',
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

  it('同一份食谱（按身份或名字）只保留最近一次使用，且鲜食与定制分开去重', () => {
    const result = buildDogHistoryRecipes(
      [
        {
          id: 'oi-1',
          recipeSnapshot: { id: 'recipe-1', name: '鸡肉鲜食' },
          order: {
            status: 'COMPLETED',
            paidAt: '2026-08-01T00:00:00.000Z',
            createdAt: '2026-08-01T00:00:00.000Z',
          },
        },
        {
          id: 'oi-2',
          recipeSnapshot: { id: 'recipe-1', version: 3, name: '鸡肉鲜食' },
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
          recipe: { id: 'recipe-1', name: '鸡肉鲜食' },
        },
        {
          id: 'cro-2',
          status: 'COMPLETED',
          createdAt: '2026-10-01T00:00:00.000Z',
          recipe: { id: 'recipe-1', name: '鸡肉鲜食' },
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
      },
      {
        id: 'recipe-1',
        name: '鸡肉鲜食',
        kind: 'FINISHED',
        date: '2026-09-15T00:00:00.000Z',
        status: 'SHIPPED',
      },
      {
        id: 'oi-4',
        name: '鸭肉鲜食',
        kind: 'FINISHED',
        date: '2026-07-20T00:00:00.000Z',
        status: 'COMPLETED',
      },
    ]);
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
      },
      {
        id: 'recipe-1',
        name: '鸡肉鲜食',
        kind: 'FINISHED',
        date: '2026-09-01T00:00:00.000Z',
        status: 'COMPLETED',
      },
    ]);
  });
});
