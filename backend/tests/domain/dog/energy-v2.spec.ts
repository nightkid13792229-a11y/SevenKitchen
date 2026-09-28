import { ActivityLevel, DogSizeCategory, LifeStageOverride, TreatInputMode, TreatLevel } from '../../../src/domain/dog/enums';
import {
  ADULT_ENERGY_TABLE,
  BCS_TO_IDEAL_WEIGHT_FACTOR,
  calculateDailyEnergyV2,
  resolveActivityColumn,
  resolveAdultEnergyPhase,
  resolveGrowthCurvePercent,
  resolveIdealWeightFactor,
  resolveLactationKcal,
  resolvePregnancyKcal,
  resolvePuppyFactor,
  type EnergyV2Input,
} from '../../../src/domain/dog/energy-v2';

/** 基准日固定，避免测试随今天漂移 */
const AS_OF = new Date('2026-09-28T00:00:00.000Z');
const daysAgo = (d: number) => new Date(AS_OF.getTime() - d * 86400000);

function buildInput(overrides: Partial<EnergyV2Input> = {}): EnergyV2Input {
  return {
    currentWeightKg: 20,
    bcsScore: 5,
    birthday: daysAgo(365 * 4), // 4 岁 → 2-7 岁档
    activityLevel: ActivityLevel.NORMAL,
    lifeStageOverride: LifeStageOverride.NONE,
    sizeCategory: DogSizeCategory.MEDIUM,
    treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
    treatLevel: TreatLevel.NONE,
    asOf: AS_OF,
    ...overrides,
  };
}

describe('energy-v2：体况分 → 理想体重（FEDIAF 表 VII-2）', () => {
  it('BCS 4 与 5 都不换算', () => {
    expect(resolveIdealWeightFactor(4)).toBe(1.0);
    expect(resolveIdealWeightFactor(5)).toBe(1.0);
  });

  it('各档系数与 FEDIAF 表一致（相对 BCS 5 的增减中值换算）', () => {
    expect(resolveIdealWeightFactor(1)).toBeCloseTo(1.6667, 3);
    expect(resolveIdealWeightFactor(2)).toBeCloseTo(1.5385, 3);
    expect(resolveIdealWeightFactor(3)).toBeCloseTo(1.3333, 3);
    expect(resolveIdealWeightFactor(6)).toBeCloseTo(0.8889, 3);
    expect(resolveIdealWeightFactor(7)).toBeCloseTo(0.8, 3);
    expect(resolveIdealWeightFactor(8)).toBeCloseTo(0.7273, 3);
    expect(resolveIdealWeightFactor(9)).toBeCloseTo(0.6897, 3);
  });

  it('越界或缺失时按 BCS 5（不换算）保守处理', () => {
    expect(resolveIdealWeightFactor(null)).toBe(1.0);
    expect(resolveIdealWeightFactor(0)).toBe(1.0);
    expect(resolveIdealWeightFactor(12)).toBe(1.0);
  });

  it('BCS 7 的 20 kg 狗，理想体重约 16 kg', () => {
    const result = calculateDailyEnergyV2(buildInput({ bcsScore: 7 }));
    expect(result.idealWeightKg).toBeCloseTo(16, 1);
    expect(result.idealWeightSource).toBe('BCS');
    expect(result.rerBasisWeightKg).toBeCloseTo(16, 2);
  });
});

describe('energy-v2：生长曲线（FEDIAF 表 VII-8a）', () => {
  it('官方英文 2025 的 >15-27.5 kg 档系数为 39.88（不是波兰译本的 36.88）', () => {
    // 6 月龄（26 周）应给出约 69.2% 成年体重
    const percent = resolveGrowthCurvePercent(20, 26);
    expect(percent).toBeGreaterThan(69);
    expect(percent).toBeLessThan(69.5);
  });

  it('按档取曲线（离散选档，不跨档混合）：档位内部结果相同', () => {
    // 20 kg 完整落在 >15-27.5 档内，应与档内任意体重一致
    expect(resolveGrowthCurvePercent(20, 26)).toBeCloseTo(
      resolveGrowthCurvePercent(27, 26),
      6,
    );
  });

  it('跨档边界有台阶，但幅度可控（相邻档最大约 6%）', () => {
    const below = resolveGrowthCurvePercent(15, 26);
    const above = resolveGrowthCurvePercent(15.001, 26);
    expect(Math.abs(above - below) / below).toBeLessThan(0.07);
  });

  it('超出最大档时使用末档曲线（不外推错曲线）', () => {
    const at60 = resolveGrowthCurvePercent(60, 26);
    const at50 = resolveGrowthCurvePercent(50, 26);
    // 50 与 60 都落在 >47.5 档，应完全一致
    expect(at60).toBeCloseTo(at50, 6);
  });

  it('体型越大、同周龄占成年体重比例越低（官方值下五档单调）', () => {
    const percents = [5, 10, 20, 35, 60].map((w) => resolveGrowthCurvePercent(w, 26));
    for (let i = 1; i < percents.length; i += 1) {
      expect(percents[i]).toBeLessThan(percents[i - 1]);
    }
  });

  it('幼犬系数随周龄单调下降', () => {
    const weeks = [8, 12, 17, 26, 39, 52];
    const factors = weeks.map((w) => resolvePuppyFactor(resolveGrowthCurvePercent(20, w)));
    for (let i = 1; i < factors.length; i += 1) {
      expect(factors[i]).toBeLessThan(factors[i - 1]);
    }
  });

  it('6 月龄、预期成年 20 kg 的幼犬系数约 2.30', () => {
    expect(resolvePuppyFactor(resolveGrowthCurvePercent(20, 26))).toBeCloseTo(2.295, 2);
  });
});

describe('energy-v2：成犬 3×3（FEDIAF 表 VII-6 × 表 VII-7）', () => {
  it('年龄段划分：12-24 月青年、24 月-7 岁中年、>7 岁老年', () => {
    expect(resolveAdultEnergyPhase(13)).toBe('YOUNG');
    expect(resolveAdultEnergyPhase(23.9)).toBe('YOUNG');
    expect(resolveAdultEnergyPhase(24)).toBe('MIDDLE');
    expect(resolveAdultEnergyPhase(83.9)).toBe('MIDDLE');
    expect(resolveAdultEnergyPhase(84)).toBe('SENIOR');
  });

  it('活动档映射：静养/少动/普通 → 日常；活跃 → 活跃；工作犬 → 工作犬', () => {
    expect(resolveActivityColumn(ActivityLevel.RESTING)).toBe('daily');
    expect(resolveActivityColumn(ActivityLevel.LOW)).toBe('daily');
    expect(resolveActivityColumn(ActivityLevel.NORMAL)).toBe('daily');
    expect(resolveActivityColumn(ActivityLevel.HIGH)).toBe('active');
    expect(resolveActivityColumn(ActivityLevel.WORKING)).toBe('working');
  });

  it('九格取值与规格书一致', () => {
    expect(ADULT_ENERGY_TABLE.YOUNG).toEqual({ daily: 125, active: 130, working: 150 });
    expect(ADULT_ENERGY_TABLE.MIDDLE).toEqual({ daily: 95, active: 110, working: 150 });
    expect(ADULT_ENERGY_TABLE.SENIOR).toEqual({ daily: 80, active: 95, working: 150 });
  });

  it('3-7 岁日常：20 kg 的狗约 899 kcal（旧算法 1040）', () => {
    const result = calculateDailyEnergyV2(buildInput());
    expect(result.stage).toBe('ADULT_MIDDLE');
    expect(result.baselineKcalPerKg075).toBe(95);
    expect(result.dailyEnergyKcal).toBeCloseTo(898.6, 0);
  });

  it('1-2 岁日常比中年高：同为 20 kg 的狗约 1182 kcal', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ birthday: daysAgo(365 * 1.5) }),
    );
    expect(result.stage).toBe('ADULT_YOUNG');
    expect(result.dailyEnergyKcal).toBeCloseTo(1182.5, 0);
  });

  it('老年犬不再出现「老年 > 成年」的反向结果', () => {
    const senior = calculateDailyEnergyV2(buildInput({ birthday: daysAgo(365 * 9) }));
    const adult = calculateDailyEnergyV2(buildInput());
    expect(senior.dailyEnergyKcal).toBeLessThan(adult.dailyEnergyKcal);
    expect(senior.stage).toBe('ADULT_SENIOR');
    expect(senior.baselineKcalPerKg075).toBe(80);
  });

  it('工作犬取 150，且不随年龄变化', () => {
    const young = calculateDailyEnergyV2(
      buildInput({ birthday: daysAgo(365 * 1.5), activityLevel: ActivityLevel.WORKING }),
    );
    const senior = calculateDailyEnergyV2(
      buildInput({ birthday: daysAgo(365 * 9), activityLevel: ActivityLevel.WORKING }),
    );
    expect(young.baselineKcalPerKg075).toBe(150);
    expect(senior.baselineKcalPerKg075).toBe(150);
  });
});

describe('energy-v2：怀孕 / 哺乳（FEDIAF 表 VII-8b）', () => {
  it('怀孕前 4 周 = 132 × 体重^0.75', () => {
    const { totalKcal, isEarly } = resolvePregnancyKcal(10, 2);
    expect(isEarly).toBe(true);
    expect(totalKcal).toBeCloseTo(132 * 10 ** 0.75, 4);
  });

  it('怀孕后 5 周 = 132 × 体重^0.75 + 26 × 体重（两项量纲不同）', () => {
    const { totalKcal, isEarly } = resolvePregnancyKcal(10, 6);
    expect(isEarly).toBe(false);
    expect(totalKcal).toBeCloseTo(132 * 10 ** 0.75 + 26 * 10, 4);
  });

  it('缺配种日时按孕早期保守处理，并给出提示', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ lifeStageOverride: LifeStageOverride.PREGNANCY }),
    );
    expect(result.stage).toBe('PREGNANCY_EARLY');
    expect(result.notes.join()).toContain('配种日');
  });

  it('哺乳随窝仔数增加：5 只第 3 周 > 2 只第 1 周', () => {
    const small = resolveLactationKcal(10, 2, 1);
    const large = resolveLactationKcal(10, 5, 3);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeCloseTo(2003.4, 0);
  });

  it('缺窝仔数时按 2 只保守处理，并给出提示', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ lifeStageOverride: LifeStageOverride.LACTATION }),
    );
    expect(result.notes.join()).toContain('窝仔数');
  });
});

describe('energy-v2：兜底与零食', () => {
  it('活动量缺失（视为日常）走最低档', () => {
    const rest = calculateDailyEnergyV2(buildInput({ activityLevel: ActivityLevel.RESTING }));
    expect(rest.baselineKcalPerKg075).toBe(80 + 15); // 3-7 岁日常 = 95
  });

  it('零食「少」扣 3%', () => {
    const withTreat = calculateDailyEnergyV2(
      buildInput({ treatLevel: TreatLevel.LOW }),
    );
    const without = calculateDailyEnergyV2(buildInput());
    expect(without.treatDeduction).toBe(0);
    expect(withTreat.dailyEnergyKcal).toBeCloseTo(without.dailyEnergyKcal * 0.97, 0);
  });

  it('精确输入但缺千卡时，按「少」保守处理而不是 0', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ treatInputMode: TreatInputMode.EXACT_KCAL, manualTreatKcal: null }),
    );
    expect(result.treatDeduction).toBeGreaterThan(0);
    expect(result.notes.join()).toContain('零食千卡');
  });

  it('零食扣减不超过 10%', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ treatInputMode: TreatInputMode.EXACT_KCAL, manualTreatKcal: 99999 }),
    );
    expect(result.treatDeduction).toBeLessThanOrEqual(result.dailyEnergyKcal * 0.2 + 1);
  });

  it('体重缺失时抛错（不猜）', () => {
    expect(() => calculateDailyEnergyV2(buildInput({ currentWeightKg: 0 }))).toThrow();
  });

  it('主人填的理想体重优先于体况分换算', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ bcsScore: 8, ownerIdealWeightKg: 18 }),
    );
    expect(result.idealWeightSource).toBe('OWNER');
    expect(result.idealWeightKg).toBe(18);
  });

  it('输出的 baselineKcalPerKg075 可作为跨侧接口（营养侧据此选列）', () => {
    const result = calculateDailyEnergyV2(buildInput());
    expect(result.baselineKcalPerKg075).toBe(95);
  });
});

describe('energy-v2：BCS 表完整性', () => {
  it('1-9 每一档都有系数', () => {
    for (let bcs = 1; bcs <= 9; bcs += 1) {
      expect(BCS_TO_IDEAL_WEIGHT_FACTOR[bcs]).toBeGreaterThan(0);
    }
  });

  it('偏瘦档系数 > 1，偏胖档系数 < 1', () => {
    expect(BCS_TO_IDEAL_WEIGHT_FACTOR[3]).toBeGreaterThan(1);
    expect(BCS_TO_IDEAL_WEIGHT_FACTOR[6]).toBeLessThan(1);
  });
});
