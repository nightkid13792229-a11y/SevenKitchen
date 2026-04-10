jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

import { AdminController } from '../../../src/interfaces/controllers/admin.controller';
import { MIXED_BREED_VIRTUAL_ID } from '../../../src/domain/dog/constants';
import { DogSizeCategory, GrowthCurveType } from '../../../src/domain/dog/enums';

describe('AdminController', () => {
  describe('getBreeds', () => {
    it('returns standard breeds sorted by profile count desc with profileCount included', async () => {
      const mockDogBreedRepository = {
        findAll: jest.fn().mockResolvedValue([
          {
            id: 'breed-alpha',
            name: '阿尔法犬',
            aliases: [],
            sizeCategory: DogSizeCategory.SMALL,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 10,
            seniorAgeYears: 11,
            averageAdultWeightKg: 4.5,
            isCommon: false,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'breed-bravo',
            name: '布拉沃犬',
            aliases: [],
            sizeCategory: DogSizeCategory.MEDIUM,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 12,
            seniorAgeYears: 10,
            averageAdultWeightKg: 12.3,
            isCommon: false,
            createdAt: new Date('2026-01-02T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
          },
          {
            id: 'breed-charlie',
            name: '查理犬',
            aliases: [],
            sizeCategory: DogSizeCategory.LARGE,
            growthCurveType: GrowthCurveType.STANDARD,
            adultAgeMonths: 18,
            seniorAgeYears: 8,
            averageAdultWeightKg: 28.6,
            isCommon: false,
            createdAt: new Date('2026-01-03T00:00:00Z'),
            updatedAt: new Date('2026-01-03T00:00:00Z'),
          },
        ]),
      };
      const mockPrisma = {
        dog: {
          groupBy: jest.fn().mockResolvedValue([
            { breedId: 'breed-charlie', _count: { breedId: 12 } },
            { breedId: 'breed-alpha', _count: { breedId: 4 } },
          ]),
        },
      };

      const controller = new AdminController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        mockPrisma as any,
        mockDogBreedRepository as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await controller.getBreeds();

      expect(mockPrisma.dog.groupBy).toHaveBeenCalledWith({
        by: ['breedId'],
        where: {
          breedId: {
            not: MIXED_BREED_VIRTUAL_ID,
          },
        },
        _count: {
          breedId: true,
        },
        orderBy: {
          _count: {
            breedId: 'desc',
          },
        },
      });
      expect((result.data ?? []).map((breed: any) => breed.id)).toEqual([
        'breed-charlie',
        'breed-alpha',
        'breed-bravo',
      ]);
      expect((result.data ?? []).map((breed: any) => breed.profileCount)).toEqual([
        12,
        4,
        0,
      ]);
    });
  });
});
