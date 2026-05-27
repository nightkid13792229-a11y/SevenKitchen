import {
  auditDogAtwaterProfile,
  calculateDogAtwaterEnergyPer100g,
} from '../../../src/domain/recipe-designer/dog-atwater-energy';

describe('dog Atwater energy', () => {
  const baseProfile = {
    meta: { rawBasisType: 'PER_100_G' },
    macros: {
      energyKcal: 999,
      moisture: 65,
      crudeProtein: 20,
      crudeFat: 10,
      ash: 1,
      carbohydrate: 0,
      fiber: 0,
      solubleFiber: null,
      insolubleFiber: null,
    },
    minerals: {},
    vitamins: {},
    fattyAcids: {},
    aminoAcids: {},
    customItems: [],
  };

  it('uses unmodified dog Atwater coefficients instead of source energyKcal', () => {
    const result = calculateDogAtwaterEnergyPer100g(baseProfile as any);

    expect(result).toMatchObject({
      energyKcalPer100g: 186,
      nfeGPer100g: 4,
      missingFields: [],
      invalidReasons: [],
    });
  });

  it('requires all difference-method macro fields for FOOD profiles', () => {
    const profile = {
      ...baseProfile,
      macros: {
        ...baseProfile.macros,
        fiber: null,
      },
    };

    const result = calculateDogAtwaterEnergyPer100g(profile as any);

    expect(result.energyKcalPer100g).toBeNull();
    expect(result.missingFields).toEqual(['fiber']);
  });

  it('clamps small negative NFE caused by source rounding to zero', () => {
    const profile = {
      ...baseProfile,
      macros: {
        ...baseProfile.macros,
        moisture: 66,
        crudeProtein: 20,
        crudeFat: 14.5,
        ash: 1,
        fiber: 0,
      },
    };

    const result = auditDogAtwaterProfile(profile as any);

    expect(result).toMatchObject({
      energyKcalPer100g: 210.5,
      nfeGPer100g: -1.5,
      missingFields: [],
      invalidReasons: [],
    });
  });

  it('rejects profiles whose difference-method NFE is materially negative', () => {
    const profile = {
      ...baseProfile,
      macros: {
        ...baseProfile.macros,
        moisture: 80,
        crudeProtein: 20,
        crudeFat: 10,
        ash: 1,
        fiber: 0,
      },
    };

    const result = auditDogAtwaterProfile(profile as any);

    expect(result.energyKcalPer100g).toBeNull();
    expect(result.invalidReasons).toEqual([
      'NFE_BY_DIFFERENCE_NEGATIVE',
    ]);
  });
});
