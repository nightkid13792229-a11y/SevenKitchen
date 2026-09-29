import { Prisma } from '@prisma/client';
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service';

describe('DogProfileAnalyticsService', () => {
  const prisma = {
    dogProfileEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    dog: {
      count: jest.fn(),
    },
  } as any;

  let service: DogProfileAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // 体况确认率的三个 count（全部 / 已确认 / 区间内新增）默认都返回 0
    prisma.dog.count.mockResolvedValue(0);
    service = new DogProfileAnalyticsService(prisma);
  });

  it('stores one dog-profile event row with normalized nullable fields', async () => {
    prisma.dogProfileEvent.create.mockResolvedValue({ id: 'evt-1' });

    await service.track({
      customerId: 'customer-a',
      eventName: 'dog_profile_create_started',
      mode: 'create',
      dogId: null,
      stepName: 'basic_info',
      moduleName: null,
      entrySource: 'dog_list',
      hasDraft: false,
      calcStatus: null,
      submitStatus: null,
      properties: { route: '/pages/dog-create/index' },
    });

    expect(prisma.dogProfileEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'customer-a',
        eventName: 'dog_profile_create_started',
        mode: 'create',
        entrySource: 'dog_list',
        stepName: 'basic_info',
        dogId: null,
        moduleName: null,
        calcStatus: null,
        submitStatus: null,
      }),
    });
  });

  it('normalizes null analytics properties to Prisma.JsonNull', async () => {
    prisma.dogProfileEvent.create.mockResolvedValue({ id: 'evt-2' });

    await service.track({
      customerId: 'customer-b',
      eventName: 'dog_profile_submit_failed',
      mode: 'edit',
      properties: null,
    });

    expect(prisma.dogProfileEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'customer-b',
        eventName: 'dog_profile_submit_failed',
        mode: 'edit',
        properties: Prisma.JsonNull,
      }),
    });
  });

  it('fails open when analytics table is missing during track', async () => {
    prisma.dogProfileEvent.create.mockRejectedValue({
      code: 'P2021',
      meta: { table: 'public.dog_profile_event' },
    });

    await expect(
      service.track({
        customerId: 'customer-a',
        eventName: 'dog_profile_step_viewed',
        mode: 'create',
      }),
    ).resolves.toBeNull();
  });

  it('builds funnel counts from a time window', async () => {
    prisma.dogProfileEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        customerId: 'customer-a',
        eventName: 'dog_profile_create_started',
        mode: 'create',
        createdAt: new Date('2026-04-03T08:00:00Z'),
      },
      {
        id: 'evt-2',
        customerId: 'customer-a',
        eventName: 'dog_profile_step_completed',
        mode: 'create',
        stepName: 'basic_info',
        createdAt: new Date('2026-04-03T08:01:00Z'),
      },
      {
        id: 'evt-3',
        customerId: 'customer-a',
        eventName: 'dog_profile_calc_succeeded',
        mode: 'create',
        createdAt: new Date('2026-04-03T08:02:00Z'),
      },
      {
        id: 'evt-4',
        customerId: 'customer-a',
        eventName: 'dog_profile_submit_succeeded',
        mode: 'create',
        createdAt: new Date('2026-04-03T08:03:00Z'),
      },
    ]);

    await expect(
      service.getSummary({
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-04T00:00:00.000Z',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        createFunnel: expect.objectContaining({
          started: 1,
          basicCompleted: 1,
          recommendationSucceeded: 1,
          submitted: 1,
        }),
      }),
    );

    expect(prisma.dogProfileEvent.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-04-01T00:00:00.000Z'),
          lte: new Date('2026-04-04T00:00:00.000Z'),
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('counts distinct customers instead of raw events', async () => {
    // 同一个用户反复进出建档页 3 次，只应算 1 个人；
    // 原先按事件条数统计会算成 3，漏斗各步比例随之失真。
    prisma.dogProfileEvent.findMany.mockResolvedValue([
      { id: 'evt-1', customerId: 'customer-a', eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-2', customerId: 'customer-a', eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-3', customerId: 'customer-a', eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-4', customerId: 'customer-b', eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-5', customerId: 'customer-a', eventName: 'dog_profile_health_skipped', mode: 'create' },
      { id: 'evt-6', customerId: 'customer-b', eventName: 'dog_profile_health_skipped', mode: 'create' },
      { id: 'evt-7', customerId: 'customer-a', eventName: 'dog_profile_calc_failed', mode: 'create' },
    ]);

    const summary = await service.getSummary({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-04T00:00:00.000Z',
    });

    expect(summary.createFunnel.started).toBe(2);
    expect(summary.riskSignals.healthSkipped).toBe(2);
    expect(summary.riskSignals.calcFailed).toBe(1);
  });

  it('ignores event rows without customerId instead of merging them into one person', async () => {
    prisma.dogProfileEvent.findMany.mockResolvedValue([
      { id: 'evt-1', customerId: null, eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-2', customerId: null, eventName: 'dog_profile_create_started', mode: 'create' },
      { id: 'evt-3', customerId: 'customer-a', eventName: 'dog_profile_create_started', mode: 'create' },
    ]);

    const summary = await service.getSummary({
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-04T00:00:00.000Z',
    });

    expect(summary.createFunnel.started).toBe(1);
  });

  it('returns an empty summary when analytics table is missing', async () => {
    prisma.dogProfileEvent.findMany.mockRejectedValue({
      code: 'P2021',
      meta: { table: 'public.dog_profile_event' },
    });

    await expect(
      service.getSummary({
        from: '2026-04-01T00:00:00.000Z',
        to: '2026-04-04T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      createFunnel: {
        started: 0,
        basicCompleted: 0,
        recommendationSucceeded: 0,
        submitted: 0,
      },
      editFunnel: {
        moduleOpened: 0,
        calcSucceeded: 0,
        saved: 0,
      },
      riskSignals: {
        draftRestored: 0,
        calcFailed: 0,
        submitFailed: 0,
        healthSkipped: 0,
      },
      bcsConfirmation: {
        totalDogs: 0,
        confirmedDogs: 0,
        confirmedInRange: 0,
        rate: 0,
      },
    });
  });

  // ==================== 体况确认率（阶段 C10） ====================
  //
  // 阶段 C 上线前，生产库 99.98% 的狗从未确认过体况分，
  // 而新算法里体况分第一次真正参与能量计算。
  // 这个指标要看的就是新问卷有没有把存量撬动。

  it('体况确认率读 Dog 表，而不是埋点表', async () => {
    prisma.dog.count
      .mockResolvedValueOnce(4556) // 全部档案
      .mockResolvedValueOnce(31) // 顾客亲自确认过
      .mockResolvedValueOnce(24); // 区间内新增
    prisma.dogProfileEvent.findMany.mockResolvedValue([]);

    const summary = await service.getSummary({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });

    expect(summary.bcsConfirmation).toEqual({
      totalDogs: 4556,
      confirmedDogs: 31,
      confirmedInRange: 24,
      rate: 0.7, // 31 / 4556 = 0.68%，保留 1 位小数
    });

    // 判据必须与顾客端门槛同一个字段：只有顾客亲自确认过才会写上时间
    expect(prisma.dog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bcsScoreConfirmedAt: { not: null } },
      }),
    );
  });

  it('一只狗都没有时不除以零', async () => {
    prisma.dog.count.mockResolvedValue(0);
    prisma.dogProfileEvent.findMany.mockResolvedValue([]);

    const summary = await service.getSummary({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });

    expect(summary.bcsConfirmation.rate).toBe(0);
  });

  it('埋点表缺失时体况确认率照常返回', async () => {
    // 两者数据来源不同：埋点表挂了不该把存量指标一起拖没
    prisma.dogProfileEvent.findMany.mockRejectedValue({
      code: 'P2021',
      meta: { table: 'public.dog_profile_event' },
    });
    prisma.dog.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(7);

    const summary = await service.getSummary({
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });

    expect(summary.createFunnel.started).toBe(0);
    expect(summary.bcsConfirmation).toEqual({
      totalDogs: 100,
      confirmedDogs: 7,
      confirmedInRange: 7,
      rate: 7,
    });
  });
});
