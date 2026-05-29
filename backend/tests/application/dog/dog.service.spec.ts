/**
 * DogService Unit Tests
 * Tests for calcPreview method with boundary cases
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  DogService,
  DOG_BREED_REPOSITORY,
  DOG_REPOSITORY,
  PRISMA_SERVICE,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import type { DogRepository } from 'src/domain/dog/dog.repository';
import type { DogBreedRepository } from 'src/domain/dog/dog-breed.repository';
import type { RecipeRepository } from 'src/domain/recipe/recipe.repository';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
  DogSizeCategory,
  GrowthCurveType,
} from 'src/domain';
import { DogBreed } from 'src/domain/dog/dog-breed.entity';
import { SearchGovernanceService } from 'src/application/search-governance/search-governance.service';

describe('DogService', () => {
  let service: DogService;
  let dogRepository: jest.Mocked<DogRepository>;
  let dogBreedRepository: jest.Mocked<DogBreedRepository>;
  let searchGovernance: jest.Mocked<
    Pick<SearchGovernanceService, 'expandQuery' | 'recordSearchEvent'>
  >;

  const createDogForUpdate = (overrides?: {
    breedId?: string;
    birthday?: Date;
    currentWeightKg?: number;
    bcsScore?: number;
    activityLevel?: ActivityLevel;
    treatInputMode?: TreatInputMode;
    treatLevel?: TreatLevel;
    manualTreatKcal?: number | null;
    sizeClassOverride?: null;
  }): Dog => new Dog(
    'dog-id-1',
    'owner-id-1',
    'Seven',
    overrides?.breedId ?? 'breed-mini-schnauzer',
    null,
    overrides?.birthday ?? new Date('2023-04-06T00:00:00.000Z'),
    DogGender.MALE,
    true,
    overrides?.currentWeightKg ?? 6.7,
    overrides?.bcsScore ?? 5,
    overrides?.activityLevel ?? ActivityLevel.NORMAL,
    LifeStageOverride.NONE,
    overrides?.sizeClassOverride ?? null,
    2,
    overrides?.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
    overrides?.treatLevel ?? TreatLevel.LOW,
    overrides?.manualTreatKcal ?? null,
    null,
    null,
    452,
  );

  const mockDogRepository: jest.Mocked<DogRepository> = {
    findById: jest.fn(),
    findByOwnerId: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockRecipeRepository: jest.Mocked<RecipeRepository> = {
    findById: jest.fn(),
    findByIdAndVersion: jest.fn(),
    findPublicRecipes: jest.fn(),
  };

  const mockDogBreedRepository: jest.Mocked<DogBreedRepository> = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findHotBreeds: jest.fn(),
    findBySizeCategory: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByName: jest.fn(),
    countUsage: jest.fn(),
    findUsage: jest.fn(),
  };

  const mockPrismaService = {
    order: {
      count: jest.fn(),
    },
  };

  const createBreed = (
    id: string,
    name: string,
    aliases: string[] = [],
    isCommon = false,
  ) =>
    new DogBreed(
      id,
      name,
      aliases,
      DogSizeCategory.LARGE,
      GrowthCurveType.STANDARD,
      18,
      8,
      30,
      isCommon,
    );

  beforeEach(async () => {
    searchGovernance = {
      expandQuery: jest.fn(async (_domain, rawQuery) => (rawQuery ? [rawQuery] : [])),
      recordSearchEvent: jest.fn().mockResolvedValue({ id: 'query-log-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DogService,
        {
          provide: DOG_REPOSITORY,
          useValue: mockDogRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: mockRecipeRepository,
        },
        {
          provide: DOG_BREED_REPOSITORY,
          useValue: mockDogBreedRepository,
        },
        {
          provide: PRISMA_SERVICE,
          useValue: mockPrismaService,
        },
        {
          provide: SearchGovernanceService,
          useValue: searchGovernance,
        },
      ],
    }).compile();

    service = module.get<DogService>(DogService);
    dogRepository = module.get(DOG_REPOSITORY);
    dogBreedRepository = module.get(DOG_BREED_REPOSITORY);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('searchBreeds', () => {
    it('expands breed keywords through search governance', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['拉布拉多犬', 'labrador']);
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('labrador', 'Labrador Retriever'),
        createBreed('golden', '金毛寻回犬'),
      ]);

      const result = await service.searchBreeds('拉布拉多犬');

      expect(searchGovernance.expandQuery).toHaveBeenCalledWith(
        'BREED',
        '拉布拉多犬',
      );
      expect(result.map((breed) => breed.id)).toEqual(['labrador']);
    });

    it('records breed searches with the final result count', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['拉布拉多犬', 'labrador']);
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('labrador', 'Labrador Retriever'),
        createBreed('golden', '金毛寻回犬'),
      ]);

      await service.searchBreeds(' 拉布拉多犬 ');

      expect(searchGovernance.recordSearchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'BREED',
          source: 'DOG_BREED_SEARCH',
          rawQuery: '拉布拉多犬',
          resultCount: 1,
        }),
      );
    });

    it('matches breeds by expanded aliases', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['金毛犬', 'golden retriever']);
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('labrador', '拉布拉多寻回犬'),
        createBreed('golden', 'Golden Retriever'),
      ]);

      const result = await service.searchBreeds('金毛犬');

      expect(result[0]?.name).toBe('Golden Retriever');
    });

    it('falls back to the original keyword when breed governance expansion fails', async () => {
      searchGovernance.expandQuery.mockRejectedValue(new Error('alias unavailable'));
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('labrador', '拉布拉多寻回犬'),
        createBreed('golden', '金毛寻回犬'),
      ]);

      const result = await service.searchBreeds('金毛');

      expect(result.map((breed) => breed.id)).toEqual(['golden']);
    });

    it('ranks a primary breed name exact match before another breed alias exact match', async () => {
      searchGovernance.expandQuery.mockResolvedValue(['拉布拉多寻回犬']);
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('primary-name', '拉布拉多寻回犬'),
        createBreed('alias-match', '金毛', ['拉布拉多寻回犬'], true),
      ]);

      const result = await service.searchBreeds('拉布拉多寻回犬');

      expect(result.map((breed) => breed.id)).toEqual([
        'primary-name',
        'alias-match',
      ]);
    });

    it('keeps the original keyword first and limits expanded breed terms', async () => {
      searchGovernance.expandQuery.mockResolvedValue([
        '金毛',
        'alias-1',
        'alias-2',
        'alias-3',
        'alias-4',
        'alias-5',
        'alias-6',
        'alias-7',
        'alias-8',
      ]);
      dogBreedRepository.findAll.mockResolvedValue([
        createBreed('original', '拉布拉多寻回犬', ['拉拉']),
        createBreed('expanded', '金毛寻回犬'),
        createBreed('first-excluded-expanded-term', 'alias-7'),
      ]);

      const result = await service.searchBreeds('拉拉');

      expect(result.map((breed) => breed.id)).toEqual(['original', 'expanded']);
    });

    it('returns the default breed list for blank keywords', async () => {
      const breeds = [
        createBreed('labrador', '拉布拉多寻回犬'),
        createBreed('golden', '金毛寻回犬'),
      ];
      dogBreedRepository.findAll.mockResolvedValue(breeds);

      await expect(service.searchBreeds('   ')).resolves.toEqual(breeds);
      expect(searchGovernance.expandQuery).not.toHaveBeenCalled();
      expect(searchGovernance.recordSearchEvent).not.toHaveBeenCalled();
    });
  });

  describe('calcPreview', () => {
    const createMockDog = (overrides?: {
      breedId?: string;
      birthday?: Date;
      currentWeightKg?: number;
      bcsScore?: number;
      activityLevel?: ActivityLevel;
      treatInputMode?: TreatInputMode;
      manualTreatKcal?: number | null;
    }): Dog => {
      return new Dog(
        'dog-id-1',
        'owner-id-1',
        'Test Dog',
        overrides?.breedId ?? 'breed-id-1',
        null,
        overrides?.birthday ?? new Date('2020-01-01'),
        DogGender.MALE,
        false,
        overrides?.currentWeightKg ?? 10.0,
        overrides?.bcsScore ?? 5,
        overrides?.activityLevel ?? ActivityLevel.NORMAL,
        LifeStageOverride.NONE,
        null,
        2,
        overrides?.treatInputMode ?? TreatInputMode.ESTIMATE_LEVEL,
        TreatLevel.LOW,
        overrides?.manualTreatKcal ?? null,
        null,
        null,
        0,
      );
    };

    it('should calculate preview for a normal adult dog', async () => {
      // Arrange
      const dog = createMockDog();
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      expect(result.totalDer).toBeGreaterThan(0);
      expect(result.treatDeduction).toBeGreaterThanOrEqual(0);
      expect(typeof result.isTreatCapped).toBe('boolean');
    });

    it('should throw error when dog is not found', async () => {
      // Arrange
      dogRepository.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(service.calcPreview('non-existent-id')).rejects.toThrow(
        'Dog not found: non-existent-id',
      );
    });

    it('should handle boundary case: minimum weight dog (very small)', async () => {
      // Arrange: Very small dog (1kg - boundary case)
      const dog = createMockDog({
        currentWeightKg: 1.0, // Minimum realistic weight
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      // Small dogs should have proportionally lower energy requirements
      expect(result.totalDer).toBeGreaterThan(0);
    });

    it('should handle boundary case: maximum weight dog (very large)', async () => {
      // Arrange: Very large dog (80kg - boundary case for giant breeds)
      const dog = createMockDog({
        currentWeightKg: 80.0, // Maximum realistic weight
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      // Large dogs should have higher energy requirements
      expect(result.totalDer).toBeGreaterThan(0);
    });

    it('should handle boundary case: treat input mode EXACT_KCAL', async () => {
      // Arrange: Dog with exact treat kcal input
      const dog = createMockDog({
        treatInputMode: TreatInputMode.EXACT_KCAL,
        manualTreatKcal: 100, // Explicit treat calories
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThanOrEqual(0);
      // When using EXACT_KCAL, treat deduction should be based on manual input
      expect(result.treatDeduction).toBeGreaterThanOrEqual(0);
    });

    it('should handle boundary case: extreme activity level (WORKING)', async () => {
      // Arrange: Working dog with high activity
      const dog = createMockDog({
        activityLevel: ActivityLevel.WORKING,
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      // Working dogs should have higher energy requirements
      expect(result.totalDer).toBeGreaterThan(0);
    });

    it('should handle boundary case: minimum BCS score (1)', async () => {
      // Arrange: Underweight dog
      const dog = createMockDog({
        bcsScore: 1, // Minimum BCS (severely underweight)
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      // Underweight dogs should have higher energy requirements to gain weight
    });

    it('should handle boundary case: maximum BCS score (9)', async () => {
      // Arrange: Overweight dog
      const dog = createMockDog({
        bcsScore: 9, // Maximum BCS (severely overweight)
      });
      dogRepository.findById.mockResolvedValue(dog);
      dogBreedRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.calcPreview('dog-id-1');

      // Assert
      expect(result).toBeDefined();
      expect(result.finalFoodKcal).toBeGreaterThan(0);
      // Overweight dogs should have reduced energy requirements for weight loss
    });
  });

  describe('updateDogProfile', () => {
    it('persists updated breedId and birthday', async () => {
      const dog = createDogForUpdate();
      const savedDog = createDogForUpdate({
        breedId: 'breed-standard-schnauzer',
        birthday: new Date('2022-06-01T00:00:00.000Z'),
      });

      dogRepository.findById.mockResolvedValue(dog);
      dogRepository.save.mockResolvedValue(savedDog);
      dogBreedRepository.findById.mockResolvedValue(null);

      const result = await service.updateDogProfile('dog-id-1', {
        breedId: 'breed-standard-schnauzer',
        birthday: new Date('2022-06-01T00:00:00.000Z'),
      });

      expect(dogRepository.save).toHaveBeenCalledTimes(1);
      const persistedDog = dogRepository.save.mock.calls[0]?.[0];
      expect(persistedDog?.breedId).toBe('breed-standard-schnauzer');
      expect(persistedDog?.birthday.toISOString()).toBe('2022-06-01T00:00:00.000Z');
      expect(result.breedId).toBe('breed-standard-schnauzer');
      expect(result.birthday.toISOString()).toBe('2022-06-01T00:00:00.000Z');
    });
  });
});
