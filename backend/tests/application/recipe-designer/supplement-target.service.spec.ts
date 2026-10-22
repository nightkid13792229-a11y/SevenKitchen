import { BadRequestException } from '@nestjs/common';
import { SupplementTargetService } from '../../../src/application/recipe-designer/supplement-target.service';
import {
  createEmptyNutritionProfile,
  normalizeNutritionProfile,
} from '../../../src/domain/ingredient/nutrition-profile.utils';
import type {
  NutritionProfileV2,
  NutritionRawBasisType,
} from '../../../src/domain/ingredient/types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type ProfileTab =
  | 'macros'
  | 'minerals'
  | 'vitamins'
  | 'fattyAcids'
  | 'aminoAcids';

interface ProfileSeed {
  basis?: NutritionRawBasisType;
  meta?: Partial<NutritionProfileV2['meta']>;
  values?: Partial<Record<ProfileTab, Record<string, number>>>;
}

/**
 * 用真实领域函数构造营养档案，不手搓 Prisma 形态的 JSON。
 * 默认按 PER_1_G 造，补剂档案（粉末/油）多数按每克标注。
 */
function buildProfile(seed: ProfileSeed = {}): NutritionProfileV2 {
  const profile = createEmptyNutritionProfile();
  profile.meta.rawBasisType = seed.basis ?? 'PER_1_G';
  Object.assign(profile.meta, seed.meta ?? {});

  for (const [tab, values] of Object.entries(seed.values ?? {})) {
    Object.assign((profile as any)[tab], values);
  }

  return normalizeNutritionProfile(profile)!;
}

function buildFiberPowderProfile(): NutritionProfileV2 {
  return buildProfile({
    values: {
      macros: {
        fiber: 1,
        insolubleFiber: 1,
      },
    },
  });
}

function buildCodLiverOilProfile(): NutritionProfileV2 {
  return buildProfile({
    values: {
      vitamins: {
        vitaminA: 5000,
        vitaminD: 500,
      },
    },
  });
}

function buildEpaDhaProfile(): NutritionProfileV2 {
  return buildProfile({
    values: {
      fattyAcids: {
        epa: 120,
        dha: 80,
      },
    },
  });
}

describe('SupplementTargetService', () => {
  let service: SupplementTargetService;
  let findUnique: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn();
    const prisma = {
      nutritionFood: { findUnique },
    } as unknown as PrismaService;
    service = new SupplementTargetService(prisma);
  });

  describe('resolveDefaultTargets', () => {
    const fiberDefinition = {
      fieldPath: 'macros.fiber',
      label: '膳食纤维',
      unit: 'g',
    };

    it('returns the nutrition profile default targets when their fields are present', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: buildFiberPowderProfile(),
        defaultSupplementTargets: [fiberDefinition],
      });

      await expect(
        service.resolveDefaultTargets('food-fiber'),
      ).resolves.toEqual([fiberDefinition]);
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'food-fiber' },
        select: {
          id: true,
          name: true,
          nutritionData: true,
          defaultSupplementTargets: true,
        },
      });
    });

    it('returns an empty list when the supplement has no default targets', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fish-oil',
        name: '鱼油',
        nutritionData: buildCodLiverOilProfile(),
        defaultSupplementTargets: null,
      });

      await expect(
        service.resolveDefaultTargets('food-fish-oil'),
      ).resolves.toEqual([]);
    });

    it('normalizes a stored default unit to the nutrition catalog unit', async () => {
      findUnique.mockResolvedValue({
        id: 'food-kelp',
        name: '海藻粉',
        nutritionData: buildProfile({
          values: { minerals: { iodine: 100 } },
        }),
        defaultSupplementTargets: [
          { fieldPath: 'minerals.iodine', label: '碘', unit: 'ug' },
        ],
      });

      await expect(service.resolveDefaultTargets('food-kelp')).resolves.toEqual(
        [{ fieldPath: 'minerals.iodine', label: '碘', unit: 'μg' }],
      );
    });

    it('accepts derived default targets such as EPA+DHA', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fish-oil',
        name: '深海鱼油',
        nutritionData: buildEpaDhaProfile(),
        defaultSupplementTargets: [
          { fieldPath: 'derived.epaDha', label: 'EPA+DHA', unit: 'mg' },
        ],
      });

      await expect(
        service.resolveDefaultTargets('food-fish-oil'),
      ).resolves.toEqual([
        { fieldPath: 'derived.epaDha', label: 'EPA + DHA', unit: 'mg' },
      ]);
    });

    it('resolves defaults from a legacy flat nutrition data map', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: { fiber_g: 1 },
        defaultSupplementTargets: [fiberDefinition],
      });

      await expect(
        service.resolveDefaultTargets('food-fiber'),
      ).resolves.toEqual([fiberDefinition]);
    });

    it('rejects a default target whose field is empty in the profile instead of dropping it', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: buildProfile({
          values: { macros: { fiber: 0 } },
        }),
        defaultSupplementTargets: [fiberDefinition],
      });

      await expect(service.resolveDefaultTargets('food-fiber')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a default target that is not in the nutrition catalog', async () => {
      findUnique.mockResolvedValue({
        id: 'food-fiber',
        name: '纤维素粉',
        nutritionData: buildFiberPowderProfile(),
        defaultSupplementTargets: [{ fieldPath: 'macros.unknownFiber' }],
      });

      await expect(service.resolveDefaultTargets('food-fiber')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a missing nutrition food', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.resolveDefaultTargets('food-missing'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty nutrition food id without querying the database', async () => {
      await expect(service.resolveDefaultTargets('  ')).rejects.toThrow(
        BadRequestException,
      );
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('validateTargets', () => {
    it('accepts a single fiber target and returns catalog label and unit', () => {
      const profile = buildFiberPowderProfile();

      expect(
        service.validateTargets(profile, [
          { fieldPath: 'macros.fiber' },
          { fieldPath: 'macros.insolubleFiber', label: '自定义标签' },
        ]),
      ).toEqual([
        { fieldPath: 'macros.fiber', label: '膳食纤维', unit: 'g' },
        {
          fieldPath: 'macros.insolubleFiber',
          label: '不可溶性纤维',
          unit: 'g',
        },
      ]);
    });

    it('accepts derived EPA+DHA as one target', () => {
      const profile = buildEpaDhaProfile();

      expect(
        service.validateTargets(profile, [{ fieldPath: 'derived.epaDha' }]),
      ).toEqual([
        { fieldPath: 'derived.epaDha', label: 'EPA + DHA', unit: 'mg' },
      ]);
    });

    it('normalizes convertible mass units to the catalog unit', () => {
      const profile = buildProfile({
        values: { minerals: { zinc: 50 } },
      });

      expect(
        service.validateTargets(profile, [
          { fieldPath: 'minerals.zinc', unit: 'g' },
        ]),
      ).toEqual([{ fieldPath: 'minerals.zinc', label: '锌', unit: 'mg' }]);
    });

    it('rejects a unit that cannot be converted to the catalog unit', () => {
      const profile = buildCodLiverOilProfile();

      expect(() =>
        service.validateTargets(profile, [
          { fieldPath: 'vitamins.vitaminD', unit: 'mg' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects an empty fieldPath', () => {
      expect(() =>
        service.validateTargets(buildFiberPowderProfile(), [
          { fieldPath: ' ' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects an unknown fieldPath', () => {
      expect(() =>
        service.validateTargets(buildFiberPowderProfile(), [
          { fieldPath: 'macros.notARealField' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects a profile field that is empty', () => {
      const profile = buildProfile();

      expect(() =>
        service.validateTargets(profile, [{ fieldPath: 'minerals.zinc' }]),
      ).toThrow(BadRequestException);
    });

    it('rejects a profile field that is zero', () => {
      const profile = buildProfile({
        values: { macros: { fiber: 0 } },
      });

      expect(() =>
        service.validateTargets(profile, [{ fieldPath: 'macros.fiber' }]),
      ).toThrow(BadRequestException);
    });

    it('rejects duplicate targets instead of de-duplicating silently', () => {
      expect(() =>
        service.validateTargets(buildFiberPowderProfile(), [
          { fieldPath: 'macros.fiber' },
          { fieldPath: 'macros.fiber' },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects multi-field or expression-style targets', () => {
      expect(() =>
        service.validateTargets(buildFiberPowderProfile(), [
          {
            fieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
            operation: 'SUM',
          },
        ]),
      ).toThrow(BadRequestException);
    });

    it('rejects a non-array target payload', () => {
      expect(() =>
        service.validateTargets(buildFiberPowderProfile(), {
          fieldPath: 'macros.fiber',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('computeTargets', () => {
    it('computes the fiber powder concentration as 19.67 g/kg for 3 g in 152.55 g', () => {
      const targets = service.computeTargets(
        buildFiberPowderProfile(),
        [{ fieldPath: 'macros.fiber' }],
        3,
        152.55,
      );

      expect(targets).toEqual([
        {
          fieldPath: 'macros.fiber',
          label: '膳食纤维',
          unit: 'g',
          targetValuePerKg: 19.67,
        },
      ]);
    });

    it('computes vitamin A and vitamin D concentrations for cod liver oil', () => {
      const targets = service.computeTargets(
        buildCodLiverOilProfile(),
        [
          { fieldPath: 'vitamins.vitaminA' },
          { fieldPath: 'vitamins.vitaminD' },
        ],
        2,
        500,
      );

      expect(targets).toEqual([
        {
          fieldPath: 'vitamins.vitaminA',
          label: '维生素 A',
          unit: 'IU',
          targetValuePerKg: 20000,
        },
        {
          fieldPath: 'vitamins.vitaminD',
          label: '维生素 D',
          unit: 'IU',
          targetValuePerKg: 2000,
        },
      ]);
    });

    it('sums EPA and DHA into one derived concentration', () => {
      const targets = service.computeTargets(
        buildEpaDhaProfile(),
        [{ fieldPath: 'derived.epaDha' }],
        1,
        1000,
      );

      expect(targets).toEqual([
        {
          fieldPath: 'derived.epaDha',
          label: 'EPA + DHA',
          unit: 'mg',
          targetValuePerKg: 200,
        },
      ]);
    });

    it('rejects a zero total weight', () => {
      expect(() =>
        service.computeTargets(
          buildFiberPowderProfile(),
          [{ fieldPath: 'macros.fiber' }],
          3,
          0,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a missing total weight', () => {
      expect(() =>
        service.computeTargets(
          buildFiberPowderProfile(),
          [{ fieldPath: 'macros.fiber' }],
          3,
          null,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects a non-positive supplement weight', () => {
      expect(() =>
        service.computeTargets(
          buildFiberPowderProfile(),
          [{ fieldPath: 'macros.fiber' }],
          0,
          152.55,
        ),
      ).toThrow(BadRequestException);
    });

    it('rejects targets that cannot be validated instead of returning a zero concentration', () => {
      expect(() =>
        service.computeTargets(
          buildProfile({ values: { macros: { fiber: 0 } } }),
          [{ fieldPath: 'macros.fiber' }],
          3,
          152.55,
        ),
      ).toThrow(BadRequestException);
    });
  });
});
