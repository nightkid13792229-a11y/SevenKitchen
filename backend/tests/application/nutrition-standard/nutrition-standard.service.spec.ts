import { NutritionStandardService } from '../../../src/application/nutrition-standard/nutrition-standard.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NutritionStandardController } from '../../../src/interfaces/controllers/nutrition-standard.controller';
import { AuthGuard } from '../../../src/interfaces/auth';
import { AdminGuard } from '../../../src/interfaces/guards/role.guard';

describe('NutritionStandardService', () => {
  const prisma = {
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
    nutritionStandardEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    nutritionStandardReviewEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns FEDIAF 2025 dog overview with review status counts', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      name: 'FEDIAF 2025 犬营养标准',
      species: 'DOG',
      publicationMonth: '2025-09',
      sourceTitle: 'FEDIAF Nutritional Guidelines 2025',
      sourceUrl:
        'https://europeanpetfood.org/self-regulation/nutritional-guidelines/',
      pdfUrl:
        'https://europeanpetfood.org/wp-content/uploads/2025/09/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf',
      importBatch: 'fediaf-2025-dog-v1',
      importStatus: 'IMPORTED',
      isActive: true,
      importedAt: new Date('2026-05-17T00:00:00.000Z'),
      entries: [
        { id: 'entry-1', sourceTable: 'III-3b', category: 'MINERAL' },
        { id: 'entry-2', sourceTable: 'VII-17c', category: 'MINERAL' },
      ],
    });
    prisma.nutritionStandardReviewEvent.findMany.mockResolvedValue([
      {
        entryId: 'entry-1',
        status: 'REVIEWED',
        note: null,
        reviewedBy: 'admin-1',
        reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
      },
    ]);

    const service = new NutritionStandardService(prisma);

    await expect(service.getFediaf2025DogOverview()).resolves.toEqual(
      expect.objectContaining({
        version: expect.objectContaining({
          code: 'FEDIAF_2025_DOG',
          species: 'DOG',
        }),
        totalEntries: 2,
        reviewCounts: {
          UNREVIEWED: 1,
          REVIEWED: 1,
          QUESTION: 0,
          NEEDS_FIX: 0,
        },
      }),
    );
  });

  it('lists entries with latest review status and filters', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        fediafName: 'Calcium',
        category: 'MINERAL',
        sourceTable: 'VII-17c',
        sourceType: 'ANNEX_7_8',
        pdfPage: 75,
        species: 'DOG',
        lifeStage: 'ADULT_MER_110',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g/1000kcal',
        minValue: 0.5,
        maxValue: 7.1,
        recommendedValue: null,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: [],
        notes: null,
        sortOrder: 1,
        nutrient: {
          code: 'calcium',
          fieldPath: 'minerals.calcium',
          name: '钙',
          nameEn: 'Calcium',
        },
        reviewEvents: [
          {
            status: 'QUESTION',
            note: '核对最大值',
            reviewedBy: 'admin-1',
            reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
          },
        ],
      },
    ]);

    const service = new NutritionStandardService(prisma);

    await expect(
      service.listFediaf2025DogEntries({
        sourceTable: 'VII-17c',
        lifeStage: 'ADULT_MER_110',
        category: 'MINERAL',
        reviewStatus: 'QUESTION',
        search: 'cal',
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'entry-1',
        nutrientCode: 'calcium',
        reviewStatus: 'QUESTION',
      }),
    ]);

    expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceTable: 'VII-17c',
          lifeStage: 'ADULT_MER_110',
          category: 'MINERAL',
        }),
      }),
    );
  });

  it('uses stable latest-review ordering when timestamps tie', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        fediafName: 'Calcium',
        category: 'MINERAL',
        sourceTable: 'VII-17c',
        sourceType: 'ANNEX_7_8',
        pdfPage: 75,
        species: 'DOG',
        lifeStage: 'ADULT_MER_110',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g/1000kcal',
        minValue: 0.5,
        maxValue: 7.1,
        recommendedValue: null,
        maxType: 'NUTRITIONAL_MAX',
        footnoteRefs: [],
        notes: null,
        sortOrder: 1,
        nutrient: {
          code: 'calcium',
          fieldPath: 'minerals.calcium',
          name: '钙',
          nameEn: 'Calcium',
        },
        reviewEvents: [
          {
            id: 'review-1',
            status: 'REVIEWED',
            note: null,
            reviewedBy: 'admin-1',
            reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
          },
          {
            id: 'review-2',
            status: 'NEEDS_FIX',
            note: '同时间戳下 id 更新',
            reviewedBy: 'admin-1',
            reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
          },
        ],
      },
    ]);

    const service = new NutritionStandardService(prisma);
    const [entry] = await service.listFediaf2025DogEntries({});

    expect(entry.reviewStatus).toBe('NEEDS_FIX');
    expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          reviewEvents: expect.objectContaining({
            orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
          }),
        }),
      }),
    );
  });

  it('creates a review event without changing the standard entry', async () => {
    prisma.nutritionStandardEntry.findFirst.mockResolvedValue({
      id: 'entry-1',
    });
    prisma.nutritionStandardReviewEvent.create.mockResolvedValue({
      id: 'review-1',
      entryId: 'entry-1',
      status: 'REVIEWED',
      note: '已核对',
      reviewedBy: 'admin-1',
      reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
    });

    const service = new NutritionStandardService(prisma);

    await expect(
      service.createReviewEvent('entry-1', {
        status: 'REVIEWED',
        note: '已核对',
        reviewedBy: 'admin-1',
      }),
    ).resolves.toEqual(expect.objectContaining({ status: 'REVIEWED' }));

    expect(prisma.nutritionStandardEntry.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'entry-1',
        version: { code: 'FEDIAF_2025_DOG' },
      },
      select: { id: true },
    });
    expect(prisma.nutritionStandardReviewEvent.create).toHaveBeenCalledWith({
      data: {
        entryId: 'entry-1',
        status: 'REVIEWED',
        note: '已核对',
        reviewedBy: 'admin-1',
      },
    });
  });
});

describe('NutritionStandardController authorization', () => {
  it('requires both authentication and admin guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      NutritionStandardController,
    );

    expect(guards).toEqual([AuthGuard, AdminGuard]);
  });
});
