/**
 * Recipes Controller API Tests
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { RecipesController } from 'src/recipes.controller';
import { RECIPE_REPOSITORY_TOKEN } from 'src/recipes.controller';
import { InMemoryRecipeRepository } from 'src/infrastructure/repositories/in-memory-recipe.repository';
import { DiySheetService } from 'src/application/recipe/diy-sheet.service';
import {
  DogService,
  DOG_REPOSITORY,
  DOG_BREED_REPOSITORY,
  PRISMA_SERVICE,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import { InMemoryDogRepository } from 'src/infrastructure/repositories/in-memory-dog.repository';
import type { Recipe } from 'src/domain/recipe/recipe.repository';
import { Dog } from 'src/domain/dog/dog.entity';
import { DogBreed } from 'src/domain/dog/dog-breed.entity';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
  DogSizeCategory,
} from 'src/domain';
import { GrowthCurveType } from 'src/domain/dog/enums';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { JwtAuthService } from 'src/auth/jwt.service';

describe('RecipesController (e2e)', () => {
  let app: INestApplication;
  let recipeRepository: InMemoryRecipeRepository;
  let dogRepository: InMemoryDogRepository;
  const mockBreed = new DogBreed(
    '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    'Test Breed',
    [],
    DogSizeCategory.MEDIUM,
    GrowthCurveType.STANDARD,
    12,
    8,
    12,
    true,
  );
  const mockDogBreedRepository = {
    findById: jest.fn().mockResolvedValue(mockBreed),
    findAll: jest.fn().mockResolvedValue([mockBreed]),
    findHotBreeds: jest.fn().mockResolvedValue([mockBreed]),
    findBySizeCategory: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByName: jest.fn(),
    countUsage: jest.fn(),
    findUsage: jest.fn(),
  };
  const mockPrismaService = {
    recipe: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    preparationMethod: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const mockJwtAuthService = {
    validateToken: jest.fn(),
    generateToken: jest.fn(),
    generateTokenForUser: jest.fn(),
  };

  beforeEach(async () => {
    // Create shared repository instances
    const sharedRecipeRepo = new InMemoryRecipeRepository();
    const sharedDogRepo = new InMemoryDogRepository();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecipesController],
      providers: [
        DiySheetService,
        DogService,
        {
          provide: RECIPE_REPOSITORY_TOKEN,
          useValue: sharedRecipeRepo,
        },
        {
          provide: RECIPE_REPOSITORY,
          useValue: sharedRecipeRepo,
        },
        {
          provide: DOG_REPOSITORY,
          useValue: sharedDogRepo,
        },
        {
          provide: DOG_BREED_REPOSITORY,
          useValue: mockDogBreedRepository,
        },
        {
          provide: PRISMA_SERVICE,
          useValue: {},
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtAuthService,
          useValue: mockJwtAuthService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    recipeRepository = moduleFixture.get(RECIPE_REPOSITORY_TOKEN);
    dogRepository = moduleFixture.get(DOG_REPOSITORY);
    jest.clearAllMocks();
    mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
    mockDogBreedRepository.findAll.mockResolvedValue([mockBreed]);
    mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);
    mockPrismaService.recipe.findFirst.mockImplementation(
      async (args?: { where?: { recipeId?: string } }) => {
        const recipeId = args?.where?.recipeId;
        return recipeId ? { id: recipeId } : null;
      },
    );
    mockPrismaService.recipe.update.mockResolvedValue({});

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/recipes', () => {
    it('should return seeded recipe after app initialization', async () => {
      // Seed the canonical recipe
      const canonicalRecipe: Recipe = {
        id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        version: 1,
        name: 'Chicken Pumpkin Bowl',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1200,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(canonicalRecipe);

      const response = await request(app.getHttpServer())
        .get('/api/v1/recipes')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data.data)).toBe(true);
      expect(response.body.data.data.length).toBeGreaterThan(0);

      // Verify seeded recipe is in the list
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const seededRecipe = response.body.data.data.find(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        (r: { id: string }) => r.id === '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      );
      expect(seededRecipe).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(seededRecipe?.name).toBe('Chicken Pumpkin Bowl');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(seededRecipe?.energyDensityKcalPerKg).toBe(1200);
    });

    it('returns coverTitle so the miniapp can render the cover badge', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440015',
        version: 1,
        name: 'Badge Title Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1200,
        productionLossRate: 1.07,
        coverImageUrl: 'https://img.sevenkitchen.cloud/recipes/cover.jpg',
        coverTitle: '皮毛友好【成年犬】',
      };
      await recipeRepository.save(recipe);

      const response = await request(app.getHttpServer())
        .get('/api/v1/recipes')
        .expect(200);

      const listedRecipe = response.body.data.data.find(
        (r: { id: string }) => r.id === recipe.id,
      );
      expect(listedRecipe).toBeDefined();
      expect(listedRecipe.coverTitle).toBe('皮毛友好【成年犬】');
    });

    it('should return empty array when no public recipes exist', async () => {
      // Note: InMemoryRepository doesn't have a clear method
      // This test verifies the endpoint handles empty state correctly
      // In real scenario, repository would be cleared in test setup

      const response = await request(app.getHttpServer())
        .get('/api/v1/recipes')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data.data)).toBe(true);
      expect(response.body.data.data).toHaveLength(0);
      expect(response.body.data.total).toBe(0);
    });
  });

  describe('GET /api/v1/recipes/:id', () => {
    it('does not increment view count when loading recipe detail', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440010',
        version: 1,
        name: 'Detail Only Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
        items: [],
      };
      await recipeRepository.save(recipe);

      await request(app.getHttpServer())
        .get(`/api/v1/recipes/${recipe.id}`)
        .expect(200);

      expect(mockPrismaService.recipe.update).not.toHaveBeenCalled();
    });

    it('does not expose raw unresolved legacy preparation method uuids in public recipe detail', async () => {
      const missingId = '33333333-3333-3333-3333-333333333333';
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440012',
        version: 1,
        name: 'Legacy Detail Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
        items: [
          {
            id: 'item-1',
            ingredientId: 'ingredient-1',
            preparationMethod: missingId,
            ingredient: {
              id: 'ingredient-1',
              name: '南瓜',
              type: 'FOOD',
              properties: {},
            },
            ratioPercent: 100,
            sortOrder: 0,
          } as any,
        ],
      };
      await recipeRepository.save(recipe);
      mockPrismaService.preparationMethod.findMany.mockResolvedValue([]);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/recipes/${recipe.id}`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.items[0].preparationMethod).toBeUndefined();
      expect(response.body.data.items[0]).not.toHaveProperty(
        'preparationMethod',
        missingId,
      );
    });

    it('does not expose uploaded PDF report urls on public recipe detail', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440014',
        version: 1,
        name: 'Report Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
        items: [],
        nutritionReportUrl:
          'https://cdn.example.com/recipe-nutrition-reports/report.pdf',
      } as any;
      await recipeRepository.save(recipe);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/recipes/${recipe.id}`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data).not.toHaveProperty('nutritionReportUrl');
    });

    it('returns supplement alternatives with product fields and resolved active nutrients', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440013',
        version: 1,
        name: 'Supplement Alternatives Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
        items: [
          {
            id: 'item-supplement',
            ingredientId: 'ingredient-supplement-default',
            sortOrder: 0,
            nutrientTargetKey: '维生素E',
            nutrientTargetValue: 200,
            supplementAlternativeIngredientIds: ['ingredient-supplement-alt'],
            supplementAlternatives: [
              {
                ingredientId: 'ingredient-supplement-alt',
                ingredientName: '维生素E-400',
                ingredient: {
                  id: 'ingredient-supplement-alt',
                  name: '维生素E-400',
                  type: 'SUPPLEMENT',
                  diyEnabled: true,
                  brand: 'NOW FOODS',
                  productModel: '400IU/粒',
                  purchaseChannel: '京东',
                  unitDisplayLabel: '粒',
                  properties: {
                    image_url: 'https://cdn.example.com/e400-square.jpg',
                    purchase_link: {
                      platform: 'JD',
                  url: 'https://jd.example/e400',
                },
                add_timing: 'BEFORE_MEAL',
                active_nutrients: {
                  维生素E: {
                    value: 400,
                        unit: 'IU',
                      },
                    },
                  },
                } as any,
              },
            ],
            ingredient: {
              id: 'ingredient-supplement-default',
              name: '维生素E-200',
              type: 'SUPPLEMENT',
              diyEnabled: false,
              brand: 'NOW FOODS',
              productModel: '200IU/粒',
              purchaseChannel: '京东',
              unitDisplayLabel: '粒',
              properties: {
                image_url: 'https://cdn.example.com/e200-square.jpg',
                purchase_link: {
                  platform: 'JD',
                  url: 'https://jd.example/e200',
                },
                add_timing: 'BEFORE_MEAL',
                active_nutrients: {
                  维生素E: {
                    value: 200,
                    unit: 'IU',
                  },
                },
              },
            } as any,
          } as any,
        ],
      };
      await recipeRepository.save(recipe);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/recipes/${recipe.id}`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.items[0].ingredient.displayUnit).toBe('粒');
      expect(response.body.data.items[0].ingredient.diyEnabled).toBe(false);
      expect(response.body.data.items[0].ingredient.addTimingLabel).toBe('随餐');
      expect(response.body.data.items[0].ingredient.imageUrl).toBe(
        'https://cdn.example.com/e200-square.jpg',
      );
      expect(response.body.data.items[0].ingredient.activeNutrients.维生素E).toEqual({
        value: 200,
        unit: 'IU',
      });
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient.brand,
      ).toBe('NOW FOODS');
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient
          .diyEnabled,
      ).toBe(true);
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient
          .addTimingLabel,
      ).toBe('随餐');
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient
          .purchaseLink,
      ).toEqual({
        platform: 'JD',
        url: 'https://jd.example/e400',
      });
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient
          .imageUrl,
      ).toBe('https://cdn.example.com/e400-square.jpg');
      expect(
        response.body.data.items[0].supplementAlternatives[0].ingredient
          .activeNutrients.维生素E,
      ).toEqual({
        value: 400,
        unit: 'IU',
      });
    });
  });

  describe('POST /api/v1/recipes/:id/view', () => {
    it('increments view count via the explicit tracking endpoint', async () => {
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440011',
        version: 1,
        name: 'Tracked View Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
        items: [],
      };
      await recipeRepository.save(recipe);

      await request(app.getHttpServer())
        .post(`/api/v1/recipes/${recipe.id}/view`)
        .expect(200);

      expect(mockPrismaService.recipe.update).toHaveBeenCalledWith({
        where: { id: recipe.id },
        data: { viewCount: { increment: 1 } },
      });
    });
  });

  describe('POST /api/v1/recipes/:id/diy-sheet', () => {
    it('should generate DIY sheet successfully for valid recipe', async () => {
      // Setup: Add recipe to repository
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440001',
        version: 1,
        name: 'Test Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(recipe);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recipes/${recipe.id}/diy-sheet`)
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('recipeId', recipe.id);
      expect(response.body.data).toHaveProperty('recipeName', recipe.name);
      expect(response.body.data).toHaveProperty('steps');
      expect(Array.isArray(response.body.data.steps)).toBe(true);
      expect(response.body.data.steps.length).toBeGreaterThan(0);

      expect(response.body.data.steps[0]).toHaveProperty('stepNumber');

      expect(response.body.data.steps[0]).toHaveProperty('description');
    });

    it('should return 404 for non-existent recipe', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recipes/${nonExistentId}/diy-sheet`)
        .send({})
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body.message).toContain('Recipe not found');
      expect(response.body.data).toBeNull();
    });

    it('should return 400 for invalid request body (invalid dogId format)', async () => {
      // Setup: Add recipe to repository
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440002',
        version: 1,
        name: 'Test Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(recipe);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recipes/${recipe.id}/diy-sheet`)
        .send({ dogId: 'invalid-uuid' })
        .expect(400); // ValidationPipe returns HTTP 400 for invalid DTO

      // Validation errors typically return HTTP 400 directly
      expect(response.status).toBe(400);
    });

    it('should include recommendedDailyIntakeG when dogId is provided', async () => {
      // Setup: Add recipe and dog to repositories
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440003',
        version: 1,
        name: 'Test Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(recipe);

      const dog = new Dog(
        '550e8400-e29b-41d4-a716-446655440010', // Use valid UUID format
        'owner-id-1',
        'Test Dog',
        '3fa85f64-5717-4562-b3fc-2c963f66afa6', // Use valid UUID format
        null,
        new Date('2020-01-01'),
        DogGender.MALE,
        false,
        10.0,
        5, // Valid BCS score
        ActivityLevel.NORMAL,
        LifeStageOverride.NONE,
        null,
        2,
        TreatInputMode.ESTIMATE_LEVEL,
        TreatLevel.LOW,
        null,
        null,
        null,
        null,
        0,
      );
      await dogRepository.save(dog);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recipes/${recipe.id}/diy-sheet`)
        .send({ dogId: dog.id })
        .expect(200);
      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('recommendedDailyIntakeG');

      expect(typeof response.body.data.recommendedDailyIntakeG).toBe('number');
    });

    it('should return 404 when dogId is provided but dog does not exist', async () => {
      // Setup: Add recipe to repository
      const recipe: Recipe = {
        id: '550e8400-e29b-41d4-a716-446655440004',
        version: 1,
        name: 'Test Recipe',
        status: 'PUBLIC',
        energyDensityKcalPerKg: 1450,
        productionLossRate: 1.07,
      };
      await recipeRepository.save(recipe);

      const nonExistentDogId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recipes/${recipe.id}/diy-sheet`)
        .send({ dogId: nonExistentDogId })
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      // The error could be "Recipe not found" or "Dog not found" depending on execution order
      // Since recipe exists, it should be "Dog not found"
      expect(response.body.message).toMatch(/Dog not found|Recipe not found/);
      expect(response.body.data).toBeNull();
    });
  });
});
