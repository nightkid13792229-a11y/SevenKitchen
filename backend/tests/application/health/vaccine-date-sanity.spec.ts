import { BadRequestException } from '@nestjs/common';
import { HealthService } from '../../../src/application/health/health.service';

/**
 * 接种日期不能晚于今天（老板 2026-10-07 审计时定）。
 *
 * 为什么必须拦在入口：计划算法是"有记录就算这一针打过了"。
 * 一条日期填到未来的记录会把"还没打的针"直接标成已完成、提醒随之消失 ——
 * 实测（当天 2026-06-01）：把接种日填成 2026-12-01，
 * 「狂犬疫苗 首针」就变成已完成，第 2 次被推到 2027-11。
 * 常见来源是手写年份写错、拍疫苗本时 OCR 把年份读错。
 *
 * ⚠️ 早于狗狗生日的日期**不在这里拦** —— 生日本身可能是估的（领养犬），
 *    直接拒会把真实打过的那一针挡在门外。那一种交给计划里的
 *    "请核对"提示 + 窗口夹取兜底（见 domain 的"接种日期的合理性"那组测试）。
 */
describe('疫苗记录 · 接种日期不能晚于今天（2026-10-07 老板审计时定）', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  const dateText = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  function createService() {
    const baseRecord = {
      id: 'vaccine-1',
      dogId: DOG_ID,
      vaccineName: '狂犬疫苗',
      vaccinationDate: new Date('2026-09-01T00:00:00.000Z'),
      nextDueDate: null,
      notes: null,
      status: 'COMPLETED',
      attachments: [],
      kinds: ['rabies'],
      components: ['rabies'],
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };
    const vaccineRepo = {
      create: jest.fn((data: any) => Promise.resolve({ ...baseRecord, ...data })),
      // Prisma 的语义：patch 里 undefined 的字段**不动**，其它字段覆盖。
      // 不模拟这一点的话，"只改备注"会把接种日覆盖成 undefined，
      // 后面 DTO 映射读日期就炸 —— 那是 mock 的错，不是产品的错。
      update: jest.fn((_id: string, data: any) => {
        const merged: Record<string, any> = { ...baseRecord };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) merged[key] = value;
        }
        return Promise.resolve(merged);
      }),
      findById: jest.fn().mockResolvedValue({ ...baseRecord }),
    };
    const dogRepo = {
      findById: jest
        .fn()
        .mockResolvedValue({ id: DOG_ID, ownerId: CUSTOMER_ID }),
    };
    const service = new HealthService(
      vaccineRepo as any,
      {} as any,
      {} as any,
      {} as any,
      dogRepo as any,
      { deleteImage: jest.fn() } as any,
      {} as any,
    );
    return { service, vaccineRepo };
  }

  it('🔴 新建：接种日填成明天 → 直接拒，并且一条都不写库', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.createVaccineRecord(CUSTOMER_ID, {
        dogId: DOG_ID,
        vaccineName: '狂犬疫苗',
        vaccinationDate: dateText(1),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vaccineRepo.create).not.toHaveBeenCalled();
  })

  it('新建：接种日就是今天 → 正常保存（别把今天也拦掉）', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.createVaccineRecord(CUSTOMER_ID, {
        dogId: DOG_ID,
        vaccineName: '狂犬疫苗',
        vaccinationDate: dateText(0),
      } as any),
    ).resolves.toBeDefined();
    expect(vaccineRepo.create).toHaveBeenCalled();
  })

  it('🔴 修改：把接种日改成未来 → 同样拒（改记录这条路原来也没有校验）', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.updateVaccineRecord('vaccine-1', CUSTOMER_ID, {
        vaccinationDate: dateText(3),
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vaccineRepo.update).not.toHaveBeenCalled();
  })

  it('修改：只改备注、不带日期 → 不受影响', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.updateVaccineRecord('vaccine-1', CUSTOMER_ID, {
        notes: '换了一家医院',
      } as any),
    ).resolves.toBeDefined();
    expect(vaccineRepo.update).toHaveBeenCalled();
  })
})
