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

  it('计数按当天零点归集（跨天重新计次）', async () => {
    prisma.procurementSkuDraftUsage.upsert.mockResolvedValue({ count: 1 });

    await service.consume('user-1', new Date('2026-11-02T01:00:00'));

    const arg = prisma.procurementSkuDraftUsage.upsert.mock.calls[0][0];
    const usedOn: Date = arg.where.userId_usedOn.usedOn;
    expect(usedOn.getHours()).toBe(0);
    expect(usedOn.getMinutes()).toBe(0);
    expect(usedOn.getSeconds()).toBe(0);
    expect(arg.where.userId_usedOn.userId).toBe('user-1');
  });
});
