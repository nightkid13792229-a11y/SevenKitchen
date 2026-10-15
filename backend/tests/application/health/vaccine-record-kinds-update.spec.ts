import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { HealthService } from '../../../src/application/health/health.service';
import { UpdateVaccineDto } from '../../../src/interfaces/dto/health/update-vaccine.dto';

/**
 * 疫苗记录 · 类别**一律由后端算**（2026-10-15 按技术方案 1.1.2 重写）。
 *
 * ── 这一版与上一版的区别（逐条裁决）─────────────────────────────
 * 上一版这个文件叫「改分类能存进去」，锁的是**顾客手选的 kinds 要存进去**
 * —— 那是旧模型（顾客/前端指定类别）。新规格把这条规则整个换掉了：
 *
 *   · `kinds` **不再接受入参**（DTO 里已经删掉这个字段）
 *   · 有 `components`（顾客勾的病种）→ 由它推导类别（唯一事实）
 *   · 没有 `components` → 按名字字面判（"狂犬""六联"）
 *   · 两条都不成立 → **不保存**（需求 R6：不允许"存了但不影响计划"的记录）
 *
 * 所以旧用例里"顾客改成狂犬疫苗 → patch 里带 kinds"这一类**已经失效**：
 * 前端不再有这个选择器，后端也不认这个入参。保留下来只会钉住错的行为。
 * 相应地，新用例锁的是上面那三条 + 改名字要重算类别。
 *
 * ⚠️ 仍然保留的老坑：`undefined` = 别动它（只改备注不能把类别冲掉）。
 */
describe('疫苗记录 · 类别由后端算（2026-10-15）', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';
  const VACCINE_ID = 'vaccine-1';

  /** 库里已经躺着的一条：幼犬保（产品库认得出 → 早期核心疫苗） */
  const STORED = {
    id: VACCINE_ID,
    dogId: DOG_ID,
    vaccineName: '宠必威幼犬保',
    vaccinationDate: new Date('2026-05-10T00:00:00.000Z'),
    notes: '首针',
    attachments: [],
    kinds: ['core_early'],
    components: ['cdv', 'cpv'],
    createdAt: new Date('2026-05-10T00:00:00.000Z'),
    updatedAt: new Date('2026-05-10T00:00:00.000Z'),
  };

  function createService() {
    const vaccineRepo = {
      create: jest.fn((data: Record<string, any>) =>
        Promise.resolve({ ...STORED, ...data }),
      ),
      /**
       * Prisma 语义：patch 里是 undefined 的字段**不动**，其它字段覆盖。
       * 这个 mock 必须忠实模拟，否则"不传 = 保持原样"的断言就是假的。
       */
      update: jest.fn((_id: string, data: Record<string, any>) => {
        const base: Record<string, any> = { ...STORED };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            base[key] = value;
          }
        }
        return Promise.resolve(base);
      }),
      findById: jest.fn().mockResolvedValue({ ...STORED }),
      findByDogId: jest.fn().mockResolvedValue([]),
    };

    const cosService = { deleteImage: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      medicalRecord: { count: jest.fn().mockResolvedValue(0) },
      checkupRecord: { count: jest.fn().mockResolvedValue(0) },
      allergyRecord: { count: jest.fn().mockResolvedValue(0) },
      vaccineRecord: { count: jest.fn().mockResolvedValue(0) },
      dogHealthShareToken: { count: jest.fn().mockResolvedValue(0) },
    };

    const service = new HealthService(
      vaccineRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {
        findById: jest
          .fn()
          .mockResolvedValue({ id: DOG_ID, ownerId: CUSTOMER_ID }),
      } as any,
      cosService as any,
      prisma as any,
    );

    return { service, vaccineRepo };
  }

  it('新建时只有名字 + 日期：按名字字面判出类别（"六联" → 核心）', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.createVaccineRecord(CUSTOMER_ID, {
      dogId: DOG_ID,
      vaccineName: '犬六联',
      vaccinationDate: '2026-05-10',
    } as any);

    expect(vaccineRepo.create.mock.calls[0][0].kinds).toEqual(['core']);
    expect(result.kinds).toEqual(['core']);
  });

  it('勾了病种 → 类别由病种推导（组合苗能同时占两类）', async () => {
    const { service, vaccineRepo } = createService();

    await service.createVaccineRecord(CUSTOMER_ID, {
      dogId: DOG_ID,
      vaccineName: '某支没见过的苗',
      vaccinationDate: '2026-05-10',
      components: ['cdv', 'cpv', 'cav', 'lepto'],
    } as any);

    expect(vaccineRepo.create.mock.calls[0][0].kinds).toEqual(['core', 'lepto']);
  });

  it('🔴 名字认不出、又没勾病种 → 直接拒（不允许"存了但不影响计划"的记录）', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.createVaccineRecord(CUSTOMER_ID, {
        dogId: DOG_ID,
        vaccineName: '拜宠清',
        vaccinationDate: '2026-05-10',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vaccineRepo.create).not.toHaveBeenCalled();
  });

  it('改了名字 → 类别跟着重算（新名字按字面判）', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { vaccineName: '狂犬疫苗' }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].kinds).toEqual(['rabies']);
    expect(result.kinds).toEqual(['rabies']);
  });

  it('改了病种 → 类别跟着病种走', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { components: ['rabies'] }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].kinds).toEqual(['rabies']);
    expect(result.kinds).toEqual(['rabies']);
  });

  it('只改备注 → kinds 不写库（不会把已判定的类别冲掉）', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: '补个备注' }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].kinds).toBeUndefined();
    expect(result.kinds).toEqual(['core_early']);
  });

  it('名字改成认不出的那种、又没勾病种 → 拒掉，不落库', async () => {
    const { service, vaccineRepo } = createService();

    await expect(
      service.updateVaccineRecord(
        VACCINE_ID,
        CUSTOMER_ID,
        plainToInstance(UpdateVaccineDto, { vaccineName: '驱虫药' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(vaccineRepo.update).not.toHaveBeenCalled();
  });

  it('清空备注照常生效（前端空备注会明确传 null）', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: '' }),
    );

    expect(result.notes).toBeNull();
  });
});
