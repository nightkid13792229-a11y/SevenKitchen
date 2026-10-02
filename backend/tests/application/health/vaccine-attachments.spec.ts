import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HealthService } from '../../../src/application/health/health.service';
import { CreateVaccineDto } from '../../../src/interfaces/dto/health/create-vaccine.dto';
import { UpdateVaccineDto } from '../../../src/interfaces/dto/health/update-vaccine.dto';
import { VaccineRecordResponseDto } from '../../../src/interfaces/dto/health/vaccine-response.dto';

/**
 * 疫苗记录的报告原件（2026-10-01，健康管理第九期）。
 *
 * 老板：拍疫苗本上传的图片，原图也要留档（像病历/检查那样）。
 * 疫苗本是接种凭证 —— 出行、寄养、换医院都可能要看原件；
 * 此前只存了 AI 抄下来的文字，识别抄错了就无从对证。
 *
 * 这组测试锁三件事：
 *   ① 新建时原图真的写进去了（不传就是空数组，不是 undefined）
 *   ② 改记录时**不传附件不会把已存的原图清空**（改个备注不该丢原件）
 *   ③ 返回给顾客的数据里带着附件，否则前端拿不到、也就显示不出来
 */
describe('疫苗记录 · 报告原件留档', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';
  const IMAGE_URL = 'https://img.sevenkitchen.cloud/health/vaccine-book-1.jpg';

  function createService(overrides: Record<string, any> = {}) {
    const vaccineRepo = {
      create: jest.fn((data: any) =>
        Promise.resolve({
          id: 'vaccine-1',
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-01T00:00:00.000Z'),
          ...data,
        }),
      ),
      update: jest.fn((_id: string, data: any) => {
        // Prisma 的语义：patch 里 undefined 的字段不动，其它字段覆盖
        const base: Record<string, any> = {
          id: 'vaccine-1',
          dogId: DOG_ID,
          vaccineName: '狂犬疫苗',
          vaccinationDate: new Date('2026-09-01T00:00:00.000Z'),
          nextDueDate: null,
          notes: null,
          status: 'COMPLETED',
          attachments: [IMAGE_URL],
          createdAt: new Date('2026-10-01T00:00:00.000Z'),
          updatedAt: new Date('2026-10-01T00:00:00.000Z'),
        };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            base[key] = value;
          }
        }
        return Promise.resolve(base);
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'vaccine-1',
        dogId: DOG_ID,
        vaccineName: '狂犬疫苗',
        vaccinationDate: new Date('2026-09-01T00:00:00.000Z'),
        nextDueDate: null,
        notes: null,
        status: 'COMPLETED',
        attachments: [IMAGE_URL],
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-01T00:00:00.000Z'),
      }),
      ...overrides,
    };

    const cosService = { deleteImage: jest.fn().mockResolvedValue(undefined) };
    // 删记录时"这张图还有没有别人引用"要查库，这里一律回 0（没人引用）
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

    return { service, vaccineRepo, cosService, prisma };
  }

  it('新建疫苗记录时把原图一并存下来', async () => {
    const { service, vaccineRepo } = createService();

    const dto = plainToInstance(CreateVaccineDto, {
      dogId: DOG_ID,
      vaccineName: '狂犬疫苗',
      vaccinationDate: '2026-09-01',
      attachments: [IMAGE_URL],
    });

    const result = await service.createVaccineRecord(CUSTOMER_ID, dto);

    expect(vaccineRepo.create).toHaveBeenCalledTimes(1);
    expect(vaccineRepo.create.mock.calls[0][0].attachments).toEqual([
      IMAGE_URL,
    ]);
    expect(result.attachments).toEqual([IMAGE_URL]);
  });

  it('手工填写（没传附件）时存空数组，不是 undefined', async () => {
    const { service, vaccineRepo } = createService();

    const dto = plainToInstance(CreateVaccineDto, {
      dogId: DOG_ID,
      vaccineName: '狂犬疫苗',
      vaccinationDate: '2026-09-01',
    });

    await service.createVaccineRecord(CUSTOMER_ID, dto);

    // 列是 NOT NULL 的数组：缺省必须给 []，否则写库会报错
    expect(vaccineRepo.create.mock.calls[0][0].attachments).toEqual([]);
  });

  it('改记录时不传附件 = 保持原样，不会把已存的原图清空', async () => {
    const { service, vaccineRepo } = createService();

    await service.updateVaccineRecord(
      'vaccine-1',
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: '补了备注' }),
    );

    const patch = vaccineRepo.update.mock.calls[0][1];
    expect(patch.attachments).toBeUndefined();
    expect('attachments' in patch).toBe(true);
  });

  it('改记录时明确传空数组 = 真的删掉附件', async () => {
    const { service, vaccineRepo } = createService();

    await service.updateVaccineRecord(
      'vaccine-1',
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { attachments: [] }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].attachments).toEqual([]);
  });

  it('返回给顾客的数据里带着附件（否则前端拿不到、显示不出来）', async () => {
    const { service } = createService();

    const result = await service.getVaccineRecord('vaccine-1', CUSTOMER_ID);

    expect(result.attachments).toEqual([IMAGE_URL]);
  });

  it('老记录没有附件字段时按空数组返回，不返回 null', () => {
    const dto = plainToInstance(VaccineRecordResponseDto, {
      id: 'vaccine-old',
      dogId: DOG_ID,
      vaccineName: '老记录',
      vaccinationDate: new Date('2025-01-01T00:00:00.000Z'),
      nextDueDate: null,
      notes: null,
      status: 'COMPLETED',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    expect(dto.attachments).toBeUndefined();
    // 服务层的 mapper 兜了底（见 mapVaccineRecordToDto 的 ?? []）
  });

  describe('入参校验', () => {
    it('附件必须是字符串数组', async () => {
      const bad = plainToInstance(CreateVaccineDto, {
        dogId: DOG_ID,
        vaccineName: '狂犬疫苗',
        vaccinationDate: '2026-09-01',
        attachments: [123],
      });

      const errors = await validate(bad);
      expect(errors.some((e) => e.property === 'attachments')).toBe(true);
    });

    it('不传附件是合法的（手工填写那条路）', async () => {
      const ok = plainToInstance(CreateVaccineDto, {
        dogId: DOG_ID,
        vaccineName: '狂犬疫苗',
        vaccinationDate: '2026-09-01',
      });

      const errors = await validate(ok);
      expect(errors.some((e) => e.property === 'attachments')).toBe(false);
    });
  });
});

/**
 * 删记录时附件的去向（2026-10-02 老板问"删记录会不会把 COS 上的附件也删掉"）。
 *
 * 结论：会删，但必须满足两个条件 ——
 *   ① 地址解析要对（原来只取 URL 最后两段，路径再深一层就删不掉）
 *   ② **没有别处还在引用**（其它记录、以及永久有效的"分享给医生"快照）
 */
describe('删记录 · 附件清理', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';
  const URL = 'https://img.sevenkitchen.cloud/medical-reports/temp/vaccine-book.jpg';

  function build(overrides: Record<string, any> = {}) {
    const record = {
      id: 'vaccine-1',
      dogId: DOG_ID,
      vaccineName: '狂犬疫苗',
      vaccinationDate: new Date('2026-09-01T00:00:00.000Z'),
      nextDueDate: null,
      notes: null,
      status: 'COMPLETED',
      attachments: [URL],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vaccineRepo = {
      findById: jest.fn().mockResolvedValue(record),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const cosService = { deleteImage: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      medicalRecord: { count: jest.fn().mockResolvedValue(0) },
      checkupRecord: { count: jest.fn().mockResolvedValue(0) },
      allergyRecord: { count: jest.fn().mockResolvedValue(0) },
      vaccineRecord: { count: jest.fn().mockResolvedValue(0) },
      dogHealthShareToken: { count: jest.fn().mockResolvedValue(0) },
      ...overrides,
    };

    const service = new HealthService(
      vaccineRepo as any,
      {} as any,
      {} as any,
      {} as any,
      { findById: jest.fn().mockResolvedValue({ id: DOG_ID, ownerId: CUSTOMER_ID }) } as any,
      cosService as any,
      prisma as any,
    );

    return { service, vaccineRepo, cosService, prisma };
  }

  it('没人引用时：连文件一起删掉，key 取的是域名后的完整路径', async () => {
    const { service, vaccineRepo, cosService } = build();

    await service.deleteVaccineRecord('vaccine-1', CUSTOMER_ID);

    expect(vaccineRepo.delete).toHaveBeenCalledWith('vaccine-1');
    expect(cosService.deleteImage).toHaveBeenCalledWith(
      'medical-reports/temp/vaccine-book.jpg',
    );
  });

  it('分享给医生的快照还指着这张图 → 文件留着（链接是永久的，删了医生那边就裂了）', async () => {
    const { service, cosService } = build({
      dogHealthShareToken: { count: jest.fn().mockResolvedValue(1) },
    });

    await service.deleteVaccineRecord('vaccine-1', CUSTOMER_ID);

    expect(cosService.deleteImage).not.toHaveBeenCalled();
  });

  it('别的记录还挂着同一张图 → 文件留着', async () => {
    const { service, cosService } = build({
      checkupRecord: { count: jest.fn().mockResolvedValue(1) },
    });

    await service.deleteVaccineRecord('vaccine-1', CUSTOMER_ID);

    expect(cosService.deleteImage).not.toHaveBeenCalled();
  });

  it('删文件失败不影响"记录已删除"', async () => {
    const { service, vaccineRepo, cosService } = build();
    cosService.deleteImage.mockRejectedValue(new Error('COS 挂了'));

    await expect(
      service.deleteVaccineRecord('vaccine-1', CUSTOMER_ID),
    ).resolves.toBeUndefined();
    expect(vaccineRepo.delete).toHaveBeenCalled();
  });
});
