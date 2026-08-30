import {
  validateIngredientImportManifest,
  type IngredientImportManifest,
} from 'src/application/standard-ingredient-import/ingredient-import-manifest';

const completeFoodManifest: IngredientImportManifest = {
  version: 1,
  operationMode: 'local-draft',
  ingredient: {
    type: 'FOOD',
    name: 'Chicken breast',
    procurementSkus: [
      {
        sku: 'chicken-breast-wholesale',
        supplier: 'SevenKitchen QA Market',
      },
    ],
  },
  nutritionProfiles: [
    {
      id: 'profile-usda-171077',
      dataSource: 'USDA_FDC',
      basis: 'PER_100G',
      preparationState: 'cooked',
      nutrients: {
        energyKcal: { value: 165, unit: 'kcal' },
        proteinG: { value: 31.02, unit: 'g' },
        fatG: { value: 3.57, unit: 'g' },
        carbohydrateG: { value: 0, unit: 'g', measuredZero: true },
      },
    },
  ],
  sourceCandidates: [
    {
      sourceId: 'USDA_FDC:171077',
      sourceName: 'USDA FoodData Central',
      source: 'USDA_FDC',
      matchedName: 'Chicken breast, cooked',
      stateTags: ['cooked'],
      essentialCoveragePercent: 92,
    },
  ],
  dbAlignmentReport: {
    id: 'db-align-food-001',
    status: 'passing',
  },
  operatorConfirmation: {
    localWriteApproved: true,
    productionPackageApproved: false,
  },
};

const completeSupplementManifest: IngredientImportManifest = {
  version: 1,
  operationMode: 'production-package',
  ingredient: {
    type: 'SUPPLEMENT',
    name: 'Wild fish oil',
  },
  packageEvidence: {
    metadata: {
      source: 'operator-package-review',
      capturedAt: '2026-06-16T08:00:00.000Z',
    },
    packageImages: [
      {
        uri: 'cos://sevenkitchen/package-evidence/fish-oil-front.jpg',
        kind: 'front-label',
      },
    ],
    labelSources: [],
  },
  dbAlignmentReport: {
    id: 'db-align-production-001',
    status: 'passing',
  },
  operatorConfirmation: {
    localWriteApproved: false,
    productionPackageApproved: true,
  },
};

describe('validateIngredientImportManifest', () => {
  it('accepts a complete FOOD manifest with procurement SKUs', () => {
    const result = validateIngredientImportManifest(makeFoodManifest());

    expect(result).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('accepts a complete SUPPLEMENT manifest with package image evidence', () => {
    const result = validateIngredientImportManifest(makeSupplementManifest());

    expect(result).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('accepts SUPPLEMENT label source evidence without package images or metadata', () => {
    const manifest = makeSupplementManifest({
      packageEvidence: {
        packageImages: [],
        labelSources: [
          {
            sourceId: 'vendor-label:f792',
            labelText: 'Guaranteed analysis from vendor label PDF',
          },
        ],
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('rejects manifests that do not declare version 1', () => {
    const manifest = makeFoodManifest({ version: 2 as never });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INVALID_VERSION', path: 'version' }),
    );
  });

  it('rejects PACKAGING because v1 only supports FOOD and SUPPLEMENT', () => {
    const manifest = makeFoodManifest({
      ingredient: { type: 'PACKAGING' as never, name: 'Box' },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'INGREDIENT_TYPE_NOT_SUPPORTED' }),
    );
  });

  it('rejects whole database migration modes and flags', () => {
    const manifest = makeFoodManifest({
      operationMode: 'whole-database-migration' as never,
      wholeDatabaseMigration: true,
      migrationFlags: { wholeDatabase: true },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
          path: 'operationMode',
        }),
        expect.objectContaining({
          code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
          path: 'wholeDatabaseMigration',
        }),
        expect.objectContaining({
          code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
          path: 'migrationFlags.wholeDatabase',
        }),
      ]),
    );
  });

  it('requires FOOD manifests to include nutrition profiles and source candidates', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [],
      sourceCandidates: [],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'FOOD_NUTRITION_REQUIRED',
          path: 'nutritionProfiles',
        }),
        expect.objectContaining({
          code: 'FOOD_NUTRITION_REQUIRED',
          path: 'sourceCandidates',
        }),
      ]),
    );
  });

  it('requires FOOD source candidates to satisfy the approved source policy', () => {
    const manifest = makeFoodManifest({
      sourceCandidates: [
        {
          sourceId: 'BLOG:chicken-breast',
          sourceName: 'Personal nutrition blog',
          matchedName: 'Chicken breast',
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'FOOD_SOURCE_CANDIDATE_NOT_APPROVED',
        path: 'sourceCandidates',
      }),
    );
  });

  it('requires FOOD source candidates to match the requested preparation state', () => {
    const manifest = makeFoodManifest({
      sourceCandidates: [
        {
          sourceId: 'USDA_FDC:171077',
          sourceName: 'USDA FoodData Central',
          source: 'USDA_FDC',
          matchedName: 'Chicken breast, cooked',
          stateTags: ['cooked'],
          essentialCoveragePercent: 92,
        },
      ],
      nutritionProfiles: [
        {
          id: 'profile-usda-171077',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: {
            energyKcal: { value: 165, unit: 'kcal' },
            proteinG: { value: 31.02, unit: 'g' },
          },
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'FOOD_SOURCE_CANDIDATE_NOT_APPROVED',
        path: 'sourceCandidates',
      }),
    );
  });

  it('requires each FOOD nutrition profile to use an approved source', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'blog-profile',
          dataSource: 'BLOG_NUTRITION_TABLE',
          basis: 'PER_100G',
          preparationState: 'cooked',
          nutrients: {
            energyKcal: { value: 165, unit: 'kcal' },
            proteinG: { value: 31.02, unit: 'g' },
          },
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'FOOD_PROFILE_SOURCE_NOT_APPROVED',
        path: 'nutritionProfiles[0].dataSource',
      }),
    );
  });

  it('requires every FOOD nutrition profile to have a matching source candidate', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-usda-raw',
          dataSource: 'USDA_FDC',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: {
            energyKcal: { value: 120, unit: 'kcal' },
            proteinG: { value: 20, unit: 'g' },
          },
        },
        {
          id: 'profile-usda-cooked',
          dataSource: 'USDA_FDC',
          basis: 'PER_100G',
          preparationState: 'cooked',
          nutrients: {
            energyKcal: { value: 165, unit: 'kcal' },
            proteinG: { value: 31.02, unit: 'g' },
          },
        },
      ],
      sourceCandidates: [
        {
          sourceId: 'USDA_FDC:raw-only',
          sourceName: 'USDA FoodData Central',
          source: 'USDA_FDC',
          matchedName: 'Chicken breast, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 92,
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'FOOD_PROFILE_SOURCE_CANDIDATE_REQUIRED',
        path: 'nutritionProfiles[1].dataSource',
      }),
    );
  });

  it('requires source search evidence before FOOD imports use CFCT fallback data', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-cfct-001',
          dataSource: 'CFCT',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: {
            energyKcal: { value: 110, unit: 'kcal' },
          },
        },
      ],
      sourceCandidates: [
        {
          source: 'CFCT',
          sourceId: 'CFCT:example-food',
          sourceName: 'Chinese Food Composition Table',
          matchedName: 'Example food, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 90,
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'CFCT_FALLBACK_SEARCH_REQUIRED',
        path: 'sourceSearchLog',
      }),
    );
  });

  it('does not require CFCT fallback evidence when the selected profile uses a primary source', () => {
    const manifest = makeFoodManifest({
      sourceCandidates: [
        ...completeFoodManifest.sourceCandidates!,
        {
          source: 'CFCT',
          sourceId: 'CFCT:comparison-only',
          sourceName: 'Chinese Food Composition Table',
          matchedName: 'Chicken breast, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 90,
        },
      ],
    });

    expect(validateIngredientImportManifest(manifest)).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('requires complete primary-source search evidence before FOOD imports use CFCT fallback data', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-cfct-002',
          dataSource: 'CFCT',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: {
            energyKcal: { value: 110, unit: 'kcal' },
          },
        },
      ],
      sourceCandidates: [
        {
          source: 'CFCT',
          sourceId: 'CFCT:example-food',
          sourceName: 'Chinese Food Composition Table',
          matchedName: 'Example food, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 90,
        },
      ],
      sourceSearchLog: [
        {
          source: 'CFCT',
          status: 'candidate_found',
          query: 'example food raw',
          searchedAt: '2026-07-11T12:00:00.000Z',
          evidenceUri: 'https://example.test/cfct',
          notes: 'CFCT candidate found.',
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'CFCT_FALLBACK_SEARCH_INCOMPLETE',
        path: 'sourceSearchLog',
      }),
    );
  });

  it('accepts CFCT fallback data after primary-source searches are exhausted', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-cfct-003',
          dataSource: 'CFCT',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: {
            energyKcal: { value: 110, unit: 'kcal' },
          },
        },
      ],
      sourceCandidates: [
        {
          source: 'CFCT',
          sourceId: 'CFCT:example-food',
          sourceName: 'Chinese Food Composition Table',
          matchedName: 'Example food, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 90,
        },
      ],
      sourceSearchLog: [
        ...[
          'USDA_FDC',
          'NZFCD',
          'NEVO',
          'MEXT',
          'AFCD',
          'AUSNUT',
          'CNF',
          'COFID',
          'CIQUAL',
        ].map((source) => ({
          source,
          status: 'searched_no_match',
          query: `${source} example food raw`,
          searchedAt: '2026-07-11T12:00:00.000Z',
          evidenceUri: `https://example.test/${source}`,
          notes: `${source} has no matching raw record.`,
        })),
        {
          source: 'CFCT',
          status: 'candidate_found',
          query: 'CFCT example food raw',
          searchedAt: '2026-07-11T12:00:00.000Z',
          evidenceUri: 'https://example.test/CFCT',
          notes: 'CFCT fallback candidate selected after primary searches.',
        },
      ],
    });

    expect(validateIngredientImportManifest(manifest)).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('requires the CFCT search evidence to identify a usable fallback candidate', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-cfct-004',
          dataSource: 'CFCT',
          basis: 'PER_100G',
          preparationState: 'raw',
          nutrients: { energyKcal: { value: 110, unit: 'kcal' } },
        },
      ],
      sourceCandidates: [
        {
          source: 'CFCT',
          sourceId: 'CFCT:example-food',
          sourceName: 'Chinese Food Composition Table',
          matchedName: 'Example food, raw',
          stateTags: ['raw'],
          essentialCoveragePercent: 90,
        },
      ],
      sourceSearchLog: completeCfctFallbackSearchLog('searched_no_match'),
    });

    expect(validateIngredientImportManifest(manifest).errors).toContainEqual(
      expect.objectContaining({
        code: 'CFCT_FALLBACK_SEARCH_INCOMPLETE',
        path: 'sourceSearchLog',
      }),
    );
  });

  it('forbids procurement SKUs for SUPPLEMENT manifests', () => {
    const manifest = makeSupplementManifest({
      ingredient: {
        type: 'SUPPLEMENT',
        name: 'Vitamin D3',
        procurementSkus: [
          {
            sku: 'vitamin-d3-1000iu',
            supplier: 'Supplement Vendor',
          },
        ],
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN',
        path: 'ingredient.procurementSkus',
      }),
    );
  });

  it('requires SUPPLEMENT manifests to include a package photo or equivalent label source', () => {
    const manifest = makeSupplementManifest({
      packageEvidence: {
        metadata: {
          source: 'operator-package-review',
          capturedAt: '2026-06-16T08:00:00.000Z',
        },
        packageImages: [],
        labelSources: [],
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED',
        path: 'packageEvidence',
      }),
    );
  });

  it('describes missing SUPPLEMENT evidence without requiring metadata', () => {
    const manifest = makeSupplementManifest({
      packageEvidence: {
        metadata: {
          source: 'operator-package-review',
          capturedAt: '2026-06-16T08:00:00.000Z',
        },
        packageImages: [],
        labelSources: [],
      },
    });

    const result = validateIngredientImportManifest(manifest);
    const evidenceError = result.errors.find(
      (error) => error.code === 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED',
    );

    expect(evidenceError?.message).toContain(
      'package photo or equivalent label source',
    );
    expect(evidenceError?.message).not.toContain('metadata');
  });

  it('treats empty, null, non-numeric, and unmeasured zero nutrient values as missing', () => {
    const manifest = makeFoodManifest({
      nutritionProfiles: [
        {
          id: 'profile-with-missing-values',
          basis: 'PER_100G',
          nutrients: {
            proteinG: { value: '', unit: 'g' },
            fatG: { value: null, unit: 'g' },
            calciumMg: { value: 'not provided', unit: 'mg' },
            phosphorusMg: { value: 0, unit: 'mg' },
            carbohydrateG: { value: 0, unit: 'g', measuredZero: true },
          },
        },
      ],
    });

    const result = validateIngredientImportManifest(manifest);
    const missingValuePaths = result.errors
      .filter((error) => error.code === 'NUTRIENT_VALUE_MISSING')
      .map((error) => error.path);

    expect(result.ok).toBe(false);
    expect(missingValuePaths).toEqual(
      expect.arrayContaining([
        'nutritionProfiles[0].nutrients.proteinG.value',
        'nutritionProfiles[0].nutrients.fatG.value',
        'nutritionProfiles[0].nutrients.calciumMg.value',
        'nutritionProfiles[0].nutrients.phosphorusMg.value',
      ]),
    );
    expect(missingValuePaths).not.toContain(
      'nutritionProfiles[0].nutrients.carbohydrateG.value',
    );
  });

  it('accepts local draft writes without a DB alignment report when the operator approves', () => {
    const manifest = makeFoodManifest({
      dbAlignmentReport: {
        id: '',
        status: 'failing',
      },
      operatorConfirmation: {
        localWriteApproved: true,
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result).toEqual({
      ok: true,
      errors: [],
      warnings: [],
    });
  });

  it('requires local draft writes to have operator approval', () => {
    const manifest = makeFoodManifest({
      dbAlignmentReport: {
        id: '',
        status: 'failing',
      },
      operatorConfirmation: {
        localWriteApproved: false,
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'LOCAL_WRITE_CONFIRMATION_REQUIRED',
        path: 'operatorConfirmation.localWriteApproved',
      }),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({
        code: 'LOCAL_WRITE_ALIGNMENT_REQUIRED',
      }),
    );
  });

  it('requires production package exports to have operator approval', () => {
    const manifest = makeSupplementManifest({
      operatorConfirmation: {
        productionPackageApproved: false,
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'PRODUCTION_PACKAGE_CONFIRMATION_REQUIRED',
        path: 'operatorConfirmation.productionPackageApproved',
      }),
    );
  });

  it('requires production package exports to have a passing DB alignment report', () => {
    const manifest = makeSupplementManifest({
      dbAlignmentReport: {
        id: '',
        status: 'failing',
      },
      operatorConfirmation: {
        productionPackageApproved: true,
      },
    });

    const result = validateIngredientImportManifest(manifest);

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'PRODUCTION_DB_ALIGNMENT_REQUIRED',
        path: 'dbAlignmentReport',
      }),
    );
  });

  it('returns every applicable error instead of stopping at the first one', () => {
    const manifest = makeFoodManifest({
      version: 99 as never,
      wholeDatabaseMigration: true,
      nutritionProfiles: [
        {
          id: 'bad-profile',
          basis: 'PER_100G',
          nutrients: {
            proteinG: { value: null, unit: 'g' },
          },
        },
      ],
      sourceCandidates: [],
      dbAlignmentReport: {
        id: '',
        status: 'failing',
      },
      operatorConfirmation: {
        localWriteApproved: false,
      },
    });

    const result = validateIngredientImportManifest(manifest);
    const codes = result.errors.map((error) => error.code);

    expect(result.ok).toBe(false);
    expect(codes).toEqual(
      expect.arrayContaining([
        'INVALID_VERSION',
        'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
        'FOOD_NUTRITION_REQUIRED',
        'NUTRIENT_VALUE_MISSING',
        'LOCAL_WRITE_CONFIRMATION_REQUIRED',
      ]),
    );
  });
});

function completeCfctFallbackSearchLog(cfctStatus: string) {
  return [
    ...[
      'USDA_FDC',
      'NZFCD',
      'NEVO',
      'MEXT',
      'AFCD',
      'AUSNUT',
      'CNF',
      'COFID',
      'CIQUAL',
    ].map((source) => ({
      source,
      status: 'searched_no_match',
      query: `${source} example food raw`,
      searchedAt: '2026-07-11T12:00:00.000Z',
      evidenceUri: `https://example.test/${source}`,
      notes: `${source} has no matching raw record.`,
    })),
    {
      source: 'CFCT',
      status: cfctStatus,
      query: 'CFCT example food raw',
      searchedAt: '2026-07-11T12:00:00.000Z',
      evidenceUri: 'https://example.test/CFCT',
      notes: 'CFCT fallback candidate selected after primary searches.',
    },
  ];
}

function makeFoodManifest(
  overrides: Partial<IngredientImportManifest> = {},
): IngredientImportManifest {
  return mergeManifest(completeFoodManifest, overrides);
}

function makeSupplementManifest(
  overrides: Partial<IngredientImportManifest> = {},
): IngredientImportManifest {
  return mergeManifest(completeSupplementManifest, overrides);
}

function mergeManifest(
  base: IngredientImportManifest,
  overrides: Partial<IngredientImportManifest>,
): IngredientImportManifest {
  const manifest = cloneManifest(base);

  return {
    ...manifest,
    ...overrides,
    ingredient:
      overrides.ingredient === undefined
        ? manifest.ingredient
        : {
            ...manifest.ingredient,
            ...overrides.ingredient,
          },
    dbAlignmentReport:
      overrides.dbAlignmentReport === undefined
        ? manifest.dbAlignmentReport
        : {
            ...manifest.dbAlignmentReport,
            ...overrides.dbAlignmentReport,
          },
    operatorConfirmation:
      overrides.operatorConfirmation === undefined
        ? manifest.operatorConfirmation
        : {
            ...manifest.operatorConfirmation,
            ...overrides.operatorConfirmation,
          },
  };
}

function cloneManifest(
  manifest: IngredientImportManifest,
): IngredientImportManifest {
  return JSON.parse(JSON.stringify(manifest)) as IngredientImportManifest;
}
