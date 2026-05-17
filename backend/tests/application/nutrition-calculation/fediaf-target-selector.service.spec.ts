import { BadRequestException } from '@nestjs/common';
import { FediafTargetSelectorService } from '../../../src/application/nutrition-calculation/fediaf-target-selector.service';

describe('FediafTargetSelectorService', () => {
  const prisma = {
    nutritionStandardEntry: {
      findMany: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('selects reviewed adult MER 110 Annex 7.8 targets', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
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

  it('maps adult MER 95 targets to Annex VII-17d', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([]);

    const service = new FediafTargetSelectorService(prisma);
    await service.selectFediaf2025DogTarget({ lifeStage: 'ADULT_MER_95' });

    expect(prisma.nutritionStandardEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceTable: 'VII-17d',
          lifeStage: 'ADULT_MER_95',
        }),
      }),
    );
  });

  it('rejects unsupported target life stages', async () => {
    const service = new FediafTargetSelectorService(prisma);

    await expect(
      service.selectFediaf2025DogTarget({ lifeStage: 'SENIOR' as any }),
    ).rejects.toThrow('Unsupported FEDIAF target lifeStage: SENIOR');
    expect(prisma.nutritionStandardEntry.findMany).not.toHaveBeenCalled();
  });

  it('defaults to unreviewed and uses stable latest review tie ordering', async () => {
    prisma.nutritionStandardEntry.findMany.mockResolvedValue([
      {
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
