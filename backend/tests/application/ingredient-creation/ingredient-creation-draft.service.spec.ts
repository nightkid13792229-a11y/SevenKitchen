import { NotFoundException } from '@nestjs/common';
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
  const clone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

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
          createdAt: now,
          updatedAt: now,
        };
        rows.set(row.id, row);
        return clone(row);
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = rows.get(where.id);
        return row ? clone(row) : null;
      }),
    },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');

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
        const fragment = JSON.parse(values[0] as string) as Record<string, unknown>;
        const step = values[1] as string;
        const row = rows.get(values[2] as string);
        if (!row) {
          return [];
        }
        row.payload = { ...(row.payload as object), ...fragment };
        row.step = step;
        row.updatedAt = new Date();
        return [toRawRow(row)];
      }

      throw new Error(`Unexpected raw SQL in test: ${sql}`);
    }),
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
});
