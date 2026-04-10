import { Dog } from 'src/domain/dog/dog.entity';
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
});
