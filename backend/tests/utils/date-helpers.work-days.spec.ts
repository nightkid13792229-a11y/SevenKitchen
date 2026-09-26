import { addWorkDays, isPublicHoliday } from '../../src/utils/date-helpers';

/**
 * 回归测试：addWorkDays 的死循环
 *
 * 背景（2026-09-25）：原实现是同步函数，却在循环里写了
 * `if (!isPublicHoliday(result)) daysAdded++` —— `isPublicHoliday` 是 async，
 * 返回的 Promise 恒为真，于是 `!Promise` 恒为 false、`daysAdded` 永远不增加。
 *
 * 后果不是"算错日期"，而是**死循环**：任何一次"提交定制订单"都会锁死 Node
 * 事件循环、无限堆积 Promise，直到进程涨到 2GB 被杀（实测发生过）。
 *
 * 这里用 jest 的假定时器把 fetch 钉成"永远不返回"，再断言函数在有限时间内完成，
 * 保证「第三方节假日接口挂住」也不会把下单拖死。
 */
describe('date-helpers.addWorkDays', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('advances exactly N days when there are no holidays', async () => {
    // 节假日接口返回空 => 不跳任何日期
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ holiday: {} }),
    }) as any;

    const start = new Date('2026-10-12T00:00:00.000Z');
    const result = await addWorkDays(start, 3);

    expect(result.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('skips days returned as holidays', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        holiday: {
          '10-13': { holiday: true, date: '2027-10-13', name: '假期' },
        },
      }),
    }) as any;

    // 用 2027：holidayCache 是模块级的，换一个年份避免被上一个用例缓存住
    const start = new Date('2027-10-12T00:00:00.000Z');
    const result = await addWorkDays(start, 2);

    // 10-13 被跳过 => 10-14 是第 1 天，10-15 是第 2 天
    expect(result.toISOString().slice(0, 10)).toBe('2027-10-15');
  });

  it('still terminates when the holiday API hangs forever', async () => {
    // 永不 resolve 的请求，但**尊重 abort 信号** —— 与真实 fetch 行为一致：
    // 我们靠 AbortController 的超时把它掐断。
    global.fetch = jest.fn(
      (_url: any, options: any) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener?.('abort', () =>
            reject(new Error('The operation was aborted.')),
          );
        }),
    ) as any;

    const start = new Date('2028-10-12T00:00:00.000Z');

    // 真实等待：若无超时保护，这里会一直挂住直到 jest 超时
    const result = await addWorkDays(start, 2);

    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result.getTime())).toBe(false);
  }, 20000);

  it('never spins forever even if no day ever counts as a work day', async () => {
    // 每一天都被当成节假日：靠 iterations 天花板收口，不会死循环
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        holiday: Object.fromEntries(
          Array.from({ length: 400 }, (_, index) => {
            const day = String(index + 1).padStart(2, '0');
            return [`x-${day}`, { holiday: true, date: '2029-01-01', name: 'h' }];
          }),
        ),
      }),
    }) as any;

    const start = new Date('2029-10-12T00:00:00.000Z');
    const result = await addWorkDays(start, 3);

    expect(result).toBeInstanceOf(Date);
  }, 20000);
});

describe('date-helpers.isPublicHoliday', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('falls back to "no holidays" when the API fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      isPublicHoliday(new Date('2031-01-01T00:00:00.000Z')),
    ).resolves.toBe(false);
  });
});
