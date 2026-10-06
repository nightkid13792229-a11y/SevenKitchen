import { plainToInstance } from 'class-transformer';
import { HealthService } from '../../../src/application/health/health.service';
import { UpdateVaccineDto } from '../../../src/interfaces/dto/health/update-vaccine.dto';

/**
 * 疫苗记录 · 顾客改分类要真的存进去（2026-10-06）。
 *
 * 老板报的 bug 原话："我在尝试修改分类的时候，不管点哪一个分类，
 * 都改不动，还是原来的这个分类。"
 *
 * 根因不在前端交互，在**服务端更新记录时漏写了 kinds**：
 * 接口定义（update-vaccine.dto.ts）里明明收这个字段，
 * 但 updateVaccineRecord 组装 patch 时只写了名称/日期/备注/状态/附件。
 * 于是前端点分类 → 自动保存 → 服务端丢掉 → 回读还是旧值 → "点了没反应"。
 *
 * 创建那条路一直是好的，所以这个 bug 只在"改"的时候出现 ——
 * 这组测试锁死"改"这条路，另外顺带锁住同一段里
 * nextDueDate 被无脑清空的问题。
 */
describe('疫苗记录 · 改分类能存进去', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';
  const VACCINE_ID = 'vaccine-1';

  /** 库里已经躺着的一条：幼犬保，系统判定早期核心疫苗，有下次接种日期 */
  const STORED = {
    id: VACCINE_ID,
    dogId: DOG_ID,
    vaccineName: '宠必威® 幼犬保',
    vaccinationDate: new Date('2026-05-10T00:00:00.000Z'),
    nextDueDate: new Date('2026-06-10T00:00:00.000Z'),
    notes: '首针',
    status: 'COMPLETED',
    attachments: [],
    kinds: ['core_early'],
    createdAt: new Date('2026-05-10T00:00:00.000Z'),
    updatedAt: new Date('2026-05-10T00:00:00.000Z'),
  };

  function createService() {
    const vaccineRepo = {
      create: jest.fn(),
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

  it('顾客改成狂犬疫苗 → patch 里带着 kinds（就是漏掉这一行导致"改不动"）', async () => {
    const { service, vaccineRepo } = createService();

    await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { kinds: ['rabies'] }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].kinds).toEqual(['rabies']);
  });

  it('回读就是顾客选的那个，不再是旧分类', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { kinds: ['core'] }),
    );

    // 这条的疫苗名是「幼犬保」，按名字判会得到早期核心疫苗；
    // 顾客手改之后必须以他为准 —— 否则他会觉得"又变回去了"
    expect(result.kinds).toEqual(['core']);
    expect(result.kindLabels).toEqual(['核心疫苗']);
  });

  it('顾客自己选的分类压在名字判定之上（名字不改也能改分类）', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { kinds: ['other'] }),
    );

    expect(result.kinds).toEqual(['other']);
  });

  it('不传分类 = 保持原样，不会把已判定的分类冲掉', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: '补个备注' }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].kinds).toBeUndefined();
    expect(result.kinds).toEqual(['core_early']);
  });

  it('组合苗可以同时给好几类（卫佳捌 = 核心 + 钩端）', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { kinds: ['core', 'lepto'] }),
    );

    expect(result.kinds).toEqual(['core', 'lepto']);
  });

  it('乱传的分类被过滤掉，不让脏值进库', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, {
        kinds: ['rabies', '不存在的分类', '', 'RABIES'],
      }),
    );

    expect(result.kinds).toEqual(['rabies']);
  });

  /**
   * 下面这条是同一段代码里的第二个坑，顺带锁住。
   *
   * 原来是 `nextDueDate: dto.nextDueDate ? new Date(...) : null`，
   * 而前端只在有值时才带这个字段 —— 于是"改个备注"会把已经存好的
   * 下次接种日期悄悄清成 null，接种计划跟着丢一步。
   * 和 vaccineName / status 一样，undefined 必须表示"别动它"。
   */
  it('只改备注时，下次接种日期不会被清空', async () => {
    const { service, vaccineRepo } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: '补个备注' }),
    );

    expect(vaccineRepo.update.mock.calls[0][1].nextDueDate).toBeUndefined();
    // 出参是 YYYY-MM-DD 字符串（DTO 里格式化过），不是 Date
    expect(result.nextDueDate).toEqual('2026-06-10');
  });

  it('改下次接种日期照常生效', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { nextDueDate: '2026-07-01' }),
    );

    expect(result.nextDueDate).toEqual('2026-07-01');
  });

  it('清空备注照常生效（前端空备注会明确传 null）', async () => {
    const { service } = createService();

    const result = await service.updateVaccineRecord(
      VACCINE_ID,
      CUSTOMER_ID,
      plainToInstance(UpdateVaccineDto, { notes: null as any }),
    );

    expect(result.notes).toBeNull();
  });
});
