/**
 * Dogs Controller API Tests
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { DogsController } from './dogs.controller';
import { UnauthorizedExceptionFilter } from '../common/unauthorized-exception.filter';
import {
  DogService,
  DOG_REPOSITORY,
  RECIPE_REPOSITORY,
} from '../../application/dog/dog.service';
import { InMemoryDogRepository } from '../../infrastructure/repositories/in-memory-dog.repository';
import { InMemoryRecipeRepository } from '../../infrastructure/repositories/in-memory-recipe.repository';
import {
  DogGender,
  ActivityLevel,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from '../../domain';
import { Dog } from '../../domain/dog/dog.entity';
import { JwtAuthService } from '../auth/jwt.service';
import { AuthGuard } from '../auth/auth.guard';

describe('DogsController (e2e)', () => {
  let app: INestApplication;
  let dogRepository: InMemoryDogRepository;

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
          provide: RECIPE_REPOSITORY,
          useClass: InMemoryRecipeRepository,
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

    dogRepository = moduleFixture.get(DOG_REPOSITORY);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/dogs', () => {
    it('should return empty array when customer has no dogs', async () => {
      const customerId = 'customer-with-no-dogs';

      const response = await request(app.getHttpServer())
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
        0,
      );

      const dog2 = new Dog(
        'dog-2',
        customerA,
        'Dog 2',
        '550e8400-e29b-41d4-a716-446655440000',
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
        0,
      );

      // Create dog for customer B
      const dog3 = new Dog(
        'dog-3',
        customerB,
        'Dog 3',
        '550e8400-e29b-41d4-a716-446655440000',
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
        0,
      );

      await dogRepository.save(dog1);
      await dogRepository.save(dog2);
      await dogRepository.save(dog3);

      // List dogs for customer A
      const responseA = await request(app.getHttpServer())
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
      const responseB = await request(app.getHttpServer())
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
      const response = await request(app.getHttpServer())
        .get('/api/v1/dogs')
        .expect(200);

      // Verify error response in body
      expect(response.body).toHaveProperty('code', 401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toBeNull();
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

      const response = await request(app.getHttpServer())
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

      const response = await request(app.getHttpServer())
        .post('/api/v1/dogs/calc-preview')
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should return 400 when required fields are missing', async () => {
      const incompletePayload = {
        breedId: '550e8400-e29b-41d4-a716-446655440000',
        // Missing other required fields
      };

      await request(app.getHttpServer())
        .post('/api/v1/dogs/calc-preview')
        .send(incompletePayload)
        .expect(400);
    });
  });

  describe('GET /api/v1/dogs/:id', () => {
    it('should return 404 for missing dog', async () => {
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

      const response = await request(app.getHttpServer())
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
        0,
      );

      await dogRepository.save(dog);

      const response = await request(app.getHttpServer())
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
  });
});
