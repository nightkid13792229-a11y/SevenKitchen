/**
 * 识别的每日上限（2026-10-16 上线前风险控制 B5）
 *
 * 这组用例只盯一件事：**上限是靠得住的**。
 *   · 到上限就拒绝，且给的是**中文**提示（不是 500、不是英文）✗
 *   · 被拒的请求**不会**把计数推高（不然额度会被越推越远）
 *   · 计数是"单语句原子"的：只有 `used_count < 上限` 那一条 UPDATE 会生效
 *     → 同一秒并发来的请求穿不过去 ✓
 *   · 分天按**北京时间**算（服务器时区不确定，不能按服务器本地时区分天）
 *   · 计数表自己出故障时 **放行**（防刷是次要目标，不能把识别整个弄挂）
 *
 * 上限怎么配、拒绝能不能省钱（会不会先调了模型再拒绝），见
 * tests/application/health/health-extraction-guardrails.spec.ts
 */

import { HttpException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { GlobalConfigService } from 'src/application/config/global-config.service';
import {
  HEALTH_EXTRACTION_QUOTA_MESSAGE,
  HEALTH_EXTRACTION_SCOPE,
  HealthExtractionQuotaService,
  resolveHealthExtractionUsageDateKey,
  toHealthExtractionUsageDate,
} from 'src/application/health/health-extraction-quota.service';

/**
 * 用内存假表**照着 Postgres 的语义**实现那两条计数语句。
 *
 * ⚠️ 真实的并发安全来自数据库（一条带条件的 UPDATE，行锁保证串行）；
 *    这里钉的是**语义**：`used_count < 上限` 不成立时那一行不能被改 ✓
 */
function createFakeCounterTable() {
  const rows = new Map<
    string,
    { usageDate: Date; scope: string; usedCount: number }
  >();
  const keyOf = (usageDate: Date, scope: string) =>
    `${usageDate.toISOString()}|${scope}`;

  return {
    rows,
    create: jest.fn(async ({ data }: any) => {
      const key = keyOf(data.usageDate, data.scope);
      if (rows.has(key)) {
        // Prisma 唯一键冲突
        const error: any = new Error('Unique constraint failed');
        error.code = 'P2002';
        throw error;
      }
      rows.set(key, { ...data });
      return { ...data };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const key = keyOf(where.usageDate, where.scope);
      const row = rows.get(key);
      if (!row) {
        return { count: 0 };
      }
      // `usedCount: { lt: 上限 }` —— 不满足就不改这一行（真实的 WHERE 语义）
      const lt = where.usedCount?.lt;
      if (typeof lt === 'number' && !(row.usedCount < lt)) {
        return { count: 0 };
      }
      row.usedCount += data.usedCount.increment;
      return { count: 1 };
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const { usageDate, scope } = where.usageDate_scope;
      const row = rows.get(keyOf(usageDate, scope));
      return row ? { usedCount: row.usedCount } : null;
    }),
  };
}

describe('识别的每日上限', () => {
  let table: ReturnType<typeof createFakeCounterTable>;
  let globalConfig: { getHealthExtractionDailyLimit: jest.Mock };
  let service: HealthExtractionQuotaService;

  const buildService = (limit: number) => {
    table = createFakeCounterTable();
    globalConfig = {
      getHealthExtractionDailyLimit: jest.fn().mockResolvedValue(limit),
    };
    service = new HealthExtractionQuotaService(
      { healthExtractionDailyUsage: table } as unknown as PrismaService,
      globalConfig as unknown as GlobalConfigService,
    );
  };

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('额度没用完：放行，并把这一次算进去', async () => {
    buildService(500);

    const first = await service.assertWithinDailyLimit();
    const second = await service.assertWithinDailyLimit();

    expect(first).toMatchObject({ limit: 500, used: 1 });
    expect(second).toMatchObject({ limit: 500, used: 2 });
  });

  it('到上限就拒绝，而且给的是**中文**提示（不是 500、不是英文）', async () => {
    buildService(2);

    await service.assertWithinDailyLimit();
    await service.assertWithinDailyLimit();

    const rejection = await service
      .assertWithinDailyLimit()
      .then(() => null)
      .catch((error) => error);

    expect(rejection).toBeInstanceOf(HttpException);
    // 429 = "你这个请求太多了"，不是"我们挂了"（5xx）
    expect((rejection as HttpException).getStatus()).toBe(429);
    expect((rejection as HttpException).getStatus()).not.toBe(500);
    expect(HEALTH_EXTRACTION_QUOTA_MESSAGE).toBe(
      (rejection as HttpException).message,
    );
    // 给人看的话：中文、说清怎么办、不许出现英文字母
    expect(HEALTH_EXTRACTION_QUOTA_MESSAGE).toContain('明天');
    expect(HEALTH_EXTRACTION_QUOTA_MESSAGE).toContain('手动填写');
    expect(/[A-Za-z]/.test(HEALTH_EXTRACTION_QUOTA_MESSAGE)).toBe(false);
    /**
     * ⚠️ 措辞里**故意不带**"频率 / 超限"这两个词（2026-10-16）：
     * 小程序 `resolveHealthScanErrorMessage` 会把含这两个词的报错改写成
     * "识别的人有点多，稍等一会儿再试" —— 那句对"今天已经用完了"是错的
     * （让人一直重试，而真要等到明天）。这条断言就是那道契约。
     */
    expect(HEALTH_EXTRACTION_QUOTA_MESSAGE).not.toMatch(/频率|超限/);
  });

  it('被拒的请求不会把计数推高（额度不会被越推越远）', async () => {
    buildService(2);

    await service.assertWithinDailyLimit();
    await service.assertWithinDailyLimit();
    for (let i = 0; i < 5; i += 1) {
      await expect(service.assertWithinDailyLimit()).rejects.toBeInstanceOf(
        HttpException,
      );
    }

    const [row] = [...table.rows.values()];
    expect(row.usedCount).toBe(2);
  });

  it('并发来的请求穿不过去：上限 3 → 10 个同时进来只有 3 个通过', async () => {
    buildService(3);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.assertWithinDailyLimit()),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
    const [row] = [...table.rows.values()];
    expect(row.usedCount).toBe(3);
  });

  it('计数只有"一条带条件的 UPDATE"：上限判断写在 WHERE 里（不是先读后写）', async () => {
    buildService(3);

    await service.assertWithinDailyLimit();
    await service.assertWithinDailyLimit();

    expect(table.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scope: HEALTH_EXTRACTION_SCOPE,
          usedCount: { lt: 3 },
        }),
        data: { usedCount: { increment: 1 } },
      }),
    );
    // 当天一行（首次 create 成功；第二次 create 撞主键 → 转 UPDATE），不会插出第二行
    expect(table.rows.size).toBe(1);
    expect(table.updateMany).toHaveBeenCalledTimes(1);
  });

  it('0 = 不限量（照样计数，但一次都不拒）', async () => {
    buildService(0);

    for (let i = 0; i < 8; i += 1) {
      const usage = await service.assertWithinDailyLimit();
      expect(usage.limit).toBe(0);
    }

    const [row] = [...table.rows.values()];
    expect(row.usedCount).toBe(8);
    // 不限量时那条 UPDATE 不带上限条件
    expect(table.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ usedCount: expect.anything() }),
      }),
    );
  });

  it('分天按**北京时间**：UTC 16:30 已经是北京的第二天', async () => {
    expect(
      resolveHealthExtractionUsageDateKey(new Date('2026-10-16T15:59:00Z')),
    ).toBe('2026-10-16');
    expect(
      resolveHealthExtractionUsageDateKey(new Date('2026-10-16T16:30:00Z')),
    ).toBe('2026-10-17');
    // 写进 DATE 列的值取当天 12:00Z（±12 小时内的时区都落在同一天）
    expect(toHealthExtractionUsageDate('2026-10-17').toISOString()).toBe(
      '2026-10-17T12:00:00.000Z',
    );
  });

  it('计数表出故障时放行（防刷不能把识别整个弄挂），但记一行 warn', async () => {
    buildService(1);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    table.create.mockRejectedValue(new Error('relation does not exist'));
    table.updateMany.mockRejectedValue(new Error('relation does not exist'));

    await expect(service.assertWithinDailyLimit()).resolves.toMatchObject({
      limit: 1,
      used: 0,
    });
    expect(
      warnSpy.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('[ExtractionQuota]'),
      ),
    ).toBe(true);
  });

  it('上限读不到时按默认 500 处理（也不挡顾客）', async () => {
    buildService(500);
    globalConfig.getHealthExtractionDailyLimit.mockRejectedValue(
      new Error('global_config 挂了'),
    );

    await expect(service.assertWithinDailyLimit()).resolves.toMatchObject({
      limit: 500,
    });
  });

  it('连"读当天用量"都挂了也照样放行（那一环只为了写日志）', async () => {
    buildService(3);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn');
    table.create.mockRejectedValue(new Error('P2002 主键冲突'));
    table.findUnique.mockRejectedValue(new Error('relation does not exist'));

    await expect(service.assertWithinDailyLimit()).resolves.toMatchObject({
      limit: 3,
      used: 0,
    });
    /**
     * ⚠️ 放行 ≠ 静默：读用量这一环挂了**必须留一行 warn**。
     * 这一条是 2026-10-16 那次事故的直接回归用例：旧代码在"create 挂 + 读挂"
     * 时**无条件**抛 429（把故障当成"用完了"），全站识别被挡住 ✗。
     * 所以这里同时钉两件事：照常放行 ✓、而且日志里看得见 ✓
     * （不然计数表坏了没人发现，额度也就永远管不住了）。
     */
    expect(
      warnSpy.mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('[ExtractionQuota]'),
      ),
    ).toBe(true);
  });

  it('🔴 计数行建不起来时**不算"到上限"**（故障不能被当成"用完了"）', async () => {
    buildService(2);
    // 表没迁移 / 权限不对：create 挂掉，而且不是主键冲突
    table.create.mockRejectedValue(new Error('permission denied for table'));

    // 那一行确实不存在 → 必须放行（否则计数表一出问题，所有顾客都识别不了 ✗）
    await expect(service.assertWithinDailyLimit()).resolves.toMatchObject({
      limit: 2,
      used: 0,
    });
  });
});
