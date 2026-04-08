/**
 * Auth Controller Tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from 'src/auth.controller';
import { JwtAuthService } from 'src/auth/jwt.service';
import { UnauthorizedExceptionFilter } from 'src/common/unauthorized-exception.filter';
import { BadRequestExceptionFilter } from 'src/common/bad-request-exception.filter';
import { PrismaService } from 'src/infrastructure/prisma.service';
import { WechatService } from 'src/infrastructure/wechat/wechat.service';
import { SmsService } from 'src/infrastructure/sms/sms.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let jwtAuthService: JwtAuthService;

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ role: 'CUSTOMER' }]),
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockWechatService = {
    code2Session: jest.fn(),
  };

  const mockSmsService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '7d' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        JwtAuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: WechatService,
          useValue: mockWechatService,
        },
        {
          provide: SmsService,
          useValue: mockSmsService,
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
    app.useGlobalFilters(
      new UnauthorizedExceptionFilter(),
      new BadRequestExceptionFilter(),
    );

    jwtAuthService = moduleFixture.get<JwtAuthService>(JwtAuthService);
    jest.clearAllMocks();
    mockPrismaService.$queryRaw.mockResolvedValue([{ role: 'CUSTOMER' }]);

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 200 with token for valid customerId', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ customerId: 'test-customer-123' })
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body).toHaveProperty('message', 'Success');
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data).toHaveProperty(
        'customerId',
        'test-customer-123',
      );
      expect(typeof response.body.data.token).toBe('string');
      expect(response.body.data.token.length).toBeGreaterThan(0);
    });

    it('should return 400 for missing customerId', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({})
        .expect(200); // Controller returns 200 with error code in body

      expect(response.body).toHaveProperty('code', 400);
      // ValidationPipe may return different message format
      expect(response.body.message).toContain('customerId');
      expect(response.body.data).toBeNull();
    });

    it('should return 400 for empty customerId', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ customerId: '' })
        .expect(200);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message', 'customerId is required');
    });

    it('should return 400 for whitespace-only customerId', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ customerId: '   ' })
        .expect(200);

      expect(response.body).toHaveProperty('code', 400);
      expect(response.body).toHaveProperty('message', 'customerId is required');
    });

    it('should trim customerId before generating token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ customerId: '  test-customer-123  ' })
        .expect(200);

      expect(response.body).toHaveProperty('code', 0);
      expect(response.body.data).toHaveProperty(
        'customerId',
        'test-customer-123',
      );
    });

    it('should generate valid JWT token that can be verified', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ customerId: 'test-customer-123' })
        .expect(200);

      const token = response.body.data.token;
      const payload = jwtAuthService.validateToken(token);

      expect(payload).toHaveProperty('customerId', 'test-customer-123');
    });
  });
});
