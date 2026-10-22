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
 * 内存版 Prisma 假实现：只覆盖草稿服务用到的三个动作。
 * 读写都做一次 JSON 深拷贝 —— 真库里 payload 是 JSONB，不会共享引用，
 * 这样测试才能真的证明「读-合并-写回」没有覆盖掉别的键。
 */
function createPrismaMock() {
  const rows = new Map<string, DraftRow>();
  let sequence = 0;
  const clone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;

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
      update: jest.fn(async ({ where, data }: any) => {
        const existing = rows.get(where.id);
        if (!existing) {
          throw new Error(`Record to update not found: ${where.id}`);
        }
        const next: DraftRow = {
          ...existing,
          ...clone(data),
          updatedAt: new Date(),
        };
        rows.set(next.id, next);
        return clone(next);
      }),
    },
  };
  client.$transaction = jest.fn(async (callback: any) => callback(client));
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

  it('patch 只合并传入的 payload 片段，不覆盖其它键', async () => {
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

    await service.patch(created.id, 'SOURCES', { candidates: [row] });
    await service.patch(created.id, 'PROFILE', { intake: card });

    const fresh = await service.get(created.id);
    expect(fresh.step).toBe('PROFILE');
    expect(fresh.payload.candidates).toHaveLength(1);
    expect(fresh.payload.candidates?.[0]).toEqual(row);
    expect(fresh.payload.intake).toEqual(card);
  });

  it('get 找不到草稿时抛 NotFoundException', async () => {
    await expect(service.get('missing-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
