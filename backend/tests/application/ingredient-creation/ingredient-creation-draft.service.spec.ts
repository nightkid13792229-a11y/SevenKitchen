import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IngredientCreationDraftService } from '../../../src/application/ingredient-creation/ingredient-creation-draft.service';
import type {
  CandidateRow,
  IntakeCard,
} from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

type DraftRow = {
  id: string;
  name: string;
  type: string;
  step: string;
  payload: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 内存版 Prisma 假实现：只覆盖草稿服务用到的动作。
 *
 * `$queryRaw` 按 SQL 片段模拟真库的 JSONB 语义（`payload || $1` 合并、
 * `proposalHistory` 追加），用来验证服务发出的语句设计对不对；
 * 断言仍然只看「发了什么语句」，不去断言数据库行为。
 */
function createPrismaMock() {
  const rows = new Map<string, DraftRow>();
  let sequence = 0;
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  const toRawRow = (row: DraftRow) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    step: row.step,
    payload: clone(row.payload),
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  });

  const readIntakeNameEn = (payload: unknown): string | null => {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const intake = (payload as Record<string, unknown>).intake;
    if (!intake || typeof intake !== 'object') {
      return null;
    }
    const nameEn = (intake as Record<string, unknown>).nameEn;
    return typeof nameEn === 'string' ? nameEn : null;
  };

  const client: any = {
    ingredientCreationDraft: {
      create: jest.fn(async ({ data }: any) => {
        const now = new Date();
        const row: DraftRow = {
          id: data.id ?? `draft-${++sequence}`,
          name: data.name,
          type: data.type,
          step: data.step,
          payload: clone(data.payload ?? {}),
          createdBy: data.createdBy,
          createdAt: data.createdAt ?? now,
          updatedAt: data.updatedAt ?? now,
        };
        rows.set(row.id, row);
        return clone(row);
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = rows.get(where.id);
        return row ? clone(row) : null;
      }),
    },
    $queryRaw: jest.fn(
      async (strings: TemplateStringsArray, ...values: any[]) => {
        const sql = strings.join('?');

        // 未完成草稿列表：只查摘要列 + payload 里的 intake.nameEn，不取整份 payload。
        if (sql.includes('intake_name_en')) {
          const createdBy = values[0] as string;
          const limit = Number(values[1]);
          return [...rows.values()]
            .filter(
              (row) => row.createdBy === createdBy && row.step !== 'COMMIT',
            )
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, limit)
            .map((row) => ({
              id: row.id,
              name: row.name,
              step: row.step,
              updated_at: row.updatedAt,
              intake_name_en: readIntakeNameEn(row.payload),
            }));
        }

        if (sql.includes('proposalHistory')) {
          const entries = JSON.parse(values[0] as string) as unknown[];
          const row = rows.get(values[1] as string);
          if (!row) {
            return [];
          }
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          const history = Array.isArray(payload.proposalHistory)
            ? (payload.proposalHistory as unknown[])
            : [];
          row.payload = {
            ...payload,
            proposalHistory: [...history, ...entries],
          };
          row.updatedAt = new Date();
          return [{ id: row.id }];
        }

        if (sql.includes('payload ||')) {
          const fragment = JSON.parse(values[0] as string) as Record<
            string,
            unknown
          >;
          const step = values[1] as string;
          const row = rows.get(values[2] as string);
          if (!row) {
            return [];
          }
          // 真库用 `AND step <> 'COMMIT'` 把「已提交草稿只读」放进同一条语句。
          if (sql.includes("step <> 'COMMIT'") && row.step === 'COMMIT') {
            return [];
          }
          row.payload = { ...(row.payload as object), ...fragment };
          row.step = step;
          row.updatedAt = new Date();
          return [toRawRow(row)];
        }

        throw new Error(`Unexpected raw SQL in test: ${sql}`);
      },
    ),
  };
  return client;
}

describe('IngredientCreationDraftService', () => {
  let service: IngredientCreationDraftService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        IngredientCreationDraftService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(IngredientCreationDraftService);
  });

  /**
   * 直接经 Prisma 假实现落一行草稿，方便构造「别人的 / 已提交 / 不同更新时间」
   * 这些列表场景；走 create 而不是改 Map，保持与真实写入同一入口。
   */
  async function seedDraft(overrides: {
    id: string;
    name?: string;
    step?: string;
    createdBy?: string;
    createdAt?: Date;
    updatedAt?: Date;
    payload?: Record<string, unknown>;
  }) {
    await prisma.ingredientCreationDraft.create({
      data: {
        id: overrides.id,
        name: overrides.name ?? '鸡肝',
        type: 'FOOD',
        step: overrides.step ?? 'INTAKE',
        payload: overrides.payload ?? {},
        createdBy: overrides.createdBy ?? 'u1',
        createdAt: overrides.createdAt,
        updatedAt: overrides.updatedAt,
      },
    });
  }

  it('create 落一条 INTAKE 草稿，并按 name 原样保存', async () => {
    const draft = await service.create({
      name: '鸡肝',
      type: 'FOOD',
      createdBy: 'u1',
    });

    expect(draft.step).toBe('INTAKE');
    expect(draft.name).toBe('鸡肝');
    expect(draft.type).toBe('FOOD');
    expect(draft.createdBy).toBe('u1');
    expect(draft.payload).toEqual({});
  });

  it('patch 用一条 UPDATE 原子合并 payload，不做读改写', async () => {
    const created = await service.create({
      name: '鸡肝',
      type: 'FOOD',
      createdBy: 'u1',
    });

    const card: IntakeCard = {
      name: '鸡肝',
      nameEn: 'Chicken liver',
      aliases: ['鸡肝'],
      confusables: ['鸡心'],
      category: 'MEAT_ORGAN',
      requiredStates: ['RAW'],
      suggestedStates: ['COOKED'],
    };
    const row: CandidateRow = {
      sourceRecordId: 'src-usda-05025',
      sourceType: 'USDA',
      foodName: 'Chicken, liver, raw',
      foodNameEn: null,
      preparationState: 'RAW',
      cookingMethod: null,
      coveragePercent: 82,
      missingFields: ['vitamin_b12'],
      matchScore: 0.91,
      notes: [],
    };

    const afterFirst = await service.patch(created.id, 'SOURCES', {
      candidates: [row],
    });

    // 设计断言：一次 patch = 一条原子 UPDATE，没有「先读后写」
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [firstSql] = prisma.$queryRaw.mock.calls[0];
    expect((firstSql as string[]).join('?')).toContain('payload ||');
    expect(prisma.ingredientCreationDraft.findUnique).not.toHaveBeenCalled();

    // $queryRaw 返回 snake_case 原始行，服务要映射回驼峰结构
    expect(afterFirst.step).toBe('SOURCES');
    expect(afterFirst.createdBy).toBe('u1');
    expect(afterFirst.payload.candidates).toHaveLength(1);

    await service.patch(created.id, 'PROFILE', { intake: card });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    const fresh = await service.get(created.id);
    expect(fresh.step).toBe('PROFILE');
    expect(fresh.payload.candidates).toHaveLength(1);
    expect(fresh.payload.candidates?.[0]).toEqual(row);
    expect(fresh.payload.intake).toEqual(card);
  });

  it('patch 更新到不存在的草稿时抛 NotFoundException', async () => {
    await expect(
      service.patch('missing-draft', 'SOURCES', { candidates: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('appendProposal 用一条语句原子追加提案快照，不覆盖历史', async () => {
    const created = await service.create({
      name: '鸡肝',
      type: 'FOOD',
      createdBy: 'u1',
    });

    await service.appendProposal(
      created.id,
      { candidates: ['src-usda-05025'] },
      'CANDIDATES',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    await service.appendProposal(
      created.id,
      { primarySourceRecordId: 'src-usda-05025' },
      'MERGE',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    const [firstSql, firstJson] = prisma.$queryRaw.mock.calls[0];
    expect((firstSql as string[]).join('?')).toContain('proposalHistory');
    const firstEntries = JSON.parse(firstJson as string) as Array<
      Record<string, unknown>
    >;
    expect(firstEntries).toHaveLength(1);
    expect(firstEntries[0]).toMatchObject({ kind: 'CANDIDATES' });
    expect(typeof firstEntries[0].createdAt).toBe('string');

    const fresh = await service.get(created.id);
    expect(fresh.payload.proposalHistory).toHaveLength(2);
    expect(fresh.payload.proposalHistory?.map((entry) => entry.kind)).toEqual([
      'CANDIDATES',
      'MERGE',
    ]);
  });

  it('patch 兜底剥掉 proposalHistory，不允许覆盖 AI 提案历史', async () => {
    const created = await service.create({
      name: '鸡肝',
      type: 'FOOD',
      createdBy: 'u1',
    });

    await service.patch(created.id, 'PROFILE', {
      proposalHistory: [{ kind: 'MERGE', createdAt: '2026-10-22T00:00:00Z' }],
    });

    const [, serializedPayload] = prisma.$queryRaw.mock.calls[0];
    expect(JSON.parse(serializedPayload as string)).toEqual({});

    const fresh = await service.get(created.id);
    expect(fresh.payload.proposalHistory).toBeUndefined();
  });

  it('patch 兜底剥掉 aiBaseline，只允许 AI 写工具更新它', async () => {
    const created = await service.create({
      name: '鸡肝',
      type: 'FOOD',
      createdBy: 'u1',
    });

    await service.patch(created.id, 'PROFILE', {
      aiBaseline: {
        profiles: { 'src-1': { 'macros.crudeProtein': { value: 99, unit: 'g', at: 'x' } } },
        ingredient: {},
        updatedAt: '2026-11-21T00:00:00.000Z',
      },
      intake: { name: '鸡肝' },
    } as never);

    const [, serializedPayload] = prisma.$queryRaw.mock.calls[0];
    expect(JSON.parse(serializedPayload as string)).toEqual({
      intake: { name: '鸡肝' },
    });

    const fresh = await service.get(created.id);
    expect(fresh.payload.aiBaseline).toBeUndefined();
  });

  it('已提交的草稿不能再 patch：409，且 payload 保持原样', async () => {
    await seedDraft({
      id: 'draft-committed',
      step: 'COMMIT',
      payload: { intake: { name: '鸡肝' } },
    });

    await expect(
      service.patch('draft-committed', 'PROFILE', {
        intake: { name: '改名' },
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);

    const fresh = await service.get('draft-committed');
    expect(fresh.step).toBe('COMMIT');
    expect(fresh.payload.intake).toEqual({ name: '鸡肝' });
  });

  it('appendProposal 找不到草稿时抛 NotFoundException', async () => {
    await expect(
      service.appendProposal('missing-draft', {}, 'INTAKE'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('get 找不到草稿时抛 NotFoundException', async () => {
    await expect(service.get('missing-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('get 原样返回完整 payload：原料卡、营养档案、证据与终检结果', async () => {
    const payload = {
      ingredient: {
        name: '鸡肝',
        nameEn: 'Chicken liver',
        type: 'FOOD',
        category: 'MEAT_ORGAN',
        baseUnit: 'G',
        unitDisplayLabel: '克',
        cfctClass: '禽肉类及制品',
        edibleYieldRate: 0.95,
        manualFields: ['edibleYieldPercent'],
      },
      profiles: [
        {
          preparationState: 'RAW',
          sourceRecordId: 'src-raw',
          entries: [
            {
              fieldPath: 'macros.crudeProtein',
              finalValue: 20.4,
              unit: 'g',
              status: 'DIRECT',
              sourceRecordId: 'src-raw',
              sourceValue: 20.4,
              sourceUnit: 'g',
              formula: null,
              confirmedBy: null,
              confirmedAt: null,
            },
          ],
          notes: null,
        },
      ],
      evidence: [],
      checks: { blocking: [], exceptionable: [], warnings: [] },
    };
    await seedDraft({ id: 'review-draft', step: 'INGREDIENT', payload });

    const draft = await service.get('review-draft');

    expect(draft.step).toBe('INGREDIENT');
    // 审核页靠这份 payload 渲染原料卡与营养档案，四个键一个都不能少。
    expect(draft.payload).toEqual(payload);
    expect(draft.payload.ingredient?.manualFields).toEqual([
      'edibleYieldPercent',
    ]);
    expect(draft.payload.profiles?.[0]?.entries[0]?.finalValue).toBe(20.4);
    expect(draft.payload.checks).toEqual({
      blocking: [],
      exceptionable: [],
      warnings: [],
    });
  });

  describe('listUnfinished', () => {
    it('只返回当前登录人的未完成草稿', async () => {
      await seedDraft({ id: 'mine', createdBy: 'u1' });
      await seedDraft({ id: 'someone-else', createdBy: 'u2' });

      const list = await service.listUnfinished('u1');

      expect(list.map((item) => item.draftId)).toEqual(['mine']);
    });

    it('已提交（COMMIT）的草稿不出现在列表里', async () => {
      await seedDraft({ id: 'unfinished', step: 'SOURCES' });
      await seedDraft({ id: 'committed', step: 'COMMIT' });

      const list = await service.listUnfinished('u1');

      expect(list.map((item) => item.draftId)).toEqual(['unfinished']);
    });

    it('按 updatedAt 倒序返回', async () => {
      await seedDraft({
        id: 'old',
        updatedAt: new Date('2026-10-20T00:00:00.000Z'),
      });
      await seedDraft({
        id: 'newest',
        updatedAt: new Date('2026-10-22T00:00:00.000Z'),
      });
      await seedDraft({
        id: 'middle',
        updatedAt: new Date('2026-10-21T00:00:00.000Z'),
      });

      const list = await service.listUnfinished('u1');

      expect(list.map((item) => item.draftId)).toEqual([
        'newest',
        'middle',
        'old',
      ]);
    });

    it('列表只返回摘要字段与 intake.nameEn，不返回整份 payload', async () => {
      const updatedAt = new Date('2026-10-22T03:04:05.000Z');
      await seedDraft({
        id: 'draft-summary',
        name: '鸡肝',
        step: 'PROFILE',
        updatedAt,
        payload: {
          intake: { nameEn: 'Chicken liver', aliases: ['鸡肝'] },
          proposalHistory: [{ kind: 'MERGE', createdAt: '2026-10-22' }],
        },
      });

      const [item] = await service.listUnfinished('u1');

      expect(item).toEqual({
        draftId: 'draft-summary',
        name: '鸡肝',
        step: 'PROFILE',
        updatedAt,
        intake: { nameEn: 'Chicken liver' },
      });
      expect(item).not.toHaveProperty('payload');
    });

    it('payload 里没有 intake.nameEn 时 intake 返回 null', async () => {
      await seedDraft({ id: 'no-intake', payload: {} });

      const [item] = await service.listUnfinished('u1');

      expect(item?.intake).toBeNull();
    });

    it('查询按登录人过滤、排除 COMMIT、倒序且默认最多 20 条', async () => {
      for (let index = 0; index < 25; index += 1) {
        await seedDraft({
          id: `draft-${index}`,
          updatedAt: new Date(2026, 0, 1, 0, 0, index),
        });
      }

      const list = await service.listUnfinished('u1');

      expect(list).toHaveLength(20);
      const [strings, ...params] = prisma.$queryRaw.mock.calls[0];
      const sql = (strings as string[]).join('?');
      expect(sql).toContain('created_by =');
      expect(sql).toContain("step <> 'COMMIT'");
      expect(sql).toContain('ORDER BY updated_at DESC');
      expect(sql).toContain('LIMIT');
      expect(params).toEqual(['u1', 20]);
    });
  });
});


describe('IngredientCreationDraftService · remove（放弃草稿）', () => {
  const baseRow = {
    id: 'draft-1',
    name: '鸡肝',
    type: 'FOOD',
    step: 'PROFILE' as string,
    payload: {},
    createdBy: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  /**
   * 条件删除的假实现：只有 `where` 全命中才会删掉那一行。
   *
   * 真实语义靠 `deleteMany({ where: { id, createdBy, step: { not: 'COMMIT' } } })`
   * 一条语句保证；这里按 where 逐条判断，测试才能证明「条件确实被推给了数据库」。
   */
  function makeService(row: Record<string, unknown>) {
    const state = { row: { ...row } as Record<string, unknown> | null };
    const prisma: any = {
      ingredientCreationDraft: {
        findUnique: jest.fn(async () => state.row),
        deleteMany: jest.fn(async ({ where }: any) => {
          const current = state.row as Record<string, unknown> | null;
          if (!current || where?.id !== current.id) {
            return { count: 0 };
          }
          if (where?.createdBy && where.createdBy !== current.createdBy) {
            return { count: 0 };
          }
          if (where?.step?.not === 'COMMIT' && current.step === 'COMMIT') {
            return { count: 0 };
          }
          state.row = null;
          return { count: 1 };
        }),
      },
      ingredientCheckRun: {
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    return { service: new IngredientCreationDraftService(prisma), prisma };
  }

  it('删除自己的未提交草稿，并清掉它的核验报告', async () => {
    const { service, prisma } = makeService(baseRow);

    await service.remove('draft-1', 'admin-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // 「是谁的 / 有没有提交」和删除放在同一条语句里，不给并发提交留窗口。
    expect(prisma.ingredientCreationDraft.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-1',
        createdBy: 'admin-1',
        step: { not: 'COMMIT' },
      },
    });
    expect(prisma.ingredientCheckRun.deleteMany).toHaveBeenCalledWith({
      where: { draftId: 'draft-1' },
    });
  });

  it('别人的草稿不能删，也不清任何核验报告', async () => {
    const { service, prisma } = makeService(baseRow);

    await expect(service.remove('draft-1', 'other')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.ingredientCheckRun.deleteMany).not.toHaveBeenCalled();
  });

  it('已提交草稿不能删（追溯依据）', async () => {
    const { service, prisma } = makeService({ ...baseRow, step: 'COMMIT' });

    await expect(service.remove('draft-1', 'admin-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.ingredientCheckRun.deleteMany).not.toHaveBeenCalled();
  });
});
