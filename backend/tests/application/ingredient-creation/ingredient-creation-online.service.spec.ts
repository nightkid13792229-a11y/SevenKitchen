import { Test, type TestingModule } from '@nestjs/testing';
import {
  ONLINE_FALLBACK_DATA_TYPE,
  IngredientCreationOnlineService,
  orderCandidatesLocalFirst,
} from '../../../src/application/ingredient-creation/ingredient-creation-online.service';
import { TrustedNutritionWebSearchService } from '../../../src/application/nutrition-governance/trusted-nutrition-web-search.service';
import type { CandidateRow } from '../../../src/application/ingredient-creation/ingredient-creation.types';
import { createEmptyNutritionProfile } from '../../../src/domain/ingredient/nutrition-profile.utils';
import type { NutritionSourceInput } from '../../../src/domain/nutrition-governance/nutrition-governance.types';
import { PrismaService } from '../../../src/infrastructure/prisma.service';

const WHITELIST_URL =
  'https://www.foodstandards.gov.au/nutrition/quail-egg.csv';
const NON_WHITELIST_URL = 'https://evil.example.com/quail-egg.csv';

const NUTRITION_CSV = [
  'Food Name,Energy (kcal),Water (g),Protein (g),Fat (g),Calcium (mg)',
  'Quail egg raw,158,74.3,13.1,11.1,64',
].join('\n');

const FIXED_FETCHED_AT = '2026-10-23T00:00:00.000Z';

function buildNutritionProfile() {
  const profile = createEmptyNutritionProfile();
  profile.macros.energyKcal = 158;
  profile.macros.moisture = 74.3;
  profile.macros.crudeProtein = 13.1;
  profile.macros.crudeFat = 11.1;
  profile.minerals.calcium = 64;
  return profile;
}

function buildTrustedSource(
  overrides: Partial<NutritionSourceInput> = {},
): NutritionSourceInput {
  return {
    sourceType: 'MANUAL',
    externalId: 'trusted-web-quail-egg',
    sourceTitle: 'Trusted web source: foodstandards.gov.au',
    foodName: 'Quail egg raw',
    foodNameEn: null,
    dataType: 'Trusted web table',
    category: 'Trusted online source',
    sourceDetail: {
      provider: 'Trusted whitelist web source',
      trustedDomain: 'foodstandards.gov.au',
      url: WHITELIST_URL,
      discoveryMode: 'configured-url',
      extractionMode: 'trusted-web-table',
      fetchedAt: FIXED_FETCHED_AT,
      ingredientName: '鹌鹑蛋',
    },
    rawData: {
      headers: ['Food Name', 'Energy (kcal)'],
      row: ['Quail egg raw', '158'],
    },
    normalizedNutrition: buildNutritionProfile(),
    ...overrides,
  };
}

interface PersistedRow {
  id: string;
  sourceType: string;
  sourceKey: string;
  sourceTitle: string;
  sourceDetail: unknown;
  foodName: string;
  foodNameEn: string | null;
  dataType: string | null;
  category: string | null;
  rawData: unknown;
  normalizedNutrition: unknown;
  status: 'ACTIVE' | 'DEPRECATED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 内存版 Prisma：只覆盖线上兜底服务用到的 `findMany`（按 sourceKey 前缀取缓存）
 * 与 `upsert`（按 sourceType + sourceKey 落库）。
 */
function createPrismaMock() {
  const rows: PersistedRow[] = [];
  let idSeq = 0;

  const findMany = jest.fn(async (args: any) => {
    const where = args?.where ?? {};
    return rows
      .filter((row) => {
        if (where.status && row.status !== where.status) return false;
        if (
          where.sourceKey?.startsWith &&
          !row.sourceKey.startsWith(where.sourceKey.startsWith)
        ) {
          return false;
        }
        return true;
      })
      .map((row) => {
        const select = args?.select;
        if (!select) return { ...row };
        return Object.fromEntries(
          Object.keys(select)
            .filter((key) => key in row)
            .map((key) => [
              key,
              (row as unknown as Record<string, unknown>)[key],
            ]),
        );
      });
  });

  const upsert = jest.fn(async (args: any) => {
    const { sourceType, sourceKey } = args.where.sourceType_sourceKey;
    const existing = rows.find(
      (row) => row.sourceType === sourceType && row.sourceKey === sourceKey,
    );
    if (existing) {
      Object.assign(existing, args.update, { updatedAt: new Date() });
      return { ...existing };
    }

    idSeq += 1;
    const created: PersistedRow = {
      id: `src-online-${idSeq}`,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...args.create,
    };
    rows.push(created);
    return { ...created };
  });

  return {
    nutritionSourceRecord: { findMany, upsert },
    __rows: rows,
  };
}

async function createService(
  trusted: Pick<TrustedNutritionWebSearchService, 'search' | 'searchWithReport'>,
) {
  const prisma = createPrismaMock();
  const moduleRef: TestingModule = await Test.createTestingModule({
    providers: [
      IngredientCreationOnlineService,
      { provide: PrismaService, useValue: prisma },
      { provide: TrustedNutritionWebSearchService, useValue: trusted },
    ],
  }).compile();

  return {
    service: moduleRef.get(IngredientCreationOnlineService),
    prisma,
  };
}

function localCandidate(): CandidateRow {
  return {
    sourceRecordId: 'local-1',
    sourceType: 'USDA',
    foodName: 'Quail egg, raw',
    foodNameEn: 'Quail egg, raw',
    preparationState: 'RAW',
    cookingMethod: null,
    coveragePercent: 80,
    missingFields: [],
    matchScore: 0.9,
    notes: [],
  };
}

function onlineCandidate(): CandidateRow & {
  sourceUrl: string;
  fetchedAt: string;
  isOnline: true;
} {
  return {
    sourceRecordId: 'online-1',
    sourceType: 'MANUAL',
    foodName: 'Quail egg raw',
    foodNameEn: null,
    preparationState: 'RAW',
    cookingMethod: null,
    coveragePercent: 60,
    missingFields: ['vitaminD'],
    matchScore: 0.55,
    notes: [],
    sourceUrl: WHITELIST_URL,
    fetchedAt: FIXED_FETCHED_AT,
    isOnline: true,
  };
}

describe('IngredientCreationOnlineService', () => {
  const originalFetch = global.fetch;
  const originalTrustedUrls = process.env.NUTRITION_TRUSTED_SOURCE_URLS;
  const originalWebSearchEnabled =
    process.env.NUTRITION_TRUSTED_WEB_SEARCH_ENABLED;

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv('NUTRITION_TRUSTED_SOURCE_URLS', originalTrustedUrls);
    restoreEnv(
      'NUTRITION_TRUSTED_WEB_SEARCH_ENABLED',
      originalWebSearchEnabled,
    );
    jest.restoreAllMocks();
  });

  it('只在白名单主机抓取，非白名单 URL 被拒并出现在 rejectedHosts', async () => {
    process.env.NUTRITION_TRUSTED_SOURCE_URLS = [
      WHITELIST_URL,
      NON_WHITELIST_URL,
    ].join('\n');
    process.env.NUTRITION_TRUSTED_WEB_SEARCH_ENABLED = 'false';
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: jest.fn().mockResolvedValue(NUTRITION_CSV),
    })) as unknown as typeof global.fetch;

    const { service } = await createService(
      new TrustedNutritionWebSearchService(),
    );
    const result = await service.searchOnline({
      name: '鹌鹑蛋',
      nameEn: 'quail egg',
      state: 'RAW',
    });

    expect(result.rejectedHosts).toEqual(['evil.example.com']);
    expect(result.attemptedHosts).toContain('foodstandards.gov.au');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      WHITELIST_URL,
      expect.any(Object),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].foodName).toBe('Quail egg raw');
  });

  it('抓到的数据落成 nutrition_source_record（保留网址与抓取时间，dataType 标明线上）', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest.fn().mockResolvedValue({
        sources: [buildTrustedSource()],
        attemptedHosts: ['foodstandards.gov.au'],
        rejectedHosts: [],
      }),
    };
    const { service, prisma } = await createService(trusted);

    const result = await service.searchOnline({
      name: '鹌鹑蛋',
      nameEn: 'quail egg',
      state: 'RAW',
    });

    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sourceType_sourceKey: {
            sourceType: 'MANUAL',
            sourceKey: expect.stringContaining('online-fallback'),
          },
        },
        create: expect.objectContaining({
          sourceType: 'MANUAL',
          foodName: 'Quail egg raw',
          dataType: ONLINE_FALLBACK_DATA_TYPE,
          status: 'ACTIVE',
          sourceDetail: expect.objectContaining({
            url: WHITELIST_URL,
            fetchedAt: FIXED_FETCHED_AT,
            isOnlineFallback: true,
            onlineQuery: {
              name: '鹌鹑蛋',
              nameEn: 'quail egg',
              state: 'RAW',
            },
          }),
          normalizedNutrition: expect.any(Object),
        }),
      }),
    );
    expect(result.candidates[0].sourceRecordId).toBe('src-online-1');
  });

  it('同一查询第二次命中缓存，不重复抓取', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest.fn().mockResolvedValue({
        sources: [buildTrustedSource()],
        attemptedHosts: ['foodstandards.gov.au'],
        rejectedHosts: [],
      }),
    };
    const { service, prisma } = await createService(trusted);
    const input = { name: '鹌鹑蛋', nameEn: 'quail egg', state: 'RAW' } as const;

    const first = await service.searchOnline(input);
    const second = await service.searchOnline(input);

    expect(trusted.searchWithReport).toHaveBeenCalledTimes(1);
    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledTimes(1);
    expect(second.candidates).toEqual(first.candidates);
    expect(second.candidates[0].isOnline).toBe(true);
  });

  it('抓取失败/无结果时返回空数组与 attemptedHosts，不抛错', async () => {
    process.env.NUTRITION_TRUSTED_SOURCE_URLS = WHITELIST_URL;
    process.env.NUTRITION_TRUSTED_WEB_SEARCH_ENABLED = 'false';
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: jest.fn(),
    }) as unknown as typeof global.fetch;

    const { service } = await createService(
      new TrustedNutritionWebSearchService(),
    );

    await expect(
      service.searchOnline({ name: '鹌鹑蛋', state: 'RAW' }),
    ).resolves.toEqual({
      candidates: [],
      attemptedHosts: ['foodstandards.gov.au'],
      rejectedHosts: [],
    });
  });

  it('白名单服务自身抛错时也不冒泡成 500', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest
        .fn()
        .mockRejectedValue(new Error('network down')),
    };
    const { service } = await createService(trusted);

    await expect(
      service.searchOnline({ name: '鹌鹑蛋', state: 'RAW' }),
    ).resolves.toEqual({
      candidates: [],
      attemptedHosts: [],
      rejectedHosts: [],
    });
  });

  it('线上候选带 sourceUrl、fetchedAt、isOnline，并算出覆盖率', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest.fn().mockResolvedValue({
        sources: [buildTrustedSource()],
        attemptedHosts: ['foodstandards.gov.au'],
        rejectedHosts: [],
      }),
    };
    const { service } = await createService(trusted);

    const result = await service.searchOnline({
      name: '鹌鹑蛋',
      nameEn: 'quail egg',
      state: 'RAW',
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        sourceUrl: WHITELIST_URL,
        fetchedAt: FIXED_FETCHED_AT,
        isOnline: true,
        sourceType: 'MANUAL',
        preparationState: 'RAW',
        coveragePercent: expect.any(Number),
      }),
    );
  });

  it('线上候选永远排在本地候选之后（合并顺序）', () => {
    const ordered = orderCandidatesLocalFirst(
      [localCandidate()],
      [onlineCandidate()],
    );

    expect(ordered.map((candidate) => candidate.sourceRecordId)).toEqual([
      'local-1',
      'online-1',
    ]);
  });

  it('状态不符的线上数据仍然落库，但不进本次候选', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest.fn().mockResolvedValue({
        sources: [buildTrustedSource({ foodName: 'Quail egg cooked' })],
        attemptedHosts: ['foodstandards.gov.au'],
        rejectedHosts: [],
      }),
    };
    const { service, prisma } = await createService(trusted);

    const result = await service.searchOnline({
      name: '鹌鹑蛋',
      nameEn: 'quail egg',
      state: 'RAW',
    });

    expect(result.candidates).toEqual([]);
    expect(prisma.nutritionSourceRecord.upsert).toHaveBeenCalledTimes(1);
  });

  it('成分表里名字对不上的行不落库、也不进候选', async () => {
    const trusted = {
      search: jest.fn(),
      searchWithReport: jest.fn().mockResolvedValue({
        sources: [buildTrustedSource({ foodName: 'Beef liver raw' })],
        attemptedHosts: ['foodstandards.gov.au'],
        rejectedHosts: [],
      }),
    };
    const { service, prisma } = await createService(trusted);

    const result = await service.searchOnline({
      name: '鹌鹑蛋',
      nameEn: 'quail egg',
      state: 'RAW',
    });

    expect(result.candidates).toEqual([]);
    expect(prisma.nutritionSourceRecord.upsert).not.toHaveBeenCalled();
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
