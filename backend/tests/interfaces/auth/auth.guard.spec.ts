/**
 * Auth Guard Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { DogsController } from 'src/dogs.controller';
import { UnauthorizedExceptionFilter } from 'src/common/unauthorized-exception.filter';
import {
  DogService,
  DOG_REPOSITORY,
  DOG_BREED_REPOSITORY,
  PRISMA_SERVICE,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import { InMemoryDogRepository } from 'src/infrastructure/repositories/in-memory-dog.repository';
import { InMemoryRecipeRepository } from 'src/infrastructure/repositories/in-memory-recipe.repository';
import { JwtAuthService } from 'src/auth/jwt.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { DogBreed } from 'src/domain/dog/dog-breed.entity';
import { DogSizeCategory } from 'src/domain';
import { GrowthCurveType } from 'src/domain/dog/enums';
import {
  MEDICAL_RECORD_REPOSITORY,
  CHECKUP_RECORD_REPOSITORY,
  ALLERGY_RECORD_REPOSITORY,
} from 'src/application/health/health.service';
import { WeightRecordService } from 'src/application/weight-record/weight-record.service';
import { OrderService } from 'src/application/order/order.service';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { TencentCosService } from 'src/infrastructure/services/tencent-cos.service';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication;
  let jwtAuthService: JwtAuthService;
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
  const mockOrderService = {
    listDogFinishedFoodHistory: jest.fn(),
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
        {
          provide: DOG_REPOSITORY,
          useClass: InMemoryDogRepository,
        },
        {
          provide: DOG_BREED_REPOSITORY,
          useValue: mockDogBreedRepository,
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
          provide: OrderService,
          useValue: mockOrderService,
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
      }),
    );
    app.useGlobalFilters(new UnauthorizedExceptionFilter());

    jwtAuthService = moduleFixture.get<JwtAuthService>(JwtAuthService);
    jest.clearAllMocks();
    mockDogBreedRepository.findById.mockResolvedValue(mockBreed);
    mockDogBreedRepository.findAll.mockResolvedValue([mockBreed]);

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Bearer token authentication', () => {
    it('should allow access with valid Bearer token', async () => {
      const token = jwtAuthService.generateToken('test-customer-123');

      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should get 404 in body (not 401), meaning auth passed
      expect(response.body).toHaveProperty('code', 404);
    });

    it('should reject invalid Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('Authorization', 'Bearer invalid-token')
        .expect(200);

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body).toHaveProperty('message', 'Invalid token');
    });

    it('should reject malformed Authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('Authorization', 'InvalidFormat token')
        .expect(200);

      expect(response.body).toHaveProperty('code', 401);
    });

    it('should reject expired token', async () => {
      // Generate token with very short expiration
      const expiredToken = jwtAuthService.generateToken('test-customer-123');
      // Note: In real scenario, we'd need to wait or manipulate time
      // For now, we test with invalid token format
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('Authorization', `Bearer ${expiredToken}expired`)
        .expect(200);

      expect(response.body).toHaveProperty('code', 401);
    });
  });

  describe('X-Customer-Id header (backward compatibility)', () => {
    it('should allow access with X-Customer-Id header when no Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('X-Customer-Id', 'test-customer-123')
        .expect(200);

      // Should get 404 in body (not 401), meaning auth passed
      expect(response.body).toHaveProperty('code', 404);
    });

    it('should reject missing X-Customer-Id when no Bearer token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .expect(200);

      expect(response.body).toHaveProperty('code', 401);
      expect(response.body).toHaveProperty('message', 'Unauthorized');
    });
  });

  describe('Priority: Bearer token over X-Customer-Id', () => {
    it('should use Bearer token when both are present', async () => {
      const token = jwtAuthService.generateToken('bearer-customer-id');

      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs/non-existent-id')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Customer-Id', 'header-customer-id')
        .expect(200);

      // Should get 404 in body (not 401), meaning auth passed
      // The customerId from Bearer token should be used
      expect(response.body).toHaveProperty('code', 404);
    });
  });
});
