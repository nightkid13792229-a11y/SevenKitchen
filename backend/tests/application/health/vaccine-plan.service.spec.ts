import { BadRequestException } from '@nestjs/common';
import { VaccinePlanService } from '../../../src/application/health/vaccine-plan.service';

/**
 * 疫苗计划服务（2026-10-15 重做）。
 *
 * 这一层只做三件事：取数 → 交给纯函数 → 落库。所以这里锁的是**接口契约**：
 *   · `GET 计划` 的形状（next / plan / ignored / rhythm / pendingReview / conflicts）
 *   · `PUT 决定` 针对**这只狗的实际步骤**校验（冲突 A4 的修复）
 *   · `DELETE 决定` 一键恢复
 *   · 忽略的 `reason` 原样带出、`ignored.count` 是真实值（冲突 A1 的修复）
 *
 * ⚠️ 冲突 A4 是什么：改造前用**默认计划表**校验步骤标识，
 *    于是任何不在默认表里的步骤（例如"补一针""重启免疫"这两类新步骤）
 *    都会被 400 拒掉 —— 顾客点了"忽略"却报错，功能等于没有。
 */
describe('疫苗计划服务', () => {
  const CUSTOMER_ID = 'customer-1';
  const DOG_ID = 'dog-1';

  /** 6 岁、零记录的狗（2026-10-15 参考日）→ 核心补一针 + 狂犬首针 + 钩端第 1 针 */
  const BIRTHDAY = new Date('2020-08-30T00:00:00.000Z');

  function createService(overrides: Record<string, any> = {}) {
    const rows: Array<Record<string, any>> = [];

    const prisma = {
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: CUSTOMER_ID,
          birthday: BIRTHDAY,
        }),
      },
      vaccineRecord: { findMany: jest.fn().mockResolvedValue([]) },
      antibodyTestRecord: { findMany: jest.fn().mockResolvedValue([]) },
      vaccineDecision: {
        findMany: jest.fn(() => Promise.resolve(rows)),
        deleteMany: jest.fn(({ where }: any) => {
          const index = rows.findIndex((row) => row.stepKey === where.stepKey);
          if (index >= 0) rows.splice(index, 1);
          return Promise.resolve({ count: 1 });
        }),
        upsert: jest.fn(({ where, create }: any) => {
          const existing = rows.find(
            (row) => row.stepKey === where.dogId_stepKey.stepKey,
          );
          if (existing) {
            Object.assign(existing, create);
            return Promise.resolve(existing);
          }
          const created = { id: `d-${rows.length + 1}`, ...create };
          rows.push(created);
          return Promise.resolve(created);
        }),
      },
      ...overrides,
    };

    return { service: new VaccinePlanService(prisma as any), prisma, rows };
  }

  it('计划接口的形状：dogId / birthday / ageWeeks / next / plan / ignored / rhythm', async () => {
    const { service } = createService();

    const view = await service.getPlan(CUSTOMER_ID, DOG_ID);

    expect(view.dogId).toBe(DOG_ID);
    expect(view.birthday).toBe('2020-08-30');
    expect(view.ageWeeks).toBeGreaterThan(300);
    expect(view.next).not.toBeNull();
    expect(view.next!.label).toBe('补一针');
    expect(view.plan.length).toBeGreaterThan(0);
    expect(view.ignored).toEqual({ count: 0, items: [] });
    expect(view.rhythm).toContain('每年一次');
    expect(view.pendingReview).toBe(0);
    expect(view.conflicts).toEqual([]);
    expect(view.noRecordAtAll).toBe(true);
  });

  it('🔴 冲突 A4：**非默认步骤**（补一针 / 重启免疫）也能存决定', async () => {
    const { service, prisma } = createService();

    // 先确认这一步确实不在"默认计划表"里 —— 它就是本次新增的那一类
    await expect(
      service.setDecision(
        CUSTOMER_ID,
        DOG_ID,
        'core-catchup',
        'SKIP',
        'STOPPED',
      ),
    ).resolves.toMatchObject({
      stepKey: 'core-catchup',
      decision: 'SKIP',
      reason: 'STOPPED',
    });
    expect(prisma.vaccineDecision.upsert).toHaveBeenCalled();
  });

  it('不在**这只狗**程序里的步骤标识仍然要拒（不能留无效键）', async () => {
    const { service } = createService();

    await expect(
      service.setDecision(CUSTOMER_ID, DOG_ID, 'rabies-99', 'SKIP'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('决定只认 ACCEPT / DEFER / SKIP', async () => {
    const { service } = createService();

    await expect(
      service.setDecision(CUSTOMER_ID, DOG_ID, 'rabies-1', '随便写的'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('忽略的原因只认 NOT_NOW / STOPPED（可空）', async () => {
    const { service } = createService();

    await expect(
      service.setDecision(
        CUSTOMER_ID,
        DOG_ID,
        'rabies-1',
        'SKIP',
        '因为我乐意',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.setDecision(CUSTOMER_ID, DOG_ID, 'rabies-1', 'SKIP', null),
    ).resolves.toMatchObject({ reason: null });
  });

  it('🔴 冲突 A1：忽略两项之后 `ignored.count` 是真实值（不是恒为 0）', async () => {
    const { service, rows } = createService();
    rows.push({
      id: 'd-1',
      dogId: DOG_ID,
      stepKey: 'core-catchup',
      decision: 'SKIP',
      reason: 'STOPPED',
    });
    rows.push({
      id: 'd-2',
      dogId: DOG_ID,
      stepKey: 'rabies-1',
      decision: 'SKIP',
      reason: 'NOT_NOW',
    });

    const view = await service.getPlan(CUSTOMER_ID, DOG_ID);

    expect(view.ignored.count).toBe(2);
    expect(view.ignored.items.map((item) => item.key).sort()).toEqual([
      'core-catchup',
      'rabies-1',
    ]);
    expect(
      view.ignored.items.find((item) => item.key === 'rabies-1')?.reason,
    ).toBe('NOT_NOW');
    // 被忽略的步骤不再下发
    expect(view.plan.some((step) => step.key === 'core-catchup')).toBe(false);
  });

  it('清掉决定（一键恢复）', async () => {
    const { service, rows } = createService();
    rows.push({
      id: 'd-1',
      dogId: DOG_ID,
      stepKey: 'rabies-1',
      decision: 'SKIP',
      reason: 'NOT_NOW',
    });

    await service.clearDecision(CUSTOMER_ID, DOG_ID, 'rabies-1');

    const view = await service.getPlan(CUSTOMER_ID, DOG_ID);
    expect(view.ignored.count).toBe(0);
    expect(view.plan.some((step) => step.key === 'rabies-1')).toBe(true);
  });

  it('不是自己的狗 → 403（不泄露别人的档案）', async () => {
    const { service } = createService({
      dog: {
        findUnique: jest.fn().mockResolvedValue({
          id: DOG_ID,
          ownerId: 'someone-else',
          birthday: BIRTHDAY,
        }),
      },
    });

    await expect(service.getPlan(CUSTOMER_ID, DOG_ID)).rejects.toThrow(
      'Access denied',
    );
  });

  it('狗不存在 → 404', async () => {
    const { service } = createService({
      dog: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.getPlan(CUSTOMER_ID, DOG_ID)).rejects.toThrow(
      'Dog not found',
    );
  });

  it('抗体检测接进计划：CORE 合格 → 核心那一针变成"评估"', async () => {
    const { service } = createService({
      vaccineRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            dogId: DOG_ID,
            vaccineName: '狂犬疫苗',
            vaccinationDate: new Date('2025-11-20T00:00:00.000Z'),
            kinds: ['rabies'],
            components: ['rabies'],
            productVerified: true,
          },
          {
            id: 'r2',
            dogId: DOG_ID,
            vaccineName: '卫佳伍',
            vaccinationDate: new Date('2024-01-15T00:00:00.000Z'),
            kinds: ['core'],
            components: ['cdv', 'cpv', 'cav'],
            productVerified: true,
          },
        ]),
      },
      antibodyTestRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't1',
            dogId: DOG_ID,
            testedAt: new Date(),
            targets: ['CORE'],
            result: 'PASS',
            nextReviewAt: new Date(
              new Date().setFullYear(new Date().getFullYear() + 3),
            ),
          },
        ]),
      },
    });

    const view = await service.getPlan(CUSTOMER_ID, DOG_ID);
    const core = view.plan.find((step) => step.kind === 'core');
    expect(core!.label).toBe('评估');
    expect(core!.status).toBe('DONE');
  });

  it('没核对过的记录：不计入计划，但计入 pendingReview', async () => {
    const { service } = createService({
      vaccineRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            dogId: DOG_ID,
            vaccineName: '狂犬疫苗',
            vaccinationDate: new Date('2026-10-01T00:00:00.000Z'),
            kinds: ['rabies'],
            components: ['rabies'],
            productVerified: false,
          },
        ]),
      },
    });

    const view = await service.getPlan(CUSTOMER_ID, DOG_ID);
    expect(view.pendingReview).toBe(1);
    expect(view.plan.find((step) => step.kind === 'rabies')!.status).not.toBe(
      'DONE',
    );
  });
});
