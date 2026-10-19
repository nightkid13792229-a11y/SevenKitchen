import { diffSupplementLaunchTargets } from '../../../src/application/supplement-shop/supplement-shop-config.constants';

describe('补剂首发目标差异检查', () => {
  it('Prisma Decimal 返回字符串时不会误报差异', () => {
    const config = {
      markupMultiplier: '2.50',
      serviceFeeAmount: '10.00',
      packagingFeePerBag: '0.00',
      minOrderAmount: '0.00',
      maxTotalDays: 90,
      freeServiceThreshold: '99.00',
      flatShippingFee: '6.00',
      freeShippingThreshold: '129.00',
      serviceFeeMode: 'PER_ORDER',
      priceRoundingMode: 'CEIL_TO_0_1',
      roundUpUsage: true,
      maxPortionMultiplier: 3,
      paymentTimeoutMinutes: 30,
      dailyCutoffTime: '17:00',
      dailyPackingCapacity: 30,
      autoScheduleEnabled: true,
      aftersaleWindowDays: 7,
      autoCompleteDays: 10,
      shippingMode: 'FLAT_RATE',
      shippingTemplateId: null,
      powderShelfLifeMonths: 6,
      solidShelfLifeMonths: 9,
      oilShelfLifeMonths: 6,
      minRemainingShelfLifeDays: 90,
      labelBrandName: '赛文的食堂',
      labelIncludeDesiccantNotice: true,
    };
    expect(diffSupplementLaunchTargets(config)).toEqual([]);
  });

  it('Prisma Decimal 对象也不会误报', () => {
    const decimal = (value: number) => ({
      toNumber: () => value,
      toString: () => String(value),
    });
    const config = {
      markupMultiplier: decimal(2.5),
      serviceFeeAmount: decimal(10),
      packagingFeePerBag: decimal(0),
      minOrderAmount: decimal(0),
      maxTotalDays: 90,
      freeServiceThreshold: decimal(99),
      flatShippingFee: decimal(6),
      freeShippingThreshold: decimal(129),
      serviceFeeMode: 'PER_ORDER',
      priceRoundingMode: 'CEIL_TO_0_1',
      roundUpUsage: true,
      maxPortionMultiplier: 3,
      paymentTimeoutMinutes: 30,
      dailyCutoffTime: '17:00',
      dailyPackingCapacity: 30,
      autoScheduleEnabled: true,
      aftersaleWindowDays: 7,
      autoCompleteDays: 10,
      shippingMode: 'FLAT_RATE',
      shippingTemplateId: null,
      powderShelfLifeMonths: 6,
      solidShelfLifeMonths: 9,
      oilShelfLifeMonths: 6,
      minRemainingShelfLifeDays: 90,
      labelBrandName: '赛文的食堂',
      labelIncludeDesiccantNotice: true,
    };
    expect(diffSupplementLaunchTargets(config)).toEqual([]);
  });
});
