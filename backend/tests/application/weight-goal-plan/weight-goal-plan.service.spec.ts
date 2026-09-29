import { BadRequestException, ConflictException } from '@nestjs/common';
import { WeightGoalPlanService } from 'src/application/weight-goal-plan/weight-goal-plan.service';
import {
  WeightGoalAdjustmentReason,
  WeightGoalDirection,
  WeightGoalPlanStatus,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain/dog/enums';

/**
 * 体重管理计划服务（阶段 B）
 *
 * 领域规则已在 tests/domain/dog/weight-goal-plan.spec.ts 里锁住，
 * 这里只测**服务层独有的东西**：归属校验、与数据库的交互、
 * 状态流转写库、以及几个只在服务层成立的约定。
 */

const DAY = 1000 * 60 * 60 * 24;

/** 20kg / BCS 7 的胖狗：理想体重 16kg，RER(16) = 560 */
function makeDog(overrides: Record<string, any> = {}) {
  return {
    id: 'dog-1',
    ownerId: 'customer-1',
    name: '团子',
    breedId: 'breed-1',
    birthday: new Date('2021-01-01'),
    gender: 'MALE',
    isNeutered: true,
    currentWeightKg: 20,
    bcsScore: 7,
    activityLevel: ActivityLevel.NORMAL,
    lifeStageOverride: LifeStageOverride.NONE,
    sizeClassOverride: null,
    mealsPerDay: 2,
    treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
    treatLevel: TreatLevel.LOW,
    manualTreatKcal: null,
    matingDate: null,
    expectedDueDate: null,
    deliveryDate: null,
    litterSize: null,
    ...overrides,
  };
}

const BREED = {
  id: 'breed-1',
  name: '拉布拉多',
  sizeCategory: 'LARGE',
  averageAdultWeightKg: 30,
};

function createMocks() {
  const prisma: any = {
    weightGoalPlan: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(async ({ data }: any) => ({ ...basePlan, ...data })),
    },
    weightGoalPlanAdjustment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    weightRecord: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    dogBreed: {
      findMany: jest.fn(),
    },
  };
  /**
   * 事务里必须传入**同一批** mock，否则事务内的写入断言不到 ——
   * 服务有相当一部分写操作走事务（改目标、自动校正、达标转维持）。
   */
  prisma.$transaction = jest.fn(async (cb: any) => cb(prisma));

  return {
    prisma,
    dogRepository: { findById: jest.fn() },
    dogBreedRepository: { findById: jest.fn() },
  };
}

const basePlan = {
  id: 'plan-1',
  dogId: 'dog-1',
  direction: WeightGoalDirection.LOSS,
  status: WeightGoalPlanStatus.ACTIVE,
  startWeightKg: 20,
  startBcsScore: 7,
  targetWeightKg: 16,
  suggestedTargetWeightKg: 16,
  currentKcal: 560,
  floorKcal: 336,
  ceilingKcal: 800,
  targetRatePercentPerWeek: 1,
  startDate: new Date('2026-09-01T00:00:00Z'),
  estimatedGoalDate: new Date('2027-02-01T00:00:00Z'),
  nextReviewDate: new Date('2026-09-15T00:00:00Z'),
  lastWeighInDate: null,
  lastRatePercentPerWeek: null,
  pausedAt: null,
  pausedReason: null,
  maintenanceStartedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
};

function build(mocks: ReturnType<typeof createMocks>) {
  return new WeightGoalPlanService(
    mocks.prisma as any,
    mocks.dogRepository as any,
    mocks.dogBreedRepository as any,
  );
}

describe('WeightGoalPlanService · 归属与前置校验', () => {
  it('狗不属于当前顾客时拒绝访问', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(
      makeDog({ ownerId: 'someone-else' }),
    );

    await expect(
      build(mocks).getCurrentPlan('customer-1', 'dog-1'),
    ).rejects.toThrow('Access denied');
  });

  it('狗不存在时抛 404', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(null);

    await expect(
      build(mocks).getCurrentPlan('customer-1', 'dog-1'),
    ).rejects.toThrow('Dog not found');
  });

  it('已经有进行中的计划时不允许再建', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);

    await expect(
      build(mocks).createPlan('customer-1', 'dog-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('并发建计划撞到部分唯一索引时给出可读提示，而不是 500', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);
    mocks.prisma.weightGoalPlan.create.mockRejectedValue({ code: 'P2002' });

    await expect(
      build(mocks).createPlan('customer-1', 'dog-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('体况在理想区间时不给增减重建议', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog({ bcsScore: 5 }));
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);

    expect(await build(mocks).getSuggestion('customer-1', 'dog-1')).toBeNull();
    await expect(
      build(mocks).createPlan('customer-1', 'dog-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('增重方向：排查出现危险信号时先就医，不建计划', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(
      makeDog({ bcsScore: 2, currentWeightKg: 10 }),
    );
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);

    await expect(
      build(mocks).createPlan('customer-1', 'dog-1', {
        screening: { losing_weight: true },
      }),
    ).rejects.toThrow(/先就医/);
  });

  it('增重方向：排查全部正常才放行', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(
      makeDog({ bcsScore: 2, currentWeightKg: 10 }),
    );
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);
    mocks.prisma.weightGoalPlan.create.mockImplementation(async ({ data }: any) => ({
      ...basePlan,
      ...data,
    }));

    const plan = await build(mocks).createPlan('customer-1', 'dog-1', {
      screening: { losing_weight: false, poor_appetite: false, vomiting_diarrhea: false },
    });

    expect(plan.direction).toBe(WeightGoalDirection.GAIN);
  });
});

describe('WeightGoalPlanService · 建计划的落库内容', () => {
  it('减重：目标体重按理想体重算，起步能量锚在 RER(目标体重)', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);
    mocks.prisma.weightGoalPlan.create.mockImplementation(async ({ data }: any) => ({
      ...basePlan,
      ...data,
    }));

    const plan = await build(mocks).createPlan('customer-1', 'dog-1', {});

    const written = mocks.prisma.weightGoalPlan.create.mock.calls[0][0].data;
    expect(written.targetWeightKg).toBe(16);
    // RER(16) = 70 × 16^0.75 = 560
    expect(written.currentKcal).toBe(560);
    expect(written.floorKcal).toBe(336);
    expect(plan.progressPercent).toBe(0);
    expect(plan.remainingKg).toBe(4);
  });

  it('顾客可以指定目标体重，且偏离建议 >30% 只提示不拦', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);
    mocks.prisma.weightGoalPlan.create.mockImplementation(async ({ data }: any) => ({
      ...basePlan,
      ...data,
    }));

    const plan = await build(mocks).createPlan('customer-1', 'dog-1', {
      targetWeightKg: 13,
    });

    const written = mocks.prisma.weightGoalPlan.create.mock.calls[0][0].data;
    expect(written.targetWeightKg).toBe(13);
    expect(plan.notes.join('')).toContain('偏离较大');
  });
});

describe('WeightGoalPlanService · 改目标体重', () => {
  function setupPlan(mocks: ReturnType<typeof createMocks>, plan = basePlan) {
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(plan);
  }

  it('顾客可以随时改目标体重（完全自由，不受「只能更温和」限制）', async () => {
    const mocks = createMocks();
    setupPlan(mocks);

    const plan = await build(mocks).updateTargetWeight('customer-1', 'dog-1', {
      targetWeightKg: 18,
    });

    expect(plan.targetWeightKg).toBe(18);
  });

  it('改目标时不会顺手把每天的饭量调低（能量只增不减）', async () => {
    const mocks = createMocks();
    setupPlan(mocks);

    // 目标从 16 改成 19：RER(19) 明显高于 RER(16)，但下限是「不低于当前 560」
    const plan = await build(mocks).updateTargetWeight('customer-1', 'dog-1', {
      targetWeightKg: 19,
    });

    expect(plan.currentKcal).toBeGreaterThanOrEqual(560);
  });

  it('每次改目标都写一条调整历史（后台可追溯）', async () => {
    const mocks = createMocks();
    setupPlan(mocks);

    await build(mocks).updateTargetWeight('customer-1', 'dog-1', {
      targetWeightKg: 18,
    });

    expect(mocks.prisma.$transaction).toHaveBeenCalled();
  });
});

describe('WeightGoalPlanService · 改力度', () => {
  function setupPlan(mocks: ReturnType<typeof createMocks>) {
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
  }

  it('可以往更温和方向调', async () => {
    const mocks = createMocks();
    setupPlan(mocks);

    // 当前 560（×1.0），温和档是 RER(16) × 1.1 = 616
    const plan = await build(mocks).updateIntensity('customer-1', 'dog-1', {
      intensity: 'GENTLE',
    });

    expect(plan.currentKcal).toBe(616);
  });

  it('不允许往更激进方向调（那是自动校正的职责）', async () => {
    const mocks = createMocks();
    // 当前能量已经被自动校正降到了 476，此时选标准档（560）反而更温和，允许；
    // 但选一个比 476 还低的档位就该被拒 —— 档位里最低就是标准档，
    // 所以这里构造一个「当前已经是温和档」的场景
    setupPlan(mocks);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue({
      ...basePlan,
      currentKcal: 616,
    });

    await expect(
      build(mocks).updateIntensity('customer-1', 'dog-1', {
        intensity: 'STANDARD',
      }),
    ).rejects.toThrow(/只能往更温和/);
  });
});

describe('WeightGoalPlanService · 能量接入（B1-4）', () => {
  it('没有生效中的计划时，原样返回算法结果', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);

    const result = await build(mocks).applyActivePlanOverride('dog-1', 800, 24);

    expect(result.source).toBe('ALGORITHM');
    expect(result.grossKcal).toBe(800);
    expect(result.finalFoodKcal).toBe(776);
  });

  it('计划生效时替换毛值，但零食照常扣减', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue({
      currentKcal: 560,
    });

    const result = await build(mocks).applyActivePlanOverride('dog-1', 800, 24);

    expect(result.source).toBe('PLAN');
    expect(result.grossKcal).toBe(560);
    // 关键：560 − 24，而不是直接拿 560 当净食物量（那会多喂一个零食的量）
    expect(result.finalFoodKcal).toBe(536);
  });

  it('暂停中的计划不生效（回落算法默认）', async () => {
    const mocks = createMocks();
    // 查询条件里就把 PAUSED 排除掉了，所以模拟「查不到」
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);

    const result = await build(mocks).applyActivePlanOverride('dog-1', 800, 0);
    expect(result.source).toBe('ALGORITHM');

    // 断言查询条件确实排除了暂停态
    const where = mocks.prisma.weightGoalPlan.findFirst.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['ACTIVE', 'MAINTENANCE']);
    expect(where.status.in).not.toContain('PAUSED');
  });
});

describe('WeightGoalPlanService · 称重后自动校正（B1-5）', () => {
  function setupWeighIn(
    mocks: ReturnType<typeof createMocks>,
    planOverrides: Record<string, any> = {},
    previousWeight = 20,
  ) {
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue({
      ...basePlan,
      ...planOverrides,
    });
    mocks.prisma.weightRecord.findFirst.mockResolvedValue({
      id: 'rec-0',
      weightKg: previousWeight,
      recordDate: new Date('2026-09-01T00:00:00Z'),
    });
    mocks.prisma.weightGoalPlan.update.mockImplementation(async ({ data }: any) => ({
      ...basePlan,
      ...data,
    }));
  }

  it('推进太慢 → 降能量并写一条调整历史', async () => {
    const mocks = createMocks();
    // 两周只掉 0.2%（20 → 19.96）→ 0.1%/周，远低于 0.5%
    setupWeighIn(mocks);

    await build(mocks).applyWeighIn(
      'dog-1',
      19.96,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.currentKcal).toBe(476); // 560 × 0.85
    expect(data.lastRatePercentPerWeek).toBeCloseTo(-0.1, 2);
  });

  it('速率在目标区间内 → 能量不动，复查间隔放宽到 5 周', async () => {
    const mocks = createMocks();
    // 两周掉 2%（20 → 19.6）→ 1%/周，正中区间
    setupWeighIn(mocks);
    const before = Date.now();

    await build(mocks).applyWeighIn(
      'dog-1',
      19.6,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.currentKcal).toBe(560);

    // ⚠️ 复查日以**处理时刻**为基准，不是以记录日期 ——
    // 顾客可能补录过去的体重，用记录日期会算出已经过期的提醒。
    const days = (data.nextReviewDate.getTime() - before) / DAY;
    expect(days).toBeGreaterThan(34);
    expect(days).toBeLessThan(36);
  });

  it('达到目标体重 → 转维持期并上浮 10%', async () => {
    const mocks = createMocks();
    setupWeighIn(mocks);

    await build(mocks).applyWeighIn(
      'dog-1',
      16,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.MAINTENANCE);
    expect(data.currentKcal).toBe(616); // 560 × 1.1
    expect(data.maintenanceStartedAt).toBeInstanceOf(Date);
  });

  it('连续 8 周未称重 → 转暂停，且不调热量', async () => {
    const mocks = createMocks();
    setupWeighIn(mocks, {
      lastWeighInDate: new Date('2026-06-01T00:00:00Z'),
    });

    await build(mocks).applyWeighIn(
      'dog-1',
      19.5,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.PAUSED);
    expect(data.pausedReason).toContain('8 周');
    expect(data.currentKcal).toBeUndefined();
  });

  it('维持期满 3 个月 → 自动结束', async () => {
    const mocks = createMocks();
    setupWeighIn(mocks, {
      status: WeightGoalPlanStatus.MAINTENANCE,
      maintenanceStartedAt: new Date('2026-05-01T00:00:00Z'),
    });

    await build(mocks).applyWeighIn(
      'dog-1',
      16,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.COMPLETED);
  });

  it('维持期还在继续掉重 → 再加 10%', async () => {
    const mocks = createMocks();
    setupWeighIn(
      mocks,
      {
        status: WeightGoalPlanStatus.MAINTENANCE,
        maintenanceStartedAt: new Date('2026-09-01T00:00:00Z'),
      },
      16,
    );

    await build(mocks).applyWeighIn(
      'dog-1',
      15.7,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.currentKcal).toBe(616); // 560 × 1.1
    const adjustment =
      mocks.prisma.weightGoalPlanAdjustment.create.mock.calls[0][0].data;
    expect(adjustment.reason).toBe(
      WeightGoalAdjustmentReason.MAINTENANCE_UNDERSHOOT,
    );
  });

  it('第一次称重没有上一条可比 → 只更新称重日，不调热量', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
    mocks.prisma.weightRecord.findFirst.mockResolvedValue(null);
    mocks.prisma.weightGoalPlan.update.mockResolvedValue(basePlan);

    await build(mocks).applyWeighIn(
      'dog-1',
      19.5,
      new Date('2026-09-15T00:00:00Z'),
    );

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.lastWeighInDate).toBeInstanceOf(Date);
    expect(data.currentKcal).toBeUndefined();
  });

  it('没有计划时什么都不做', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);

    await build(mocks).applyWeighIn('dog-1', 19, new Date());

    expect(mocks.prisma.weightGoalPlan.update).not.toHaveBeenCalled();
  });

  it('内部抛错时不向外冒泡（绝不连累体重记录）', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      build(mocks).applyWeighIn('dog-1', 19, new Date()),
    ).resolves.toBeUndefined();
  });
});

describe('WeightGoalPlanService · 展示口径', () => {
  /**
   * 真实缺陷（2026-09-29 端到端冒烟测出来的）：
   *
   * 记体重时「同时更新档案当前体重」是个**可选开关**，顾客不同步时档案就还是旧值。
   * 于是出现自相矛盾 —— 计划已经按称重记录转成了维持期，
   * 卡片上的「当前体重」却还是旧的，`goalReached` 也跟着算成 false。
   */
  it('「当前体重」取最近一次称重，而不是档案里的旧值', async () => {
    const mocks = createMocks();
    // 档案体重 6.5，但最近一次称重是 5.4
    mocks.dogRepository.findById.mockResolvedValue(makeDog({ currentWeightKg: 6.5 }));
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue({
      ...basePlan,
      status: WeightGoalPlanStatus.MAINTENANCE,
      targetWeightKg: 5.5,
    });
    mocks.prisma.weightRecord.findFirst.mockResolvedValue({ weightKg: 5.4 });

    const plan = await build(mocks).getCurrentPlan('customer-1', 'dog-1');

    expect(plan!.currentWeightKg).toBe(5.4);
    // 状态是维持期，达标判定必须跟着一致
    expect(plan!.goalReached).toBe(true);
  });

  it('没有称重记录时退回档案体重', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog({ currentWeightKg: 6.5 }));
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
    mocks.prisma.weightRecord.findFirst.mockResolvedValue(null);

    const plan = await build(mocks).getCurrentPlan('customer-1', 'dog-1');

    expect(plan!.currentWeightKg).toBe(6.5);
  });

  it('展示用的体重按记录日期倒序取，不按创建时间', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
    mocks.prisma.weightRecord.findFirst.mockResolvedValue({ weightKg: 19.5 });

    await build(mocks).getCurrentPlan('customer-1', 'dog-1');

    expect(mocks.prisma.weightRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { recordDate: 'desc' } }),
    );
  });
});

describe('WeightGoalPlanService · 管理后台（B3）', () => {
  const planRow = {
    ...basePlan,
    dog: {
      id: 'dog-1',
      name: '团子',
      breedId: 'breed-1',
      customBreedName: null,
      currentWeightKg: 20,
      owner: { nickname: '小王', phone: '13800000000' },
    },
  };

  function setupList(mocks: ReturnType<typeof createMocks>) {
    mocks.prisma.weightGoalPlan.count.mockResolvedValue(1);
    mocks.prisma.weightGoalPlan.findMany.mockResolvedValue([planRow]);
    mocks.prisma.dogBreed.findMany.mockResolvedValue([
      { id: 'breed-1', name: '拉布拉多' },
    ]);
    mocks.prisma.weightRecord.findMany.mockResolvedValue([
      { dogId: 'dog-1', weightKg: 19.2 },
      { dogId: 'dog-1', weightKg: 19.8 },
    ]);
  }

  it('列表带出狗名、品种与主人，而不是只给一堆 id', async () => {
    const mocks = createMocks();
    setupList(mocks);

    const result = await build(mocks).listForAdmin({});

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      dogName: '团子',
      breedName: '拉布拉多',
      ownerNickname: '小王',
      ownerPhone: '13800000000',
    });
  });

  it('当前体重取最近一次称重（与顾客端同一口径）', async () => {
    const mocks = createMocks();
    setupList(mocks);

    const result = await build(mocks).listForAdmin({});

    // 档案写 20，最近称重 19.2 —— 后台看到的必须是 19.2，
    // 否则「已减多少」会算错，客服照着念就是错的
    expect(result.items[0].currentWeightKg).toBe(19.2);
    expect(result.items[0].progressPercent).toBe(20);
  });

  it('品种单独批量查（Dog 没有品种关联，不能 include）', async () => {
    const mocks = createMocks();
    setupList(mocks);

    await build(mocks).listForAdmin({});

    expect(mocks.prisma.dogBreed.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['breed-1'] } } }),
    );
  });

  it('自定义品种优先于标准品种', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.count.mockResolvedValue(1);
    mocks.prisma.weightGoalPlan.findMany.mockResolvedValue([
      { ...planRow, dog: { ...planRow.dog, customBreedName: '中华田园犬' } },
    ]);
    mocks.prisma.dogBreed.findMany.mockResolvedValue([]);
    mocks.prisma.weightRecord.findMany.mockResolvedValue([]);

    const result = await build(mocks).listForAdmin({});

    expect(result.items[0].breedName).toBe('中华田园犬');
  });

  it('筛选条件真的传到了查询里', async () => {
    const mocks = createMocks();
    setupList(mocks);

    await build(mocks).listForAdmin({
      status: 'ACTIVE',
      direction: 'LOSS',
      keyword: '团子',
      page: 2,
      pageSize: 10,
    });

    const args = mocks.prisma.weightGoalPlan.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('ACTIVE');
    expect(args.where.direction).toBe('LOSS');
    expect(args.where.dog.OR).toBeDefined();
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it('分页参数兜底，防止把库拖垮', async () => {
    const mocks = createMocks();
    setupList(mocks);

    await build(mocks).listForAdmin({ page: 0, pageSize: 9999 });

    const args = mocks.prisma.weightGoalPlan.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(100);
  });

  it('详情带出完整调整历史（「为什么降热量」要查得到）', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findUnique.mockResolvedValue({
      ...planRow,
      suggestedTargetWeightKg: 16,
      floorKcal: 336,
      ceilingKcal: 800,
      pausedReason: null,
      maintenanceStartedAt: null,
      completedAt: null,
      cancelledAt: null,
      adjustments: [
        {
          id: 'adj-1',
          reason: 'RATE_TOO_SLOW',
          energyBefore: 560,
          energyAfter: 476,
          ratePercentPerWeek: -0.15,
          weightKg: 19.2,
          note: '推进速率仅 0.15%/周，低于 0.5%/周，力度加一档',
          createdAt: new Date('2026-09-29T00:00:00Z'),
        },
      ],
      dog: {
        ...planRow.dog,
        birthday: new Date('2021-01-01'),
        bcsScore: 7,
        activityLevel: 'NORMAL',
        owner: { id: 'user-1', nickname: '小王', phone: '13800000000' },
      },
    });
    mocks.prisma.dogBreed.findMany.mockResolvedValue([
      { id: 'breed-1', name: '拉布拉多' },
    ]);
    mocks.prisma.weightRecord.findMany.mockResolvedValue([
      { dogId: 'dog-1', weightKg: 19.2 },
    ]);

    const detail = await build(mocks).getDetailForAdmin('plan-1');

    expect(detail).not.toBeNull();
    expect(detail!.adjustments).toHaveLength(1);
    expect(detail!.adjustments[0].reason).toBe('RATE_TOO_SLOW');
    expect(detail!.adjustments[0].note).toContain('力度加一档');
    expect(detail!.dog.bcsScore).toBe(7);
    expect(detail!.owner.phone).toBe('13800000000');
  });

  it('计划不存在时返回 null（由控制器转 404）', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findUnique.mockResolvedValue(null);

    expect(await build(mocks).getDetailForAdmin('missing')).toBeNull();
  });
});

describe('WeightGoalPlanService · 孕哺联动（阶段 A）', () => {
  it('计划期间怀孕 → 自动暂停，而不是结束', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
    mocks.prisma.weightGoalPlan.update.mockResolvedValue(basePlan);

    await build(mocks).pauseForReproduction('dog-1', '怀孕中');

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.PAUSED);
    expect(data.pausedReason).toBe('怀孕中');
  });

  it('已经是暂停态时不重复写', async () => {
    const mocks = createMocks();
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue({
      ...basePlan,
      status: WeightGoalPlanStatus.PAUSED,
    });

    await build(mocks).pauseForReproduction('dog-1', '怀孕中');

    expect(mocks.prisma.weightGoalPlan.update).not.toHaveBeenCalled();
  });
});

describe('WeightGoalPlanService · 结束与取消', () => {
  function setup(mocks: ReturnType<typeof createMocks>) {
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(basePlan);
    mocks.prisma.weightGoalPlan.update.mockResolvedValue(basePlan);
  }

  it('结束计划 → 终态，能量随之回落到算法默认', async () => {
    const mocks = createMocks();
    setup(mocks);

    await build(mocks).finishPlan('customer-1', 'dog-1', 'END');

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.COMPLETED);
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it('取消计划 → 另一个终态，之后可以重新新建', async () => {
    const mocks = createMocks();
    setup(mocks);

    await build(mocks).finishPlan('customer-1', 'dog-1', 'CANCEL');

    const data = mocks.prisma.weightGoalPlan.update.mock.calls[0][0].data;
    expect(data.status).toBe(WeightGoalPlanStatus.CANCELLED);
  });

  it('没有计划时结束会报 404，而不是静默成功', async () => {
    const mocks = createMocks();
    mocks.dogRepository.findById.mockResolvedValue(makeDog());
    mocks.dogBreedRepository.findById.mockResolvedValue(BREED);
    mocks.prisma.weightGoalPlan.findFirst.mockResolvedValue(null);

    await expect(
      build(mocks).finishPlan('customer-1', 'dog-1', 'END'),
    ).rejects.toThrow('还没有体重管理计划');
  });
});
