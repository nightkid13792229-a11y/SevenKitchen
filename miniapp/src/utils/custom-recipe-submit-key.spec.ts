import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, any>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
});

const {
  getOrCreateCustomRecipeSubmitKey,
  clearCustomRecipeSubmitKey,
} = await import('./custom-recipe-submit-key');

describe('定制订单提交幂等键', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('同一顾客+狗复用同一把 key', () => {
    const first = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    const second = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('不同狗互不影响', () => {
    const a = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    const b = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-2');
    expect(a).not.toBe(b);
  });

  it('订单创建成功后清掉，下一次是新 key', () => {
    const first = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    clearCustomRecipeSubmitKey('user-1', 'dog-1', first);
    const second = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    expect(second).not.toBe(first);
  });

  it('只清当前 key：并发时不会误清另一把', () => {
    const first = getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1');
    clearCustomRecipeSubmitKey('user-1', 'dog-1', 'another-key');
    expect(getOrCreateCustomRecipeSubmitKey('user-1', 'dog-1')).toBe(first);
  });
});
