import { plainToInstance } from 'class-transformer';
import { HealthService } from '../../../src/application/health/health.service';
import { CreateMedicalRecordDto } from '../../../src/interfaces/dto/health/create-medical-record.dto';
import { UpdateMedicalRecordDto } from '../../../src/interfaces/dto/health/update-medical-record.dto';

/**
 * 就诊记录的字段口径（2026-10-02 老板定稿）。
 *
 * 起因：老板实测一条真实病历，「处理与提醒」显示"无"，后面却跟着
 * "全腹部彩超、血常规、斯玛特16项生化、CRP C反应蛋白检查；回家后注意：…" ——
 * 治疗意见 + 处置处方 + 医嘱三样挤在一个字段里，还和「其它想说的」重叠。
 * 定稿：treatment = 医嘱/回家注意、exams = 这次做的检查、vitals = 体征，
 * 各自独立成列（见 20261002120000_add_medical_exams_vitals）。
 *
 * 这组测试锁三件事：
 *   ① 新建时三栏真的写进库（不是被忽略）
 *   ② 改记录时能改这三栏
 *   ③ **改化验数据真的能存上**（顺手修的老 bug：update 白名单里漏了 labValues，
 *      家长在表单里改完化验数据、保存后永远不变）
 */
describe('就诊记录 · 医嘱/检查/体征三栏', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  function createService() {
    const medicalRepo = {
      create: jest.fn((data: any) =>
        Promise.resolve({
          id: 'medical-1',
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
          updatedAt: new Date('2026-10-02T00:00:00.000Z'),
          ...data,
        }),
      ),
      update: jest.fn((_id: string, data: any) => {
        // Prisma 语义：patch 里 undefined 的字段不动，其余覆盖
        const base: Record<string, any> = {
          id: 'medical-1',
          dogId: DOG_ID,
          visitDate: new Date('2026-02-11T00:00:00.000Z'),
          chiefComplaint: '在家不够活泼，有点呕吐',
          diagnosis: '胆汁淤积',
          labValues: '生化\nALT 144 U/L（偏高）',
          treatment: '回家后注意：清淡饮食，按时吃药，定期复查',
          exams: '全腹部彩超、血常规',
          vitals: '体温 38.4℃、体重 6.70kg、BCS 3',
          medications: ['乐妥 1片/次 每日2次 共3天'],
          status: 'TREATING',
          followUpDate: null,
          veterinarian: null,
          notes: '样本存在异常：溶血+',
          attachments: [],
          createdAt: new Date('2026-10-02T00:00:00.000Z'),
          updatedAt: new Date('2026-10-02T00:00:00.000Z'),
        };
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            base[key] = value;
          }
        }
        return Promise.resolve(base);
      }),
      findById: jest.fn().mockResolvedValue({
        id: 'medical-1',
        dogId: DOG_ID,
        visitDate: new Date('2026-02-11T00:00:00.000Z'),
        chiefComplaint: '在家不够活泼，有点呕吐',
        diagnosis: '胆汁淤积',
        labValues: null,
        treatment: null,
        exams: null,
        vitals: null,
        medications: [],
        status: 'TREATING',
        followUpDate: null,
        veterinarian: null,
        notes: null,
        attachments: [],
        createdAt: new Date('2026-10-02T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
      }),
    };

    const service = new HealthService(
      {} as any,
      {} as any,
      medicalRepo as any,
      {} as any,
      {
        findById: jest
          .fn()
          .mockResolvedValue({ id: DOG_ID, ownerId: CUSTOMER_ID }),
      } as any,
      { deleteImage: jest.fn() } as any,
      {
        medicalRecord: { count: jest.fn().mockResolvedValue(0) },
        checkupRecord: { count: jest.fn().mockResolvedValue(0) },
        allergyRecord: { count: jest.fn().mockResolvedValue(0) },
        vaccineRecord: { count: jest.fn().mockResolvedValue(0) },
        dogHealthShareToken: { count: jest.fn().mockResolvedValue(0) },
      } as any,
    );

    return { service, medicalRepo };
  }

  it('新建就诊记录：医嘱 / 这次做的检查 / 体征 都真的写进库', async () => {
    const { service, medicalRepo } = createService();

    const dto = plainToInstance(CreateMedicalRecordDto, {
      dogId: DOG_ID,
      visitDate: '2026-02-11',
      chiefComplaint: '在家不够活泼，有点呕吐',
      diagnosis: '胆汁淤积',
      treatment: '回家后注意：注意心情调节，清淡饮食，按时吃药，定期复查',
      exams: '全腹部彩超、血常规、斯玛特16项生化、CRP C反应蛋白、DR×2',
      vitals: '体温 38.4℃、体重 6.70kg、BCS 3',
      medications: ['乐妥 1片/次 每日2次 共3天'],
      labValues: '生化\n丙氨酸氨基转移酶(ALT) 144 U/L（偏高）',
      notes: '样本存在异常：溶血+',
    });

    const result = await service.createMedicalRecord(CUSTOMER_ID, dto);
    const written = medicalRepo.create.mock.calls[0][0];

    expect(written.treatment).toContain('回家后注意');
    expect(written.exams).toContain('全腹部彩超');
    expect(written.vitals).toContain('体温 38.4');
    expect(written.labValues).toContain('144 U/L');
    // 检查清单不该再混进医嘱里
    expect(written.treatment).not.toContain('全腹部彩超');

    expect(result.exams).toContain('全腹部彩超');
    expect(result.vitals).toContain('BCS 3');
  });

  it('改记录时能改这三栏', async () => {
    const { service, medicalRepo } = createService();

    const dto = plainToInstance(UpdateMedicalRecordDto, {
      exams: '全腹部彩超、血常规、DR×2',
      vitals: '体温 38.4℃',
      treatment: '清淡饮食，两周后复查',
    });

    await service.updateMedicalRecord('medical-1', CUSTOMER_ID, dto);
    const written = medicalRepo.update.mock.calls[0][1];

    expect(written.exams).toBe('全腹部彩超、血常规、DR×2');
    expect(written.vitals).toBe('体温 38.4℃');
    expect(written.treatment).toBe('清淡饮食，两周后复查');
  });

  it('改化验数据真的能存上（修 update 白名单漏 labValues 的老 bug）', async () => {
    const { service, medicalRepo } = createService();

    const dto = plainToInstance(UpdateMedicalRecordDto, {
      labValues: '生化\nALT 90 U/L',
    });

    const result = await service.updateMedicalRecord('medical-1', CUSTOMER_ID, dto);

    expect(medicalRepo.update.mock.calls[0][1].labValues).toBe('生化\nALT 90 U/L');
    expect(result.labValues).toBe('生化\nALT 90 U/L');
  });

  it('清空某一栏（传空串）也能存上，不会被当成"没改"', async () => {
    const { service, medicalRepo } = createService();

    const dto = plainToInstance(UpdateMedicalRecordDto, { exams: '' });

    await service.updateMedicalRecord('medical-1', CUSTOMER_ID, dto);

    expect(medicalRepo.update.mock.calls[0][1].exams).toBe('');
  });
});
