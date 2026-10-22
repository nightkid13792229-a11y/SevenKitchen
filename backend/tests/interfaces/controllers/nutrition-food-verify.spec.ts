import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NutritionFoodStatus } from '@prisma/client';
import request from 'supertest';
import { NutritionFoodService } from '../../../src/application/nutrition-food/nutrition-food.service';
import { AuthGuard } from '../../../src/interfaces/auth/auth.guard';
import { JwtAuthService } from '../../../src/interfaces/auth/jwt.service';
import { NutritionFoodController } from '../../../src/interfaces/controllers/nutrition-food.controller';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

const BASE_PATH = '/api/v1/nutrition-foods';
const ADMIN_TOKEN = 'admin-token';
const STAFF_TOKEN = 'staff-token';

describe('NutritionFoodController verify', () => {
  let app: INestApplication;
  let nutritionFoodService: { verify: jest.Mock };
  const validateToken = jest.fn((token: string) => {
    if (token === ADMIN_TOKEN) {
      return { userId: 'admin-1', customerId: 'admin-1', role: 'ADMIN' };
    }
    if (token === STAFF_TOKEN) {
      return { userId: 'staff-1', customerId: 'staff-1', role: 'STAFF' };
    }
    throw new Error('invalid token');
  });

  beforeEach(async () => {
    nutritionFoodService = { verify: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [NutritionFoodController],
      providers: [
        { provide: NutritionFoodService, useValue: nutritionFoodService },
        { provide: JwtAuthService, useValue: { validateToken } },
        AuthGuard,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function http() {
    return request(app.getHttpServer());
  }

  it('未登录调用 verify → 401', async () => {
    await http().patch(`${BASE_PATH}/nf-1/verify`).expect(401);

    expect(nutritionFoodService.verify).not.toHaveBeenCalled();
  });

  it('非管理员调用 verify → 403，且不写库', async () => {
    await http()
      .patch(`${BASE_PATH}/nf-1/verify`)
      .set('Authorization', `Bearer ${STAFF_TOKEN}`)
      .expect(403);

    expect(nutritionFoodService.verify).not.toHaveBeenCalled();
  });

  it('管理员调用后状态变 VERIFIED 且记录操作人', async () => {
    const verifiedAt = new Date('2026-10-22T12:00:00.000Z');
    nutritionFoodService.verify.mockResolvedValue({
      id: 'nf-1',
      name: '鸡肝（生）',
      status: NutritionFoodStatus.VERIFIED,
      verifiedBy: 'admin-1',
      verifiedAt,
    });

    const response = await http()
      .patch(`${BASE_PATH}/nf-1/verify`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .expect(200);

    expect(nutritionFoodService.verify).toHaveBeenCalledWith('nf-1', 'admin-1');
    expect(response.body.code).toBe(0);
    expect(response.body.data.status).toBe('VERIFIED');
    expect(response.body.data.verifiedBy).toBe('admin-1');
  });
});
