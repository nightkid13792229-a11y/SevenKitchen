import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, any>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: any) => storage.set(key, value),
});

const {
  loadCustomRecipeMultiChoice,
  saveCustomRecipeMultiChoice,
} = await import('./custom-recipe-multi-choice');

describe('确认页多份选择记忆', () => {
  beforeEach(() => storage.clear());

  it('按顾客+狗分别保存，互不覆盖', () => {
    saveCustomRecipeMultiChoice(
      'user-1',
      'dog-1',
      { quantity: 3, proteinMode: 'SELF', proteinCodes: ['CHICKEN'] },
      5,
    );
    saveCustomRecipeMultiChoice(
      'user-1',
      'dog-2',
      { quantity: 2, proteinMode: 'DIETITIAN', proteinCodes: [] },
      5,
    );

    expect(loadCustomRecipeMultiChoice('user-1', 'dog-1', 5)).toEqual({
      quantity: 3,
      proteinMode: 'SELF',
      proteinCodes: ['CHICKEN'],
    });
    expect(loadCustomRecipeMultiChoice('user-1', 'dog-2', 5)?.quantity).toBe(2);
  });

  it('份数按后台上限收口，肉类裁到份数', () => {
    saveCustomRecipeMultiChoice(
      'user-1',
      'dog-1',
      {
        quantity: 9,
        proteinMode: 'SELF',
        proteinCodes: ['A', 'B', 'C', 'D'],
      },
      3,
    );
    expect(loadCustomRecipeMultiChoice('user-1', 'dog-1', 3)).toEqual({
      quantity: 3,
      proteinMode: 'SELF',
      proteinCodes: ['A', 'B', 'C'],
    });
  });

  it('没有记录时返回 null，不猜默认值', () => {
    expect(loadCustomRecipeMultiChoice('user-1', 'dog-1', 5)).toBeNull();
  });

  it('未知模式按营养师配处理', () => {
    saveCustomRecipeMultiChoice(
      'user-1',
      'dog-1',
      {
        quantity: 2,
        proteinMode: 'SOMETHING' as any,
        proteinCodes: [],
      },
      5,
    );
    expect(loadCustomRecipeMultiChoice('user-1', 'dog-1', 5)?.proteinMode).toBe(
      'DIETITIAN',
    );
  });
});
