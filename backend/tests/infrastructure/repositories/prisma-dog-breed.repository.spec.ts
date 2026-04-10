import { DogSizeCategory, GrowthCurveType } from '../../../src/domain/dog/enums';
import { MIXED_BREED_VIRTUAL_ID } from '../../../src/domain/dog/constants';
import { PrismaDogBreedRepository } from '../../../src/infrastructure/repositories/prisma-dog-breed.repository';

describe('PrismaDogBreedRepository', () => {
  const mockPrismaService = {
    dog: {
      groupBy: jest.fn(),
    },
    dogBreed: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns hot standard breeds ordered by usage and excludes the mixed breed virtual id', async () => {
    mockPrismaService.dog.groupBy.mockResolvedValue([
      { breedId: 'breed-hot-2', _count: { breedId: 18 } },
      { breedId: 'breed-hot-1', _count: { breedId: 12 } },
      { breedId: 'breed-missing', _count: { breedId: 9 } },
    ]);
    mockPrismaService.dogBreed.findMany.mockResolvedValue([
      {
        id: 'breed-hot-1',
        name: '拉布拉多',
        aliases: [],
        sizeCategory: DogSizeCategory.LARGE,
        growthCurveType: GrowthCurveType.STANDARD,
        adultAgeMonths: 18,
        seniorAgeYears: 8,
        averageAdultWeightKg: 30,
        isCommon: false,
      },
      {
        id: 'breed-hot-2',
        name: '金毛',
        aliases: [],
        sizeCategory: DogSizeCategory.LARGE,
        growthCurveType: GrowthCurveType.STANDARD,
        adultAgeMonths: 18,
        seniorAgeYears: 8,
        averageAdultWeightKg: 32,
        isCommon: false,
      },
    ]);

    const repository = new PrismaDogBreedRepository(mockPrismaService);
    const result = await repository.findHotBreeds(10);

    expect(mockPrismaService.dog.groupBy).toHaveBeenCalledWith({
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
      take: 10,
    });
    expect(mockPrismaService.dogBreed.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['breed-hot-2', 'breed-hot-1', 'breed-missing'],
        },
      },
    });
    expect(result.map((breed) => breed.id)).toEqual(['breed-hot-2', 'breed-hot-1']);
    expect(result.map((breed) => breed.name)).toEqual(['金毛', '拉布拉多']);
  });
});
