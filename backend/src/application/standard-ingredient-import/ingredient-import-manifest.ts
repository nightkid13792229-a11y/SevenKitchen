import {
  rankNutritionSourceCandidates,
  toApprovedNutritionSource,
  type ApprovedNutritionSource,
  type NutritionSourceCandidate,
  type NutritionStateTag,
} from './source-policy';

export type IngredientImportType = 'FOOD' | 'SUPPLEMENT';
export type IngredientImportMode = 'local-draft' | 'production-package';

export interface ManifestValidationIssue {
  code:
    | 'INVALID_MANIFEST_SHAPE'
    | 'INVALID_VERSION'
    | 'INGREDIENT_TYPE_NOT_SUPPORTED'
    | 'WHOLE_DATABASE_MIGRATION_FORBIDDEN'
    | 'FOOD_NUTRITION_REQUIRED'
    | 'FOOD_PROFILE_SOURCE_CANDIDATE_REQUIRED'
    | 'FOOD_PROFILE_SOURCE_NOT_APPROVED'
    | 'FOOD_SOURCE_CANDIDATE_NOT_APPROVED'
    | 'CFCT_FALLBACK_SEARCH_REQUIRED'
    | 'CFCT_FALLBACK_SEARCH_INCOMPLETE'
    | 'SUPPLEMENT_PACKAGE_PHOTO_REQUIRED'
    | 'SUPPLEMENT_PROCUREMENT_SKU_FORBIDDEN'
    | 'LOCAL_WRITE_ALIGNMENT_REQUIRED'
    | 'LOCAL_WRITE_CONFIRMATION_REQUIRED'
    | 'PRODUCTION_DB_ALIGNMENT_REQUIRED'
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
  updateExistingIngredientId?: string;
  nutritionProfiles?: IngredientImportNutritionProfile[];
  sourceCandidates?: IngredientImportSourceCandidate[];
  sourceSearchLog?: NutritionSourceSearchEntry[];
  packageEvidence?: SupplementPackageEvidence;
  supplementLabel?: SupplementLabelEvidence;
  dbAlignmentReport?: DbAlignmentReport;
  operatorConfirmation?: OperatorConfirmation;
  wholeDatabaseMigration?: boolean;
  migrationFlags?: MigrationFlags;
}

export interface IngredientImportDescriptor {
  type: IngredientImportType;
  name: string;
  brand?: string | null;
  productModel?: string | null;
  tagIds?: string[];
  notes?: string | null;
  procurementSkus?: ProcurementSkuManifest[];
}

export interface ProcurementSkuManifest {
  sku: string;
  name?: string;
  supplier?: string;
  supplierName?: string;
  brand?: string | null;
  productModel?: string | null;
  purchaseChannel?: string | null;
  purchaseUnit?: string | null;
  purchaseToBaseRatio?: number | null;
  currentPurchasePrice?: number | null;
  referencePurchasePrice?: number | null;
  sourceTier?: 'ORGANIC' | 'MARKET_PREMIUM' | 'WHOLESALE' | null;
  notes?: string | null;
}

export interface IngredientImportNutritionProfile {
  id: string;
  name?: string;
  nameEn?: string | null;
  dataSource?: string;
  externalId?: string | null;
  category?: string;
  basis: string;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  isPrimary?: boolean;
  yieldRate?: number;
  notes?: string | null;
  sourceForms?: Record<
    string,
    Record<string, string | number | boolean | null>
  >;
  nutritionData?: Record<string, unknown>;
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
  source?: string;
  matchedName?: string;
  stateTags?: NutritionStateTag[];
  essentialCoveragePercent?: number;
}

export interface NutritionSourceSearchEntry {
  source?: string;
  status?: string;
  query?: string;
  searchedAt?: string;
  evidenceUri?: string;
  notes?: string;
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

export interface SupplementLabelEvidence {
  servingSize?: string;
  activeNutrients?: Record<string, number | string | null>;
  notes?: string;
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

  const foodNutritionProfilesAreValid = validateFoodNutritionProfileShapes(
    manifest,
    errors,
  );

  if (!hasItems(manifest.sourceCandidates)) {
    errors.push({
      code: 'FOOD_NUTRITION_REQUIRED',
      path: 'sourceCandidates',
      message: 'FOOD import manifests must include source candidates.',
    });
  } else {
    if (!validateFoodSourceCandidateShapes(manifest, errors)) {
      return;
    }
    validateFoodSourceCandidates(manifest, errors);
    if (foodNutritionProfilesAreValid) {
      validateFoodProfileSourceBindings(manifest, errors);
    }
  }

  if (
    foodNutritionProfilesAreValid &&
    foodManifestUsesCfctFallback(manifest) &&
    !hasItems(manifest.sourceSearchLog)
  ) {
    errors.push({
      code: 'CFCT_FALLBACK_SEARCH_REQUIRED',
      path: 'sourceSearchLog',
      message:
        'FOOD imports using CFCT fallback data must include source search evidence.',
    });
  } else if (
    foodNutritionProfilesAreValid &&
    foodManifestUsesCfctFallback(manifest) &&
    !hasCompleteCfctFallbackSearchEvidence(manifest.sourceSearchLog)
  ) {
    errors.push({
      code: 'CFCT_FALLBACK_SEARCH_INCOMPLETE',
      path: 'sourceSearchLog',
      message:
        'FOOD imports using CFCT fallback data must document an exhausted search of every primary official nutrition source.',
    });
  }
}

function foodManifestUsesCfctFallback(
  manifest: IngredientImportManifest,
): boolean {
  return (
    Array.isArray(manifest.nutritionProfiles) &&
    manifest.nutritionProfiles.some(
      (profile) =>
        isRecord(profile) && hasCfctSourceToken(profile.dataSource),
    )
  );
}

function hasCfctSourceToken(value: unknown): boolean {
  if (!hasTextValue(value)) {
    return false;
  }

  const normalizedValue = value.trim();

  return (
    normalizedValue.toUpperCase().split(/[^A-Z0-9]+/).includes('CFCT')
  );
}

const primaryOfficialNutritionSources = [
  'USDA_FDC',
  'NZFCD',
  'NEVO',
  'MEXT',
  'AFCD',
  'AUSNUT',
  'CNF',
  'COFID',
  'CIQUAL',
];

const exhaustedSearchStatuses = new Set([
  'searched_no_match',
  'state_mismatch',
  'coverage_too_low',
  'source_unavailable',
]);

function hasCompleteCfctFallbackSearchEvidence(
  sourceSearchLog: NutritionSourceSearchEntry[] | undefined,
): boolean {
  if (!Array.isArray(sourceSearchLog)) {
    return false;
  }

  const entriesBySource = new Map<string, Record<string, unknown>>();
  for (const entry of sourceSearchLog) {
    if (!isRecord(entry) || !hasCompleteSearchEvidence(entry)) {
      return false;
    }

    const sourceValue = entry.source;
    if (!hasTextValue(sourceValue)) {
      return false;
    }

    const source = sourceValue.trim().toUpperCase();
    if (entriesBySource.has(source)) {
      return false;
    }
    entriesBySource.set(source, entry);
  }

  const cfctEntry = entriesBySource.get('CFCT');
  if (cfctEntry?.status !== 'candidate_found') {
    return false;
  }

  return primaryOfficialNutritionSources.every((source) => {
    const entry = entriesBySource.get(source);
    return (
      entry !== undefined &&
      exhaustedSearchStatuses.has(entry.status as string)
    );
  });
}

function hasCompleteSearchEvidence(entry: Record<string, unknown>): boolean {
  return (
    hasTextValue(entry.source) &&
    hasTextValue(entry.status) &&
    hasTextValue(entry.query) &&
    hasTextValue(entry.searchedAt) &&
    Number.isFinite(Date.parse(entry.searchedAt)) &&
    hasTextValue(entry.evidenceUri) &&
    hasTextValue(entry.notes)
  );
}

function hasTextValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateFoodSourceCandidateShapes(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): boolean {
  let isValid = true;

  (manifest.sourceCandidates ?? []).forEach((candidate, candidateIndex) => {
    if (!isRecord(candidate)) {
      isValid = false;
      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: `sourceCandidates[${candidateIndex}]`,
        message: 'FOOD source candidates must be objects.',
      });
      return;
    }

    const stateTags = candidate.stateTags;
    if (stateTags === undefined) {
      return;
    }

    if (
      !Array.isArray(stateTags) ||
      stateTags.some((stateTag) => !isNutritionStateTag(stateTag))
    ) {
      isValid = false;
      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: `sourceCandidates[${candidateIndex}].stateTags`,
        message:
          'FOOD source candidate state tags must be an array of supported nutrition states.',
      });
    }

    for (const field of [
      'sourceId',
      'sourceName',
      'source',
      'matchedName',
    ]) {
      if (candidate[field] !== undefined && !hasTextValue(candidate[field])) {
        isValid = false;
        errors.push({
          code: 'INVALID_MANIFEST_SHAPE',
          path: `sourceCandidates[${candidateIndex}].${field}`,
          message: `FOOD source candidate ${field} must be text when provided.`,
        });
      }
    }
  });

  return isValid;
}

function validateFoodNutritionProfileShapes(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): boolean {
  if (!Array.isArray(manifest.nutritionProfiles)) {
    return manifest.nutritionProfiles === undefined;
  }

  let isValid = true;
  manifest.nutritionProfiles.forEach((profile, profileIndex) => {
    if (!isRecord(profile)) {
      isValid = false;
      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: `nutritionProfiles[${profileIndex}]`,
        message: 'FOOD nutrition profiles must be objects.',
      });
      return;
    }

    for (const field of ['dataSource', 'preparationState']) {
      if (profile[field] !== undefined && !hasTextValue(profile[field])) {
        isValid = false;
        errors.push({
          code: 'INVALID_MANIFEST_SHAPE',
          path: `nutritionProfiles[${profileIndex}].${field}`,
          message: `FOOD nutrition profile ${field} must be text when provided.`,
        });
      }
    }
  });

  return isValid;
}

function validateFoodSourceCandidates(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): void {
  const requestedState = resolveRequestedNutritionState(manifest);
  const candidates = (manifest.sourceCandidates ?? [])
    .map(toNutritionSourceCandidate)
    .filter(
      (candidate): candidate is NutritionSourceCandidate => candidate !== null,
    );
  const rankedCandidates = rankNutritionSourceCandidates({
    requestedState,
    candidates,
  });
  const hasUsableCandidate = rankedCandidates.some(
    (candidate) => candidate.essentialCoveragePercent >= 60,
  );

  if (hasUsableCandidate) {
    return;
  }

  errors.push({
    code: 'FOOD_SOURCE_CANDIDATE_NOT_APPROVED',
    path: 'sourceCandidates',
    message:
      'FOOD source candidates must include an approved nutrition source with matching state tags and at least 60 percent essential coverage.',
  });
}

function toNutritionSourceCandidate(
  candidate: IngredientImportSourceCandidate,
): NutritionSourceCandidate | null {
  const source = firstText(
    candidate.source,
    sourceFromSourceId(candidate.sourceId),
  );
  if (!source) {
    return null;
  }

  return {
    source,
    matchedName: candidate.matchedName,
    stateTags: candidate.stateTags,
    essentialCoveragePercent:
      typeof candidate.essentialCoveragePercent === 'number'
        ? candidate.essentialCoveragePercent
        : 0,
  };
}

function validateFoodProfileSourceBindings(
  manifest: IngredientImportManifest,
  errors: ManifestValidationIssue[],
): void {
  const candidates = (manifest.sourceCandidates ?? [])
    .map(toNutritionSourceCandidate)
    .filter(
      (candidate): candidate is NutritionSourceCandidate => candidate !== null,
    );

  if (!Array.isArray(manifest.nutritionProfiles)) {
    return;
  }

  manifest.nutritionProfiles.forEach((profile, profileIndex) => {
    const approvedSource = resolveProfileApprovedSource(profile.dataSource);
    if (approvedSource === undefined) {
      errors.push({
        code: 'FOOD_PROFILE_SOURCE_NOT_APPROVED',
        path: `nutritionProfiles[${profileIndex}].dataSource`,
        message:
          'FOOD nutrition profiles must declare dataSource as an approved nutrition source code.',
      });
      return;
    }

    const requestedState = resolveProfileNutritionState(profile);
    const rankedCandidates = rankNutritionSourceCandidates({
      requestedState,
      candidates,
    });
    const hasMatchingCandidate = rankedCandidates.some(
      (candidate) =>
        candidate.source === approvedSource &&
        candidate.essentialCoveragePercent >= 60,
    );

    if (hasMatchingCandidate) {
      return;
    }

    errors.push({
      code: 'FOOD_PROFILE_SOURCE_CANDIDATE_REQUIRED',
      path: `nutritionProfiles[${profileIndex}].dataSource`,
      message:
        'Each FOOD nutrition profile must be backed by a matching approved source candidate with matching state tags and at least 60 percent essential coverage.',
    });
  });
}

function resolveProfileApprovedSource(
  dataSource: unknown,
): ApprovedNutritionSource | undefined {
  if (!hasTextValue(dataSource)) {
    return undefined;
  }
  const normalizedSource = dataSource.trim().toUpperCase();
  if (normalizedSource === 'USDA') {
    return 'USDA_FDC';
  }
  if (normalizedSource === 'NZFCD_FOODFILES') {
    return 'NZFCD';
  }

  return toApprovedNutritionSource(normalizedSource);
}

function sourceFromSourceId(sourceId: unknown): string | undefined {
  const prefix = typeof sourceId === 'string' ? sourceId.split(':')[0]?.trim() : undefined;
  if (!prefix) {
    return undefined;
  }
  if (prefix === 'USDA') {
    return 'USDA_FDC';
  }
  return prefix;
}

function resolveRequestedNutritionState(
  manifest: IngredientImportManifest,
): NutritionStateTag {
  return resolveProfileNutritionState(manifest.nutritionProfiles?.[0]);
}

function resolveProfileNutritionState(
  profile: unknown,
): NutritionStateTag {
  const normalizedState = isRecord(profile) && hasTextValue(profile.preparationState)
    ? profile.preparationState.trim()
    : undefined;
  return isNutritionStateTag(normalizedState) ? normalizedState : 'raw';
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
  profiles: unknown,
  errors: ManifestValidationIssue[],
): void {
  if (!Array.isArray(profiles)) {
    if (profiles !== undefined) {
      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: 'nutritionProfiles',
        message: 'Nutrition profiles must be an array.',
      });
    }
    return;
  }

  profiles.forEach((profile, profileIndex) => {
    if (!isRecord(profile)) {
      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: `nutritionProfiles[${profileIndex}]`,
        message: 'Nutrition profiles must be objects.',
      });
      return;
    }

    const hasNutritionData =
      isRecord(profile.nutritionData) &&
      Object.keys(profile.nutritionData).length > 0;

    if (!isRecord(profile.nutrients)) {
      if (hasNutritionData) {
        return;
      }

      errors.push({
        code: 'INVALID_MANIFEST_SHAPE',
        path: `nutritionProfiles[${profileIndex}].nutrients`,
        message: 'Nutrition profile nutrients must be an object.',
      });
      return;
    }

    if (hasNutritionData) {
      return;
    }

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
    if (manifest.operatorConfirmation?.localWriteApproved !== true) {
      errors.push({
        code: 'LOCAL_WRITE_CONFIRMATION_REQUIRED',
        path: 'operatorConfirmation.localWriteApproved',
        message: 'Local draft writes require explicit operator confirmation.',
      });
    }
  }

  if (
    manifest.operationMode === 'production-package' &&
    !hasPassingDbAlignmentReport(manifest.dbAlignmentReport)
  ) {
    errors.push({
      code: 'PRODUCTION_DB_ALIGNMENT_REQUIRED',
      path: 'dbAlignmentReport',
      message:
        'Production package exports require a passing DB alignment report id.',
    });
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
  return packageImages?.some((image) => image.uri.trim().length > 0) === true;
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
  nutrientValue: unknown,
): boolean {
  if (!isRecord(nutrientValue)) {
    return true;
  }

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

  if (typeof value !== 'number') {
    return true;
  }

  return isNumericValueMissing(value, nutrientValue);
}

function isNumericValueMissing(
  value: number,
  nutrientValue: Record<string, unknown>,
): boolean {
  if (!Number.isFinite(value)) {
    return true;
  }

  return value === 0 && nutrientValue.measuredZero !== true;
}

function hasText(value: unknown): value is string {
  return hasTextValue(value);
}

function firstText(...values: unknown[]): string | undefined {
  return values.find((value) => hasText(value))?.trim();
}

const nutritionStateTags: NutritionStateTag[] = [
  'raw',
  'cooked',
  'dried',
  'peeled',
  'unpeeled',
  'oil',
  'powder',
  'prepared',
];

function isNutritionStateTag(value: unknown): value is NutritionStateTag {
  return (
    typeof value === 'string' &&
    nutritionStateTags.includes(value as NutritionStateTag)
  );
}
