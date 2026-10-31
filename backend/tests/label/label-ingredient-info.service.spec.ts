import { LabelIngredientInfoService } from '../../src/application/ingredient/label-ingredient-info.service';

/**
 * 打印标签时按原料 ID 回查标签字段。
 *
 * 这层是「老订单快照没有分类」的兜底：快照冻结在下单那一刻，
 * 2026-10-30 之前下的单里根本没有 label_category，靠这里取主数据。
 */

function buildService(rows: any[] | null) {
  const findMany = jest.fn().mockResolvedValue(rows ?? []);
  const prisma = { ingredient: { findMany } } as any;
  return { service: new LabelIngredientInfoService(prisma), findMany };
}

describe('LabelIngredientInfoService', () => {
  it('回查原料主数据里的标签分类与规范名称', async () => {
    const { service, findMany } = buildService([
      {
        id: 'ing-1',
        name: '葡萄糖酸锌片',
        type: 'SUPPLEMENT',
        properties: {
          label_category: 'FEED_ADDITIVE',
          label_names: ['葡萄糖酸锌', ' 葡萄糖酸锌 '],
        },
      },
      {
        id: 'ing-2',
        name: '海藻粉',
        type: 'SUPPLEMENT',
        properties: { label_category: 'FEED_MATERIAL', label_names: ['海藻粉'] },
      },
      {
        id: 'ing-3',
        name: '鸡胸',
        type: 'FOOD',
        properties: {},
      },
    ]);

    const items = await service.getByIngredientIds(['ing-1', 'ing-2', 'ing-3']);

    expect(items).toEqual([
      {
        id: 'ing-1',
        name: '葡萄糖酸锌片',
        type: 'SUPPLEMENT',
        labelCategory: 'FEED_ADDITIVE',
        labelNames: ['葡萄糖酸锌', '葡萄糖酸锌'],
      },
      {
        id: 'ing-2',
        name: '海藻粉',
        type: 'SUPPLEMENT',
        labelCategory: 'FEED_MATERIAL',
        labelNames: ['海藻粉'],
      },
      {
        id: 'ing-3',
        name: '鸡胸',
        type: 'FOOD',
        labelCategory: null,
        labelNames: [],
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['ing-1', 'ing-2', 'ing-3'] } },
      select: { id: true, name: true, type: true, properties: true },
    });
  });

  it('去重、去空、并且不把非法分类当成分组依据', async () => {
    const { service, findMany } = buildService([]);

    await service.getByIngredientIds([' a ', 'a', '', 'b']);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['a', 'b'] } } }),
    );
  });

  it('分类字段乱写时按“未分类”返回，交给打印前拦截处理', async () => {
    const { service } = buildService([
      {
        id: 'ing-1',
        name: '某某粉',
        type: 'FOOD',
        properties: { label_category: 'SOMETHING_ELSE', label_names: '不是数组' },
      },
    ]);

    const [item] = await service.getByIngredientIds(['ing-1']);

    expect(item.labelCategory).toBeNull();
    expect(item.labelNames).toEqual([]);
  });

  it('没有原料 ID 时不查库', async () => {
    const { service, findMany } = buildService([]);

    await expect(service.getByIngredientIds([])).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('本地没启用 Prisma 时返回空，不抛错', async () => {
    const service = new LabelIngredientInfoService(undefined);

    await expect(service.getByIngredientIds(['a'])).resolves.toEqual([]);
  });
});
