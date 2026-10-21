/**
 * 后台代客下单「顾客 + 狗狗」合并搜索（2026-10-21）
 *
 * 用**真实守卫**（AdminGuard / StaffGuard），只替换登录守卫：
 *   · 未登录 → 401；
 *   · STAFF → 403（搜索只给管理员做代客下单用）；
 *   · 默认只搜真实顾客（role=CUSTOMER）；
 *   · includeInternal=true 才带出 ADMIN / STAFF；
 *   · 顾客昵称 / 手机号 / 狗名都能命中；
 *   · 每个顾客返回**全部狗狗**（不能因为关键词只命中其中一只就截断）；
 *   · 返回角色字段，内部账号 isInternal=true；
 *   · 订单详情带 customer.role，后台据此标「内部测试」。
 */

import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminCustomRecipeController } from '../../src/interfaces/controllers/custom-recipe/admin-custom-recipe.controller';
import { AssistedOrderService } from '../../src/application/custom-recipe/assisted-order.service';
import { CustomRecipeService } from '../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipeDeliveryService } from '../../src/application/custom-recipe/custom-recipe-delivery.service';
import { CustomRecipeAftersaleService } from '../../src/application/custom-recipe/custom-recipe-aftersale.service';
import { CustomRecipeViewService } from '../../src/application/custom-recipe/custom-recipe-view.service';
import { PrismaService } from '../../src/infrastructure/prisma.service';
import { WechatService } from '../../src/infrastructure/wechat/wechat.service';
import { WechatPaymentService } from '../../src/application/payment/wechat-payment.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';

describe('AdminCustomRecipeController · 顾客狗狗合并搜索', () => {
  const BASE = '/api/v1/admin/custom-recipe/customer-dog-search';

  let app: INestApplication;
  let prisma: {
    user: { findMany: jest.Mock };
    dogBreed: { findMany: jest.Mock };
  };
  let customRecipeService: {
    getOrderByOrderId: jest.Mock;
    signOrderMedia: jest.Mock;
  };
  let viewService: { buildStaffView: jest.Mock };
  let aftersaleService: { hasOpenForOrder: jest.Mock };

  const customerRow = () => ({
    id: 'customer-1',
    nickname: '王女士',
    phone: '13800000000',
    role: 'CUSTOMER',
    dogs: [
      {
        id: 'dog-1',
        name: 'Seven',
        breedId: 'breed-1',
        customBreedName: null,
        birthday: new Date('2023-01-01T00:00:00.000Z'),
        currentWeightKg: 11.2,
      },
      {
        id: 'dog-2',
        name: '面包',
        breedId: null,
        customBreedName: '田园犬',
        birthday: null,
        currentWeightKg: null,
      },
    ],
  });

  beforeAll(async () => {
    prisma = {
      user: { findMany: jest.fn() },
      dogBreed: { findMany: jest.fn() },
    };
    customRecipeService = {
      getOrderByOrderId: jest.fn(),
      signOrderMedia: jest.fn(async (value: any) => value),
    };
    viewService = { buildStaffView: jest.fn().mockResolvedValue({}) };
    aftersaleService = { hasOpenForOrder: jest.fn().mockResolvedValue(false) };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminCustomRecipeController],
      providers: [
        { provide: CustomRecipeService, useValue: customRecipeService },
        { provide: CustomRecipeConfigService, useValue: {} },
        { provide: WechatService, useValue: {} },
        { provide: WechatPaymentService, useValue: {} },
        { provide: CustomRecipeDeliveryService, useValue: {} },
        { provide: CustomRecipeAftersaleService, useValue: aftersaleService },
        { provide: CustomRecipeViewService, useValue: viewService },
        { provide: PrismaService, useValue: prisma },
        { provide: AssistedOrderService, useValue: {} },
      ],
    })
      // 只替登录守卫；AdminGuard / StaffGuard 必须是真实的
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (!req.headers.authorization) {
            throw new UnauthorizedException('Unauthorized');
          }
          const role = String(
            req.headers['x-test-role'] ?? 'ADMIN',
          ).toUpperCase();
          req.user = {
            userId: role === 'ADMIN' ? 'admin-1' : 'staff-1',
            customerId: role === 'ADMIN' ? 'admin-1' : 'staff-1',
            role,
          };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.user.findMany.mockReset().mockResolvedValue([customerRow()]);
    prisma.dogBreed.findMany
      .mockReset()
      .mockResolvedValue([{ id: 'breed-1', name: '柯基' }]);
    customRecipeService.getOrderByOrderId.mockReset();
    viewService.buildStaffView.mockClear();
    aftersaleService.hasOpenForOrder.mockClear();
  });

  function get(path: string, role?: 'ADMIN' | 'STAFF') {
    const req = request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer test-token');
    if (role) {
      req.set('x-test-role', role);
    }
    return req;
  }

  it('★ 未登录 → 401，不查库', async () => {
    await request(app.getHttpServer()).get(BASE).expect(401);

    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('★ STAFF → 403（合并搜索只给管理员），不查库', async () => {
    const res = await get(`${BASE}?keyword=Seven`, 'STAFF').expect(403);

    expect(JSON.stringify(res.body)).toContain('管理员');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('★ 默认只搜 CUSTOMER，并返回角色 + 全部狗狗', async () => {
    const res = await get(`${BASE}?keyword=Seven`, 'ADMIN').expect(200);

    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.where.role).toEqual({ in: ['CUSTOMER'] });
    expect(query.take).toBe(30);
    expect(query.orderBy).toEqual({ updatedAt: 'desc' });
    expect(query.select.dogs.select).toEqual(
      expect.objectContaining({
        birthday: true,
        currentWeightKg: true,
      }),
    );

    expect(res.body.code).toBe(0);
    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expect(item).toMatchObject({
      id: 'customer-1',
      name: '王女士',
      phone: '13800000000',
      role: 'CUSTOMER',
      isInternal: false,
    });
    // 关键词只命中 Seven，但每个顾客的狗狗必须完整返回
    expect(item.dogs.map((dog: any) => dog.name)).toEqual(['Seven', '面包']);
    expect(item.dogs[0]).toMatchObject({
      id: 'dog-1',
      name: 'Seven',
      breedName: '柯基',
      currentWeightKg: 11.2,
    });
    expect(item.dogs[0].birthday).toBe('2023-01-01T00:00:00.000Z');
    expect(typeof item.dogs[0].ageText).toBe('string');
    // 自定义品种优先；没有生日/体重时字段照常返回
    expect(item.dogs[1]).toMatchObject({
      id: 'dog-2',
      name: '面包',
      breedName: '田园犬',
      birthday: null,
      ageText: null,
      currentWeightKg: null,
    });
  });

  it('★ 昵称 / 手机号 / 狗名三种关键词都进 OR 条件', async () => {
    await get(`${BASE}?keyword=王`, 'ADMIN').expect(200);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { phone: { contains: '王' } },
        { nickname: { contains: '王', mode: 'insensitive' } },
        {
          dogs: {
            some: { name: { contains: '王', mode: 'insensitive' } },
          },
        },
      ]),
    );
  });

  it('★ includeInternal=true 才带出 ADMIN / STAFF，并标记 isInternal', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...customerRow(),
        id: 'admin-1',
        nickname: '内部测试号',
        phone: '13900000000',
        role: 'ADMIN',
        dogs: [
          {
            id: 'dog-admin',
            name: '测试狗',
            breedId: null,
            customBreedName: null,
            birthday: null,
            currentWeightKg: 8,
          },
        ],
      },
      {
        ...customerRow(),
        id: 'staff-1',
        nickname: '员工测试号',
        phone: '13700000000',
        role: 'STAFF',
        dogs: [],
      },
      customerRow(),
    ]);

    const res = await get(
      `${BASE}?keyword=%E6%B5%8B%E8%AF%95&includeInternal=true`,
      'ADMIN',
    ).expect(200);

    const query = prisma.user.findMany.mock.calls[0][0];
    expect(query.where.role).toEqual({
      in: ['CUSTOMER', 'ADMIN', 'STAFF'],
    });

    const items = res.body.data.items;
    expect(items.map((item: any) => item.role)).toEqual([
      'ADMIN',
      'STAFF',
      'CUSTOMER',
    ]);
    expect(items.map((item: any) => item.isInternal)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('★ includeInternal=false / 不传时都不会带内部账号', async () => {
    await get(`${BASE}?keyword=Seven&includeInternal=false`, 'ADMIN').expect(
      200,
    );
    expect(prisma.user.findMany.mock.calls[0][0].where.role).toEqual({
      in: ['CUSTOMER'],
    });
  });

  it('★ 空关键词直接返回空列表，不做全表搜索', async () => {
    const res = await get(`${BASE}?keyword=%20%20`, 'ADMIN').expect(200);

    expect(res.body.data).toEqual({ items: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('★ 店铺里没有品种字典时，品种回 null 而不是报错', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...customerRow(),
        dogs: [
          {
            id: 'dog-x',
            name: '无品种',
            breedId: null,
            customBreedName: null,
            birthday: null,
            currentWeightKg: 3,
          },
        ],
      },
    ]);
    prisma.dogBreed.findMany.mockResolvedValue([]);

    const res = await get(`${BASE}?keyword=无品种`, 'ADMIN').expect(200);

    expect(res.body.data.items[0].dogs[0].breedName).toBeNull();
  });

  it('★ 订单详情把 customer.role 透出（内部账号可标记）', async () => {
    customRecipeService.getOrderByOrderId.mockResolvedValue({
      id: 'cr-1',
      orderId: 'CR202610210001',
      status: 'PAID',
      customer: {
        id: 'admin-1',
        nickname: '内部测试号',
        phone: '13900000000',
        role: 'ADMIN',
        wechatOpenid: null,
      },
      dog: { id: 'dog-1', name: '测试狗' },
      deliveries: [],
      attachmentsRecords: [],
    });

    const res = await get(
      '/api/v1/admin/custom-recipe/orders/CR202610210001',
      'ADMIN',
    ).expect(200);

    expect(res.body.data.customer).toMatchObject({
      id: 'admin-1',
      nickname: '内部测试号',
      role: 'ADMIN',
    });
    expect(viewService.buildStaffView).toHaveBeenCalled();
  });
});
