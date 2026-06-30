import {
  buildProductionMigrationPackage,
  type ProductionMigrationPackageFiles,
} from 'src/application/standard-ingredient-import/production-package';
import type {
  IngredientImportManifest,
  LocalIngredientImportAudit,
} from 'src/application/standard-ingredient-import';

describe('buildProductionMigrationPackage', () => {
  it('refuses export without production-package confirmation', async () => {
    await expect(
      buildProductionMigrationPackage({
        prisma: makePrisma(),
        manifest: makeFoodProductionManifest({
          operatorConfirmation: {
            localWriteApproved: true,
            productionPackageApproved: false,
          },
        }),
        localImportAudit: makeAudit(),
        outputDir: '/tmp/package',
        writePackageFile: jest.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'PRODUCTION_PACKAGE_CONFIRMATION_REQUIRED',
    });
  });

  it('refuses export without a passing production DB alignment report', async () => {
    await expect(
      buildProductionMigrationPackage({
        prisma: makePrisma(),
        manifest: makeFoodProductionManifest({
          dbAlignmentReport: {
            id: '',
            status: 'not-run',
          },
        }),
        localImportAudit: makeAudit(),
        outputDir: '/tmp/package',
        writePackageFile: jest.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'PRODUCTION_DB_ALIGNMENT_REQUIRED',
    });
  });


  it('refuses export when local apply audit is missing', async () => {
    await expect(
      buildProductionMigrationPackage({
        prisma: makePrisma(),
        manifest: makeFoodProductionManifest(),
        localImportAudit: null,
        outputDir: '/tmp/package',
        writePackageFile: jest.fn(),
      }),
    ).rejects.toMatchObject({ code: 'LOCAL_IMPORT_AUDIT_REQUIRED' });
  });

  it('emits package files containing only records listed in the local audit', async () => {
    const writes: Record<string, string> = {};
    const writePackageFile = jest.fn(
      async (_outputDir: string, fileName: keyof ProductionMigrationPackageFiles, body: string) => {
        writes[fileName] = body;
      },
    );

    const result = await buildProductionMigrationPackage({
      prisma: makePrisma({
        ingredients: [
          { id: 'ingredient-1', name: 'Duck egg', type: 'FOOD' },
          { id: 'unrelated-ingredient', name: 'Chicken', type: 'FOOD' },
        ],
      }),
      manifest: makeFoodProductionManifest(),
      localImportAudit: makeAudit(),
      outputDir: '/tmp/duck-egg-package',
      writePackageFile,
    });

    expect(writePackageFile).toHaveBeenCalledTimes(6);
    expect(result.files.upSql).toContain('ingredient-1');
    expect(result.files.upSql).not.toContain('unrelated-ingredient');
    expect(result.files.downSql).toContain('DELETE FROM procurement_sku');
    expect(result.files.downSql).toContain('DELETE FROM ingredient');
    expect(result.files.reviewSummary).toContain('Duck egg');
    expect(result.files.reviewSummary).toContain('Unit audit');
    expect(writes['manifest.json']).toContain('"wholeDatabaseMigration": false');
    expect(writes['up.sql']).toBe(result.files.upSql);
  });

  it('emits Prisma Decimal values as numeric SQL literals', async () => {
    const result = await buildProductionMigrationPackage({
      prisma: makePrisma({
        ingredients: [
          {
            id: 'ingredient-1',
            name: 'Duck egg',
            type: 'FOOD',
            currentPricePerPurchaseUnit: decimalLike('0'),
            effectivePricePerPurchaseUnit: decimalLike('12.34'),
          },
        ],
      }),
      manifest: makeFoodProductionManifest(),
      localImportAudit: makeAudit(),
      outputDir: '/tmp/package',
      writePackageFile: jest.fn(),
    });

    expect(result.files.upSql).toContain("VALUES (0, 12.34, 'ingredient-1'");
    expect(result.files.upSql).not.toContain("'\"0\"'");
    expect(result.files.upSql).not.toContain("'\"12.34\"'");
  });

  it('includes FOOD-related records in deterministic parent-before-child order', async () => {
    const result = await buildProductionMigrationPackage({
      prisma: makePrisma(),
      manifest: makeFoodProductionManifest(),
      localImportAudit: makeAudit(),
      outputDir: '/tmp/package',
      writePackageFile: jest.fn(),
    });

    const upSql = result.files.upSql;
    expect(upSql.indexOf('INSERT INTO ingredient')).toBeLessThan(
      upSql.indexOf('INSERT INTO nutrition_food'),
    );
    expect(upSql.indexOf('INSERT INTO nutrition_food')).toBeLessThan(
      upSql.indexOf('INSERT INTO nutrition_food_mapping'),
    );
    expect(upSql.indexOf('INSERT INTO nutrition_food_mapping')).toBeLessThan(
      upSql.indexOf('INSERT INTO ingredient_tag_assignment'),
    );
    expect(upSql.indexOf('INSERT INTO ingredient_tag_assignment')).toBeLessThan(
      upSql.indexOf('INSERT INTO procurement_sku'),
    );
    expect(result.files.downSql.indexOf('DELETE FROM procurement_sku')).toBeLessThan(
      result.files.downSql.indexOf('DELETE FROM ingredient_tag_assignment'),
    );
  });

  it('omits procurement SKU records for SUPPLEMENT packages and reports evidence status', async () => {
    const result = await buildProductionMigrationPackage({
      prisma: makePrisma({
        procurementSkus: [{ id: 'procurement-sku-1', ingredientId: 'ingredient-1' }],
      }),
      manifest: makeSupplementProductionManifest(),
      localImportAudit: makeAudit({
        procurementSkuIds: [],
        nutritionFoodIds: [],
        nutritionFoodMappingIds: [],
      }),
      outputDir: '/tmp/fish-oil-package',
      writePackageFile: jest.fn(),
    });

    expect(result.files.upSql).not.toContain('INSERT INTO procurement_sku');
    expect(result.files.reviewSummary).toContain('Supplement evidence: present');
  });
});

function decimalLike(value: string) {
  return {
    decimalPlaces: () => (value.split('.')[1] ?? '').length,
    toJSON: () => value,
    toString: () => value,
  };
}

function makeFoodProductionManifest(
  overrides: Partial<IngredientImportManifest> = {},
): IngredientImportManifest {
  return {
    version: 1,
    operationMode: 'production-package',
    ingredient: {
      type: 'FOOD',
      name: 'Duck egg',
      tagIds: ['tag-egg'],
    },
    nutritionProfiles: [
      {
        id: 'nutrition-food-1',
        name: 'Duck egg raw profile',
        dataSource: 'USDA_FDC',
        category: 'EGG',
        basis: 'PER_100G',
        preparationState: 'raw',
        nutrients: {
          fatG: { value: 13, unit: 'g' },
          proteinG: { value: 13, unit: 'g' },
        },
        isPrimary: true,
      },
    ],
    sourceCandidates: [{ sourceId: 'USDA:123', sourceName: 'USDA FDC' }],
    dbAlignmentReport: {
      id: 'production-alignment-ok',
      status: 'passing',
    },
    operatorConfirmation: {
      localWriteApproved: false,
      productionPackageApproved: true,
    },
    ...overrides,
  };
}

function makeSupplementProductionManifest(): IngredientImportManifest {
  return {
    version: 1,
    operationMode: 'production-package',
    ingredient: {
      type: 'SUPPLEMENT',
      name: 'Fish oil',
      brand: 'Nordic Test',
    },
    packageEvidence: {
      packageImages: [{ uri: 'cos://labels/fish-oil.jpg' }],
      labelSources: [],
    },
    supplementLabel: {
      servingSize: '1 capsule',
    },
    dbAlignmentReport: {
      id: 'production-alignment-ok',
      status: 'passing',
    },
    operatorConfirmation: {
      localWriteApproved: false,
      productionPackageApproved: true,
    },
  };
}

function makeAudit(
  overrides: Partial<LocalIngredientImportAudit> = {},
): LocalIngredientImportAudit {
  return {
    version: 1,
    createdAt: '2026-06-16T08:00:00.000Z',
    alignmentId: 'alignment-ok',
    dbAlignmentStatus: 'passing',
    manifestHash: 'manifest-hash',
    ingredientIds: ['ingredient-1'],
    nutritionFoodIds: ['nutrition-food-1'],
    nutritionFoodMappingIds: ['mapping-1'],
    ingredientTagAssignmentIds: ['tag-assignment-1'],
    procurementSkuIds: ['procurement-sku-1'],
    nutritionAudits: [
      {
        profileId: 'nutrition-food-1',
        essentialCoveragePercent: 88,
        blockingIssues: [],
        reviewIssues: [],
      },
    ],
    ...overrides,
  };
}

function makePrisma(
  overrides: Partial<{
    ingredients: Array<Record<string, unknown>>;
    nutritionFoods: Array<Record<string, unknown>>;
    mappings: Array<Record<string, unknown>>;
    tagAssignments: Array<Record<string, unknown>>;
    procurementSkus: Array<Record<string, unknown>>;
  }> = {},
) {
  return {
    ingredient: {
      findMany: jest.fn().mockResolvedValue(
        overrides.ingredients ?? [
          { id: 'ingredient-1', name: 'Duck egg', type: 'FOOD' },
        ],
      ),
    },
    nutritionFood: {
      findMany: jest.fn().mockResolvedValue(
        overrides.nutritionFoods ?? [
          { id: 'nutrition-food-1', name: 'Duck egg raw profile' },
        ],
      ),
    },
    nutritionFoodMapping: {
      findMany: jest.fn().mockResolvedValue(
        overrides.mappings ?? [
          {
            id: 'mapping-1',
            ingredientId: 'ingredient-1',
            nutritionFoodId: 'nutrition-food-1',
          },
        ],
      ),
    },
    ingredientTagAssignment: {
      findMany: jest.fn().mockResolvedValue(
        overrides.tagAssignments ?? [
          {
            id: 'tag-assignment-1',
            ingredientId: 'ingredient-1',
            tagId: 'tag-egg',
          },
        ],
      ),
    },
    procurementSku: {
      findMany: jest.fn().mockResolvedValue(
        overrides.procurementSkus ?? [
          {
            id: 'procurement-sku-1',
            ingredientId: 'ingredient-1',
            name: 'Duck egg supplier tray',
          },
        ],
      ),
    },
  };
}
