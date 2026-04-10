import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service';

describe('DogProfileAnalyticsService', () => {
  const prisma = {
    dogProfileEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;

  let service: DogProfileAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
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
        eventName: 'dog_profile_create_started',
        mode: 'create',
        createdAt: new Date('2026-04-03T08:00:00Z'),
      },
      {
        eventName: 'dog_profile_step_completed',
        mode: 'create',
        stepName: 'basic_info',
        createdAt: new Date('2026-04-03T08:01:00Z'),
      },
      {
        eventName: 'dog_profile_calc_succeeded',
        mode: 'create',
        createdAt: new Date('2026-04-03T08:02:00Z'),
      },
      {
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
    });
  });
});
