import {
  WeightGoalAdjustmentReason,
  WeightGoalDirection,
} from 'src/domain/dog/enums';
import {
  GAIN_CEILING_FACTOR,
  GAIN_INTENSITY_LEVELS,
  GAIN_START_FACTOR,
  INACTIVITY_PAUSE_WEEKS,
  LOSS_FLOOR_RER_FACTOR,
  LOSS_INTENSITY_LEVELS,
  MAINTENANCE_DURATION_MONTHS,
  MAINTENANCE_UPLIFT_FACTOR,
  TARGET_RATE_MAX_PERCENT_PER_WEEK,
  TARGET_RATE_MIN_PERCENT_PER_WEEK,
  applyManualTargetWeight,
  calculateRatePercentPerWeek,
  calculateRerForWeight,
  evaluateWeightGainScreening,
  isGoalReached,
  resolveAdjustableIntensities,
  resolveCorrection,
  resolveEstimatedGoalDate,
  resolveIntensityLevels,
  resolveNextReviewDate,
  resolvePlanEnergy,
  resolvePlanSafeguards,
  resolveProgressRate,
  resolveSuggestedPlan,
  shouldCompleteMaintenance,
  shouldPauseForInactivity,
} from 'src/domain/dog/weight-goal-plan';

/**
 * 体重管理计划 · 领域逻辑（阶段 B）
 *
 * 老板原话：不只是给用户一个记录体重的工具，而是真真正正能指导用户
 * 通过饮食增减重的可执行方案。
 *
 * 这组测试锁住三样东西：
 *   1. 系统建议怎么算（目标体重、起步能量、安全边界）
 *   2. 自动校正的三条规则（太慢/在区间/太快）与撞边界后的行为
 *   3. 状态流转的判定（达标、8 周未称重、维持期满 3 个月）
 */

const DAY = 1000 * 60 * 60 * 24;

describe('体重管理计划 · 系统建议', () => {
  it('BCS 6/7/9 → 减重，目标体重按 FEDIAF 表 VII-2 换算', () => {
    // BCS 7 的换算系数是 1/1.25 → 20kg 的理想体重是 16kg
    const plan = resolveSuggestedPlan({
      currentWeightKg: 20,
      bcsScore: 7,
      maintenanceKcal: 800,
      asOf: new Date('2026-09-29T00:00:00Z'),
    });

    expect(plan).not.toBeNull();
    expect(plan!.direction).toBe(WeightGoalDirection.LOSS);
    expect(plan!.targetWeightKg).toBe(16);
  });

  it('BCS 1/2/3 → 增重', () => {
    const plan = resolveSuggestedPlan({
      currentWeightKg: 10,
      bcsScore: 2,
      maintenanceKcal: 500,
      asOf: new Date('2026-09-29T00:00:00Z'),
    });

    expect(plan).not.toBeNull();
    expect(plan!.direction).toBe(WeightGoalDirection.GAIN);
    // BCS 2 系数 1/0.65 = 1.5385 → 10 × 1.5385 = 15.38
    expect(plan!.targetWeightKg).toBe(15.38);
  });

  it('BCS 4-5 是理想区间，不给增减重建议', () => {
    // FEDIAF：犬应维持 BCS 4-5 —— 落在这一档就不该建计划
    for (const bcsScore of [4, 5]) {
      expect(
        resolveSuggestedPlan({
          currentWeightKg: 20,
          bcsScore,
          maintenanceKcal: 800,
        }),
      ).toBeNull();
    }
  });

  it('主人手填的理想体重优先级最高', () => {
    const plan = resolveSuggestedPlan({
      currentWeightKg: 20,
      bcsScore: 7,
      ownerIdealWeightKg: 18,
      maintenanceKcal: 800,
    });

    expect(plan!.targetWeightKg).toBe(18);
  });

  it('减重起步力度 = RER(目标体重) × 1.0', () => {
    const plan = resolveSuggestedPlan({
      currentWeightKg: 20,
      bcsScore: 7,
      maintenanceKcal: 800,
    });

    // RER(16) = 70 × 16^0.75 = 70 × 8 = 560
    expect(plan!.startKcal).toBe(560);
    expect(calculateRerForWeight(16)).toBe(560);
  });

  it('增重起步力度 = 维持需求 × 1.10（我们的取值，无权威依据）', () => {
    const plan = resolveSuggestedPlan({
      currentWeightKg: 10,
      bcsScore: 2,
      maintenanceKcal: 500,
    });

    expect(plan!.startKcal).toBe(Math.round(500 * GAIN_START_FACTOR));
  });

  it('安全边界：减重卡下限 0.6×RER(目标)、上限不超过维持量', () => {
    const { floorKcal, ceilingKcal } = resolvePlanSafeguards({
      direction: WeightGoalDirection.LOSS,
      targetWeightKg: 16,
      maintenanceKcal: 800,
    });

    expect(floorKcal).toBe(Math.round(560 * LOSS_FLOOR_RER_FACTOR));
    // 减重期间绝不超过维持量 —— 超了就不是减重了
    expect(ceilingKcal).toBe(800);
  });

  it('安全边界：增重下限不低于维持量、上限 1.4×维持量', () => {
    const { floorKcal, ceilingKcal } = resolvePlanSafeguards({
      direction: WeightGoalDirection.GAIN,
      targetWeightKg: 15.38,
      maintenanceKcal: 500,
    });

    expect(floorKcal).toBe(500);
    expect(ceilingKcal).toBe(Math.round(500 * GAIN_CEILING_FACTOR));
  });

  it('目标体重离当前体重 <5% 时提示（但不拦）', () => {
    // 20kg 的狗目标定 19.5kg，只差 2.5%
    const plan = resolveSuggestedPlan({
      currentWeightKg: 20,
      bcsScore: 6,
      ownerIdealWeightKg: 19.5,
      maintenanceKcal: 800,
    });

    expect(plan!.notes.join('')).toContain('变化太小');
  });

  it('预计达标日按等比衰减推算，而不是线性除法', () => {
    const startDate = new Date('2026-09-29T00:00:00Z');
    const estimated = resolveEstimatedGoalDate({
      currentWeightKg: 20,
      targetWeightKg: 16,
      targetRatePercentPerWeek: 1,
      startDate,
    });

    // ln(16/20) / ln(0.99) = 22.2 周 → 155 天
    const days = (estimated!.getTime() - startDate.getTime()) / DAY;
    expect(days).toBe(155);
  });

  it('体重缺失或非法时不给建议，而不是抛错', () => {
    expect(
      resolveSuggestedPlan({ currentWeightKg: 0, bcsScore: 7, maintenanceKcal: 800 }),
    ).toBeNull();
    expect(
      resolveSuggestedPlan({ currentWeightKg: 20, bcsScore: 7, maintenanceKcal: 0 }),
    ).toBeNull();
  });
});

describe('体重管理计划 · 速率计算', () => {
  it('按体重变化方向带符号：掉重为负、增重为正', () => {
    // 20kg 两周掉到 19.6kg → −1.0%/周（与顾客看到的口径一致）
    expect(
      calculateRatePercentPerWeek({
        previousWeightKg: 20,
        currentWeightKg: 19.6,
        elapsedDays: 14,
      }),
    ).toBe(-1);

    expect(
      calculateRatePercentPerWeek({
        previousWeightKg: 20,
        currentWeightKg: 20.4,
        elapsedDays: 14,
      }),
    ).toBe(1);
  });

  it('间隔为 0 或体重非法时返回 null（宁可不动，也不按脏数据调热量）', () => {
    expect(
      calculateRatePercentPerWeek({
        previousWeightKg: 20,
        currentWeightKg: 19,
        elapsedDays: 0,
      }),
    ).toBeNull();
    expect(
      calculateRatePercentPerWeek({
        previousWeightKg: 0,
        currentWeightKg: 19,
        elapsedDays: 14,
      }),
    ).toBeNull();
  });

  it('朝目标推进的速率按方向换算成统一口径', () => {
    // 减重计划：体重掉了 → 正数（在往目标走）
    expect(resolveProgressRate(WeightGoalDirection.LOSS, -1)).toBe(1);
    // 减重计划：体重涨了 → 负数（在倒退）
    expect(resolveProgressRate(WeightGoalDirection.LOSS, 0.5)).toBe(-0.5);
    // 增重计划：体重涨了 → 正数
    expect(resolveProgressRate(WeightGoalDirection.GAIN, 1)).toBe(1);
  });
});

describe('体重管理计划 · 自动校正', () => {
  const base = {
    direction: WeightGoalDirection.LOSS,
    currentKcal: 560,
    floorKcal: 336,
    ceilingKcal: 800,
  };

  it('推进太慢（<0.5%/周）→ 力度加一档，减重时是降能量', () => {
    // 两周只掉 0.2% → 0.1%/周
    const result = resolveCorrection({ ...base, progressRatePercentPerWeek: 0.1 });

    expect(result.action).toBe('MORE_AGGRESSIVE');
    expect(result.reason).toBe(WeightGoalAdjustmentReason.RATE_TOO_SLOW);
    expect(result.nextKcal).toBe(476); // 560 × 0.85
    expect(result.nextKcal).toBeLessThan(base.currentKcal);
  });

  it('在目标区间内 → 保持不动', () => {
    const result = resolveCorrection({ ...base, progressRatePercentPerWeek: 1 });

    expect(result.action).toBe('HOLD');
    expect(result.nextKcal).toBe(base.currentKcal);
    expect(result.reason).toBeNull();
  });

  it('推进太快（>2%/周）→ 力度退一档，减重时是升能量（减太快会掉肌肉）', () => {
    const result = resolveCorrection({ ...base, progressRatePercentPerWeek: 2.5 });

    expect(result.action).toBe('LESS_AGGRESSIVE');
    expect(result.reason).toBe(WeightGoalAdjustmentReason.RATE_TOO_FAST);
    expect(result.nextKcal).toBe(616); // 560 × 1.10
  });

  it('已撞下限就不再下调，并写明原因', () => {
    const result = resolveCorrection({
      ...base,
      currentKcal: 336, // 已经等于下限
      progressRatePercentPerWeek: 0.1,
    });

    expect(result.action).toBe('BLOCKED');
    expect(result.nextKcal).toBe(336);
    expect(result.reason).toBe(WeightGoalAdjustmentReason.FLOOR_REACHED);
    expect(result.note).toContain('安全下限');
  });

  it('加力度不会越过下限（幅度被夹紧）', () => {
    // 从 360 降 15% 应到 306，但下限是 336 → 夹到 336
    const result = resolveCorrection({
      ...base,
      currentKcal: 360,
      progressRatePercentPerWeek: 0.1,
    });

    expect(result.action).toBe('MORE_AGGRESSIVE');
    expect(result.nextKcal).toBe(336);
  });

  it('增重方向：太慢是升能量、太快是降能量（与减重完全对称）', () => {
    const gainBase = {
      direction: WeightGoalDirection.GAIN,
      currentKcal: 550,
      floorKcal: 500,
      ceilingKcal: 700,
    };

    const tooSlow = resolveCorrection({ ...gainBase, progressRatePercentPerWeek: 0.1 });
    expect(tooSlow.action).toBe('MORE_AGGRESSIVE');
    expect(tooSlow.nextKcal).toBe(633); // 550 × 1.15

    const tooFast = resolveCorrection({ ...gainBase, progressRatePercentPerWeek: 3 });
    expect(tooFast.action).toBe('LESS_AGGRESSIVE');
    // 550 × 0.90 = 495，但增重计划的能量**绝不能低于维持量** 500 → 夹到 500
    expect(tooFast.nextKcal).toBe(gainBase.floorKcal);
  });

  it('增重撞上限后不再上调', () => {
    const result = resolveCorrection({
      direction: WeightGoalDirection.GAIN,
      currentKcal: 700,
      floorKcal: 500,
      ceilingKcal: 700,
      progressRatePercentPerWeek: 0,
    });

    expect(result.action).toBe('BLOCKED');
    expect(result.nextKcal).toBe(700);
  });

  it('速率缺失时保持不动，不按脏数据调热量', () => {
    const result = resolveCorrection({ ...base, progressRatePercentPerWeek: Number.NaN });

    expect(result.action).toBe('HOLD');
    expect(result.nextKcal).toBe(base.currentKcal);
  });

  it('目标区间边界（正好 0.5 与 2.0）算在区间内', () => {
    for (const rate of [
      TARGET_RATE_MIN_PERCENT_PER_WEEK,
      TARGET_RATE_MAX_PERCENT_PER_WEEK,
    ]) {
      expect(resolveCorrection({ ...base, progressRatePercentPerWeek: rate }).action).toBe(
        'HOLD',
      );
    }
  });
});

describe('体重管理计划 · 顾客手动改目标体重', () => {
  const base = {
    direction: WeightGoalDirection.LOSS,
    suggestedTargetWeightKg: 16,
    currentWeightKg: 20,
    maintenanceKcal: 800,
  };

  it('完全自由可调，不受「只能更温和」限制', () => {
    // 老板决定：系统算出的目标体重本身有不确定性，权限交还顾客。
    // 顾客想把目标定得比建议更低（17 → 15），也必须允许。
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 15 });

    expect(result).not.toBeNull();
    expect(result!.targetWeightKg).toBe(15);
  });

  it('偏离当前体重 >30% 时提示一次，但不拦截', () => {
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 13 });

    expect(result!.targetWeightKg).toBe(13);
    expect(result!.notes.join('')).toContain('相差超过 30%');
  });

  it('与系统建议相差 >10% 时提示一次，且不用专业词（2026-10-04 补）', () => {
    // 系统建议 16kg、顾客填 13kg → 相差 18.75%
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 13 });

    const note = result!.notes.find((n) =>
      n.includes('系统按它现在的体形建议目标'),
    );
    expect(note).toBeTruthy();
    // 老板要求：面向狗家长的界面不用专业词
    expect(note).not.toContain('体况');
    expect(note).not.toContain('理想体重');
  });

  it('与系统建议接近时不提示', () => {
    // 16kg 的建议、填 15.5kg → 相差 3%
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 15.5 });

    expect(
      result!.notes.some((n) => n.includes('系统按它现在的体形建议目标')),
    ).toBe(false);
  });

  it('改目标后能量按同一口径重算', () => {
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 15 });

    // RER(15) = 70 × 15^0.75
    expect(result!.kcal).toBe(Math.round(calculateRerForWeight(15)));
  });

  it('重算出来的能量仍被安全区间夹紧（第三道护栏）', () => {
    // 目标定得极低 → RER 跟着变低，但不能低于下限
    const result = applyManualTargetWeight({ ...base, newTargetWeightKg: 5 });

    expect(result!.kcal).toBeGreaterThanOrEqual(result!.floorKcal);
  });

  it('目标非法时返回 null', () => {
    expect(applyManualTargetWeight({ ...base, newTargetWeightKg: 0 })).toBeNull();
    expect(
      applyManualTargetWeight({ ...base, newTargetWeightKg: Number.NaN }),
    ).toBeNull();
  });
});

describe('体重管理计划 · 状态流转', () => {
  it('达标判定按方向相反', () => {
    expect(
      isGoalReached({
        direction: WeightGoalDirection.LOSS,
        currentWeightKg: 15.9,
        targetWeightKg: 16,
      }),
    ).toBe(true);

    expect(
      isGoalReached({
        direction: WeightGoalDirection.GAIN,
        currentWeightKg: 15.9,
        targetWeightKg: 16,
      }),
    ).toBe(false);
    expect(
      isGoalReached({
        direction: WeightGoalDirection.GAIN,
        currentWeightKg: 16.1,
        targetWeightKg: 16,
      }),
    ).toBe(true);
  });

  it('连续 8 周未称重 → 该转暂停', () => {
    const asOf = new Date('2026-09-29T00:00:00Z');

    expect(
      shouldPauseForInactivity({
        lastWeighInDate: new Date(asOf.getTime() - (INACTIVITY_PAUSE_WEEKS * 7 + 1) * DAY),
        asOf,
      }),
    ).toBe(true);

    expect(
      shouldPauseForInactivity({
        lastWeighInDate: new Date(asOf.getTime() - (INACTIVITY_PAUSE_WEEKS * 7 - 2) * DAY),
        asOf,
      }),
    ).toBe(false);
  });

  it('从未称重过不触发暂停（刚建的计划不该立刻被暂停）', () => {
    expect(shouldPauseForInactivity({ lastWeighInDate: null })).toBe(false);
  });

  it('维持期满 3 个月 → 该自动结束', () => {
    const asOf = new Date('2026-09-29T00:00:00Z');

    expect(
      shouldCompleteMaintenance({
        maintenanceStartedAt: new Date(
          asOf.getTime() - (MAINTENANCE_DURATION_MONTHS * 30.4375 + 1) * DAY,
        ),
        asOf,
      }),
    ).toBe(true);

    expect(
      shouldCompleteMaintenance({
        maintenanceStartedAt: new Date(asOf.getTime() - 30 * DAY),
        asOf,
      }),
    ).toBe(false);
  });

  it('复查间隔：在目标区间内时放宽到 5 周，否则 2 周', () => {
    const from = new Date('2026-09-29T00:00:00Z');

    expect((resolveNextReviewDate({ from, onTrack: false }).getTime() - from.getTime()) / DAY).toBe(14);
    expect((resolveNextReviewDate({ from, onTrack: true }).getTime() - from.getTime()) / DAY).toBe(35);
  });
});

describe('增重前的站内排查', () => {
  it('前 3 项任一为「是」→ 提示就医', () => {
    const result = evaluateWeightGainScreening({ losing_weight: true });

    expect(result.needsVet).toBe(true);
    expect(result.dangerReasons).toHaveLength(1);
  });

  it('后 2 项（驱虫、换粮）只是背景信息，不影响放行', () => {
    const result = evaluateWeightGainScreening({
      dewormed_on_schedule: true,
      changed_food: true,
    });

    expect(result.needsVet).toBe(false);
    expect(result.dangerReasons).toHaveLength(0);
  });

  it('全部正常 → 允许进入增重方案', () => {
    const result = evaluateWeightGainScreening({
      losing_weight: false,
      poor_appetite: false,
      vomiting_diarrhea: false,
      dewormed_on_schedule: true,
      changed_food: false,
    });

    expect(result.needsVet).toBe(false);
  });

  it('没答也算没危险信号（缺数据不拦，由前端保证必答）', () => {
    expect(evaluateWeightGainScreening({}).needsVet).toBe(false);
  });
});

describe('常量口径', () => {
  it('维持期上浮 10%（AAHA）', () => {
    expect(MAINTENANCE_UPLIFT_FACTOR).toBe(1.1);
  });

  it('目标速率区间与 SACN5 一致', () => {
    expect(TARGET_RATE_MIN_PERCENT_PER_WEEK).toBe(0.5);
    expect(TARGET_RATE_MAX_PERCENT_PER_WEEK).toBe(2);
  });

  it('减重起步与下限都锚在 RER 上', () => {
    const loss = resolvePlanEnergy({
      direction: WeightGoalDirection.LOSS,
      targetWeightKg: 16,
      maintenanceKcal: 800,
    });
    expect(loss).toBe(560);
  });
});

/**
 * 力度档位的命名（2026-10-04 修正）。
 *
 * 背景：增重方向原先沿用减重的档位名「标准 / 温和 / 更温和」——
 * 但增重时系数越大 = 热量越多 = **长肉越快**，叫"更温和"会让人
 * 以为最保守、实际选到最快的一档。这里把命名钉住。
 */
describe('体重管理计划 · 力度档位命名', () => {
  it('增重档位按「越快」命名，与"系数越大 = 长肉越快"一致', () => {
    expect(GAIN_INTENSITY_LEVELS.map((l) => l.label)).toEqual([
      '标准',
      '加快',
      '更快',
    ]);
  });

  it('增重系数递增：1.1 / 1.2 / 1.3', () => {
    expect(GAIN_INTENSITY_LEVELS.map((l) => l.factor)).toEqual([1.1, 1.2, 1.3]);
  });

  it('减重档位仍是「越温和」命名（系数越大 = 掉秤越慢）', () => {
    expect(LOSS_INTENSITY_LEVELS.map((l) => l.label)).toEqual([
      '标准',
      '温和',
      '更温和',
    ]);
  });
});

/**
 * 可调力度档位的"只能往更安全方向调"规则（2026-10-04 修正）。
 *
 * 原先两种情况都判 `kcal ≥ 当前`，增重计划里"允许"的恰好是更激进的档位 ——
 * 与"更激进留给系统自动校正"的原则相反。这里把两个方向都钉住。
 */
describe('体重管理计划 · 可调力度档位', () => {
  const levelsFor = (direction: 'LOSS' | 'GAIN') =>
    resolveIntensityLevels(direction as WeightGoalDirection).map((level) => ({
      level,
      // 减重：系数越大热量越多；增重同理（都相对各自的基准）
      kcal: Math.round(1000 * level.factor),
    }));

  it('减重：只能往更温和调（热量不低于当前值）', () => {
    const { available, currentLevel } = resolveAdjustableIntensities({
      direction: 'LOSS' as WeightGoalDirection,
      levelKcal: levelsFor('LOSS'),
      currentKcal: 1000,
    });

    expect(available.map((l) => l.allowed)).toEqual([true, true, true]);
    expect(currentLevel.key).toBe('STANDARD');

    const higher = resolveAdjustableIntensities({
      direction: 'LOSS' as WeightGoalDirection,
      levelKcal: levelsFor('LOSS'),
      currentKcal: 1100,
    });
    // 当前已在 ×1.1：只有不更激进的档位（≥1100）可选
    expect(higher.available.map((l) => l.allowed)).toEqual([false, true, true]);
    expect(higher.currentLevel.key).toBe('GENTLE');
  });

  it('⚠️ 增重：只能往更保守调（热量不高于当前值）—— 这是被修掉的反向 bug', () => {
    const { available, currentLevel } = resolveAdjustableIntensities({
      direction: 'GAIN' as WeightGoalDirection,
      levelKcal: levelsFor('GAIN'),
      currentKcal: 1200,
    });

    // 当前是 ×1.2：只能选 ≤1200 的档位（标准 1.1），不能选更快的 ×1.3
    expect(available.map((l) => l.allowed)).toEqual([true, true, false]);
    expect(currentLevel.key).toBe('GENTLE');
  });

  it('增重：当前已在最低档时，更快的那两档都不可选', () => {
    const { available, currentLevel } = resolveAdjustableIntensities({
      direction: 'GAIN' as WeightGoalDirection,
      levelKcal: levelsFor('GAIN'),
      currentKcal: 1100,
    });

    expect(available.map((l) => l.allowed)).toEqual([true, false, false]);
    expect(currentLevel.key).toBe('STANDARD');
  });
});

/**
 * 顾客坚持要的方向（2026-10-05 老板要求）。
 *
 * 背景：体况在理想区间（4-5）时系统本来不给建议，定制页的
 * 「去制定体重管理计划」按钮点进去只有一句"不需要增减重计划"。
 * 老板要求给坚持的家长一条路，但**只在系统本来没有建议时才听顾客的**。
 */
describe('体重管理计划 · 顾客坚持的方向', () => {
  const base = {
    currentWeightKg: 7,
    bcsScore: 5,
    maintenanceKcal: 480,
  };

  it('体况理想 + 顾客坚持 → 按他说的方向给，并写明"系统原本建议维持"', () => {
    const loss = resolveSuggestedPlan({ ...base, forcedDirection: WeightGoalDirection.LOSS });
    const gain = resolveSuggestedPlan({ ...base, forcedDirection: WeightGoalDirection.GAIN });

    expect(loss?.direction).toBe(WeightGoalDirection.LOSS);
    expect(gain?.direction).toBe(WeightGoalDirection.GAIN);
    expect(loss?.notes.join('')).toContain('原本建议维持');
    expect(loss?.notes.join('')).toContain('按你要求');
  });

  it('体况理想 + 顾客没坚持 → 仍旧不给建议（老行为不变）', () => {
    expect(resolveSuggestedPlan(base)).toBeNull();
    expect(resolveSuggestedPlan({ ...base, forcedDirection: null })).toBeNull();
  });

  it('体况不理想时顾客改不了方向：偏胖不能建增重计划', () => {
    const fat = resolveSuggestedPlan({
      currentWeightKg: 9,
      bcsScore: 7,
      maintenanceKcal: 480,
      forcedDirection: WeightGoalDirection.GAIN,
    });
    const thin = resolveSuggestedPlan({
      currentWeightKg: 5,
      bcsScore: 3,
      maintenanceKcal: 480,
      forcedDirection: WeightGoalDirection.LOSS,
    });

    expect(fat?.direction).toBe(WeightGoalDirection.LOSS);
    expect(thin?.direction).toBe(WeightGoalDirection.GAIN);
    // 没有"顾客坚持"这回事，就不该出现那句说明
    expect(fat?.notes.join('')).not.toContain('按你要求');
  });

  it('顾客坚持的方向同样受安全边界约束（能量仍在安全区间内）', () => {
    const gain = resolveSuggestedPlan({ ...base, forcedDirection: WeightGoalDirection.GAIN });
    const loss = resolveSuggestedPlan({ ...base, forcedDirection: WeightGoalDirection.LOSS });

    expect(gain!.startKcal).toBeGreaterThanOrEqual(base.maintenanceKcal);
    expect(gain!.ceilingKcal).toBeLessThanOrEqual(
      Math.round(base.maintenanceKcal * 1.4) + 1,
    );
    expect(loss!.startKcal).toBeLessThanOrEqual(base.maintenanceKcal);
    expect(loss!.floorKcal).toBeGreaterThan(0);
  });
});
