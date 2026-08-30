import {
  applyLocalIngredientImport,
  buildNutritionFoodProfile,
  type LocalIngredientImportAudit,
} from 'src/application/standard-ingredient-import/local-ingredient-import';
import type {
  DatabaseAlignmentResult,
  IngredientImportManifest,
} from 'src/application/standard-ingredient-import';

describe('applyLocalIngredientImport', () => {
  it('records local writes without requiring a passing production DB alignment', async () => {
    const prisma = makePrisma();

    const result = await applyLocalIngredientImport({
      prisma,
      manifest: makeFoodManifest(),
      alignment: makeAlignment({ ok: false }),
      auditOutputPath: '/tmp/duck-egg.local-apply.json',
      writeAuditFile: jest.fn().mockResolvedValue(undefined),
      now: new Date('2026-06-16T08:00:00.000Z'),
    });

    expect(result.audit.alignmentId).toBeNull();
    expect(result.audit.dbAlignmentStatus).toBe('not-required-for-local');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('records passing alignment metadata when it is supplied', async () => {
    const result = await applyLocalIngredientImport({
      prisma: makePrisma(),
      manifest: makeFoodManifest(),
      alignment: makeAlignment(),
      auditOutputPath: '/tmp/duck-egg.local-apply.json',
      writeAuditFile: jest.fn().mockResolvedValue(undefined),
    });

    expect(result.audit.alignmentId).toBe('alignment-ok');
    expect(result.audit.dbAlignmentStatus).toBe('passing');
  });

  it('refuses to run when local write confirmation is false', async () => {
    await expect(
      applyLocalIngredientImport({
        prisma: makePrisma(),
        manifest: makeFoodManifest({
          operatorConfirmation: {
            localWriteApproved: false,
            productionPackageApproved: false,
          },
        }),
        alignment: makeAlignment(),
        auditOutputPath: '/tmp/audit.json',
        writeAuditFile: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'LOCAL_WRITE_CONFIRMATION_REQUIRED' });
  });

  it('refuses SUPPLEMENT manifests that include procurement SKUs', async () => {
    await expect(
      applyLocalIngredientImport({
        prisma: makePrisma(),
        manifest: makeSupplementManifest({
          ingredient: {
            type: 'SUPPLEMENT',
            name: 'Fish oil',
            procurementSkus: [{ sku: 'fish-oil-sku' }],
          },
        }),
        alignment: makeAlignment(),
        auditOutputPath: '/tmp/audit.json',
        writeAuditFile: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN' });
  });

  it('creates FOOD records in one transaction and writes an audit file', async () => {
    const prisma = makePrisma();
    const writeAuditFile = jest.fn().mockResolvedValue(undefined);

    const result = await applyLocalIngredientImport({
      prisma,
      manifest: makeFoodManifest(),
      alignment: makeAlignment(),
      auditOutputPath: '/tmp/duck-egg.local-apply.json',
      writeAuditFile,
      now: new Date('2026-06-16T08:00:00.000Z'),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Duck egg',
        type: 'FOOD',
        baseUnit: 'G',
        nutritionProfile: expect.objectContaining({
          macros: expect.objectContaining({
            crudeFat: 13,
            crudeProtein: 13,
            energyKcal: 185,
          }),
          meta: expect.objectContaining({
            sourceType: 'USDA',
            sourceCode: 'USDA_FDC',
            sampleState: 'RAW',
          }),
        }),
        properties: expect.objectContaining({
          importSource: 'standard-ingredient-import',
        }),
      }),
    });
    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Duck egg raw profile',
        dataSource: 'USDA_FDC',
        nutritionData: expect.objectContaining({
          macros: expect.objectContaining({
            crudeFat: 13,
            crudeProtein: 13,
            energyKcal: 185,
          }),
          meta: expect.objectContaining({
            sourceType: 'USDA',
            sourceCode: 'USDA_FDC',
            sampleState: 'RAW',
          }),
        }),
      }),
    });
    expect(prisma.nutritionFoodMapping.create).toHaveBeenCalledWith({
      data: {
        ingredientId: 'ingredient-1',
        nutritionFoodId: 'nutrition-food-1',
        yieldRate: 1,
        isPrimary: true,
        notes: expect.stringContaining('standard ingredient import'),
      },
    });
    expect(prisma.ingredientTagAssignment.create).toHaveBeenCalledWith({
      data: { ingredientId: 'ingredient-1', tagId: 'tag-egg' },
    });
    expect(prisma.procurementSku.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'ingredient-1',
        name: 'Duck egg supplier tray',
        sourceTier: 'WHOLESALE',
      }),
    });
    expect(writeAuditFile).toHaveBeenCalledWith(
      '/tmp/duck-egg.local-apply.json',
      expect.objectContaining<Partial<LocalIngredientImportAudit>>({
        alignmentId: 'alignment-ok',
        dbAlignmentStatus: 'passing',
        ingredientIds: ['ingredient-1'],
        nutritionFoodIds: ['nutrition-food-1'],
        nutritionFoodMappingIds: ['mapping-1'],
        procurementSkuIds: ['procurement-sku-1'],
        manifestHash: expect.any(String),
        packageManifestHash: expect.any(String),
      }),
    );
    expect(result.auditPath).toBe('/tmp/duck-egg.local-apply.json');
  });

  it('creates SUPPLEMENT records with package evidence properties and no procurement SKU', async () => {
    const prisma = makePrisma();

    await applyLocalIngredientImport({
      prisma,
      manifest: makeSupplementManifest(),
      alignment: makeAlignment(),
      auditOutputPath: '/tmp/fish-oil.local-apply.json',
      writeAuditFile: jest.fn().mockResolvedValue(undefined),
    });

    expect(prisma.ingredient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Fish oil',
        type: 'SUPPLEMENT',
        brand: 'Nordic Test',
        productModel: '1000 mg',
        procurementEnabled: false,
        properties: expect.objectContaining({
          packageEvidence: expect.objectContaining({
            packageImages: [{ uri: 'cos://labels/fish-oil-front.jpg' }],
          }),
          supplementLabel: expect.objectContaining({
            servingSize: '1 capsule',
          }),
        }),
      }),
    });
    expect(prisma.procurementSku.create).not.toHaveBeenCalled();
  });

  it('creates a nutrition profile and primary mapping for an existing SUPPLEMENT without exporting the ingredient row', async () => {
    const prisma = makePrisma({
      existingIngredient: { id: 'existing-supplement' },
    });
    const writeAuditFile = jest.fn().mockResolvedValue(undefined);

    await applyLocalIngredientImport({
      prisma,
      manifest: makeSupplementManifest({
        updateExistingIngredientId: 'existing-supplement',
        nutritionProfiles: [
          {
            id: 'fish-oil-label',
            name: 'Fish oil label profile',
            dataSource: 'SUPPLEMENT_LABEL',
            externalId: 'SUPPLEMENT_LABEL:existing-supplement',
            category: 'SUPPLEMENT',
            basis: 'PER_SERVING',
            preparationState: 'CONCENTRATE',
            nutritionData: {
              meta: { rawBasisType: 'PER_SERVING' },
              macros: {},
              minerals: {},
              vitamins: {},
              fattyAcids: { epa: 180, dha: 120 },
              aminoAcids: {},
              customItems: [],
            },
            nutrients: {
              epaMg: { value: 180, unit: 'mg' },
              dhaMg: { value: 120, unit: 'mg' },
            },
            isPrimary: true,
          },
        ],
      }),
      alignment: makeAlignment(),
      auditOutputPath: '/tmp/fish-oil-profile.local-apply.json',
      writeAuditFile,
    });

    expect(prisma.nutritionFood.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Fish oil label profile',
        category: 'SUPPLEMENT',
        dataSource: 'SUPPLEMENT_LABEL',
        nutritionData: expect.objectContaining({
          meta: { rawBasisType: 'PER_SERVING' },
          fattyAcids: { epa: 180, dha: 120 },
        }),
      }),
    });
    expect(prisma.nutritionFoodMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ingredientId: 'existing-ingredient',
        nutritionFoodId: 'nutrition-food-1',
        isPrimary: true,
      }),
    });
    expect(writeAuditFile).toHaveBeenCalledWith(
      '/tmp/fish-oil-profile.local-apply.json',
      expect.objectContaining({
        ingredientIds: [],
        nutritionFoodIds: ['nutrition-food-1'],
        nutritionFoodMappingIds: ['mapping-1'],
      }),
    );
  });

  it('does not overwrite an existing ingredient unless updateExistingIngredientId is declared', async () => {
    const prisma = makePrisma({
      existingIngredient: { id: 'existing-ingredient' },
    });

    await expect(
      applyLocalIngredientImport({
        prisma,
        manifest: makeFoodManifest(),
        alignment: makeAlignment(),
        auditOutputPath: '/tmp/audit.json',
        writeAuditFile: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'INGREDIENT_ALREADY_EXISTS' });

    const updatePrisma = makePrisma({
      existingIngredient: { id: 'existing-ingredient' },
    });
    await applyLocalIngredientImport({
      prisma: updatePrisma,
      manifest: makeFoodManifest({
        updateExistingIngredientId: 'existing-ingredient',
      }),
      alignment: makeAlignment(),
      auditOutputPath: '/tmp/update-audit.json',
      writeAuditFile: jest.fn().mockResolvedValue(undefined),
    });

    expect(updatePrisma.ingredient.update).toHaveBeenCalledWith({
      where: { id: 'existing-ingredient' },
      data: expect.objectContaining({
        name: 'Duck egg',
      }),
    });
  });
});

describe('buildNutritionFoodProfile', () => {
  it('keeps MEXT as the nutrition profile source type', () => {
    const profile = buildNutritionFoodProfile({
      id: 'black-rice-raw',
      name: '黑米，生/干',
      dataSource: 'MEXT',
      externalId: 'MEXT:01182',
      basis: 'PER_100_G',
      preparationState: 'raw',
      nutrients: {},
    });

    expect(profile.meta.sourceType).toBe('MEXT');
    expect(profile.meta.sourceCode).toBe('MEXT');
    expect(profile.meta.sourceKind).toBe('FOOD_DATABASE');
    expect(profile.meta.sourceProvider).toBe('MEXT');
    expect(profile.meta.sampleState).toBe('RAW');
  });

  it('stores source form canonical values after unit conversion', () => {
    const profile = buildNutritionFoodProfile({
      id: 'mext-shrimp-raw',
      name: '南美对虾虾仁，生',
      dataSource: 'MEXT',
      externalId: 'MEXT:10415',
      basis: 'PER_100_G',
      preparationState: 'raw',
      nutrients: {
        proteinG: { value: 19.6, unit: 'g' },
        fatG: { value: 0.6, unit: 'g' },
        linoleicAcid: { value: 47, unit: 'mg' },
        lysine: { value: 1600, unit: 'mg' },
      },
    });

    expect(profile.fattyAcids.linoleicAcid).toBeCloseTo(0.047);
    expect(profile.aminoAcids.lysine).toBeCloseTo(1.6);
    expect(
      profile.meta.sourceForms?.['fattyAcids.linoleicAcid']?.canonicalValue,
    ).toBeCloseTo(0.047);
    expect(
      profile.meta.sourceForms?.['aminoAcids.lysine']?.canonicalValue,
    ).toBeCloseTo(1.6);
    expect(
      profile.meta.sourceForms?.['fattyAcids.linoleicAcid']?.canonicalUnit,
    ).toBe('g');
    expect(profile.meta.sourceForms?.['aminoAcids.lysine']?.canonicalUnit).toBe(
      'g',
    );
  });
});

function makeAlignment(
  overrides: Partial<DatabaseAlignmentResult> = {},
): DatabaseAlignmentResult {
  return {
    id: 'alignment-ok',
    checkedAt: '2026-06-16T08:00:00.000Z',
    ok: true,
    localDatabaseLabel: 'local',
    productionDatabaseLabel: 'production',
    blockingIssues: [],
    warnings: [],
    ...overrides,
  };
}

function makeFoodManifest(
  overrides: Partial<IngredientImportManifest> = {},
): IngredientImportManifest {
  return {
    version: 1,
    operationMode: 'local-draft',
    ingredient: {
      type: 'FOOD',
      name: 'Duck egg',
      tagIds: ['tag-egg'],
      procurementSkus: [
        {
          sku: 'duck-egg-tray',
          name: 'Duck egg supplier tray',
          supplierName: 'QA Farm',
          purchaseUnit: 'tray',
          purchaseToBaseRatio: 600,
          currentPurchasePrice: 42,
          sourceTier: 'WHOLESALE',
        },
      ],
    },
    nutritionProfiles: [
      {
        id: 'usda-duck-egg-raw',
        name: 'Duck egg raw profile',
        dataSource: 'USDA_FDC',
        externalId: '123',
        category: 'EGG',
        basis: 'PER_100G',
        preparationState: 'raw',
        nutrients: {
          proteinG: { value: 13, unit: 'g' },
          fatG: { value: 13, unit: 'g' },
          linoleicAcidG: { value: 1, unit: 'g' },
          energyKcal: { value: 185, unit: 'kcal' },
          vitaminAIu: { value: 500, unit: 'IU' },
        },
        isPrimary: true,
      },
    ],
    sourceCandidates: [
      {
        sourceId: 'USDA_FDC:123',
        sourceName: 'USDA FoodData Central',
        source: 'USDA_FDC',
        matchedName: 'Duck egg, raw',
        stateTags: ['raw'],
        essentialCoveragePercent: 88,
      },
    ],
    dbAlignmentReport: {
      id: 'alignment-ok',
      status: 'passing',
    },
    operatorConfirmation: {
      localWriteApproved: true,
      productionPackageApproved: false,
    },
    ...overrides,
  };
}

function makeSupplementManifest(
  overrides: Partial<IngredientImportManifest> = {},
): IngredientImportManifest {
  return {
    version: 1,
    operationMode: 'local-draft',
    ingredient: {
      type: 'SUPPLEMENT',
      name: 'Fish oil',
      brand: 'Nordic Test',
      productModel: '1000 mg',
      tagIds: ['tag-supplement'],
    },
    packageEvidence: {
      packageImages: [{ uri: 'cos://labels/fish-oil-front.jpg' }],
      labelSources: [],
    },
    supplementLabel: {
      servingSize: '1 capsule',
      activeNutrients: {
        epaMg: 180,
        dhaMg: 120,
      },
    },
    dbAlignmentReport: {
      id: 'alignment-ok',
      status: 'passing',
    },
    operatorConfirmation: {
      localWriteApproved: true,
      productionPackageApproved: false,
    },
    ...overrides,
  };
}

function makePrisma(
  options: {
    existingIngredient?: { id: string } | null;
  } = {},
) {
  const prisma = {
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    ingredient: {
      findFirst: jest
        .fn()
        .mockResolvedValue(options.existingIngredient ?? null),
      create: jest.fn().mockResolvedValue({ id: 'ingredient-1' }),
      update: jest.fn().mockResolvedValue({ id: 'existing-ingredient' }),
    },
    nutritionFood: {
      create: jest.fn().mockResolvedValue({ id: 'nutrition-food-1' }),
    },
    nutritionFoodMapping: {
      create: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
    },
    ingredientTagAssignment: {
      create: jest.fn().mockResolvedValue({ id: 'tag-assignment-1' }),
    },
    procurementSku: {
      create: jest.fn().mockResolvedValue({ id: 'procurement-sku-1' }),
    },
  };

  return prisma;
}
