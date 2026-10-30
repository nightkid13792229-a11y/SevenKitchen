import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('./api', () => ({ request: (...args: any[]) => requestMock(...args) }));

import { loadOptionSet, useOptionSet } from './option-set';

describe('选项字典', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it('成功时返回字典条目并缓存', async () => {
    requestMock.mockResolvedValue({
      code: 0,
      data: {
        sets: {
          'test-set-ok': [
            { code: 'A', label: '选项 A' },
            { code: 'B', label: '选项 B' },
          ],
        },
      },
    });

    const items = await loadOptionSet('test-set-ok');
    expect(items).toEqual([
      { code: 'A', label: '选项 A' },
      { code: 'B', label: '选项 B' },
    ]);

    // 第二次走缓存，不再请求
    await loadOptionSet('test-set-ok');
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('失败时抛出，让页面能区分“加载失败”和“空字典”', async () => {
    requestMock.mockRejectedValue(new Error('network down'));

    await expect(loadOptionSet('test-set-fail')).rejects.toThrow('network down');
  });

  it('useOptionSet 暴露 failed，重试成功后可恢复', async () => {
    requestMock.mockRejectedValueOnce(new Error('network down'));

    const hook = useOptionSet('test-set-retry');
    await hook.ensure();

    expect(hook.failed.value).toBe(true);
    expect(hook.loading.value).toBe(false);
    expect(hook.items.value).toEqual([]);

    requestMock.mockResolvedValueOnce({
      code: 0,
      data: {
        sets: {
          'test-set-retry': [{ code: 'A', label: '选项 A' }],
        },
      },
    });
    await hook.ensure();

    expect(hook.failed.value).toBe(false);
    expect(hook.items.value).toEqual([{ code: 'A', label: '选项 A' }]);
  });
});
