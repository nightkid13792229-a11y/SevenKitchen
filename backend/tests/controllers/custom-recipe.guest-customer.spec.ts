/**
 * AdminGuestCustomerController 接口测试（2026-10-21 · Task 2）
 *
 * 这里用**真实守卫**（AdminGuard / StaffGuard），只替换登录守卫：
 *   · 未登录 → 401；
 *   · STAFF 建客户/建狗 → 403；
 *   · STAFF 搜索 → 200（客服代客下单要用）；
 *   · ADMIN 建客户/建狗 → 成功；
 *   · 参数校验失败 → 400，且不调用 service。
 */

import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AdminGuestCustomerController,
  CreateGuestCustomerDto,
} from '../../src/interfaces/controllers/custom-recipe/admin-guest-customer.controller';
import { GuestCustomerService } from '../../src/application/custom-recipe/guest-customer.service';
import { AuthGuard } from '../../src/interfaces/auth/auth.guard';

describe('AdminGuestCustomerController', () => {
  const BASE = '/api/v1/admin/custom-recipe/guest-customers';

  let app: INestApplication;
  let guestCustomerService: {
    createGuest: jest.Mock;
    createGuestDog: jest.Mock;
    searchGuestCustomers: jest.Mock;
  };

  const guestDogPayload = () => ({
    name: '旺财',
    breedId: 'breed-1',
    birthday: '2020-01-01',
    gender: 'MALE',
    isNeutered: true,
    currentWeightKg: 12.5,
    bcsScore: 5,
    activityLevel: 'NORMAL',
    lifeStageOverride: 'NONE',
  });

  beforeAll(async () => {
    guestCustomerService = {
      createGuest: jest.fn(),
      createGuestDog: jest.fn(),
      searchGuestCustomers: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminGuestCustomerController],
      providers: [
        { provide: GuestCustomerService, useValue: guestCustomerService },
      ],
    })
      /**
       * 只替登录守卫；AdminGuard/StaffGuard 必须是真的，
       * 否则 401/403 测的是替身，不是线上行为。
       */
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
    guestCustomerService.createGuest
      .mockReset()
      .mockResolvedValue({ customerId: 'guest-1' });
    guestCustomerService.createGuestDog
      .mockReset()
      .mockResolvedValue({ dogId: 'dog-1' });
    guestCustomerService.searchGuestCustomers.mockReset().mockResolvedValue([]);
  });

  function post(path: string, body: unknown, role?: 'ADMIN' | 'STAFF') {
    const req = request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer test-token');
    if (role) {
      req.set('x-test-role', role);
    }
    return req.send(body as object);
  }

  function get(path: string, role?: 'ADMIN' | 'STAFF') {
    const req = request(app.getHttpServer())
      .get(path)
      .set('Authorization', 'Bearer test-token');
    if (role) {
      req.set('x-test-role', role);
    }
    return req;
  }

  it('★ 未登录创建代客客户 → 401，且不落任何数据', async () => {
    await request(app.getHttpServer())
      .post(BASE)
      .send({ name: '王女士' })
      .expect(401);

    await request(app.getHttpServer()).get(BASE).expect(401);

    expect(guestCustomerService.createGuest).not.toHaveBeenCalled();
    expect(guestCustomerService.searchGuestCustomers).not.toHaveBeenCalled();
  });

  it('★ STAFF 创建代客客户 → 403（仅管理员可建档）', async () => {
    const res = await post(BASE, { name: '王女士' }, 'STAFF').expect(403);

    expect(JSON.stringify(res.body)).toContain('管理员');
    expect(guestCustomerService.createGuest).not.toHaveBeenCalled();
  });

  it('★ STAFF 给代客客户建狗 → 403', async () => {
    await post(`${BASE}/guest-1/dogs`, guestDogPayload(), 'STAFF').expect(403);

    expect(guestCustomerService.createGuestDog).not.toHaveBeenCalled();
  });

  it('★ STAFF 可以搜索代客客户（代客下单要用）', async () => {
    guestCustomerService.searchGuestCustomers.mockResolvedValue([
      {
        id: 'guest-1',
        name: '王女士',
        phone: '13800138000',
        wechat: 'wang_nvshi',
        dogCount: 2,
      },
    ]);

    const res = await get(`${BASE}?keyword=王`, 'STAFF').expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.data.items).toEqual([
      {
        id: 'guest-1',
        name: '王女士',
        phone: '13800138000',
        wechat: 'wang_nvshi',
        dogCount: 2,
      },
    ]);
    expect(guestCustomerService.searchGuestCustomers).toHaveBeenCalledWith(
      '王',
    );
  });

  it('★ 管理员创建代客客户成功，并把操作人一起传给 service', async () => {
    const res = await post(
      BASE,
      {
        name: '王女士',
        phone: '13800138000',
        wechat: 'wang_nvshi',
        note: '朋友介绍',
      },
      'ADMIN',
    ).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual({ customerId: 'guest-1' });
    expect(guestCustomerService.createGuest).toHaveBeenCalledWith(
      {
        name: '王女士',
        phone: '13800138000',
        wechat: 'wang_nvshi',
        note: '朋友介绍',
      },
      'admin-1',
    );
  });

  it('★ 管理员给代客客户建狗成功，返回 dogId', async () => {
    const res = await post(
      `${BASE}/guest-1/dogs`,
      guestDogPayload(),
      'ADMIN',
    ).expect(201);

    expect(res.body.code).toBe(0);
    expect(res.body.data).toEqual({ dogId: 'dog-1' });
    expect(guestCustomerService.createGuestDog).toHaveBeenCalledWith(
      'guest-1',
      expect.objectContaining({
        name: '旺财',
        breedId: 'breed-1',
        birthday: '2020-01-01',
        gender: 'MALE',
        isNeutered: true,
        currentWeightKg: 12.5,
        bcsScore: 5,
        activityLevel: 'NORMAL',
        lifeStageOverride: 'NONE',
      }),
      'admin-1',
    );
  });

  it('★ 姓名为空 → 400 参数校验失败，不调用 service', async () => {
    const res = await post(BASE, { name: '' }, 'ADMIN').expect(400);

    expect(JSON.stringify(res.body)).toContain('name');
    expect(guestCustomerService.createGuest).not.toHaveBeenCalled();
  });

  it('★ 姓名纯空白 → 400（去空格后视为未填）', async () => {
    await post(BASE, { name: '   ' }, 'ADMIN').expect(400);

    expect(guestCustomerService.createGuest).not.toHaveBeenCalled();
  });

  it('★ 建狗缺必填字段 → 400，不调用 service', async () => {
    await post(`${BASE}/guest-1/dogs`, { name: '旺财' }, 'ADMIN').expect(400);

    expect(guestCustomerService.createGuestDog).not.toHaveBeenCalled();
  });

  it('后台新建接口的 DTO 允许只填姓名（电话/微信都是可选）', () => {
    const dto = new CreateGuestCustomerDto();
    dto.name = '王女士';

    expect(dto.phone).toBeUndefined();
    expect(dto.wechat).toBeUndefined();
  });
});
