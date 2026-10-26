import { hashDraftPayload } from 'src/domain/ingredient-creation/draft-payload-hash';

/**
 * 核验报告靠内容哈希判断「是否还对得上当前草稿」，所以哈希必须只由内容决定：
 * 同一份内容在任何进程、任何键顺序下都要得到同一个值；内容变一格就必须变。
 */
describe('hashDraftPayload', () => {
  it('键顺序不影响结果（含嵌套对象）', () => {
    expect(hashDraftPayload({ a: 1, b: 2 })).toBe(
      hashDraftPayload({ b: 2, a: 1 }),
    );
    expect(
      hashDraftPayload({
        ingredient: { name: '冷冻三文鱼', baseUnit: 'G' },
        intake: { name: '三文鱼', aliases: ['鲑鱼'] },
      }),
    ).toBe(
      hashDraftPayload({
        intake: { aliases: ['鲑鱼'], name: '三文鱼' },
        ingredient: { baseUnit: 'G', name: '冷冻三文鱼' },
      }),
    );
  });

  it('值变化会变哈希', () => {
    expect(hashDraftPayload({ a: 1 })).not.toBe(hashDraftPayload({ a: 2 }));
    expect(hashDraftPayload({ ingredient: { name: '冷冻三文鱼' } })).not.toBe(
      hashDraftPayload({ ingredient: { name: '冷冻三文鱼 带皮' } }),
    );
  });

  it('undefined 与缺键等价', () => {
    expect(hashDraftPayload({ a: 1, b: undefined })).toBe(
      hashDraftPayload({ a: 1 }),
    );
    expect(
      hashDraftPayload({
        ingredient: { name: '冷冻三文鱼', brand: undefined },
      }),
    ).toBe(hashDraftPayload({ ingredient: { name: '冷冻三文鱼' } }));
  });

  it('数组顺序敏感（不排序，只排序对象键）', () => {
    expect(hashDraftPayload({ tags: ['A', 'B'] })).not.toBe(
      hashDraftPayload({ tags: ['B', 'A'] }),
    );
  });

  it('大小写敏感、null 与空串不同', () => {
    expect(hashDraftPayload({ name: 'Salmon' })).not.toBe(
      hashDraftPayload({ name: 'salmon' }),
    );
    expect(hashDraftPayload({ name: null })).not.toBe(
      hashDraftPayload({ name: '' }),
    );
  });

  it('返回 64 位小写十六进制（SHA-256），且多次调用稳定', () => {
    const payload = {
      intake: { name: '鸡肝' },
      profiles: [{ preparationState: 'RAW', entries: [] }],
    };

    const first = hashDraftPayload(payload);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDraftPayload(payload)).toBe(first);
    // 传进来的对象不能被改写（哈希不能有副作用）。
    expect(payload).toEqual({
      intake: { name: '鸡肝' },
      profiles: [{ preparationState: 'RAW', entries: [] }],
    });
  });
});
