import { mapLegacySupplementTarget } from '../../prisma/backfill-recipe-supplement-targets-v2';

describe('backfill recipe supplement targets v2', () => {
  it.each([
    [
      '碘',
      660,
      {
        fieldPath: 'minerals.iodine',
        label: '碘',
        targetValuePerKg: 660,
        unit: 'μg',
      },
    ],
    [
      '钙',
      2160,
      {
        fieldPath: 'minerals.calcium',
        label: '钙',
        targetValuePerKg: 2160,
        unit: 'mg',
      },
    ],
    [
      '锌',
      17,
      {
        fieldPath: 'minerals.zinc',
        label: '锌',
        targetValuePerKg: 17,
        unit: 'mg',
      },
    ],
    [
      '维生素E',
      95,
      {
        fieldPath: 'vitamins.vitaminE',
        label: '维生素 E',
        targetValuePerKg: 95,
        unit: 'IU',
      },
    ],
    [
      '维生素D',
      125,
      {
        fieldPath: 'vitamins.vitaminD',
        label: '维生素 D',
        targetValuePerKg: 125,
        unit: 'IU',
      },
    ],
    [
      '胆碱',
      150,
      {
        fieldPath: 'vitamins.choline',
        label: '胆碱',
        targetValuePerKg: 150,
        unit: 'mg',
      },
    ],
  ])('maps %s', (key, value, expected) => {
    expect(mapLegacySupplementTarget(key, value)).toEqual(expected);
  });

  it('requires manual review for EPA+DHA', () => {
    expect(mapLegacySupplementTarget('EPA+DHA', 600)).toBeNull();
  });
});
