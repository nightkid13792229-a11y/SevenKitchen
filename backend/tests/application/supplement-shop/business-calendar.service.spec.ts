import { BusinessCalendarService } from '../../../src/application/supplement-shop/business-calendar.service';
import { TimezoneUtil } from '../../../src/utils/timezone.util';

describe('BusinessCalendarService', () => {
  const prisma = {
    customRecipeSchedule: { findUnique: jest.fn() },
    customRecipeWeekdayRule: { findUnique: jest.fn() },
  } as any;
  let service: BusinessCalendarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BusinessCalendarService(prisma);
  });

  it('具体某天优先：开 + 非假日 = 营业', async () => {
    prisma.customRecipeSchedule.findUnique.mockResolvedValue({
      isAvailable: true,
      isPublicHoliday: false,
    });
    await expect(
      service.isOpen(TimezoneUtil.parseDateOnly('2026-10-19')),
    ).resolves.toBe(true);
  });

  it('具体某天优先：假日 = 不营业（即使 isAvailable=true）', async () => {
    prisma.customRecipeSchedule.findUnique.mockResolvedValue({
      isAvailable: true,
      isPublicHoliday: true,
    });
    await expect(
      service.isOpen(TimezoneUtil.parseDateOnly('2026-10-19')),
    ).resolves.toBe(false);
  });

  it('没有具体某天时看星期规则', async () => {
    prisma.customRecipeSchedule.findUnique.mockResolvedValue(null);
    prisma.customRecipeWeekdayRule.findUnique.mockResolvedValue({ isOpen: false });
    await expect(
      service.isOpen(TimezoneUtil.parseDateOnly('2026-10-18')),
    ).resolves.toBe(false);
  });

  it('两边都没配置时默认营业', async () => {
    prisma.customRecipeSchedule.findUnique.mockResolvedValue(null);
    prisma.customRecipeWeekdayRule.findUnique.mockResolvedValue(null);
    await expect(
      service.isOpen(TimezoneUtil.parseDateOnly('2026-10-19')),
    ).resolves.toBe(true);
  });

  it('nextOpen 跳过周日，找到周一', async () => {
    prisma.customRecipeSchedule.findUnique.mockResolvedValue(null);
    prisma.customRecipeWeekdayRule.findUnique.mockImplementation(
      async ({ where }: any) => ({ isOpen: where.weekday !== 0 }),
    );
    await expect(
      service.nextOpen(TimezoneUtil.parseDateOnly('2026-10-18')),
    ).resolves.toEqual(TimezoneUtil.parseDateOnly('2026-10-19'));
  });
});
