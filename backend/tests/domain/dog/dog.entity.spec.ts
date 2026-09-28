import { Dog } from 'src/domain/dog/dog.entity';
import { MAX_DOG_WEIGHT_KG } from 'src/domain/dog/constants';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';

describe('Dog entity', () => {
  function createDog() {
    return new Dog(
      'dog-id-1',
      'owner-id-1',
      'Seven',
      'breed-mini-schnauzer',
      null,
      new Date('2023-04-06T00:00:00.000Z'),
      DogGender.MALE,
      true,
      6.7,
      5,
      ActivityLevel.NORMAL,
      LifeStageOverride.NONE,
      null,
      2,
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.LOW,
      null,
      null,
      null,
      452,
    );
  }

  it('allows updating breedId and birthday through updateProfile', () => {
    const dog = createDog();
    const nextBirthday = new Date('2022-06-01T00:00:00.000Z');

    dog.updateProfile({
      breedId: 'breed-standard-schnauzer',
      birthday: nextBirthday,
      customBreedName: null,
    });

    expect(dog.breedId).toBe('breed-standard-schnauzer');
    expect(dog.birthday.toISOString()).toBe(nextBirthday.toISOString());
  });

  it('allows updating avatarUrl through updateProfile', () => {
    const dog = createDog();

    dog.updateProfile({
      avatarUrl: 'https://img.example.com/dogs/seven.png',
    });

    expect(dog.avatarUrl).toBe('https://img.example.com/dogs/seven.png');
  });

  describe('weight upper bound（2026-09-28 体重污染修复）', () => {
    function buildDog(weightKg: number) {
      return new Dog(
        'dog-id-1',
        'owner-id-1',
        'Seven',
        'breed-mini-schnauzer',
        null,
        new Date('2023-04-06T00:00:00.000Z'),
        DogGender.MALE,
        true,
        weightKg,
        5,
        ActivityLevel.NORMAL,
        LifeStageOverride.NONE,
        null,
        2,
        TreatInputMode.ESTIMATE_LEVEL,
        TreatLevel.LOW,
        null,
        null,
        null,
        452,
      );
    }

    it('拒绝超过上限的体重', () => {
      expect(() => buildDog(MAX_DOG_WEIGHT_KG + 0.1)).toThrow(
        /must not exceed/i,
      );
    });

    it('上限本身允许', () => {
      expect(buildDog(MAX_DOG_WEIGHT_KG).currentWeightKg).toBe(
        MAX_DOG_WEIGHT_KG,
      );
    });

    it('只拦生物学上不可能的值：可疑但可能的体重照常放行', () => {
      // 35 kg 的柯基很可能是「35 斤」填错，但系统无权替顾客判定，
      // 因此实体层必须放行，只由界面提示单位换算。
      expect(buildDog(35).currentWeightKg).toBe(35);
    });
  });
});