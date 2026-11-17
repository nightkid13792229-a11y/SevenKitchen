import {
  isMergedRecipeId,
  resolveMergedRecipeId,
} from '../../../src/domain/recipe/merged-recipe-id-alias';

/**
 * 2026-11-17 合并了 5 组重复食谱编号，库里旧行已删除。
 * 旧分享链接 / 缓存页面还带着旧编号，入口处必须换成正式编号，否则整页 404。
 */
describe('已合并食谱编号的别名', () => {
  it('5 个旧编号都能换到正式编号', () => {
    const expected: Array<[string, string]> = [
      [
        '0644e096-2074-4c67-8764-a7e8580023fd',
        '30f83406-d2e9-44f7-aebf-7d5c438c72d8',
      ],
      [
        '99184a28-a297-4279-b7df-138fcc3826e3',
        '403c4d60-51a5-4f51-80e8-2e6471dc553d',
      ],
      [
        '0d049e33-a450-4300-b2fe-439089cdecef',
        'ce128379-de56-4416-99e1-1e48dd5a1956',
      ],
      [
        '1d802350-3bcb-4c42-b40f-38185e539d52',
        '0fdc6d24-fddc-4ec6-9790-3e05f724587b',
      ],
      [
        'a149634a-ead1-4a25-98ea-ee2b423b3175',
        '1bd86ee4-fef9-40a5-8c5f-dd867eab5c56',
      ],
    ];

    for (const [oldId, newId] of expected) {
      expect(resolveMergedRecipeId(oldId)).toBe(newId);
      expect(isMergedRecipeId(oldId)).toBe(true);
    }
  });

  it('正式编号、其它编号、空值都原样返回', () => {
    const currentId = 'ce128379-de56-4416-99e1-1e48dd5a1956';
    expect(resolveMergedRecipeId(currentId)).toBe(currentId);
    expect(resolveMergedRecipeId('some-other-recipe')).toBe('some-other-recipe');
    expect(resolveMergedRecipeId('')).toBe('');
    expect(isMergedRecipeId(currentId)).toBe(false);
  });

  it('别名不会再指向另一个别名（没有链式跳转）', () => {
    const mergedOldIds = [
      '0644e096-2074-4c67-8764-a7e8580023fd',
      '99184a28-a297-4279-b7df-138fcc3826e3',
      '0d049e33-a450-4300-b2fe-439089cdecef',
      '1d802350-3bcb-4c42-b40f-38185e539d52',
      'a149634a-ead1-4a25-98ea-ee2b423b3175',
    ];
    for (const oldId of mergedOldIds) {
      const target = resolveMergedRecipeId(oldId);
      expect(isMergedRecipeId(target)).toBe(false);
      expect(resolveMergedRecipeId(target)).toBe(target);
    }
  });

  it('允许前后空白（URL 里粘进来的编号）', () => {
    expect(
      resolveMergedRecipeId(' 0d049e33-a450-4300-b2fe-439089cdecef '),
    ).toBe('ce128379-de56-4416-99e1-1e48dd5a1956');
  });
});
