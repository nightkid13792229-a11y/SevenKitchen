import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProcurementSkuDraftQuotaService } from '../../../src/application/purchasing/procurement-sku-draft-quota.service';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

describe('ProcurementSkuDraftQuotaService', () => {
  let service: ProcurementSkuDraftQuotaService;
  const prisma = {
    procurementSkuDraftUsage: {
      aggregate: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementSkuDraftQuotaService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ProcurementSkuDraftQuotaService);
    jest.clearAllMocks();
    prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({
      _sum: { count: 0 },
    });
  });

  it('同一个人同一天第 31 次被拒绝', async () => {
    prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 31 });

    await expect(
      service.consume('user-1', new Date('2026-11-01T10:00:00')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('全系统当月已满 3000 次时第 1 次也拒绝', async () => {
    prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({
      _sum: { count: 3000 },
    });

    await expect(
      service.consume('user-1', new Date('2026-11-01T10:00:00')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.procurementSkuDraftUsage.upsert).not.toHaveBeenCalled();
  });

  it('同一个人当天第 30 次通过', async () => {
    prisma.procurementSkuDraftUsage.aggregate.mockResolvedValue({
      _sum: { count: 10 },
    });
    prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 30 });

    await expect(
      service.consume('user-1', new Date('2026-11-01T10:00:00')),
    ).resolves.toBeUndefined();
  });

  it('存进库的是「本地日历日期」，不会因为时差退回前一天', async () => {
    prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 1 });

    const now = new Date('2026-11-02T01:00:00');
    await service.consume('user-1', now);

    const arg = prisma.procurementSkuDraftUsage.upsert.mock.calls[0][0];
    const usedOn: Date = arg.where.userId_usedOn.usedOn;

    // DATE 列存的是这一刻的 UTC 日历日；必须等于**本地**的今天，
    // 否则东八区会在早上 8 点前把日期记成昨天（2026-11-01 线上实测踩到）
    const expectedDate = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    expect(usedOn.toISOString()).toBe(expectedDate.toISOString());
    expect(arg.where.userId_usedOn.userId).toBe('user-1');
  });
});
