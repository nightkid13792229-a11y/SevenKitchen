import { NutrientMappingAuditService } from '../../../src/application/nutrition-calculation/nutrient-mapping-audit.service';

describe('NutrientMappingAuditService', () => {
  const prisma = {
    nutritionStandardVersion: {
      findUnique: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('audits FEDIAF nutrient mappings and reports reviewed coverage', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-calcium',
          nutrient: {
            code: 'calcium',
            fieldPath: 'minerals.calcium',
            defaultStandardUnit: 'g',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [
            {
              id: 'review-1',
              status: 'REVIEWED',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'entry-epa-dha',
          nutrient: {
            code: 'epaDha',
            fieldPath: null,
            defaultStandardUnit: 'g',
            isDirect: false,
            isDerived: true,
            expression: {
              op: 'sum',
              fields: ['fattyAcids.epa', 'fattyAcids.dha'],
            },
          },
          reviewEvents: [
            {
              id: 'review-2',
              status: 'REVIEWED',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'entry-question',
          sourceTable: 'III-3b',
          sortOrder: 1,
          nutrient: {
            code: 'questionOnly',
            fieldPath: 'minerals.phosphorus',
            defaultStandardUnit: 'g',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [
            {
              id: 'review-3',
              status: 'QUESTION',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.versionCode).toBe('FEDIAF_2025_DOG');
    expect(result.summary).toEqual({
      totalNutrients: 3,
      reviewedNutrients: 2,
      resolvedMappings: 3,
      missingMappings: 0,
      unsupportedMappings: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        nutrientCode: 'calcium',
        mappingStatus: 'RESOLVED',
        mappingType: 'DIRECT',
        sourceFieldPaths: ['minerals.calcium'],
      }),
      expect.objectContaining({
        nutrientCode: 'epaDha',
        mappingStatus: 'RESOLVED',
        mappingType: 'COMBINATION',
        sourceFieldPaths: ['fattyAcids.epa', 'fattyAcids.dha'],
      }),
      expect.objectContaining({
        nutrientCode: 'questionOnly',
        reviewStatus: 'QUESTION',
        mappingStatus: 'RESOLVED',
      }),
    ]);
    expect(prisma.nutritionStandardVersion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          entries: expect.objectContaining({
            orderBy: [
              { sourceTable: 'asc' },
              { sortOrder: 'asc' },
              { id: 'asc' },
            ],
          }),
        }),
      }),
    );
  });

  it('marks unreviewed nutrients and missing field paths explicitly', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-unknown',
          nutrient: {
            code: 'unknownNutrient',
            fieldPath: null,
            defaultStandardUnit: 'mg',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 1,
      reviewedNutrients: 0,
      resolvedMappings: 0,
      missingMappings: 1,
      unsupportedMappings: 0,
    });
    expect(result.items[0]).toMatchObject({
      nutrientCode: 'unknownNutrient',
      reviewStatus: 'UNREVIEWED',
      mappingType: 'UNSUPPORTED',
      mappingStatus: 'MISSING_MAPPING',
      sourceFieldPaths: [],
    });
  });

  it('marks unsupported expression operators explicitly', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-unsupported',
          nutrient: {
            code: 'unsupportedExpression',
            fieldPath: null,
            defaultStandardUnit: 'mg',
            isDirect: false,
            isDerived: true,
            expression: { op: 'multiply', fields: ['minerals.calcium'] },
          },
          reviewEvents: [
            {
              id: 'review-1',
              status: 'REVIEWED',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 1,
      reviewedNutrients: 1,
      resolvedMappings: 0,
      missingMappings: 0,
      unsupportedMappings: 1,
    });
    expect(result.items[0]).toMatchObject({
      nutrientCode: 'unsupportedExpression',
      mappingType: 'UNSUPPORTED',
      mappingStatus: 'UNSUPPORTED_EXPRESSION',
      sourceFieldPaths: [],
    });
  });

  it('audits divide expressions as resolved ratio mappings', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-ca-p-ratio',
          nutrient: {
            code: 'calciumPhosphorusRatio',
            fieldPath: null,
            defaultStandardUnit: ':1',
            isDirect: false,
            isDerived: true,
            expression: {
              op: 'divide',
              numerator: 'minerals.calcium',
              denominator: 'minerals.phosphorus',
            },
          },
          reviewEvents: [
            {
              id: 'review-1',
              status: 'REVIEWED',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 1,
      reviewedNutrients: 1,
      resolvedMappings: 1,
      missingMappings: 0,
      unsupportedMappings: 0,
    });
    expect(result.items[0]).toMatchObject({
      nutrientCode: 'calciumPhosphorusRatio',
      mappingType: 'RATIO',
      mappingStatus: 'RESOLVED',
      sourceFieldPaths: ['minerals.calcium', 'minerals.phosphorus'],
    });
  });

  it('deduplicates nutrients using the first ordered standard entry as canonical', async () => {
    prisma.nutritionStandardVersion.findUnique.mockResolvedValue({
      id: 'version-1',
      code: 'FEDIAF_2025_DOG',
      entries: [
        {
          id: 'entry-calcium-canonical',
          sourceTable: 'III-3b',
          sortOrder: 1,
          nutrient: {
            code: 'calcium',
            fieldPath: 'minerals.calcium',
            defaultStandardUnit: 'g',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [
            {
              id: 'review-canonical',
              status: 'QUESTION',
              reviewedAt: new Date('2026-05-17T00:00:00.000Z'),
            },
          ],
        },
        {
          id: 'entry-calcium-duplicate',
          sourceTable: 'VII-17c',
          sortOrder: 2,
          nutrient: {
            code: 'calcium',
            fieldPath: 'minerals.phosphorus',
            defaultStandardUnit: 'mg',
            isDirect: true,
            isDerived: false,
            expression: null,
          },
          reviewEvents: [
            {
              id: 'review-duplicate',
              status: 'REVIEWED',
              reviewedAt: new Date('2026-05-17T00:01:00.000Z'),
            },
          ],
        },
      ],
    });

    const service = new NutrientMappingAuditService(prisma);
    const result = await service.auditFediaf2025DogMappings();

    expect(result.summary).toEqual({
      totalNutrients: 1,
      reviewedNutrients: 0,
      resolvedMappings: 1,
      missingMappings: 0,
      unsupportedMappings: 0,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        nutrientCode: 'calcium',
        defaultStandardUnit: 'g',
        reviewStatus: 'QUESTION',
        sourceFieldPaths: ['minerals.calcium'],
      }),
    ]);
  });
});
