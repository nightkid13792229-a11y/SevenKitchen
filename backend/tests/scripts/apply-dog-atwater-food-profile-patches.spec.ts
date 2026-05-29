import {
  DOG_ATWATER_FOOD_PROFILE_PATCHES,
  applyDogAtwaterFoodProfilePatch,
} from '../../scripts/apply-dog-atwater-food-profile-patches';
import { calculateDogAtwaterEnergyPer100g } from '../../src/domain/recipe-designer/dog-atwater-energy';

const profile = (macros: Record<string, number | null>) => ({
  meta: {
    rawBasisType: 'PER_100_G',
    versionNote: 'existing note',
  },
  macros: {
    energyKcal: null,
    moisture: null,
    crudeProtein: null,
    crudeFat: null,
    carbohydrate: null,
    fiber: null,
    solubleFiber: null,
    insolubleFiber: null,
    ash: null,
    ...macros,
  },
  minerals: {},
  vitamins: {},
  fattyAcids: {},
  aminoAcids: {},
  customItems: [],
});

const fixtures = [
  {
    externalId: 'CFCT:043221',
    nutritionData: profile({
      energyKcal: 12.43,
      moisture: 96.6,
      crudeProtein: 0.4,
      crudeFat: 0.2,
      carbohydrate: 2.6,
      ash: 0.2,
    }),
  },
  {
    externalId: 'NEVO:918',
    nutritionData: profile({
      energyKcal: 98,
      moisture: 79,
      crudeProtein: 19,
      crudeFat: 2,
      carbohydrate: 0,
      fiber: 0,
    }),
  },
  {
    externalId: 'USDA:333476',
    nutritionData: profile({
      energyKcal: 56,
      moisture: 86.7,
      crudeProtein: 12.3,
      crudeFat: 0.41,
      carbohydrate: 0,
      ash: 1.36,
    }),
  },
  {
    externalId: 'NEVO:3319',
    nutritionData: profile({
      energyKcal: 120,
      moisture: 72.8,
      crudeProtein: 27.4,
      crudeFat: 1.2,
      carbohydrate: 0,
      fiber: 0,
    }),
  },
  {
    externalId: 'CFCT:031306',
    nutritionData: profile({
      energyKcal: 116,
      moisture: 78.6,
      crudeProtein: 9.2,
      crudeFat: 8.1,
      carbohydrate: 3,
      ash: 1.1,
    }),
  },
  {
    externalId: 'CFCT:031304',
    nutritionData: profile({
      energyKcal: 50,
      moisture: 89.2,
      crudeProtein: 5,
      crudeFat: 1.9,
      carbohydrate: 3.3,
      ash: 0.6,
      insolubleFiber: 0.4,
    }),
  },
  {
    externalId: 'CFCT:031307',
    nutritionData: profile({
      energyKcal: 87,
      moisture: 83.6,
      crudeProtein: 5.7,
      crudeFat: 5.8,
      carbohydrate: 3.9,
      ash: 1,
    }),
  },
  {
    externalId: 'MEXT:10155',
    nutritionData: profile({
      energyKcal: 253,
      moisture: 57.4,
      crudeProtein: 22.6,
      crudeFat: 22.6,
      carbohydrate: 0.3,
      fiber: 0,
      ash: 1,
    }),
  },
  {
    externalId: 'CFCT:051013',
    nutritionData: profile({
      energyKcal: 265,
      moisture: 15.5,
      crudeProtein: 12.1,
      crudeFat: 1.5,
      carbohydrate: 65.6,
      fiber: 70.1,
      insolubleFiber: 29.9,
      ash: 5.3,
    }),
  },
];

describe('dog Atwater FOOD profile patches', () => {
  it('patches the nine audited food profiles so dog Atwater energy is available', () => {
    expect(DOG_ATWATER_FOOD_PROFILE_PATCHES).toHaveLength(9);

    for (const fixture of fixtures) {
      const patch = DOG_ATWATER_FOOD_PROFILE_PATCHES.find(
        (candidate) => candidate.externalId === fixture.externalId,
      );
      expect(patch).toBeDefined();

      const patchedProfile = applyDogAtwaterFoodProfilePatch(
        fixture.nutritionData as any,
        patch!,
      );
      const result = calculateDogAtwaterEnergyPer100g(patchedProfile as any);

      expect(result.energyKcalPer100g).not.toBeNull();
      expect(result.invalidReasons).toEqual([]);
      expect(result.missingFields).toEqual([]);
    }
  });

  it('keeps source traceability for values changed only for dog Atwater calculation', () => {
    const mackerel = applyDogAtwaterFoodProfilePatch(
      fixtures.find((fixture) => fixture.externalId === 'MEXT:10155')!
        .nutritionData as any,
      DOG_ATWATER_FOOD_PROFILE_PATCHES.find(
        (patch) => patch.externalId === 'MEXT:10155',
      )!,
    ) as any;
    const blackFungus = applyDogAtwaterFoodProfilePatch(
      fixtures.find((fixture) => fixture.externalId === 'CFCT:051013')!
        .nutritionData as any,
      DOG_ATWATER_FOOD_PROFILE_PATCHES.find(
        (patch) => patch.externalId === 'CFCT:051013',
      )!,
    ) as any;

    expect(mackerel.macros.crudeFat).toBe(17.3);
    expect(mackerel.customItems).toContainEqual(
      expect.objectContaining({
        name: 'MEXT 总脂肪',
        value: 22.6,
        unit: 'g',
      }),
    );
    expect(blackFungus.macros.fiber).toBe(29.9);
    expect(blackFungus.customItems).toContainEqual(
      expect.objectContaining({
        name: 'CFCT 总膳食纤维',
        value: 70.1,
        unit: 'g',
      }),
    );
  });
});
