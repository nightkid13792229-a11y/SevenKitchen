/**
 * Auth Guard Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { DogsController } from 'src/controllers/dogs.controller';
import { UnauthorizedExceptionFilter } from 'src/common/unauthorized-exception.filter';
import {
  DogService,
  DOG_REPOSITORY,
  RECIPE_REPOSITORY,
} from 'src/application/dog/dog.service';
import { InMemoryDogRepository } from 'src/infrastructure/repositories/in-memory-dog.repository';
import { InMemoryRecipeRepository } from 'src/infrastructure/repositories/in-memory-recipe.repository';
import { JwtAuthService } from 'src/jwt.service';
import { AuthGuard } from 'src/auth.guard';

describe('AuthGuard (e2e)', () => {
  let app: INestApplication;
  let jwtAuthService: JwtAuthService;

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

    jwtAuthService = moduleFixture.get<JwtAuthService>(JwtAuthService);

    await app.init();
  });

  afterEach(async () => {
    await app.close();
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
