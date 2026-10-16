import { HealthService } from '../../../src/application/health/health.service';

/**
 * 疫苗记录 · 「核对状态」有没有下发（2026-10-16 自检 V3）。
 *
 * 背景：`productVerified = false` 表示"这一针是识别出来的、我们有理由怀疑，
 * 顾客还没对照疫苗本核过 —— 先不算进计划"（见 schema.prisma 该列的注释）。
 *
 * 小程序**靠这个字段判断"待核对"**：角标要不要出现、点那一条要不要去核对，
 * 全看 `record.productVerified === false`。
 *
 * 可它此前根本不在响应里下发 —— 于是「待核对」整条路是死的：
 * 角标不出现、点那一条也不会去核对，而页面上还写着"点那一条就能核对" ✗。
 *
 * 这组测试锁三件事：
 *   ① 响应里**带着** `productVerified`（字段不能缺）
 *   ② 落库是 false 的，照原样回 false（不能被兜底成 true ——
 *      那等于偷偷把没核对的针算进计划，狗可能漏打 ✗）
 *   ③ 老记录 / 手工填写的（这一列是后加的，迁移过来可能读到 undefined）算 true
 */
describe('疫苗记录 · 核对状态下发（productVerified）', () => {
  const DOG_ID = 'dog-1';
  const CUSTOMER_ID = 'customer-1';

  function buildRecord(overrides: Record<string, any> = {}) {
    return {
      id: 'vaccine-1',
      dogId: DOG_ID,
      vaccineName: '狂犬疫苗',
      vaccinationDate: new Date('2026-09-01T00:00:00.000Z'),
      notes: null,
      attachments: [],
      components: ['rabies'],
      kinds: ['rabies'],
      productVerified: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function createService(records: any[]) {
    const vaccineRepo = {
      findById: jest
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(records.find((record) => record.id === id) ?? null),
        ),
      findByDogId: jest.fn().mockResolvedValue(records),
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
      {} as any,
      {} as any,
    );

    return { service, vaccineRepo };
  }

  it('列表与单条都**带着** productVerified（字段不能缺，缺了前端判断不了）', async () => {
    const { service } = createService([buildRecord()]);

    const list = await service.getVaccineRecords(DOG_ID, CUSTOMER_ID);
    expect('productVerified' in list.records[0]).toBe(true);
    expect(list.records[0].productVerified).toBe(true);

    const single = await service.getVaccineRecord('vaccine-1', CUSTOMER_ID);
    expect('productVerified' in single).toBe(true);
    expect(single.productVerified).toBe(true);
  });

  it('落库是 false 的照原样回 false（不能兜底成 true，否则没核对的针被算进计划）', async () => {
    const { service } = createService([buildRecord({ productVerified: false })]);

    const list = await service.getVaccineRecords(DOG_ID, CUSTOMER_ID);
    expect(list.records[0].productVerified).toBe(false);

    const single = await service.getVaccineRecord('vaccine-1', CUSTOMER_ID);
    expect(single.productVerified).toBe(false);
  });

  it('老记录这一列读到 undefined（迁移过来的）算 true —— 不是 false 就算数', async () => {
    // 老行这一列是后加的：迁移脚本可能没回填，读到的是 undefined。
    const { service } = createService([
      buildRecord({ productVerified: undefined }),
    ]);

    const list = await service.getVaccineRecords(DOG_ID, CUSTOMER_ID);
    expect(list.records[0].productVerified).toBe(true);

    const single = await service.getVaccineRecord('vaccine-1', CUSTOMER_ID);
    expect(single.productVerified).toBe(true);
  });
});
