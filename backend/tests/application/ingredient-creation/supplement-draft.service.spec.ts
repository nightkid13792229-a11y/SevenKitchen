import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import {
  SupplementDraftService,
  type SupplementDraftFinalizedIds,
} from '../../../src/application/ingredient-creation/supplement-draft.service';
import { emptySupplementDraftPayload } from '../../../src/application/ingredient-creation/supplement-draft.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type DraftStatus = 'DRAFT' | 'FINALIZED' | 'DISCARDED';

interface DraftRow {
  id: string;
  createdBy: string;
  status: DraftStatus;
  schemaVersion: number;
  name: string;
  payload: unknown;
  aiSnapshot: unknown;
  manualFields: string[];
  verification: unknown;
  finalizedIngredientId: string | null;
  finalizedNutritionFoodId: string | null;
  finalizedEvidenceId: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 内存版 Prisma 假实现：只覆盖 `supplementCreationDraft` 的 CRUD 动作。
 *
 * 目的是让测试从「服务真的写了什么、查了什么条件」出发，而不是只对着
 * jest.fn 摆返回值：`where` 会真的过滤，`select` 会真的投影，`update`
 * 会真的合并。这样「列表不带 payload」「按 createdBy 隔离」「重复放弃
 * 幂等」这些行为都能被断言到，而不是断言 mock 的调用次数。
 */
function createPrismaMock() {
  const rows = new Map<string, DraftRow>();
  let sequence = 0;

  const clone = <T>(value: T): T => structuredClone(value);

  const matches = (
    row: DraftRow,
    where: Record<string, unknown> = {},
  ): boolean =>
    Object.entries(where).every(
      ([key, value]) =>
        value === undefined || (row as unknown as Record<string, unknown>)[key] === value,
    );

  const project = (
    row: DraftRow,
    select?: Record<string, boolean>,
  ): Record<string, unknown> => {
    if (!select) {
      return clone(row) as unknown as Record<string, unknown>;
    }
    const result: Record<string, unknown> = {};
    for (const [key, enabled] of Object.entries(select)) {
      if (enabled) {
        result[key] = clone(
          (row as unknown as Record<string, unknown>)[key],
        );
      }
    }
    return result;
  };

  const seed = (overrides: Partial<DraftRow> = {}): DraftRow => {
    const now = new Date('2026-11-21T10:00:00.000Z');
    const row: DraftRow = {
      id: `seed-${++sequence}`,
      createdBy: 'u1',
      status: 'DRAFT',
      schemaVersion: 1,
      name: '',
      payload: emptySupplementDraftPayload(),
      aiSnapshot: null,
      manualFields: [],
      verification: null,
      finalizedIngredientId: null,
      finalizedNutritionFoodId: null,
      finalizedEvidenceId: null,
      finalizedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
    rows.set(row.id, row);
    return clone(row);
  };

  const client = {
    supplementCreationDraft: {
      create: jest.fn(async ({ data }: any) => {
        const now = new Date();
        const row: DraftRow = {
          id: data.id ?? `draft-${++sequence}`,
          createdBy: data.createdBy,
          status: data.status ?? 'DRAFT',
          schemaVersion: data.schemaVersion ?? 1,
          name: data.name ?? '',
          payload: clone(data.payload ?? {}),
          aiSnapshot: data.aiSnapshot ?? null,
          manualFields: data.manualFields ?? [],
          verification: data.verification ?? null,
          finalizedIngredientId: data.finalizedIngredientId ?? null,
          finalizedNutritionFoodId:
            data.finalizedNutritionFoodId ?? null,
          finalizedEvidenceId: data.finalizedEvidenceId ?? null,
          finalizedAt: data.finalizedAt ?? null,
          createdAt: data.createdAt ?? now,
          updatedAt: data.updatedAt ?? now,
        };
        rows.set(row.id, row);
        return clone(row);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const row = [...rows.values()].find((candidate) =>
          matches(candidate, where),
        );
        return row ? clone(row) : null;
      }),
      findMany: jest.fn(async ({ where, orderBy, select }: any) => {
        const list = [...rows.values()].filter((row) =>
          matches(row, where),
        );
        if (orderBy?.updatedAt === 'desc') {
          list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        }
        return list.map((row) => project(row, select));
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if (!row) {
          throw new Error(`No SupplementCreationDraft found for ${where.id}`);
        }
        Object.assign(row, data, { updatedAt: new Date() });
        return clone(row);
      }),
    },
  };

  return { client, seed, rows };
}

describe('SupplementDraftService', () => {
  let service: SupplementDraftService;
  let fake: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    fake = createPrismaMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SupplementDraftService,
        { provide: PrismaService, useValue: fake.client },
      ],
    }).compile();

    service = moduleRef.get(SupplementDraftService);
  });

  it('create 落一条本人 DRAFT 空草稿，返回完成度 0/15 的视图', async () => {
    const view = await service.create('u1');

    expect(fake.client.supplementCreationDraft.create).toHaveBeenCalledTimes(1);
    const [{ data }] =
      fake.client.supplementCreationDraft.create.mock.calls[0];
    expect(data.createdBy).toBe('u1');
    expect(data.status).toBe('DRAFT');
    expect(data.name).toBe('');
    expect(data.manualFields).toEqual([]);
    expect(data.payload).toEqual(emptySupplementDraftPayload());

    expect(view.id).toBeTruthy();
    expect(view.createdBy).toBe('u1');
    expect(view.status).toBe('DRAFT');
    expect(view.payload).toEqual(emptySupplementDraftPayload());
    expect(view.completeness.filledRequired).toBe(0);
    expect(view.completeness.totalRequired).toBe(15);
    expect(view.completeness.missing).toContain('name');
  });

  it('list 只查本人的 DRAFT、按 updatedAt 倒序，摘要不带 payload', async () => {
    fake.seed({
      id: 'draft-old',
      name: '旧鱼油',
      payload: { basic: { name: '旧鱼油' } },
      updatedAt: new Date('2026-11-20T10:00:00.000Z'),
    });
    const newer = fake.seed({
      id: 'draft-new',
      name: '新钙片',
      payload: { basic: { name: '新钙片' } },
      updatedAt: new Date('2026-11-21T12:00:00.000Z'),
    });
    fake.seed({
      id: 'draft-finalized',
      status: 'FINALIZED',
      updatedAt: new Date('2026-11-22T10:00:00.000Z'),
    });
    fake.seed({
      id: 'draft-other-user',
      createdBy: 'u2',
      updatedAt: new Date('2026-11-23T10:00:00.000Z'),
    });

    const list = await service.list('u1');

    expect(fake.client.supplementCreationDraft.findMany).toHaveBeenCalledWith({
      where: { createdBy: 'u1', status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, updatedAt: true, payload: true },
    });
    expect(list.map((item) => item.id)).toEqual(['draft-new', 'draft-old']);
    expect(list[0].name).toBe('新钙片');
    expect(list[0].updatedAt).toEqual(newer.updatedAt);
    expect(list[0].completeness.filledRequired).toBe(1);
    expect(list[0].completeness.totalRequired).toBe(15);
    expect('payload' in list[0]).toBe(false);
  });

  it('get 按 { id, createdBy } 查；别人的草稿 404', async () => {
    const draft = fake.seed({ id: 'draft-mine' });

    const view = await service.get(draft.id, 'u1');
    expect(view.id).toBe('draft-mine');
    expect(
      fake.client.supplementCreationDraft.findFirst,
    ).toHaveBeenCalledWith({
      where: { id: 'draft-mine', createdBy: 'u1' },
    });

    await expect(service.get(draft.id, 'u2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.get(draft.id, 'u2')).rejects.toThrow('草稿不存在');
  });

  it('update 深归一化 payload，只写 name/payload/manualFields/aiSnapshot', async () => {
    const draft = fake.seed({ id: 'draft-update' });

    const view = await service.update(draft.id, 'u1', {
      name: '鱼油软胶囊',
      payload: {
        basic: { name: '鱼油', servingUnitsPerDose: '2' },
        nutrition: {
          servingNutrients: { 'fattyAcids.epa': 650, bad: 'not-a-number' },
        },
        unknownSection: { should: 'be dropped' },
      },
      manualFields: [
        'basic.name',
        'nutrition.servingNutrients.fattyAcids.epa',
      ],
      aiSnapshot: { status: 'DONE' },
      // 故意夹带不允许改的字段：服务端必须忽略，而不是透传给 Prisma。
      status: 'FINALIZED',
      finalizedIngredientId: 'ing-should-not-be-written',
    } as any);

    expect(fake.client.supplementCreationDraft.update).toHaveBeenCalledTimes(1);
    const [{ where, data }] =
      fake.client.supplementCreationDraft.update.mock.calls[0];
    expect(where).toEqual({ id: 'draft-update' });
    expect(data).toEqual({
      name: '鱼油软胶囊',
      payload: expect.objectContaining({
        basic: expect.objectContaining({
          name: '鱼油',
          servingUnitsPerDose: null,
        }),
        nutrition: expect.objectContaining({
          servingNutrients: { 'fattyAcids.epa': 650 },
        }),
      }),
      manualFields: [
        'basic.name',
        'nutrition.servingNutrients.fattyAcids.epa',
      ],
      aiSnapshot: { status: 'DONE' },
    });
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('finalizedIngredientId');
    expect(data).not.toHaveProperty('finalizedAt');

    expect(view.status).toBe('DRAFT');
    expect(view.name).toBe('鱼油软胶囊');
    expect(view.payload.basic.name).toBe('鱼油');
    expect(view.payload.basic.servingUnitsPerDose).toBeNull();
    expect(view.payload.nutrition.servingNutrients).toEqual({
      'fattyAcids.epa': 650,
    });
    expect(view.payload).not.toHaveProperty('unknownSection');
  });

  it('update 在 expectedUpdatedAt 过期时 409，且不写库', async () => {
    const draft = fake.seed({
      id: 'draft-stale',
      updatedAt: new Date('2026-11-21T10:00:00.000Z'),
    });

    await expect(
      service.update(draft.id, 'u1', {
        name: '新名字',
        expectedUpdatedAt: '2026-11-21T09:59:59.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update(draft.id, 'u1', {
        name: '新名字',
        expectedUpdatedAt: '2026-11-21T09:59:59.000Z',
      }),
    ).rejects.toThrow('草稿已被更新，请刷新后再试');
    expect(fake.client.supplementCreationDraft.update).not.toHaveBeenCalled();

    const saved = await service.update(draft.id, 'u1', {
      name: '新名字',
      expectedUpdatedAt: draft.updatedAt.toISOString(),
    });
    expect(saved.name).toBe('新名字');
  });

  it('update/discard 对别人的草稿 404', async () => {
    fake.seed({ id: 'draft-other', createdBy: 'u2' });

    await expect(
      service.update('draft-other', 'u1', { name: '偷改' }),
    ).rejects.toThrow('草稿不存在');
    await expect(service.discard('draft-other', 'u1')).rejects.toThrow(
      '草稿不存在',
    );
  });

  it('discard 只把 DRAFT 改成 DISCARDED，重复放弃幂等', async () => {
    const draft = fake.seed({ id: 'draft-discard' });

    const first = await service.discard(draft.id, 'u1');
    expect(first.status).toBe('DISCARDED');
    expect(fake.client.supplementCreationDraft.update).toHaveBeenCalledTimes(1);
    expect(
      fake.client.supplementCreationDraft.update,
    ).toHaveBeenCalledWith({
      where: { id: draft.id },
      data: { status: 'DISCARDED' },
    });

    const second = await service.discard(draft.id, 'u1');
    expect(second.status).toBe('DISCARDED');
    expect(fake.client.supplementCreationDraft.update).toHaveBeenCalledTimes(1);
  });

  it('已写入的草稿不能放弃', async () => {
    const draft = fake.seed({ id: 'draft-done', status: 'FINALIZED' });

    await expect(service.discard(draft.id, 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(fake.client.supplementCreationDraft.update).not.toHaveBeenCalled();
  });

  it('markFinalized 在事务里写 FINALIZED、三个正式 id 与 finalizedAt', async () => {
    const draft = fake.seed({ id: 'draft-finalize' });
    const ids: SupplementDraftFinalizedIds = {
      ingredientId: 'ing-1',
      nutritionFoodId: 'nf-1',
      evidenceId: 'ev-1',
    };

    await service.markFinalized(
      fake.client as unknown as Prisma.TransactionClient,
      draft.id,
      ids,
    );

    const [{ where, data }] =
      fake.client.supplementCreationDraft.update.mock.calls[0];
    expect(where).toEqual({ id: 'draft-finalize' });
    expect(data.status).toBe('FINALIZED');
    expect(data.finalizedIngredientId).toBe('ing-1');
    expect(data.finalizedNutritionFoodId).toBe('nf-1');
    expect(data.finalizedEvidenceId).toBe('ev-1');
    expect(data.finalizedAt).toBeInstanceOf(Date);

    const row = fake.rows.get('draft-finalize');
    expect(row?.status).toBe('FINALIZED');
    expect(row?.finalizedIngredientId).toBe('ing-1');
    expect(row?.finalizedNutritionFoodId).toBe('nf-1');
    expect(row?.finalizedEvidenceId).toBe('ev-1');
    expect(row?.finalizedAt).toBeInstanceOf(Date);
  });

  it('saveVerification 只给本人 FINALIZED 草稿写核验报告', async () => {
    const draft = fake.seed({ id: 'draft-verified', status: 'FINALIZED' });
    const report = {
      ok: true,
      checkedAt: '2026-11-21T10:00:00.000Z',
      fields: [],
      features: [],
    };

    const view = await service.saveVerification(draft.id, 'u1', report);

    expect(
      fake.client.supplementCreationDraft.findFirst,
    ).toHaveBeenCalledWith({
      where: { id: draft.id, createdBy: 'u1', status: 'FINALIZED' },
    });
    expect(
      fake.client.supplementCreationDraft.update,
    ).toHaveBeenCalledWith({
      where: { id: draft.id },
      data: { verification: report },
    });
    expect(view.verification).toEqual(report);
  });

  it('saveVerification 对不存在/非本人/非 FINALIZED 的草稿 404', async () => {
    fake.seed({ id: 'draft-in-progress' });
    fake.seed({
      id: 'draft-other-finalized',
      createdBy: 'u2',
      status: 'FINALIZED',
    });

    for (const id of [
      'draft-missing',
      'draft-in-progress',
      'draft-other-finalized',
    ]) {
      await expect(
        service.saveVerification(id, 'u1', { ok: true }),
      ).rejects.toThrow('草稿不存在');
    }
    expect(fake.client.supplementCreationDraft.update).not.toHaveBeenCalled();
  });
});
