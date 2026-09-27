/**
 * 绝育状态到底影不影响热量计算？（2026-09-27）
 *
 * 老板问："我记得在热量的计算中，绝育状态会影响热量计算的系数，对吗？"
 *
 * 这组测试用**实际算出来的 DER**回答，而不是靠读代码下结论。
 * 结论（见下方各用例）：绝育状态目前**只在「成犬 + 活动量为工作犬」时才影响热量**，
 * 其余情况（幼犬、妊娠哺乳、老年犬、成犬非工作犬）写进去了也不参与计算。
 *
 * 为什么值得固化成测试：代码里确实存在 ADULT_NEUTERED(1.6) / ADULT_INTACT(1.8)
 * 两个"绝育基准/未绝育基准"常量，看起来绝育理应是通用因素；
 * 但 applyAdultModifiers 的两道提前返回让它们对绝大多数狗不可达。
 * 若日后要按"绝育要减热量"的兽医口径调整，这个测试会立刻提醒改动点。
 */

import { calculateDogEnergy } from 'src/domain/dog/dog-calc.service';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain/dog/enums';

describe('绝育状态对热量计算的影响', () => {
  const buildDog = (options: {
    isNeutered: boolean;
    activityLevel: ActivityLevel;
    lifeStageOverride?: LifeStageOverride;
    birthday?: Date;
  }): Dog =>
    new Dog(
      'dog-id-1',
      'owner-id-1',
      'Test Dog',
      'breed-id-1',
      null,
      options.birthday ?? new Date('2021-01-01'), // 成年
      DogGender.MALE,
      options.isNeutered,
      10.0,
      5, // BCS 5 = 系数 1.0，避免干扰
      options.activityLevel,
      options.lifeStageOverride ?? LifeStageOverride.NONE,
      null,
      2,
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.NONE, // 不给零食，避免零食扣减干扰对比
      null,
      null,
      null,
      0,
    );

  const der = (options: Parameters<typeof buildDog>[0]): number =>
    calculateDogEnergy(buildDog(options)).der;

  describe('成犬 + 非工作犬：绝育不影响', () => {
    it.each([
      ActivityLevel.RESTING,
      ActivityLevel.LOW,
      ActivityLevel.NORMAL,
      ActivityLevel.HIGH,
    ])('活动量 %s 时，绝育与未绝育算出来完全一样', (activityLevel) => {
      const neutered = der({ isNeutered: true, activityLevel });
      const intact = der({ isNeutered: false, activityLevel });

      expect(neutered).toBe(intact);
    });
  });

  describe('成犬 + 工作犬：绝育**确实影响**', () => {
    it('未绝育比绝育高约 12.5%（1.8 vs 1.6）', () => {
      const neutered = der({
        isNeutered: true,
        activityLevel: ActivityLevel.WORKING,
      });
      const intact = der({
        isNeutered: false,
        activityLevel: ActivityLevel.WORKING,
      });

      expect(intact).toBeGreaterThan(neutered);
      // 1.8 / 1.6 = 1.125
      expect(intact / neutered).toBeCloseTo(1.125, 6);
    });
  });

  describe('老年犬：绝育不影响', () => {
    it('同为老年犬时，绝育与未绝育一致', () => {
      const neutered = der({
        isNeutered: true,
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.SENIOR,
      });
      const intact = der({
        isNeutered: false,
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.SENIOR,
      });

      expect(neutered).toBe(intact);
    });
  });

  describe('幼犬：绝育不影响', () => {
    it('幼犬阶段绝育与未绝育一致（活动量也不参与）', () => {
      const neutered = der({
        isNeutered: true,
        activityLevel: ActivityLevel.HIGH,
        lifeStageOverride: LifeStageOverride.PUPPY,
        birthday: new Date('2026-05-01'),
      });
      const intact = der({
        isNeutered: false,
        activityLevel: ActivityLevel.HIGH,
        lifeStageOverride: LifeStageOverride.PUPPY,
        birthday: new Date('2026-05-01'),
      });

      expect(neutered).toBe(intact);
    });
  });

  describe('妊娠 / 哺乳：绝育不影响', () => {
    it.each([LifeStageOverride.PREGNANCY, LifeStageOverride.LACTATION])(
      '%s 阶段绝育与未绝育一致',
      (lifeStageOverride) => {
        const neutered = der({
          isNeutered: true,
          activityLevel: ActivityLevel.NORMAL,
          lifeStageOverride,
        });
        const intact = der({
          isNeutered: false,
          activityLevel: ActivityLevel.NORMAL,
          lifeStageOverride,
        });

        expect(neutered).toBe(intact);
      },
    );
  });
});
