/**
 * AssistedOrderService 单测（2026-10-21 · 代客定制食谱订单 Task 3）
 *
 * 这里锁住的是「后台代客下单」最不能错的三件事：
 *   1. 金额：应付来自服务端报价（quote），线下实收另存 actualPaidAmount；
 *      两者不一致时**必须**有原因，否则 400。
 *   2. 状态：已收款直接 PAID（不经过微信支付），未收款才是 PENDING_PAYMENT。
 *   3. 归属：狗必须属于该顾客；无账号代客客户打上 assistedForGuest。
 *
 * 排期/落库复用 `CustomRecipeService.createOrderAtNextAvailableSlot`（自助单
 * 同一套容量与日期逻辑），所以本文件用替身接住它，只断言「按份数委托」+
 * 「写进订单的数据是什么」。真正的排期逻辑由既有自助单测试覆盖。
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AllergyAnswerStatus,
  CustomRecipeOrderSource,
  CustomRecipeStatus,
  TargetGoal,
} from '@prisma/client';
import { AssistedOrderService } from '../../../src/application/custom-recipe/assisted-order.service';
import { CustomRecipeService } from '../../../src/application/custom-recipe/custom-recipe.service';
import { CustomRecipeConfigService } from '../../../src/application/custom-recipe/custom-recipe-config.service';
import { CustomRecipePricingService } from '../../../src/application/custom-recipe/custom-recipe-pricing.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

/** 当前测试配置：¥299/份，2 份 9 折 → 598 − 59.8 = 538.20 */
function makeConfig() {
  return {
    feeAmount: 299,
    deliveryWorkDays: 3,
    dailyCapacity: 4,
    paymentTimeoutMinutes: 30,
    multiRecipeEnabled: true,
    maxRecipeQuantity: 5,
    multiRecipeDiscounts: [
      { quantity: 2, discountRate: 0.1, label: '2 份享 9 折' },
      { quantity: 3, discountRate: 0.1, label: '3 份享 9 折' },
      { quantity: 4, discountRate: 0.1, label: '4 份享 9 折' },
      { quantity: 5, discountRate: 0.1, label: '5 份享 9 折' },
    ],
    dailyDesignMinutes: 480,
    minutesPerRecipe: 96,
    scheduleLookaheadDays: 45,
    slotRetryTimes: 5,
    orderNoPrefix: 'CR',
  } as any;
}

describe('AssistedOrderService', () => {
  let service: AssistedOrderService;
  let customRecipeService: CustomRecipeService;

  /** 替身接住 buildData，便于断言真正会写进订单的字段 */
  let writtenData: any;
  let config: ReturnType<typeof makeConfig>;

  const scheduledDate = new Date('2026-10-22T00:00:00.000Z');
  const estimatedDeliveryDate = new Date('2026-10-27T00:00:00.000Z');

  const prisma = {
    user: { findUnique: jest.fn() },
    dog: { findUnique: jest.fn() },
  };

  const configService = { getConfig: jest.fn() };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AssistedOrderService,
        // 用真实报价服务：538.20 这类金额断言才有意义
        CustomRecipePricingService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomRecipeConfigService, useValue: configService },
        {
          provide: CustomRecipeService,
          useFactory: (pricing: CustomRecipePricingService) =>
            new CustomRecipeService(
              prisma as any,
              {} as any,
              configService as any,
              pricing,
            ),
          inject: [CustomRecipePricingService],
        },
      ],
    }).compile();

    service = moduleRef.get(AssistedOrderService);
    customRecipeService = moduleRef.get(CustomRecipeService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    config = makeConfig();
    configService.getConfig.mockResolvedValue(config);

    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-1',
      isGuest: true,
    });
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
      owner: { id: 'customer-1', isGuest: true },
    });

    writtenData = null;
    // 自助单/代客单共用排期与落库入口：替身只记录 buildData 的结果
    (customRecipeService as any).createOrderAtNextAvailableSlot = jest.fn(
      async (quantity: number, cfg: any, buildData: any) => {
        expect(quantity).toBeGreaterThanOrEqual(1);
        expect(cfg).toBe(config);
        writtenData = buildData({ scheduledDate, estimatedDeliveryDate });
        return {
          id: 'order-uuid-1',
          orderId: 'CR202610210001',
          ...writtenData,
        };
      },
    );
    (customRecipeService as any).syncPaidOrderToHealthProfile = jest
      .fn()
      .mockResolvedValue({ synced: true });
  });

  /** 一笔合法的代客单入参（已线下收款、金额与报价一致） */
  function baseInput(overrides: Record<string, any> = {}) {
    return {
      customerId: 'customer-1',
      dogId: 'dog-1',
      targetGoal: TargetGoal.MAINTAIN,
      recipeQuantity: 2,
      requestedProteinCodes: ['CHICKEN', 'BEEF'],
      allergies: [],
      allergyText: '',
      allergyStatus: AllergyAnswerStatus.NO_ALLERGY,
      currentFoodMain: 'DRY',
      currentFoodOther: null,
      changeReasons: ['HEALTHIER'],
      stomachConditions: [],
      additionalNotes: '希望少油',
      payment: {
        collected: true,
        channel: 'OFFLINE_WECHAT',
        amount: 538.2,
        externalRef: 'wx-20261021-001',
        overrideReason: null,
      },
      ...overrides,
    } as any;
  }

  const submit = (overrides: Record<string, any> = {}) =>
    service.create(baseInput(overrides), 'admin-1');

  it('★ 2 份按当前配置报价 538.20；实收 500 且填了原因时，订单金额与实收都是 500，快照仍保留 538.20', async () => {
    const result = await submit({
      payment: {
        collected: true,
        channel: 'OFFLINE_WECHAT',
        amount: 500,
        externalRef: 'wx-20261021-001',
        overrideReason: '老客户优惠',
      },
    });

    expect(result).toMatchObject({
      orderId: 'CR202610210001',
      status: CustomRecipeStatus.PAID,
      amount: 500,
      recipeQuantity: 2,
      actualPaidAmount: 500,
      paymentChannel: 'OFFLINE_WECHAT',
    });

    expect(writtenData).toMatchObject({
      orderSource: CustomRecipeOrderSource.ASSISTED,
      createdByStaffId: 'admin-1',
      // 无账号代客客户：标记来源，方便后台/分享链接识别
      assistedForGuest: true,
      status: CustomRecipeStatus.PAID,
      paymentChannel: 'OFFLINE_WECHAT',
      externalPaymentRef: 'wx-20261021-001',
      actualPaidAmount: 500,
      priceOverrideReason: '老客户优惠',
      // 服务端报价快照原样保留，不被实收金额覆盖
      unitAmount: 299,
      originalAmount: 598,
      discountRate: 0.1,
      discountAmount: 59.8,
      pricingSnapshot: {
        quantity: 2,
        unitAmount: 299,
        originalAmount: 598,
        discountRate: 0.1,
        discountAmount: 59.8,
        payableAmount: 538.2,
      },
      recipeQuantity: 2,
      requestedProteinCodes: ['CHICKEN', 'BEEF'],
    });
    expect(writtenData.amount).toBe(500);
    expect(writtenData.paymentConfirmedAt).toBeInstanceOf(Date);

    // 排期/落库委托给自助单同一个入口：份数与配置必须原样传下去
    const scheduleCall = (
      customRecipeService.createOrderAtNextAvailableSlot as jest.Mock
    ).mock.calls[0];
    expect(scheduleCall[0]).toBe(2);
    expect(scheduleCall[1]).toBe(config);

    // 已收款必须触发付款后档案同步
    expect(
      customRecipeService.syncPaidOrderToHealthProfile,
    ).toHaveBeenCalledWith('order-uuid-1');
  });

  it('★ 实收与报价不一致、但没有填写原因 → 400，且不排期、不落库', async () => {
    await expect(
      submit({
        payment: {
          collected: true,
          channel: 'OFFLINE_WECHAT',
          amount: 500,
          externalRef: null,
          overrideReason: '   ',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
    expect(writtenData).toBeNull();
  });

  it('实收与报价一致时不需要原因也能创建', async () => {
    const result = await submit({
      payment: {
        collected: true,
        channel: 'OFFLINE_ALIPAY',
        amount: 538.2,
        externalRef: null,
        overrideReason: null,
      },
    });

    expect(result.status).toBe(CustomRecipeStatus.PAID);
    expect(writtenData.amount).toBe(538.2);
    expect(writtenData.actualPaidAmount).toBe(538.2);
    expect(writtenData.priceOverrideReason).toBeNull();
    expect(writtenData.paymentChannel).toBe('OFFLINE_ALIPAY');
  });

  it('★ 未收款 → PENDING_PAYMENT，应付仍是报价，不写实收/渠道/确认时间', async () => {
    const result = await submit({
      payment: {
        collected: false,
        channel: 'OFFLINE_WECHAT',
        amount: 538.2,
        externalRef: null,
        overrideReason: null,
      },
    });

    expect(result).toMatchObject({
      status: CustomRecipeStatus.PENDING_PAYMENT,
      amount: 538.2,
      actualPaidAmount: null,
    });

    expect(writtenData).toMatchObject({
      status: CustomRecipeStatus.PENDING_PAYMENT,
      amount: 538.2,
      actualPaidAmount: null,
      paymentChannel: null,
      externalPaymentRef: null,
      paymentConfirmedAt: null,
    });

    // 没收到钱就不能写档案
    expect(
      customRecipeService.syncPaidOrderToHealthProfile,
    ).not.toHaveBeenCalled();
  });

  it('★ 有账号顾客（isGuest=false）的代客单 assistedForGuest=false', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-1',
      isGuest: false,
    });
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'customer-1',
      owner: { id: 'customer-1', isGuest: false },
    });

    await submit();

    expect(writtenData.assistedForGuest).toBe(false);
    expect(writtenData.orderSource).toBe(CustomRecipeOrderSource.ASSISTED);
    // 有账号顾客同样由员工代下，操作人必须留痕
    expect(writtenData.createdByStaffId).toBe('admin-1');
  });

  it('★ 狗不属于该顾客 → 400，且不报价、不排期', async () => {
    prisma.dog.findUnique.mockResolvedValue({
      id: 'dog-1',
      ownerId: 'someone-else',
      owner: { id: 'someone-else', isGuest: false },
    });

    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it('狗不存在 → 400', async () => {
    prisma.dog.findUnique.mockResolvedValue(null);

    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('顾客不存在 → 404，且不查狗、不排期', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(submit()).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.dog.findUnique).not.toHaveBeenCalled();
    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it.each([0, 6, 2.5, -1])('份数 %p 非法 → 400', async (quantity) => {
    await expect(submit({ recipeQuantity: quantity })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it('份数超过当前配置上限 → 400', async () => {
    config = { ...makeConfig(), maxRecipeQuantity: 3 };
    configService.getConfig.mockResolvedValue(config);

    await expect(
      submit({ recipeQuantity: 4, requestedProteinCodes: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it('多份开关关闭时不能代客下 2 份单（代客单同样受开关约束）', async () => {
    config = { ...makeConfig(), multiRecipeEnabled: false };
    configService.getConfig.mockResolvedValue(config);

    await expect(submit()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('肉类数量与份数不一致 → 400（与自助单同一套校验）', async () => {
    await expect(
      submit({ requestedProteinCodes: ['CHICKEN'] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it('缺少操作人 → 400（代客单必须能追溯到是谁下的）', async () => {
    await expect(service.create(baseInput(), '')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      customRecipeService.createOrderAtNextAvailableSlot,
    ).not.toHaveBeenCalled();
  });

  it('线下收款渠道只能是 OFFLINE_WECHAT / OFFLINE_ALIPAY / OTHER', async () => {
    await expect(
      submit({
        payment: {
          collected: true,
          channel: 'WECHAT_ONLINE',
          amount: 538.2,
          externalRef: null,
          overrideReason: null,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('已收款但实收金额不是有效数字 → 400', async () => {
    await expect(
      submit({
        payment: {
          collected: true,
          channel: 'OFFLINE_WECHAT',
          amount: Number.NaN,
          externalRef: null,
          overrideReason: '随便写',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
