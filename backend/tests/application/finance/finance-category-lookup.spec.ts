import {
  buildFinanceCategoryLookup,
  resolveLineCategory,
} from 'src/application/finance/finance-category-lookup';

/**
 * 类别查找表（2026-11-19 报表改用类别字典）。
 *
 * 关键口径：合并后的源类别是 `isActive=false` + `mergedIntoId=目标`。
 * 历史数据、或未来某条漏网的合并路径，按 code 找类别时必须继续跟到目标，
 * 否则自动来源（采购行/快递/手续费）会挂在一个已停用、且被合并掉的类别上，
 * 等于合并没生效。
 */

describe('buildFinanceCategoryLookup.byCode', () => {
  it('命中的类别已停用且 mergedIntoId 非空时，跟到目标类别', () => {
    const lookup = buildFinanceCategoryLookup([
      {
        id: 'cat-TOOLS',
        name: '工具',
        code: 'TOOLS',
        isActive: false,
        mergedIntoId: 'cat-EQUIPMENT',
      },
      {
        id: 'cat-EQUIPMENT',
        name: '设备工具',
        code: 'EQUIPMENT',
        isActive: true,
        mergedIntoId: null,
      },
    ]);

    expect(lookup.byCode.get('TOOLS')).toMatchObject({
      id: 'cat-EQUIPMENT',
      name: '设备工具',
    });
    // 明细行按 code 解析时也落在目标类别上
    expect(resolveLineCategory({ categoryCode: 'TOOLS' }, lookup)).toEqual({
      categoryId: 'cat-EQUIPMENT',
      label: '设备工具',
    });
  });

  it('多级合并一路跟到最终启用类别，环状数据不会死循环', () => {
    const lookup = buildFinanceCategoryLookup([
      {
        id: 'a',
        name: '工具',
        code: 'TOOLS',
        isActive: false,
        mergedIntoId: 'b',
      },
      {
        id: 'b',
        name: '工具旧名',
        code: null,
        isActive: false,
        mergedIntoId: 'c',
      },
      { id: 'c', name: '设备', code: null, isActive: true },
      // 坏数据：合并成环
      {
        id: 'x',
        name: '杂物',
        code: 'SUNDRIES',
        isActive: false,
        mergedIntoId: 'y',
      },
      {
        id: 'y',
        name: '杂物旧名',
        code: null,
        isActive: false,
        mergedIntoId: 'x',
      },
    ]);

    expect(lookup.byCode.get('TOOLS')).toMatchObject({ id: 'c', name: '设备' });
    // 环状数据停在能在环上找到的最后一个，不抛也不死循环
    expect(lookup.byCode.get('SUNDRIES')).toBeDefined();
  });

  it('未合并的启用类别原样返回', () => {
    const lookup = buildFinanceCategoryLookup([
      {
        id: 'cat-RENT',
        name: '房租',
        code: 'RENT',
        isActive: true,
        mergedIntoId: null,
      },
    ]);

    expect(lookup.byCode.get('RENT')).toMatchObject({
      id: 'cat-RENT',
      name: '房租',
    });
  });
});
