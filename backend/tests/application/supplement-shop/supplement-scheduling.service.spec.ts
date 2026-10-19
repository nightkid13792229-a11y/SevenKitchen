import { BadRequestException } from '@nestjs/common';
import { SupplementSchedulingService } from '../../../src/application/supplement-shop/supplement-scheduling.service';
import { TimezoneUtil } from '../../../src/utils/timezone.util';

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

describe('SupplementSchedulingService', () => {
  const prisma: any = {
    supplementOrder: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    supplementOrderEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const configService: any = {
    getConfig: jest.fn(),
  };
  const calendar: any = {
    isOpen: jest.fn(),
  };
  let service: SupplementSchedulingService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getConfig.mockResolvedValue({
      dailyCutoffTime: '17:00',
      dailyPackingCapacity: 30,
      autoScheduleEnabled: true,
      autoCompleteDays: 10,
    });
    calendar.isOpen.mockResolvedValue(true);
    prisma.supplementOrder.count.mockResolvedValue(0);
    service = new SupplementSchedulingService(
      prisma,
      configService,
      calendar,
    );
  });

  it('截单前付款、当天营业、产能未满 → 当天', async () => {
    const paidAt = new Date('2026-10-19T09:00:00+08:00');
    const result = await service.resolvePackingDate(
      paidAt,
      new Date('2026-10-19T10:00:00+08:00'),
    );
    expect(dateKey(result)).toBe('2026-10-19');
  });

  it('截单后付款 → 下一个营业日', async () => {
    const paidAt = new Date('2026-10-19T18:00:00+08:00');
    const result = await service.resolvePackingDate(
      paidAt,
      new Date('2026-10-19T18:00:00+08:00'),
    );
    expect(dateKey(result)).toBe('2026-10-20');
  });

  it('昨天付款 → 今天开始排', async () => {
    const result = await service.resolvePackingDate(
      new Date('2026-10-18T10:00:00+08:00'),
      new Date('2026-10-19T10:00:00+08:00'),
    );
    expect(dateKey(result)).toBe('2026-10-19');
  });

  it('当天停发/周日 → 顺延到下一个营业日', async () => {
    calendar.isOpen.mockImplementation(
      async (date: Date) => TimezoneUtil.weekday(date) !== 0,
    );
    const result = await service.resolvePackingDate(
      new Date('2026-10-18T10:00:00+08:00'),
      new Date('2026-10-18T10:00:00+08:00'),
    );
    expect(dateKey(result)).toBe('2026-10-19');
  });

  it('当天产能满 → 顺延', async () => {
    prisma.supplementOrder.count.mockImplementation(async ({ where }: any) => {
      return dateKey(where.packingDate) === '2026-10-19' ? 30 : 0;
    });
    const result = await service.resolvePackingDate(
      new Date('2026-10-19T09:00:00+08:00'),
      new Date('2026-10-19T10:00:00+08:00'),
    );
    expect(dateKey(result)).toBe('2026-10-20');
  });

  it('只有 PAID 可以改期', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'PACKED',
      packingDate: null,
    });
    await expect(
      service.rescheduleOrder(
        'o1',
        TimezoneUtil.parseDateOnly('2026-10-21'),
        { type: 'ADMIN' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('管理员改期：落日期 + 写 RESCHEDULED 事件', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'PAID',
      packingDate: null,
    });
    const tx = {
      supplementOrder: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      supplementOrderEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    const result = await service.rescheduleOrder(
      'o1',
      TimezoneUtil.parseDateOnly('2026-10-21'),
      { type: 'ADMIN', id: 'admin-1' },
      { reason: '顾客要求' },
    );

    expect(dateKey(result)).toBe('2026-10-21');
    expect(tx.supplementOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          packingDateSource: 'ADMIN',
        }),
      }),
    );
    expect(tx.supplementOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SCHEDULED' }),
      }),
    );
  });

  it('排期事务内调用库存预占', async () => {
    const inventory = { reserveForOrder: jest.fn().mockResolvedValue(undefined) };
    const withInventory = new SupplementSchedulingService(
      prisma,
      configService,
      calendar,
      inventory as any,
    );
    prisma.supplementOrder.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'PAID',
      packingDate: null,
    });
    const tx = {
      supplementOrder: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      supplementOrderEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    await withInventory.rescheduleOrder(
      'o1',
      TimezoneUtil.parseDateOnly('2026-10-21'),
      { type: 'ADMIN' },
    );

    expect(inventory.reserveForOrder).toHaveBeenCalledWith(
      tx,
      'o1',
      TimezoneUtil.parseDateOnly('2026-10-21'),
    );
  });

  it('管理员改期：满员且未允许超排 → 拒绝', async () => {
    prisma.supplementOrder.findUnique.mockResolvedValue({
      id: 'o1',
      status: 'PAID',
      packingDate: null,
    });
    prisma.supplementOrder.count.mockResolvedValue(30);

    await expect(
      service.rescheduleOrder(
        'o1',
        TimezoneUtil.parseDateOnly('2026-10-21'),
        { type: 'ADMIN' },
        { reason: '顾客要求' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('自动完成：SHIPPED 满 10 天 → COMPLETED + 事件', async () => {
    prisma.supplementOrder.findMany.mockResolvedValue([
      { id: 'o1', shippedAt: new Date('2026-10-01T00:00:00Z') },
    ]);
    const tx = {
      supplementOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      supplementOrderEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

    const count = await service.autoCompleteShippedOrders();

    expect(count).toBe(1);
    expect(tx.supplementOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
    expect(tx.supplementOrderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'COMPLETED' }),
      }),
    );
  });
});
