import { ActivityLevel, DogGender, LifeStageOverride, TreatInputMode, TreatLevel } from '../../../src/domain/dog/enums';
import {
  DOG_GESTATION_DAYS,
  calculateDailyEnergyV2,
  resolveGestationWeeks,
  type EnergyV2Input,
} from '../../../src/domain/dog/energy-v2';

const AS_OF = new Date('2026-09-28T00:00:00.000Z');
const daysAgo = (d: number) => new Date(AS_OF.getTime() - d * 86400000);
const daysAhead = (d: number) => new Date(AS_OF.getTime() + d * 86400000);

function buildInput(overrides: Partial<EnergyV2Input> = {}): EnergyV2Input {
  return {
    currentWeightKg: 10,
    bcsScore: 5,
    birthday: daysAgo(365 * 4),
    activityLevel: ActivityLevel.NORMAL,
    lifeStageOverride: LifeStageOverride.NONE,
    sizeCategory: null,
    treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
    treatLevel: TreatLevel.NONE,
    asOf: AS_OF,
    ...overrides,
  };
}

describe('繁殖期信息（阶段 A）：孕周推算', () => {
  it('由预产期反推孕周：还有 7 周生产 = 怀孕第 2 周', () => {
    const weeks = resolveGestationWeeks(
      { expectedDueDate: daysAhead(7 * 7) },
      AS_OF,
    );
    expect(weeks).toBeCloseTo(2, 1);
  });

  it('由配种日正推孕周', () => {
    const weeks = resolveGestationWeeks({ matingDate: daysAgo(21) }, AS_OF);
    expect(weeks).toBeCloseTo(3, 1);
  });

  it('预产期优先于配种日（兽医 B 超更准）', () => {
    const weeks = resolveGestationWeeks(
      { matingDate: daysAgo(7), expectedDueDate: daysAhead(7 * 7) },
      AS_OF,
    );
    // 若用配种日会得到 1 周；用预产期应得到 2 周
    expect(weeks).toBeCloseTo(2, 1);
  });

  it('两个日期都没有 → 返回 null（调用方按孕早期保守处理）', () => {
    expect(resolveGestationWeeks({}, AS_OF)).toBeNull();
  });

  it('配种日在未来 → 视为无效，返回 null', () => {
    expect(resolveGestationWeeks({ matingDate: daysAhead(3) }, AS_OF)).toBeNull();
  });

  it('妊娠期常数：犬约 63 天', () => {
    expect(DOG_GESTATION_DAYS).toBe(63);
  });
});

describe('繁殖期信息（阶段 A）：对能量的影响', () => {
  it('孕早期按 132 kcal/kg^0.75（旧算法全程 3.0，高估约 59%）', () => {
    const result = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.PREGNANCY,
        expectedDueDate: daysAhead(7 * 7), // 第 2 周
      }),
    );
    expect(result.stage).toBe('PREGNANCY_EARLY');
    expect(result.dailyEnergyKcal).toBeCloseTo(132 * 10 ** 0.75, 0);
  });

  it('孕后期加上 26 × 体重', () => {
    const result = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.PREGNANCY,
        expectedDueDate: daysAhead(3 * 7), // 第 6 周
      }),
    );
    expect(result.stage).toBe('PREGNANCY_LATE');
    expect(result.dailyEnergyKcal).toBeCloseTo(132 * 10 ** 0.75 + 26 * 10, 0);
  });

  it('缺日期时按孕早期保守处理，并给出提示', () => {
    const result = calculateDailyEnergyV2(
      buildInput({ lifeStageOverride: LifeStageOverride.PREGNANCY }),
    );
    expect(result.stage).toBe('PREGNANCY_EARLY');
    expect(result.notes.join()).toContain('配种日');
  });

  it('哺乳期随窝仔数与产后周数变化', () => {
    const small = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        deliveryDate: daysAgo(7),
        litterSize: 2,
      }),
    );
    const large = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        deliveryDate: daysAgo(21),
        litterSize: 6,
      }),
    );
    expect(large.dailyEnergyKcal).toBeGreaterThan(small.dailyEnergyKcal * 1.5);
  });

  it('缺窝仔数时按 2 只保守处理，并给出提示', () => {
    const result = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        deliveryDate: daysAgo(7),
      }),
    );
    expect(result.notes.join()).toContain('窝仔数');
  });
});
