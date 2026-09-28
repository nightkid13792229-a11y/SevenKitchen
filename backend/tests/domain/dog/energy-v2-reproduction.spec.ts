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

  it('哺乳超期（>8 周）自动按成犬档，不再给哺乳期高能量', () => {
    const nursing = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        deliveryDate: daysAgo(7 * 4),
        litterSize: 4,
      }),
    );
    const weaned = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        deliveryDate: daysAgo(7 * 12),
        litterSize: 4,
      }),
    );
    const adult = calculateDailyEnergyV2(buildInput());

    // 哺乳第 4 周应明显高于成犬档
    expect(nursing.dailyEnergyKcal).toBeGreaterThan(adult.dailyEnergyKcal * 2);
    // 产后 12 周应已回落成成犬档（否则会被长期喂近 4 倍）
    expect(weaned.dailyEnergyKcal).toBeCloseTo(adult.dailyEnergyKcal, 0);
    expect(weaned.notes.join()).toContain('断奶');
  });

  it('哺乳缺分娩日时按成犬保守处理（无法判断是否结束）', () => {
    const result = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.LACTATION,
        litterSize: 4,
      }),
    );
    expect(result.notes.join()).toContain('分娩日');
  });

  it('预产期过去两周以上仍未更新 → 按成犬计算并提示', () => {
    const overdue = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.PREGNANCY,
        expectedDueDate: daysAgo(30),
      }),
    );
    const adult = calculateDailyEnergyV2(buildInput());
    expect(overdue.dailyEnergyKcal).toBeCloseTo(adult.dailyEnergyKcal, 0);
    expect(overdue.notes.join()).toContain('预产期');
  });

  it('预产期刚过（宽限期内）仍按孕后期计算', () => {
    const justDue = calculateDailyEnergyV2(
      buildInput({
        lifeStageOverride: LifeStageOverride.PREGNANCY,
        expectedDueDate: daysAgo(3),
      }),
    );
    expect(justDue.stage).toBe('PREGNANCY_LATE');
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
