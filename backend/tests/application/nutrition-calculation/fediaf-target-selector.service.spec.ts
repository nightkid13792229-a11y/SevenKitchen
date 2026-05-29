import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FediafTargetSelectorService } from '../../../src/application/nutrition-calculation/fediaf-target-selector.service';
import type { FediafTargetLifeStage } from '../../../src/application/nutrition-calculation/nutrition-calculation.types';

describe('FediafTargetSelectorService', () => {
  const prisma = {
    nutritionStandardEntry: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const standardEntry = (
    lifeStage: FediafTargetLifeStage,
    sourceTable: string,
  ) => ({
    id: `entry-${lifeStage}`,
    nutrient: { code: 'calcium', name: '钙' },
    sourceTable,
    pdfPage: 75,
    lifeStage,
    basis: 'PER_1000_KCAL_ME',
    unit: 'g',
    minValue: 0.5,
    maxValue: 7.1,
    recommendedValue: null,
    reviewEvents: [],
  });

  it('selects reviewed adult MER 110 Annex 7.8 targets', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        nutrient: { code: 'calcium', name: '钙' },
        sourceTable: 'VII-17c',
        pdfPage: 75,
        lifeStage: 'ADULT_MER_110',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 0.5,
        maxValue: 7.1,
        recommendedValue: null,
        reviewEvents: [
          {
            id: 'review-1',
            status: 'REVIEWED',
            reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const service = new FediafTargetSelectorService(prisma);
    const result = await service.selectFediaf2025DogTarget({
      lifeStage: 'ADULT_MER_110',
    });

    expect(result).toEqual({
      versionCode: 'FEDIAF_2025_DOG',
      lifeStage: 'ADULT_MER_110',
      sourceType: 'ANNEX_7_8',
      entries: [
        {
          entryId: 'entry-1',
          nutrientCode: 'calcium',
          nutrientName: '钙',
          sourceTable: 'VII-17c',
          pdfPage: 75,
          lifeStage: 'ADULT_MER_110',
          basis: 'PER_1000_KCAL_ME',
          unit: 'g',
          minValue: 0.5,
          maxValue: 7.1,
          recommendedValue: null,
          reviewStatus: 'REVIEWED',
        },
      ],
    });
    expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith({
      where: {
        version: { code: 'FEDIAF_2025_DOG' },
        sourceType: 'ANNEX_7_8',
        sourceTable: 'VII-17c',
        lifeStage: 'ADULT_MER_110',
      },
      include: {
        nutrient: true,
        reviewEvents: {
          orderBy: [{ reviewedAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
      },
      orderBy: [{ sortOrder: 'asc' }],
    });
  });

  it('rejects ambiguous adult target selection', async () => {
    const service = new FediafTargetSelectorService(prisma);
    await expect(
      service.selectFediaf2025DogTarget({ lifeStage: 'ADULT' as any }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['EARLY_GROWTH_UNDER_14_WEEKS', 'VII-17a'],
    ['REPRODUCTION', 'VII-17a'],
    ['LATE_GROWTH_FROM_14_WEEKS', 'VII-17b'],
    ['ADULT_MER_110', 'VII-17c'],
    ['ADULT_MER_95', 'VII-17d'],
  ] as Array<[FediafTargetLifeStage, string]>)(
    'maps %s targets to Annex %s',
    async (lifeStage, sourceTable) => {
      prisma.nutritionStandardEntry.findMany.mockResolvedValue([
        standardEntry(lifeStage, sourceTable),
      ]);

      const service = new FediafTargetSelectorService(prisma);
      const result = await service.selectFediaf2025DogTarget({ lifeStage });

      expect(result.entries[0]).toEqual(
        expect.objectContaining({
          entryId: `entry-${lifeStage}`,
          sourceTable,
          lifeStage,
        }),
      );
      expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceTable,
            lifeStage,
          }),
        }),
      );
    },
  );

  it('rejects unsupported target life stages', async () => {
    const service = new FediafTargetSelectorService(prisma);

    await expect(
      service.selectFediaf2025DogTarget({ lifeStage: 'SENIOR' as any }),
    ).rejects.toThrow('Unsupported FEDIAF target lifeStage: SENIOR');
    expect(prisma.nutritionStandardEntry.findMany).not.toHaveBeenCalled();
  });

  it('throws not found when Annex 7.8 targets are missing', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([]);

    const service = new FediafTargetSelectorService(prisma);

    await expect(
      service.selectFediaf2025DogTarget({ lifeStage: 'ADULT_MER_110' }),
    ).rejects.toThrow(
      new NotFoundException(
        'FEDIAF 2025 dog Annex 7.8 targets not found for ADULT_MER_110',
      ),
    );
  });

  it('defaults to unreviewed and uses stable latest review tie ordering', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
        id: 'entry-1',
        nutrient: { code: 'phosphorus', name: '磷' },
        sourceTable: 'VII-17a',
        pdfPage: 73,
        lifeStage: 'REPRODUCTION',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 0.4,
        maxValue: null,
        recommendedValue: null,
        reviewEvents: [],
      },
      {
        id: 'entry-2',
        nutrient: { code: 'calcium', name: '钙' },
        sourceTable: 'VII-17a',
        pdfPage: 73,
        lifeStage: 'REPRODUCTION',
        basis: 'PER_1000_KCAL_ME',
        unit: 'g',
        minValue: 0.8,
        maxValue: null,
        recommendedValue: null,
        reviewEvents: [
          {
            id: 'review-1',
            status: 'QUESTION',
            reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
          },
          {
            id: 'review-2',
            status: 'NEEDS_FIX',
            reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
          },
        ],
      },
    ]);

    const service = new FediafTargetSelectorService(prisma);
    const result = await service.selectFediaf2025DogTarget({
      lifeStage: 'REPRODUCTION',
    });

    expect(result.entries.map((entry) => entry.reviewStatus)).toEqual([
      'UNREVIEWED',
      'NEEDS_FIX',
    ]);
  });
});
