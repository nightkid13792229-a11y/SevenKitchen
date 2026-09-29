import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain/dog/enums';
import { calculateDogEnergy } from 'src/domain/dog/dog-calc.service';

/**
 * v1 / v2 的 `der` 口径必须一致（2026-09-29）
 *
 * 背景 —— v2 打开全量后在**生产上实测**发现的真实缺陷：
 *
 * `calculateDogEnergyV2Compat` 原先把 `der` 直接映射成 v2 的 `dailyEnergyKcal`，
 * 而那个值是**已扣零食的净值**；v1 的 `der` 是**毛值**。
 *
 * 前端 `utils/dog-recommendation-summary.ts` 会显示
 * 「主食热量 = der − 零食能量」，它按 v1 的口径假设 der 是毛值 ——
 * 于是 v2 下这条算成 `737.2 − 22.8 = 714.4`，而正确答案是 `760.0 − 22.8 = 737.2`。
 *
 * 同一只狗在两个页面还会显示不同数字：
 *   · 建档页读 `POST /dogs/calc-preview`（走原始算法 → 拿到净值）
 *   · 档案页读 `GET /dogs/:id`（走 calcPreview 的覆盖逻辑 → 拿到毛值）
 *
 * 这组测试把这条不变量锁死，避免以后改适配器时再次破掉。
 */

function makeDog(overrides: Record<string, any> = {}): Dog {
  return new Dog(
    'dog-id-1',
    'owner-id-1',
    'Test Dog',
    'breed-id-1',
    null,
    overrides.birthday ?? new Date('2021-01-01'),
    DogGender.MALE,
    true,
    overrides.currentWeightKg ?? 20,
    overrides.bcsScore ?? 7,
    overrides.activityLevel ?? ActivityLevel.NORMAL,
    LifeStageOverride.NONE,
    overrides.sizeClassOverride ?? null,
    2,
    overrides.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
    overrides.treatLevel ?? TreatLevel.LOW,
    overrides.manualTreatKcal ?? null,
    null,
    null,
    null,
    0,
  );
}

/** 品种留空 → 按体型档兜底，避免测试依赖品种数据 */
const BREED = null;

function withAlgorithm<T>(value: string | undefined, fn: () => T): T {
  const original = process.env.ENERGY_ALGORITHM;
  if (value === undefined) {
    delete process.env.ENERGY_ALGORITHM;
  } else {
    process.env.ENERGY_ALGORITHM = value;
  }
  try {
    return fn();
  } finally {
    if (original === undefined) {
      delete process.env.ENERGY_ALGORITHM;
    } else {
      process.env.ENERGY_ALGORITHM = original;
    }
  }
}

describe('v1 / v2 的 der 口径一致', () => {
  it('v2 下 der 是毛值：der = finalFoodKcal + 零食扣减', () => {
    const dog = makeDog();

    const result = withAlgorithm('v2', () => calculateDogEnergy(dog, undefined, BREED, true));

    expect(result.treatDeduction).toBeGreaterThan(0);
    expect(result.der).toBeCloseTo(
      result.finalFoodKcal + result.treatDeduction,
      6,
    );
  });

  it('v1 下同样的关系成立（这是前端依赖的原始口径）', () => {
    const dog = makeDog();

    const result = withAlgorithm(undefined, () =>
      calculateDogEnergy(dog, undefined, BREED, true),
    );

    expect(result.treatDeduction).toBeGreaterThan(0);
    expect(result.der).toBeCloseTo(
      result.finalFoodKcal + result.treatDeduction,
      6,
    );
  });

  it('v2 的 der 不再等于 finalFoodKcal（那正是修掉的那个 bug）', () => {
    const dog = makeDog();

    const v2 = withAlgorithm('v2', () => calculateDogEnergy(dog, undefined, BREED, true));

    // 有零食扣减时两者必须不同；若又相等说明 der 被映射回了净值
    expect(v2.der).not.toBeCloseTo(v2.finalFoodKcal, 3);
    expect(v2.der).toBeGreaterThan(v2.finalFoodKcal);
  });

  it('没有零食扣减时 der === finalFoodKcal（两版都成立）', () => {
    // 注意：不能用 manualTreatKcal=0 —— 0 会被当成「缺数据」按 3% 兜底（刻意的保守处理）。
    // 要「不吃零食」得用 ESTIMATE_LEVEL + NONE。
    const dog = makeDog({
      treatInputMode: TreatInputMode.ESTIMATE_LEVEL,
      treatLevel: TreatLevel.NONE,
    });

    for (const algorithm of ['v2', undefined]) {
      const result = withAlgorithm(algorithm, () =>
        calculateDogEnergy(dog, undefined, BREED, true),
      );
      expect(result.treatDeduction).toBe(0);
      expect(result.der).toBeCloseTo(result.finalFoodKcal, 6);
    }
  });

  it('v2 的 rer 用理想体重（与 v1 的关键差别，顺带锁住）', () => {
    const dog = makeDog({ currentWeightKg: 20, bcsScore: 7 });

    const v1 = withAlgorithm(undefined, () => calculateDogEnergy(dog, undefined, BREED, true));
    const v2 = withAlgorithm('v2', () => calculateDogEnergy(dog, undefined, BREED, true));

    // v1: RER(20) = 70 × 20^0.75 ≈ 662；v2: RER(16) = 70 × 16^0.75 = 560
    expect(v1.rer).toBeCloseTo(70 * 20 ** 0.75, 1);
    expect(v2.rer).toBeCloseTo(560, 1);
    expect(v2.rer).toBeLessThan(v1.rer);
  });
});
