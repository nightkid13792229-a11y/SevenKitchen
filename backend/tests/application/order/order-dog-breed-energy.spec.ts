import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateDogEnergy } from '../../../src/domain/dog/dog-calc.service';
import { DogBreed } from '../../../src/domain/dog/dog-breed.entity';
import type { Dog } from '../../../src/domain/dog/dog.entity';

/**
 * 下单链路必须把犬种传进能量计算（2026-10-01 修复）。
 *
 * ── 原来错在哪 ──────────────────────────────────────────────
 *
 *   calculateDogEnergy 的体型类别取值顺序是
 *     size_class_override > breed > MEDIUM（兜底）
 *
 *   dog.service 那几处一直有传 breed，**只有下单这条链路漏了**，
 *   于是"没有手工设过体型类别"的狗，下单时一律按中型算能量 ——
 *   小型犬偏高、大型犬偏低。这个偏差不会报错，只会静默算错。
 */
describe('下单链路的犬种参数', () => {
  const orderServiceSource = readFileSync(
    resolve(process.cwd(), 'src/application/order/order.service.ts'),
    'utf-8',
  );

  function buildDog(overrides: Partial<Dog> = {}): Dog {
    return {
      id: 'dog-1',
      ownerId: 'customer-1',
      name: '面包',
      breedId: 'breed-small',
      customBreedName: null,
      birthday: new Date('2022-01-01'),
      gender: 'MALE',
      isNeutered: true,
      currentWeightKg: 5,
      bcsScore: 5,
      activityLevel: 'LOW',
      lifeStageOverride: 'NONE',
      sizeClassOverride: null,
      mealsPerDay: 2,
      treatInputMode: 'ESTIMATE_LEVEL',
      treatLevel: 'LOW',
      manualTreatKcal: null,
      activityLevelConfirmedAt: null,
      bcsScoreConfirmedAt: null,
      mealsPerDayConfirmedAt: null,
      createdAt: new Date('2022-01-01'),
      ...overrides,
    } as Dog;
  }

  function buildBreed(sizeCategory: string): DogBreed {
    return new DogBreed(
      'breed-small',
      '吉娃娃',
      [],
      sizeCategory as any,
      'SMALL' as any,
      12,
      8,
      3,
      false,
      [],
    );
  }

  describe('漏传犬种的真实影响面（核实结果：只影响幼犬）', () => {
    const originalEnv = process.env.ENERGY_ALGORITHM;

    beforeEach(() => {
      // 线上是 v2（FEDIAF 2025），这条链路要按线上那套算法验证
      process.env.ENERGY_ALGORITHM = 'v2';
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.ENERGY_ALGORITHM;
      } else {
        process.env.ENERGY_ALGORITHM = originalEnv;
      }
    });

    it('成年犬：传不传犬种结果一样 —— 能量公式不读体型类别', () => {
      const adult = buildDog({ birthday: new Date('2020-01-01') });
      const withoutBreed = calculateDogEnergy(adult, undefined, null);
      const withBreed = calculateDogEnergy(adult, undefined, buildBreed('SMALL'));

      expect(withoutBreed.finalFoodKcal).toBe(withBreed.finalFoodKcal);
    });

    it('幼犬：犬种的预期成年体重会改变结果 —— 这才是漏传的影响', () => {
      const puppy = buildDog({
        birthday: new Date(Date.now() - 90 * 86400000),
        currentWeightKg: 3,
      });

      const withoutBreed = calculateDogEnergy(puppy, undefined, null);
      const withBreed = calculateDogEnergy(puppy, undefined, buildBreed('SMALL'));

      expect(withoutBreed.finalFoodKcal).not.toBe(withBreed.finalFoodKcal);
    });
  })

  describe('订单服务确实把犬种传下去了', () => {
    it('两处 calculateDogEnergy 调用都带上 loadDogBreed', () => {
      const matches = orderServiceSource.match(
        /calculateDogEnergy\(\s*dog,\s*recipe\.energyDensityKcalPerKg,\s*await this\.loadDogBreed\(dog\.breedId\),/g,
      );

      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(2);
    });

    it('确实按 breedId 去查犬种，而不是写死 null', () => {
      expect(orderServiceSource).toContain('this.prisma.dogBreed.findUnique');
      expect(orderServiceSource).toContain('await this.loadDogBreed(dog.breedId)');
      // 不允许出现"只传两个参数"的旧写法
      expect(orderServiceSource).not.toMatch(
        /calculateDogEnergy\(\s*dog,\s*recipe\.energyDensityKcalPerKg,\s*\)/,
      );
    });

    it('查不到犬种时返回 null（混合犬种的虚拟 id 不该让下单失败）', () => {
      expect(orderServiceSource).toContain('private async loadDogBreed');
      expect(orderServiceSource).toContain('if (!record) {');
      expect(orderServiceSource).toContain('return null;');
    });
  })
})
