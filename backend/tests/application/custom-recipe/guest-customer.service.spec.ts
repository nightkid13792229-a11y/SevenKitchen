/**
 * GuestCustomerService 单测（2026-10-21 · 代客定制食谱订单 Task 2）
 *
 * 锁住三件事：
 *   1. 代客客户是**独立 User**：isGuest=true、无 openid/password、
 *      User.phone 必须是 null（否则会和真实注册用户撞唯一键）；
 *   2. 狗必须挂在代客客户名下，非代客用户一律拒绝；
 *   3. 搜索只返回 isGuest=true，且带狗狗数量。
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GuestCustomerService } from '../../../src/application/custom-recipe/guest-customer.service';
import { DogService } from '../../../src/application/dog/dog.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
} from '../../../src/domain';

describe('GuestCustomerService', () => {
  let service: GuestCustomerService;

  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const dogService = {
    createDogProfile: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        GuestCustomerService,
        { provide: PrismaService, useValue: prisma },
        { provide: DogService, useValue: dogService },
      ],
    }).compile();

    service = moduleRef.get(GuestCustomerService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function guestDogPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: '旺财',
      breedId: 'breed-1',
      birthday: '2020-01-01',
      gender: DogGender.MALE,
      isNeutered: true,
      currentWeightKg: 12.5,
      bcsScore: 5,
      activityLevel: ActivityLevel.NORMAL,
      lifeStageOverride: LifeStageOverride.NONE,
      ...overrides,
    } as any;
  }

  describe('createGuest', () => {
    it('★ 创建独立代客客户：isGuest、联系方式、创建员工齐全，且无 openid/password', async () => {
      prisma.user.create.mockResolvedValue({ id: 'guest-1' });

      const result = await service.createGuest(
        {
          name: '王女士',
          phone: '13800138000',
          wechat: 'wang_nvshi',
          note: '朋友介绍',
        },
        'staff-1',
      );

      expect(result).toEqual({ customerId: 'guest-1' });

      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data).toMatchObject({
        isGuest: true,
        nickname: '王女士',
        guestContactName: '王女士',
        guestContactPhone: '13800138000',
        guestContactWechat: 'wang_nvshi',
        guestCreatedByStaffId: 'staff-1',
      });

      // User.phone 必须留空：它带唯一约束，不能拿来存代客联系方式
      expect(createArgs.data.phone).toBeNull();
      // 代客客户不能自己登录：不得写 openid / 密码
      expect(createArgs.data).not.toHaveProperty('wechatOpenid');
      expect(createArgs.data).not.toHaveProperty('wechatUnionid');
      expect(createArgs.data).not.toHaveProperty('password');
    });

    it('姓名去首尾空格；电话/微信为空时存 null，不伪造联系方式', async () => {
      prisma.user.create.mockResolvedValue({ id: 'guest-2' });

      await service.createGuest(
        { name: '  李女士  ', phone: '   ', wechat: '' },
        'staff-1',
      );

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.nickname).toBe('李女士');
      expect(data.guestContactName).toBe('李女士');
      expect(data.guestContactPhone).toBeNull();
      expect(data.guestContactWechat).toBeNull();
    });

    it('只有电话、没有微信也可以创建（微信是可选联系方式）', async () => {
      prisma.user.create.mockResolvedValue({ id: 'guest-3' });

      await service.createGuest(
        { name: '赵先生', phone: '13900139000' },
        'staff-1',
      );

      const data = prisma.user.create.mock.calls[0][0].data;
      expect(data.guestContactPhone).toBe('13900139000');
      expect(data.guestContactWechat).toBeNull();
    });

    it('★ 姓名为空/纯空白时拒绝，且不写任何用户', async () => {
      await expect(
        service.createGuest({ name: '   ' }, 'staff-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('缺少操作人时拒绝创建（必须能追溯到是谁建的客户）', async () => {
      await expect(
        service.createGuest({ name: '王女士' }, ''),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('createGuestDog', () => {
    it('★ 狗挂到代客客户名下（ownerId = customerId），并映射必填档案字段', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'guest-1',
        isGuest: true,
      });
      dogService.createDogProfile.mockResolvedValue({ id: 'dog-1' });

      const result = await service.createGuestDog(
        'guest-1',
        // 即使调用方夹带 ownerId，也不能覆盖服务端指定的代客客户
        guestDogPayload({ ownerId: 'boss-user-id' }),
        'staff-1',
      );

      expect(result).toEqual({ dogId: 'dog-1' });
      expect(dogService.createDogProfile).toHaveBeenCalledTimes(1);

      const mapped = dogService.createDogProfile.mock.calls[0][0];
      expect(mapped).toMatchObject({
        ownerId: 'guest-1',
        name: '旺财',
        breedId: 'breed-1',
        gender: DogGender.MALE,
        isNeutered: true,
        currentWeightKg: 12.5,
        bcsScore: 5,
        activityLevel: ActivityLevel.NORMAL,
        lifeStageOverride: LifeStageOverride.NONE,
      });
      expect(mapped.birthday).toBeInstanceOf(Date);
      expect((mapped.birthday as Date).toISOString()).toBe(
        '2020-01-01T00:00:00.000Z',
      );
    });

    it('★ 拒绝给非代客用户（老板/员工/普通注册顾客）建狗', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'boss-user-id',
        isGuest: false,
      });

      await expect(
        service.createGuestDog('boss-user-id', guestDogPayload(), 'staff-1'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dogService.createDogProfile).not.toHaveBeenCalled();
    });

    it('客户不存在时返回 404，不建狗', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.createGuestDog('missing', guestDogPayload(), 'staff-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(dogService.createDogProfile).not.toHaveBeenCalled();
    });

    it('狗名字/生日缺失或非法时拒绝，不建狗', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'guest-1',
        isGuest: true,
      });

      await expect(
        service.createGuestDog(
          'guest-1',
          guestDogPayload({ name: '   ' }),
          'staff-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createGuestDog(
          'guest-1',
          guestDogPayload({ birthday: 'not-a-date' }),
          'staff-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(dogService.createDogProfile).not.toHaveBeenCalled();
    });
  });

  describe('searchGuestCustomers', () => {
    it('★ 只搜代客客户；姓名/电话/微信/昵称任一命中，并返回狗狗数量', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'guest-1',
          nickname: '王女士',
          guestContactName: '王女士',
          guestContactPhone: '13800138000',
          guestContactWechat: 'wang_nvshi',
          _count: { dogs: 2 },
        },
      ]);

      const items = await service.searchGuestCustomers('王');

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where.isGuest).toBe(true);
      expect(args.where.OR).toEqual(
        expect.arrayContaining([
          { guestContactName: { contains: '王', mode: 'insensitive' } },
          { guestContactPhone: { contains: '王', mode: 'insensitive' } },
          { guestContactWechat: { contains: '王', mode: 'insensitive' } },
          { nickname: { contains: '王', mode: 'insensitive' } },
        ]),
      );
      // 搜索结果不能带出 openid/password 这类登录凭据
      expect(args.select).not.toHaveProperty('wechatOpenid');
      expect(args.select).not.toHaveProperty('password');

      expect(items).toEqual([
        {
          id: 'guest-1',
          name: '王女士',
          phone: '13800138000',
          wechat: 'wang_nvshi',
          dogCount: 2,
        },
      ]);
    });

    it('关键字为空时仍只返回代客客户（不能把普通顾客搜出来）', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.searchGuestCustomers();

      const args = prisma.user.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ isGuest: true });
      expect(args.where.OR).toBeUndefined();
    });

    it('兼容只有 nickname 的历史代客客户，狗狗数量缺省为 0', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'guest-legacy',
          nickname: '老客户',
          guestContactName: null,
          guestContactPhone: null,
          guestContactWechat: null,
          _count: { dogs: 0 },
        },
      ]);

      const items = await service.searchGuestCustomers('老');

      expect(items[0]).toEqual({
        id: 'guest-legacy',
        name: '老客户',
        phone: null,
        wechat: null,
        dogCount: 0,
      });
    });

    it('计划里的 search 别名与 searchGuestCustomers 行为一致', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.search('138');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isGuest: true }),
        }),
      );
    });
  });
});
