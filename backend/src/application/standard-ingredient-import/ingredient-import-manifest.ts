export type IngredientImportType = 'FOOD' | 'SUPPLEMENT';
export type IngredientImportMode = 'local-draft' | 'production-package';

export interface ManifestValidationIssue {
  code:
    | 'INVALID_VERSION'
    | 'INGREDIENT_TYPE_NOT_SUPPORTED'
    | 'WHOLE_DATABASE_MIGRATION_FORBIDDEN'
    | 'FOOD_NUTRITION_REQUIRED'
    | 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED'
    | 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN'
    | 'LOCAL_WRITE_ALIGNMENT_REQUIRED'
    | 'LOCAL_WRITE_CONFIRMATION_REQUIRED'
    | 'PRODUCTION_PACKAGE_CONFIRMATION_REQUIRED'
    | 'NUTRIENT_VALUE_MISSING';
  path: string;
  message: string;
}

export interface ManifestValidationResult {
  ok: boolean;
  errors: ManifestValidationIssue[];
  warnings: ManifestValidationIssue[];
}

export interface IngredientImportManifest {
  version: 1;
  ingredient: IngredientImportDescriptor;
  operationMode: IngredientImportMode;
  nutritionProfiles?: IngredientImportNutritionProfile[];
  sourceCandidates?: IngredientImportSourceCandidate[];
  packageEvidence?: SupplementPackageEvidence;
  dbAlignmentReport?: DbAlignmentReport;
  operatorConfirmation?: OperatorConfirmation;
  wholeDatabaseMigration?: boolean;
  migrationFlags?: MigrationFlags;
}

export interface IngredientImportDescriptor {
  type: IngredientImportType;
  name: string;
  procurementSkus?: ProcurementSkuManifest[];
}

export interface ProcurementSkuManifest {
  sku: string;
  supplier?: string;
}

export interface IngredientImportNutritionProfile {
  id: string;
  basis: string;
  nutrients: Record<string, IngredientImportNutrientValue>;
}

export interface IngredientImportNutrientValue {
  value: number | string | null;
  unit?: string;
  measuredZero?: boolean;
}

export interface IngredientImportSourceCandidate {
  sourceId: string;
  sourceName: string;
  matchedName?: string;
}

export interface SupplementPackageEvidence {
  metadata?: {
    source?: string;
    capturedAt?: string;
  };
  packageImages?: SupplementPackageImage[];
  labelSources?: SupplementLabelSource[];
}

export interface SupplementPackageImage {
  uri: string;
  kind?: string;
}

export interface SupplementLabelSource {
  uri?: string;
  sourceId?: string;
  labelText?: string;
}

export interface DbAlignmentReport {
  id?: string;
  status?: string;
}

export interface OperatorConfirmation {
  localWriteApproved?: boolean;
  productionPackageApproved?: boolean;
}

export interface MigrationFlags {
  wholeDatabase?: boolean;
}

export function validateIngredientImportManifest(
  manifest: IngredientImportManifest,
): ManifestValidationResult {
  const errors: ManifestValidationIssue[] = [];

  if (manifest.version !== 1) {
    errors.push({
      code: 'INVALID_VERSION',
      path: 'version',
      message: 'Ingredient import manifests must declare version 1.',
    });
  }

  const ingredientType = manifest.ingredient?.type;
  if (ingredientType !== 'FOOD' && ingredientType !== 'SUPPLEMENT') {
    errors.push({
      code: 'INGREDIENT_TYPE_NOT_SUPPORTED',
      path: 'ingredient.type',
      message: 'Ingredient import v1 only supports FOOD and SUPPLEMENT.',
    });
  }

  if (
    manifest.operationMode !== 'local-draft' &&
    manifest.operationMode !== 'production-package'
  ) {
    errors.push({
      code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
      path: 'operationMode',
      message:
        'Ingredient import manifests may only run as local drafts or production package exports.',
    });
  }

  if (manifest.wholeDatabaseMigration === true) {
    errors.push({
      code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
      path: 'wholeDatabaseMigration',
      message: 'Whole database migration flags are not allowed.',
    });
  }

  if (manifest.migrationFlags?.wholeDatabase === true) {
    errors.push({
      code: 'WHOLE_DATABASE_MIGRATION_FORBIDDEN',
      path: 'migrationFlags.wholeDatabase',
      message: 'Whole database migration flags are not allowed.',
    });
  }

  if (ingredientType === 'FOOD') {
    validateFoodManifest(manifest, errors);
  }

  if (ingredientType === 'SUPPLEMENT') {
    validateSupplementManifest(manifest, errors);
  }

  validateNutrientValues(manifest.nutritionProfiles ?? [], errors);
  validateOperationApprovals(manifest, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings: [],
  };
}

function validateFoodManifest(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): void {
  if (!hasItems(manifest.nutritionProfiles)) {
    errors.push({
      code: 'FOOD_NUTRITION_REQUIRED',
      path: 'nutritionProfiles',
      message: 'FOOD import manifests must include nutrition profiles.',
    });
  }

  if (!hasItems(manifest.sourceCandidates)) {
    errors.push({
      code: 'FOOD_NUTRITION_REQUIRED',
      path: 'sourceCandidates',
      message: 'FOOD import manifests must include source candidates.',
    });
  }
}

function validateSupplementManifest(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): void {
  if (hasItems(manifest.ingredient.procurementSkus)) {
    errors.push({
      code: 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN',
      path: 'ingredient.procurementSkus',
      message: 'SUPPLEMENT import manifests must not include procurement SKUs.',
    });
  }

  if (!hasPackageEvidence(manifest.packageEvidence)) {
    errors.push({
      code: 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED',
      path: 'packageEvidence',
      message:
        'SUPPLEMENT import manifests must include a package photo or equivalent label source.',
    });
  }
}

function validateNutrientValues(
  profiles: IngredientImportNutritionProfile[],
  errors: ManifestValidationIssue[],
): void {
  profiles.forEach((profile, profileIndex) => {
    for (const [nutrientCode, nutrientValue] of Object.entries(
      profile.nutrients,
    )) {
      if (isNutrientValueMissing(nutrientValue)) {
        errors.push({
          code: 'NUTRIENT_VALUE_MISSING',
          path: `nutritionProfiles[${profileIndex}].nutrients.${nutrientCode}.value`,
          message:
            'Nutrient values must be numeric and non-zero unless explicitly marked as a measured zero.',
        });
      }
    }
  });
}

function validateOperationApprovals(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): void {
  if (manifest.operationMode === 'local-draft') {
    if (!hasPassingDbAlignmentReport(manifest.dbAlignmentReport)) {
      errors.push({
        code: 'LOCAL_WRITE_ALIGNMENT_REQUIRED',
        path: 'dbAlignmentReport',
        message:
          'Local draft writes require a passing DB alignment report id.',
      });
    }

    if (manifest.operatorConfirmation?.localWriteApproved !== true) {
      errors.push({
        code: 'LOCAL_WRITE_CONFIRMATION_REQUIRED',
        path: 'operatorConfirmation.localWriteApproved',
        message:
          'Local draft writes require explicit operator confirmation.',
      });
    }
  }

  if (
    manifest.operationMode === 'production-package' &&
    manifest.operatorConfirmation?.productionPackageApproved !== true
  ) {
    errors.push({
      code: 'PRODUCTION_PACKAGE_CONFIRMATION_REQUIRED',
      path: 'operatorConfirmation.productionPackageApproved',
      message:
        'Production package exports require explicit operator confirmation.',
    });
  }
}

function hasItems<T>(items: T[] | undefined): boolean {
  return Array.isArray(items) && items.length > 0;
}

function hasPackageEvidence(
  packageEvidence: SupplementPackageEvidence | undefined,
): boolean {
  if (!packageEvidence) {
    return false;
  }

  return (
    hasUsablePackageImage(packageEvidence.packageImages) ||
    hasEquivalentLabelSource(packageEvidence.labelSources)
  );
}

function hasUsablePackageImage(
  packageImages: SupplementPackageImage[] | undefined,
): boolean {
  return (
    packageImages?.some((image) => image.uri.trim().length > 0) === true
  );
}

function hasEquivalentLabelSource(
  labelSources: SupplementLabelSource[] | undefined,
): boolean {
  return (
    labelSources?.some(
      (source) =>
        hasText(source.uri) ||
        hasText(source.sourceId) ||
        hasText(source.labelText),
    ) === true
  );
}

function hasPassingDbAlignmentReport(
  report: DbAlignmentReport | undefined,
): boolean {
  return hasText(report?.id) && report?.status === 'passing';
}

function isNutrientValueMissing(
  nutrientValue: IngredientImportNutrientValue,
): boolean {
  const value = nutrientValue.value;

  if (value === null) {
    return true;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return true;
    }
    return isNumericValueMissing(Number(trimmedValue), nutrientValue);
  }

  return isNumericValueMissing(value, nutrientValue);
}

function isNumericValueMissing(
  value: number,
  nutrientValue: IngredientImportNutrientValue,
): boolean {
  if (!Number.isFinite(value)) {
    return true;
  }

  return value === 0 && nutrientValue.measuredZero !== true;
}

function hasText(value: string | undefined): boolean {
  return value?.trim().length ? true : false;
}
