/**
 * Dogs Controller API Tests
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { DogsController } from 'src/dogs.controller';
import { UnauthorizedExceptionFilter } from 'src/common/unauthorized-exception.filter';
import { BadRequestExceptionFilter } from 'src/common/bad-request-exception.filter';
import {
  DogService,
  DOG_REPOSITORY,
  DOG_BREED_REPOSITORY,
  PRISMA_SERVICE,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import {
  BREED_HEALTH_RISK_REPOSITORY,
  BreedHealthRiskService,
} from 'src/application/dog/breed-health-risk.service';
import { InMemoryDogRepository } from 'src/infrastructure/repositories/in-memory-dog.repository';
import { InMemoryRecipeRepository } from 'src/infrastructure/repositories/in-memory-recipe.repository';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
  DogSizeCategory,
} from 'src/domain';
import { Dog } from 'src/domain/dog/dog.entity';
import { DogBreed } from 'src/domain/dog/dog-breed.entity';
import {
  BreedHealthAttentionPriority,
  BreedHealthRiskSourceType,
} from 'src/domain/dog/breed-health-risk.entity';
import { GrowthCurveType } from 'src/domain/dog/enums';
import { JwtAuthService } from 'src/auth/jwt.service';
import { AuthGuard } from 'src/auth/auth.guard';
import {
  MEDICAL_RECORD_REPOSITORY,
  CHECKUP_RECORD_REPOSITORY,
  ALLERGY_RECORD_REPOSITORY,
} from 'src/application/health/health.service';
import { WeightRecordService } from 'src/application/weight-record/weight-record.service';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { TencentCosService } from 'src/infrastructure/services/tencent-cos.service';

describe('DogsController (e2e)', () => {
  let app: INestApplication;
  let dogRepository: InMemoryDogRepository;
  const mockBreed = new DogBreed(
    '550e8400-e29b-41d4-a716-446655440000',
    'Test Breed',
    [],
    DogSizeCategory.SMALL,
    GrowthCurveType.STANDARD,
    12,
    8,
    6,
    true,
  );
  const mockHotBreeds = [
    new DogBreed(
      'breed-hot-1',
      '拉布拉多',
      [],
      DogSizeCategory.LARGE,
      GrowthCurveType.STANDARD,
      18,
      8,
      30,
      false,
    ),
    new DogBreed(
      'breed-hot-2',
      '金毛',
      [],
      DogSizeCategory.LARGE,
      GrowthCurveType.STANDARD,
      18,
      8,
      32,
      false,
    ),
  ];

  const mockDogBreedRepository = {
    findById: jest.fn().mockResolvedValue(mockBreed),
    findAll: jest.fn().mockResolvedValue([mockBreed]),
    findHotBreeds: jest.fn().mockResolvedValue(mockHotBreeds),
    findBySizeCategory: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    existsByName: jest.fn(),
    countUsage: jest.fn(),
    findUsage: jest.fn(),
  };

  const mockBreedHealthRiskRepository = {
    findPublishedByBreedId: jest.fn(),
  };

  const mockMedicalRecordRepository = {
    findById: jest.fn(),
    findByDogId: jest.fn().mockResolvedValue([]),
    findByStatus: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockCheckupRecordRepository = {
    findById: jest.fn(),
    findByDogId: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockAllergyRecordRepository = {
    findById: jest.fn(),
    findByDogId: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockWeightRecordService = {
    create: jest.fn(),
    findByDogId: jest.fn(),
    delete: jest.fn(),
    updateSyncedToProfile: jest.fn(),
  };

  const mockCosService = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [DogsController],
      providers: [
        DogService,
        BreedHealthRiskService,
        {
          provide: DOG_REPOSITORY,
          useClass: InMemoryDogRepository,
        },
        {
          provide: DOG_BREED_REPOSITORY,
          useValue: mockDogBreedRepository,
        },
        {
          provide: BREED_HEALTH_RISK_REPOSITORY,
          useValue: mockBreedHealthRiskRepository,
        },
        {
          provide: RECIPE_REPOSITORY,
          useClass: InMemoryRecipeRepository,
        },
        {
          provide: PRISMA_SERVICE,
          useValue: {},
        },
        {
          provide: MEDICAL_RECORD_REPOSITORY,
          useValue: mockMedicalRecordRepository,
        },
        {
          provide: CHECKUP_RECORD_REPOSITORY,
          useValue: mockCheckupRecordRepository,
        },
        {
          provide: ALLERGY_RECORD_REPOSITORY,
          useValue: mockAllergyRecordRepository,
        },
        {
          provide: WeightRecordService,
          useValue: mockWeightRecordService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: TencentCosService,
          useValue: mockCosService,
        },
        JwtAuthService,
        AuthGuard,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: (errors) => {
          // Format validation errors into a readable message (same as main.ts)
          const messages = errors.map((error) => {
            const constraints = error.constraints || {};
            const constraintMessages = Object.values(constraints);
            if (constraintMessages.length > 0) {
              return `${error.property}: ${constraintMessages.join(', ')}`;
            }
            // Handle nested validation errors
            if (error.children && error.children.length > 0) {
              const childMessages = error.children
                .map((child) => {
                  const childConstraints = child.constraints || {};
                  return Object.values(childConstraints).join(', ');
                })
                .filter((msg) => msg.length > 0);
              if (childMessages.length > 0) {
                return `${error.property}: ${childMessages.join(', ')}`;
              }
            }
            return `${error.property}: validation failed`;
          });
          return new BadRequestException(messages.join('; '));
        },
      }),
    );
    app.useGlobalFilters(
      new BadRequestExceptionFilter(),
      new UnauthorizedExceptionFilter(),
    );

    dogRepository = moduleFixture.get(DOG_REPOSITORY);
    jest.clearAllMocks();
    mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
    mockDogBreedRepository.findAll.mockResolvedValue([mockBreed]);
    mockDogBreedRepository.findHotBreeds.mockResolvedValue(mockHotBreeds);
    mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue([]);
    mockMedicalRecordRepository.findByDogId.mockResolvedValue([]);
    mockCheckupRecordRepository.findByDogId.mockResolvedValue([]);
    mockAllergyRecordRepository.findByDogId.mockResolvedValue([]);

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/dogs', () => {
    it('should return empty array when customer has no dogs', async () => {
      const customerId = 'customer-with-no-dogs';

      const response = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs')
        .set('X-Customer-Id', customerId)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should return dogs created by current customer', async () => {
      const customerA = 'customer-a';
      const customerB = 'customer-b';

      // Create dogs for customer A
      const dog1 = new Dog(
        'dog-1',
        customerA,
        'Dog 1',
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        new Date('2020-01-01'),
        DogGender.MALE,
        false,
        10.0,
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
        null,
        0,
      );

      const dog2 = new Dog(
        'dog-2',
        customerA,
        'Dog 2',
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        new Date('2021-01-01'),
        DogGender.FEMALE,
        true,
        8.0,
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
        null,
        0,
      );

      // Create dog for customer B
      const dog3 = new Dog(
        'dog-3',
        customerB,
        'Dog 3',
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        new Date('2022-01-01'),
        DogGender.MALE,
        false,
        12.0,
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
        null,
        0,
      );

      await dogRepository.save(dog1);
      await dogRepository.save(dog2);
      await dogRepository.save(dog3);

      // List dogs for customer A
      const responseA = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs')
        .set('X-Customer-Id', customerA)
        .expect(200);

      expect(responseA.body).toHaveProperty('code', 0);
      expect(responseA.body.data).toBeDefined();
      expect(Array.isArray(responseA.body.data)).toBe(true);
      expect(responseA.body.data.length).toBe(2);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const dogIdsA = responseA.body.data.map(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
        (d: { id: string }) => d.id,
      );
      expect(dogIdsA).toContain('dog-1');
      expect(dogIdsA).toContain('dog-2');
      expect(dogIdsA).not.toContain('dog-3');

      // Verify all returned dogs belong to customer A
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      responseA.body.data.forEach(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (dog: { ownerId: string }) => {
          expect(dog.ownerId).toBe(customerA);
        },
      );

      // List dogs for customer B
      const responseB = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs')
        .set('X-Customer-Id', customerB)
        .expect(200);

      expect(responseB.body).toHaveProperty('code', 0);
      expect(responseB.body.data).toBeDefined();
      expect(Array.isArray(responseB.body.data)).toBe(true);
      expect(responseB.body.data.length).toBe(1);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(responseB.body.data[0]?.id).toBe('dog-3');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(responseB.body.data[0]?.ownerId).toBe(customerB);
    });

    it('should return 401 when X-Customer-Id header is missing', async () => {
      // UnauthorizedExceptionFilter converts UnauthorizedException to HTTP 200 with code 401 in body
      const response = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs')
        .expect(200);

      // Verify error response in body
      expect(response.body).toHaveProperty('code', 401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toBeNull();
    });
  });

  describe('GET /api/v1/dogs/breeds/hot', () => {
    it('should return hot standard breeds in usage order', async () => {
      const response = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs/breeds/hot')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0]).toMatchObject({
        id: 'breed-hot-1',
        name: '拉布拉多',
        sizeCategory: DogSizeCategory.LARGE,
      });
      expect(response.body.data[1]).toMatchObject({
        id: 'breed-hot-2',
        name: '金毛',
        sizeCategory: DogSizeCategory.LARGE,
      });
      expect(mockDogBreedRepository.findHotBreeds).toHaveBeenCalledWith(10);
    });
  });

  describe('GET /api/v1/dogs/breeds/:breedId/health-risks', () => {
    it('returns published breed health risks with visible source metadata', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
      mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue([
        {
          id: 'risk-1',
          breedId: mockBreed.id,
          conditionId: 'condition-1',
          attentionPriority: BreedHealthAttentionPriority.KEY_ATTENTION,
          oneLineSummary: '该品种资料中较常被提及的骨骼关节关注项。',
          breedSpecificReason: '该品种体型和遗传资料中较常被提及。',
          displayOrder: 1,
          isPublished: true,
          condition: {
            id: 'condition-1',
            nameCn: '髋关节发育不良',
            nameEn: 'Hip Dysplasia',
            aliases: ['CHD'],
            category: '骨骼关节',
            summary: '髋关节相关疾病。',
            commonSigns: ['后肢跛行', '运动不愿意'],
            screeningAdvice: '可与兽医讨论髋关节相关检查。',
            careAdvice: '如出现疼痛或跛行表现，请咨询兽医。',
            isActive: true,
          },
          sources: [
            {
              id: 'source-1',
              riskId: 'risk-1',
              sourceType: BreedHealthRiskSourceType.OFA_CHIC,
              sourceName: 'OFA CHIC',
              publisher: 'Orthopedic Foundation for Animals',
              title: 'Breed screening recommendation',
              url: 'https://ofa.org/diseases/',
              accessedAt: new Date('2026-05-17T00:00:00.000Z'),
              note: null,
            },
          ],
        },
      ]);

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/breeds/${mockBreed.id}/health-risks`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data.breed).toEqual({
        id: mockBreed.id,
        name: mockBreed.name,
      });
      expect(response.body.data.risks).toHaveLength(1);
      expect(response.body.data.risks[0]).toMatchObject({
        id: 'risk-1',
        conditionId: 'condition-1',
        conditionName: '髋关节发育不良',
        category: '骨骼关节',
        attentionPriority: 'KEY_ATTENTION',
        attentionLabel: '重点关注',
        sourceCount: 1,
      });
      expect(response.body.data.risks[0].sources[0]).toMatchObject({
        sourceType: 'OFA_CHIC',
        sourceName: 'OFA CHIC',
        accessedAt: '2026-05-17',
      });
      expect(
        mockBreedHealthRiskRepository.findPublishedByBreedId,
      ).toHaveBeenCalledWith(mockBreed.id);
    });

    it('returns an empty risk list for a known breed with no published risk content', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
      mockBreedHealthRiskRepository.findPublishedByBreedId.mockResolvedValue(
        [],
      );

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/breeds/${mockBreed.id}/health-risks`)
        .expect(200);

      expect(response.body.code).toBe(0);
      expect(response.body.data).toEqual({
        breed: {
          id: mockBreed.id,
          name: mockBreed.name,
        },
        risks: [],
      });
    });

    it('returns a friendly 404 envelope for an unknown breed', async () => {
      mockDogBreedRepository.findById.mockResolvedValue(null);

      const response = await request(app.getHttpAdapter().getInstance())
        .get('/api/v1/dogs/breeds/missing-breed/health-risks')
        .expect(200);

      expect(response.body).toEqual({
        code: 404,
        message: '未找到该品种',
        data: null,
      });
      expect(
        mockBreedHealthRiskRepository.findPublishedByBreedId,
      ).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/dogs/calc-preview', () => {
    it('should return 200 with calc result for valid input', async () => {
      const validPayload = {
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2020-01-01T00:00:00Z',
        gender: DogGender.MALE,
        isNeutered: false,
        currentWeightKg: 10.5,
        bcsScore: 5,
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.NONE,
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs/calc-preview')
        .send(validPayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('finalFoodKcal');
      expect(response.body.data).toHaveProperty('treatDeduction');
      expect(response.body.data).toHaveProperty('isTreatCapped');
      expect(response.body.data).toHaveProperty('totalDer');
      expect(typeof response.body.data.finalFoodKcal).toBe('number');
      expect(typeof response.body.data.totalDer).toBe('number');
    });

    it('should return 400 for invalid payload', async () => {
      const invalidPayload = {
        breedId: 'invalid-uuid',
        birthday: 'invalid-date',
        gender: 'INVALID_GENDER',
        isNeutered: 'not-boolean',
        currentWeightKg: -5, // Invalid: negative weight
        bcsScore: 15, // Invalid: BCS must be 1-9
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.NONE,
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs/calc-preview')
        .send(invalidPayload)
        .expect(200); // BadRequestExceptionFilter returns HTTP 200 with code 400 in body

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 when required fields are missing', async () => {
      const incompletePayload = {
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        // Missing other required fields
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs/calc-preview')
        .send(incompletePayload)
        .expect(200); // BadRequestExceptionFilter returns HTTP 200 with code 400 in body

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /api/v1/dogs', () => {
    it('should create a dog with valid payload and return 200 with data.id', async () => {
      const validPayload = {
        name: 'Cookie',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2020-01-01T00:00:00Z',
        gender: DogGender.FEMALE,
        isNeutered: false,
        currentWeightKg: 2.0,
        bcsScore: 5,
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.NONE,
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs')
        .set('X-Customer-Id', 'test-owner-id')
        .send(validPayload)
        .expect(201); // POST returns 201 Created

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('profile');
      expect(response.body.data.profile).toHaveProperty('id');
      expect(typeof response.body.data.profile.id).toBe('string');
      expect(response.body.data.profile.id.length).toBeGreaterThan(0);
      expect(response.body.data.profile).toHaveProperty('name', 'Cookie');
    });

    it('should return 400 with detailed validation errors for invalid payload (user scenario)', async () => {
      // This matches the user's actual payload that was failing
      const invalidPayload = {
        name: 'Cookie',
        species: 'DOG', // Invalid: not a field in DTO
        breed: 'Bichon', // Invalid: should be breedId (UUID)
        gender: 'FEMALE', // Valid enum value
        weightKg: 2.0, // Invalid: should be currentWeightKg
        // Missing required fields: birthday, isNeutered, bcsScore, activityLevel, lifeStageOverride
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs')
        .set('X-Customer-Id', 'test-owner-id')
        .send(invalidPayload)
        .expect(200); // BadRequestExceptionFilter returns HTTP 200 with code 400 in body

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBeTruthy();
      expect(response.body.message.length).toBeGreaterThan(0);
      // Verify the message contains details about validation errors
      expect(response.body.message).toContain('breedId');
      expect(response.body.message).toContain('birthday');
      expect(response.body.message).toContain('isNeutered');
      expect(response.body.message).toContain('currentWeightKg');
      expect(response.body.message).toContain('bcsScore');
      expect(response.body.message).toContain('activityLevel');
      expect(response.body.message).toContain('lifeStageOverride');
      expect(response.body.data).toBeNull();
    });

    it('should return 400 with detailed error for missing required fields', async () => {
      const incompletePayload = {
        name: 'Cookie',
        // Missing all other required fields
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs')
        .set('X-Customer-Id', 'test-owner-id')
        .send(incompletePayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
      // Message should describe which fields are missing/invalid
      expect(response.body.message).toBeTruthy();
      expect(response.body.message.length).toBeGreaterThan(0);
      expect(response.body.data).toBeNull();
    });

    it('should return 400 with detailed error for invalid enum values', async () => {
      const invalidEnumPayload = {
        name: 'Cookie',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2020-01-01T00:00:00Z',
        gender: 'INVALID_GENDER', // Invalid enum value
        isNeutered: false,
        currentWeightKg: 2.0,
        bcsScore: 5,
        activityLevel: 'INVALID_ACTIVITY', // Invalid enum value
        lifeStageOverride: LifeStageOverride.NONE,
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs')
        .set('X-Customer-Id', 'test-owner-id')
        .send(invalidEnumPayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
      // Message should indicate which enum values are invalid
      expect(response.body.message).toBeTruthy();
      expect(response.body.message.length).toBeGreaterThan(0);
      expect(response.body.message.toLowerCase()).toMatch(/gender|activity/i);
      expect(response.body.data).toBeNull();
    });

    it('should return 400 with detailed error for invalid numeric constraints', async () => {
      const invalidNumericPayload = {
        name: 'Cookie',
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        birthday: '2020-01-01T00:00:00Z',
        gender: DogGender.FEMALE,
        isNeutered: false,
        currentWeightKg: -5, // Invalid: negative weight
        bcsScore: 15, // Invalid: BCS must be 1-9
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.NONE,
      };

      const response = await request(app.getHttpAdapter().getInstance())
        .post('/api/v1/dogs')
        .set('X-Customer-Id', 'test-owner-id')
        .send(invalidNumericPayload)
        .expect(200);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message');
      // Message should indicate which numeric constraints are violated
      expect(response.body.message).toBeTruthy();
      expect(response.body.message.length).toBeGreaterThan(0);
      expect(response.body.message.toLowerCase()).toMatch(/weight|bcs/i);
      expect(response.body.data).toBeNull();
    });
  });

  describe('GET /api/v1/dogs/:id', () => {
    it('should return 404 for missing dog', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/${nonExistentId}`)
        .set('X-Customer-Id', 'test-owner-id')
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 404);
      expect(response.body).toHaveProperty('message', 'Dog not found');
      expect(response.body.data).toBeNull();
    });

    it('should return 200 with dog detail for existing dog', async () => {
      // Create a dog first
      const dog = new Dog(
        'test-dog-id',
        'test-owner-id',
        'Test Dog',
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        new Date('2020-01-01'),
        DogGender.MALE,
        false,
        10.0,
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
        null,
        0,
      );

      await dogRepository.save(dog);

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/${dog.id}`)
        .set('X-Customer-Id', 'test-owner-id')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('profile');
      expect(response.body.data).toHaveProperty('calcResult');
      expect(response.body.data.profile).toHaveProperty('id', dog.id);
      expect(response.body.data.profile).toHaveProperty('name', 'Test Dog');
    });

    it('should include the persisted dog avatar url in dog detail responses', async () => {
      const avatarUrl =
        'https://img.sevenkitchen.cloud/dogs/avatars/test-dog-id.png';
      const dog = new Dog(
        'test-dog-with-avatar-id',
        'test-owner-id',
        'Test Dog With Avatar',
        '550e8400-e29b-41d4-a716-446655440000',
        null,
        new Date('2020-01-01'),
        DogGender.MALE,
        false,
        10.0,
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
        null,
        0,
        avatarUrl,
      );

      await dogRepository.save(dog);

      const response = await request(app.getHttpAdapter().getInstance())
        .get(`/api/v1/dogs/${dog.id}`)
        .set('X-Customer-Id', 'test-owner-id')
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data.profile).toHaveProperty('avatarUrl', avatarUrl);
    });
  });
});
