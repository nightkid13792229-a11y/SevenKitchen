import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import {
  inferSupplementTargetFieldFromIngredientName,
  mapLegacyDesignSupplementTarget,
  mapLegacySupplementTargetField,
  toDesignSupplementTargetReference,
  type DesignSupplementTargetReference,
} from '../src/domain/ingredient/supplement-target-mapping';
import { readProfileFieldAmount } from '../src/domain/recipe-designer/nutrition-profile-reader';
import type { NutritionProfile } from '../src/domain/ingredient/types';
import {
  inferSupplementTargetsByRemoval,
  type InferredSupplementTarget,
} from '../src/domain/recipe-designer/supplement-target-inference';
import { assessRecipeDraft } from '../src/domain/recipe-designer/recipe-assessment';
import type {
  DesignRecipeAssessmentItemInput,
  FediafAssessmentTarget,
  FediafDogScenarioCode,
} from '../src/domain/recipe-designer/types';
import { PrismaFediafTargetProvider } from '../src/application/recipe-designer/fediaf-target-provider';
import { nutritionDataToNutritionProfile } from '../src/application/nutrition-standard/nutrient-value-resolver';
import { normalizeNutritionProfile } from '../src/domain/ingredient/nutrition-profile.utils';

export interface SupplementTargetV2 {
  fieldPath: string;
  label: string;
  targetValuePerKg: number;
  unit: string;
}

export type SupplementTargetBackfillReason =
  | 'LEGACY_TARGET_FIELD'
  | 'INFERRED_FROM_INGREDIENT_NAME'
  | 'INFERRED_FROM_INGREDIENT_NAME_AND_PROFILE'
  | 'INFERRED_FROM_NUTRITION_GAP'
  | 'ALREADY_HAS_TARGETS'
  | 'MISSING_TARGET_MAPPING'
  | 'MISSING_PROFILE_AMOUNT'
  | 'MISSING_RECIPE_WEIGHT';

export type SupplementTargetBackfillPlan<TTarget> =
  | {
      action: 'update';
      id: string;
      reason: SupplementTargetBackfillReason;
      target: TTarget | TTarget[];
    }
  | {
      action: 'skip' | 'manual_review';
      id: string;
      reason: SupplementTargetBackfillReason;
      target?: undefined;
    };

export interface PlannedRecipeSupplementTargetUpdate {
  id: string;
  target: SupplementTargetV2 | SupplementTargetV2[];
  [key: string]: unknown;
}

export interface PlannedDesignSupplementTargetUpdate {
  id: string;
  target: DesignSupplementTargetReference | DesignSupplementTargetReference[];
  [key: string]: unknown;
}

export interface SupplementTargetBackfillReportInput {
  recipeItemsScanned: number;
  designRecipeItemsScanned: number;
  plannedUpdates: PlannedRecipeSupplementTargetUpdate[];
  plannedDesignUpdates: PlannedDesignSupplementTargetUpdate[];
  skippedExisting: number;
  skippedDesignExisting: number;
  attributedDesignTargetCount: number;
  manualReview: any[];
}

export interface SupplementTargetBackfillReportCounts {
  recipeItemsScanned: number;
  plannedRecipeItemUpdates: number;
  skippedRecipeItemsAlreadyHavingV2Targets: number;
  designRecipeItemsScanned: number;
  plannedDesignRecipeItemUpdates: number;
  designRecipeNutrientGapAttributions: number;
  skippedDesignItemsAlreadyHavingV2Targets: number;
  manualReviewItems: number;
}

export type SupplementTargetBackfillTable =
  | 'recipe_item'
  | 'design_recipe_item';

export interface SupplementTargetBackfillItemRef {
  table: SupplementTargetBackfillTable;
  itemId: string;
}

export interface SupplementTargetBackfillTargetMismatch
  extends SupplementTargetBackfillItemRef {
  approvedTarget: unknown;
  plannedTarget: unknown;
}

export interface SupplementTargetBackfillAllowlistSummary {
  approvedRows: number;
  matchedApprovedRows: number;
  skippedNonAllowlistedPlannedUpdates: SupplementTargetBackfillItemRef[];
  unmatchedApprovedRows: SupplementTargetBackfillItemRef[];
  targetMismatches: SupplementTargetBackfillTargetMismatch[];
}

export type PlannedRecipeSupplementTargetReportRow = {
  table: 'recipe_item';
  recipeItemId: string;
  target: SupplementTargetV2 | SupplementTargetV2[];
} & Record<string, unknown>;

export type PlannedDesignSupplementTargetReportRow = {
  table: 'design_recipe_item';
  designRecipeItemId: string;
  target: DesignSupplementTargetReference | DesignSupplementTargetReference[];
} & Record<string, unknown>;

export interface SupplementTargetBackfillReport {
  counts: SupplementTargetBackfillReportCounts;
  plannedRecipeItemUpdates: PlannedRecipeSupplementTargetReportRow[];
  plannedDesignRecipeItemUpdates: PlannedDesignSupplementTargetReportRow[];
  manualReview: any[];
  allowlist?: SupplementTargetBackfillAllowlistSummary;
}

export interface SupplementTargetBackfillAllowlist {
  rows: Record<string, unknown>[];
}

export interface SupplementTargetBackfillCliOptions {
  apply: boolean;
  reportJsonPath: string | null;
  allowlistJsonPath: string | null;
  includeDesignGapAttribution: boolean;
}

export function buildSupplementTargetBackfillReport(
  input: SupplementTargetBackfillReportInput,
): SupplementTargetBackfillReport {
  return {
    counts: {
      recipeItemsScanned: input.recipeItemsScanned,
      plannedRecipeItemUpdates: input.plannedUpdates.length,
      skippedRecipeItemsAlreadyHavingV2Targets: input.skippedExisting,
      designRecipeItemsScanned: input.designRecipeItemsScanned,
      plannedDesignRecipeItemUpdates: input.plannedDesignUpdates.length,
      designRecipeNutrientGapAttributions: input.attributedDesignTargetCount,
      skippedDesignItemsAlreadyHavingV2Targets: input.skippedDesignExisting,
      manualReviewItems: input.manualReview.length,
    },
    plannedRecipeItemUpdates: input.plannedUpdates.map((update) => {
      const { id, target, ...details } = update;
      return {
        table: 'recipe_item',
        recipeItemId: id,
        ...details,
        target,
      };
    }),
    plannedDesignRecipeItemUpdates: input.plannedDesignUpdates.map(
      (update) => {
        const { id, target, ...details } = update;
        return {
          table: 'design_recipe_item',
          designRecipeItemId: id,
          ...details,
          target,
        };
      },
    ),
    manualReview: input.manualReview,
  };
}

function readFlagPath(argv: string[], flag: string): string | null {
  const equalsArg = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (equalsArg) {
    return equalsArg.slice(flag.length + 1) || null;
  }

  const flagIndex = argv.indexOf(flag);
  if (flagIndex >= 0) {
    return argv[flagIndex + 1] ?? null;
  }

  return null;
}

export function readSupplementTargetBackfillCliOptions(
  argv: string[],
): SupplementTargetBackfillCliOptions {
  const apply = argv.includes('--apply');
  const allowlistJsonPath = readFlagPath(argv, '--allowlist-json');
  if (apply && !allowlistJsonPath) {
    throw new Error(
      'Apply mode for recipe supplement target v2 backfill requires --allowlist-json.',
    );
  }

  return {
    apply,
    reportJsonPath: readFlagPath(argv, '--report-json'),
    allowlistJsonPath,
    includeDesignGapAttribution: argv.includes(
      '--include-design-gap-attribution',
    ),
  };
}

export function shouldBuildAttributedDesignTargets(argv: string[]): boolean {
  const options = readSupplementTargetBackfillCliOptions(argv);
  return (
    !options.allowlistJsonPath || options.includeDesignGapAttribution === true
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toRecordRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function parseSupplementTargetBackfillAllowlist(
  value: unknown,
): SupplementTargetBackfillAllowlist {
  if (Array.isArray(value)) {
    return { rows: toRecordRows(value) };
  }

  if (!isRecord(value)) {
    throw new Error('Allowlist JSON must be an object or array.');
  }

  if (Array.isArray(value.rows)) {
    return { rows: toRecordRows(value.rows) };
  }

  const plannedRows = [
    ...toRecordRows(value.plannedRecipeItemUpdates),
    ...toRecordRows(value.plannedDesignRecipeItemUpdates),
  ].map((row) => ({
    reviewDecision: 'approve',
    ...row,
  }));

  if (plannedRows.length > 0) {
    return { rows: plannedRows };
  }

  throw new Error(
    'Allowlist JSON must contain rows, plannedRecipeItemUpdates, or plannedDesignRecipeItemUpdates.',
  );
}

function loadSupplementTargetBackfillAllowlist(
  path: string,
): SupplementTargetBackfillAllowlist {
  return parseSupplementTargetBackfillAllowlist(
    JSON.parse(readFileSync(path, 'utf8')),
  );
}

function normalizeAllowlistDecision(value: unknown): string | null {
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

function isApprovedAllowlistRow(row: Record<string, unknown>): boolean {
  const decision = normalizeAllowlistDecision(row.reviewDecision);
  return decision === 'approve' || decision === 'approved';
}

function normalizeAllowlistTable(
  value: unknown,
): SupplementTargetBackfillTable | null {
  if (value === 'recipe_item' || value === 'design_recipe_item') {
    return value;
  }
  return null;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readAllowlistRowRef(
  row: Record<string, unknown>,
): SupplementTargetBackfillItemRef | null {
  const table =
    normalizeAllowlistTable(row.table) ??
    (readText(row.recipeItemId) ? 'recipe_item' : null) ??
    (readText(row.designRecipeItemId) ? 'design_recipe_item' : null);
  if (!table) {
    return null;
  }

  const itemId =
    readText(row.itemId) ??
    (table === 'recipe_item'
      ? readText(row.recipeItemId)
      : readText(row.designRecipeItemId));
  return itemId ? { table, itemId } : null;
}

function allowlistKey(ref: SupplementTargetBackfillItemRef): string {
  return `${ref.table}:${ref.itemId}`;
}

const TARGET_COMPARISON_KEYS = [
  'fieldPath',
  'nutrientTargetKey',
  'label',
  'unit',
  'targetValue',
  'targetValuePerKg',
  'expressionBasis',
] as const;

function normalizeTargetForAllowlist(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeTargetForAllowlist);
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const key of TARGET_COMPARISON_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      normalized[key] = value[key];
    }
  }
  return normalized;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function targetsMatch(approvedTarget: unknown, plannedTarget: unknown): boolean {
  if (approvedTarget === undefined) {
    return true;
  }
  return (
    stableStringify(normalizeTargetForAllowlist(approvedTarget)) ===
    stableStringify(normalizeTargetForAllowlist(plannedTarget))
  );
}

export function filterSupplementTargetBackfillReportByAllowlist(
  report: SupplementTargetBackfillReport,
  allowlistInput: SupplementTargetBackfillAllowlist | unknown,
): SupplementTargetBackfillReport {
  const allowlist = parseSupplementTargetBackfillAllowlist(allowlistInput);
  const approvedRows = new Map<
    string,
    { ref: SupplementTargetBackfillItemRef; target: unknown }
  >();
  let approvedRowCount = 0;

  for (const row of allowlist.rows) {
    if (!isApprovedAllowlistRow(row)) {
      continue;
    }

    const ref = readAllowlistRowRef(row);
    if (!ref) {
      continue;
    }

    approvedRowCount += 1;
    approvedRows.set(allowlistKey(ref), {
      ref,
      target: Object.prototype.hasOwnProperty.call(row, 'target')
        ? row.target
        : undefined,
    });
  }

  const matchedKeys = new Set<string>();
  const mismatchedKeys = new Set<string>();
  const skippedNonAllowlistedPlannedUpdates: SupplementTargetBackfillItemRef[] =
    [];
  const targetMismatches: SupplementTargetBackfillTargetMismatch[] = [];

  function isRowAllowed(
    ref: SupplementTargetBackfillItemRef,
    plannedTarget: unknown,
  ): boolean {
    const key = allowlistKey(ref);
    const approvedRow = approvedRows.get(key);
    if (!approvedRow) {
      skippedNonAllowlistedPlannedUpdates.push(ref);
      return false;
    }

    if (!targetsMatch(approvedRow.target, plannedTarget)) {
      mismatchedKeys.add(key);
      targetMismatches.push({
        ...ref,
        approvedTarget: approvedRow.target,
        plannedTarget,
      });
      return false;
    }

    matchedKeys.add(key);
    return true;
  }

  const plannedRecipeItemUpdates = report.plannedRecipeItemUpdates.filter(
    (row) =>
      isRowAllowed(
        { table: 'recipe_item', itemId: row.recipeItemId },
        row.target,
      ),
  );
  const plannedDesignRecipeItemUpdates =
    report.plannedDesignRecipeItemUpdates.filter((row) =>
      isRowAllowed(
        { table: 'design_recipe_item', itemId: row.designRecipeItemId },
        row.target,
      ),
    );

  const unmatchedApprovedRows = [...approvedRows.entries()]
    .filter(([key]) => !matchedKeys.has(key) && !mismatchedKeys.has(key))
    .map(([, row]) => row.ref);

  return {
    ...report,
    counts: {
      ...report.counts,
      plannedRecipeItemUpdates: plannedRecipeItemUpdates.length,
      plannedDesignRecipeItemUpdates: plannedDesignRecipeItemUpdates.length,
    },
    plannedRecipeItemUpdates,
    plannedDesignRecipeItemUpdates,
    allowlist: {
      approvedRows: approvedRowCount,
      matchedApprovedRows: matchedKeys.size,
      skippedNonAllowlistedPlannedUpdates,
      unmatchedApprovedRows,
      targetMismatches,
    },
  };
}

function assertAllowlistReportCanApply(
  report: SupplementTargetBackfillReport,
): void {
  const allowlist = report.allowlist;
  if (!allowlist) {
    return;
  }

  if (allowlist.approvedRows === 0) {
    throw new Error('Apply mode requires at least one approved allowlist row.');
  }

  if (allowlist.targetMismatches.length > 0) {
    throw new Error(
      `Apply blocked: ${allowlist.targetMismatches.length} allowlist target mismatch(es).`,
    );
  }

  if (allowlist.unmatchedApprovedRows.length > 0) {
    throw new Error(
      `Apply blocked: ${allowlist.unmatchedApprovedRows.length} approved allowlist row(s) did not match a planned update.`,
    );
  }

  if (allowlist.matchedApprovedRows === 0) {
    throw new Error('Apply blocked: allowlist did not match any planned update.');
  }
}

interface BaseSupplementBackfillInput {
  id: string;
  ingredientName?: string | null;
  nutrientTargetKey?: string | null;
  nutrientTargetValue?: number | null;
  supplementTargets?: unknown;
  attributedTarget?: InferredSupplementTarget | null;
  attributedTargets?: InferredSupplementTarget[] | null;
}

export interface RecipeSupplementBackfillInput
  extends BaseSupplementBackfillInput {
  nutritionProfile?: unknown;
  exampleWeight?: number | null;
  ratioPercent?: number | null;
  totalRecipeWeightG?: number | null;
}

export function mapLegacySupplementTarget(
  key: string | null | undefined,
  value: number | null | undefined,
): SupplementTargetV2 | null {
  if (!key || !(value && value > 0)) {
    return null;
  }

  const mapped = mapLegacySupplementTargetField(key);
  return mapped
    ? {
        fieldPath: mapped.fieldPath,
        label: mapped.label,
        targetValuePerKg: value,
        unit: mapped.unit,
      }
    : null;
}

export { mapLegacyDesignSupplementTarget };

export function inferDesignSupplementTargetByIngredientName(
  name: string | null | undefined,
): DesignSupplementTargetReference | null {
  const field = inferSupplementTargetFieldFromIngredientName(name);
  return field ? toDesignSupplementTargetReference(field, null) : null;
}

function hasExistingTargets(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function roundTargetValuePerKg(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getAttributedTargets(
  input: BaseSupplementBackfillInput,
): InferredSupplementTarget[] {
  if (Array.isArray(input.attributedTargets) && input.attributedTargets.length) {
    return input.attributedTargets;
  }
  return input.attributedTarget ? [input.attributedTarget] : [];
}

function resolveBackfillItemWeight(input: {
  exampleWeight?: number | null;
  ratioPercent?: number | null;
}) {
  const exampleWeight = Number(input.exampleWeight);
  if (Number.isFinite(exampleWeight) && exampleWeight > 0) {
    return exampleWeight;
  }

  const ratioPercent = Number(input.ratioPercent);
  return Number.isFinite(ratioPercent) && ratioPercent > 0
    ? ratioPercent
    : null;
}

export function planDesignSupplementTargetBackfill(
  input: BaseSupplementBackfillInput,
): SupplementTargetBackfillPlan<DesignSupplementTargetReference> {
  if (hasExistingTargets(input.supplementTargets)) {
    return {
      action: 'skip',
      id: input.id,
      reason: 'ALREADY_HAS_TARGETS',
    };
  }

  const legacyTarget = mapLegacyDesignSupplementTarget(
    input.nutrientTargetKey,
    input.nutrientTargetValue,
  );
  if (legacyTarget) {
    return {
      action: 'update',
      id: input.id,
      reason: 'LEGACY_TARGET_FIELD',
      target: legacyTarget,
    };
  }

  const nameTarget = inferDesignSupplementTargetByIngredientName(
    input.ingredientName,
  );
  if (nameTarget) {
    return {
      action: 'update',
      id: input.id,
      reason: 'INFERRED_FROM_INGREDIENT_NAME',
      target: nameTarget,
    };
  }

  const attributedTargets = getAttributedTargets(input);
  if (attributedTargets.length > 0) {
    const targets = attributedTargets.map((target) =>
      toDesignSupplementTargetReference(target, null),
    );
    return {
      action: 'update',
      id: input.id,
      reason: 'INFERRED_FROM_NUTRITION_GAP',
      target: targets.length === 1 ? targets[0] : targets,
    };
  }

  return {
    action: 'manual_review',
    id: input.id,
    reason: 'MISSING_TARGET_MAPPING',
  };
}

export function planRecipeSupplementTargetBackfill(
  input: RecipeSupplementBackfillInput,
): SupplementTargetBackfillPlan<SupplementTargetV2> {
  if (hasExistingTargets(input.supplementTargets)) {
    return {
      action: 'skip',
      id: input.id,
      reason: 'ALREADY_HAS_TARGETS',
    };
  }

  const legacyTarget = mapLegacySupplementTarget(
    input.nutrientTargetKey,
    input.nutrientTargetValue,
  );
  if (legacyTarget) {
    return {
      action: 'update',
      id: input.id,
      reason: 'LEGACY_TARGET_FIELD',
      target: legacyTarget,
    };
  }

  const attributedTargets = getAttributedTargets(input).filter(
    (target) =>
      Number.isFinite(target.targetValuePerKg) &&
      target.targetValuePerKg > 0,
  );
  if (attributedTargets.length > 0) {
    const targets = attributedTargets.map((target) => ({
      fieldPath: target.fieldPath,
      label: target.label,
      targetValuePerKg: target.targetValuePerKg,
      unit: target.unit,
    }));
    return {
      action: 'update',
      id: input.id,
      reason: 'INFERRED_FROM_NUTRITION_GAP',
      target: targets.length === 1 ? targets[0] : targets,
    };
  }

  const inferredField =
    mapLegacySupplementTargetField(input.nutrientTargetKey) ??
    inferSupplementTargetFieldFromIngredientName(input.ingredientName);
  if (!inferredField) {
    return {
      action: 'manual_review',
      id: input.id,
      reason: 'MISSING_TARGET_MAPPING',
    };
  }

  const itemWeightG = resolveBackfillItemWeight(input);
  const totalRecipeWeightG = Number(input.totalRecipeWeightG);
  if (
    !itemWeightG ||
    !Number.isFinite(totalRecipeWeightG) ||
    totalRecipeWeightG <= 0
  ) {
    return {
      action: 'manual_review',
      id: input.id,
      reason: 'MISSING_RECIPE_WEIGHT',
    };
  }

  const amountRead = readProfileFieldAmount(
    input.nutritionProfile as NutritionProfile,
    inferredField.fieldPath,
    itemWeightG,
  );
  const contributionAmount = Number(amountRead.amount);
  if (
    amountRead.missing ||
    !Number.isFinite(contributionAmount) ||
    contributionAmount <= 0
  ) {
    return {
      action: 'manual_review',
      id: input.id,
      reason: 'MISSING_PROFILE_AMOUNT',
    };
  }

  return {
    action: 'update',
    id: input.id,
    reason: 'INFERRED_FROM_INGREDIENT_NAME_AND_PROFILE',
    target: {
      fieldPath: inferredField.fieldPath,
      label: inferredField.label,
      targetValuePerKg: roundTargetValuePerKg(
        (contributionAmount / totalRecipeWeightG) * 1000,
      ),
      unit: inferredField.unit,
    },
  };
}

function resolveRecipeTotalWeightG(items: any[]): number | null {
  const exampleWeightTotal = items.reduce((total, item) => {
    const value = Number(item.exampleWeight);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  if (exampleWeightTotal > 0) {
    return exampleWeightTotal;
  }

  const ratioWeightTotal = items.reduce((total, item) => {
    const value = Number(item.ratioPercent);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  return ratioWeightTotal > 0 ? ratioWeightTotal : null;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function isGroupedNutritionProfile(value: object): boolean {
  return (
    'meta' in value ||
    'macros' in value ||
    'minerals' in value ||
    'vitamins' in value ||
    'fattyAcids' in value ||
    'aminoAcids' in value ||
    'items' in value
  );
}

function toNutritionProfile(nutritionData: unknown): NutritionProfile | null {
  if (!nutritionData || typeof nutritionData !== 'object') {
    return null;
  }

  if (isGroupedNutritionProfile(nutritionData)) {
    return normalizeNutritionProfile(nutritionData as NutritionProfile);
  }

  return nutritionDataToNutritionProfile(
    nutritionData as Record<string, unknown>,
  );
}

function readSupplementDisplayUnit(properties: unknown): string | null {
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  ) {
    return null;
  }

  return normalizeOptionalText(
    (properties as Record<string, unknown>).display_unit,
  );
}

function resolveSupplementServingUnitLabel(item: any): string | null {
  const ingredient = item.ingredient;
  return (
    normalizeOptionalText(ingredient?.unitDisplayLabel) ??
    readSupplementDisplayUnit(ingredient?.properties) ??
    normalizeOptionalText(ingredient?.purchaseUnit)
  );
}

function withSupplementServingUnit(
  profile: NutritionProfile | null,
  item: any,
): NutritionProfile | null {
  if (!profile || item.ingredient?.type !== 'SUPPLEMENT') {
    return profile;
  }

  const meta = (profile as any).meta ?? {};
  if (
    meta.rawBasisType !== 'PER_SERVING' ||
    meta.servingUnitLabel ||
    meta.amountUnitLabel ||
    meta.usageUnit
  ) {
    return profile;
  }

  const servingUnitLabel = resolveSupplementServingUnitLabel(item);
  if (!servingUnitLabel) {
    return profile;
  }

  return {
    ...profile,
    meta: {
      ...meta,
      amountUnitLabel: servingUnitLabel,
      servingUnitLabel,
      usageUnit: servingUnitLabel,
    },
  };
}

function toAssessmentNutritionProfile(item: any): NutritionProfile | null {
  const profile = toNutritionProfile(
    item.nutritionFood?.nutritionData ?? item.ingredient?.nutritionProfile,
  );
  return withSupplementServingUnit(profile, item);
}

function resolveAssessmentItemName(item: any): string {
  return (
    normalizeOptionalText(item.ingredient?.name) ??
    normalizeOptionalText(item.nutritionFood?.name) ??
    item.id
  );
}

function buildAssessmentItems(
  items: any[],
  omittedItemId?: string,
): DesignRecipeAssessmentItemInput[] {
  return items
    .filter((item) => item.includeInAssessment !== false)
    .filter((item) => item.id !== omittedItemId)
    .map((item) => ({
      id: item.id,
      name: resolveAssessmentItemName(item),
      ingredientType: item.ingredient?.type ?? null,
      weightG: item.weightG,
      nutritionProfile: toAssessmentNutritionProfile(item),
    }));
}

async function getTargetsForScenario(
  provider: PrismaFediafTargetProvider,
  cache: Map<FediafDogScenarioCode, FediafAssessmentTarget[]>,
  scenario: FediafDogScenarioCode,
) {
  const cached = cache.get(scenario);
  if (cached) {
    return cached;
  }

  const targets = await provider.getTargets(scenario);
  cache.set(scenario, targets);
  return targets;
}

async function buildAttributedDesignTargetMap(
  prisma: PrismaClient,
): Promise<Map<string, InferredSupplementTarget[]>> {
  const targetProvider = new PrismaFediafTargetProvider(prisma as any);
  const targetCache = new Map<FediafDogScenarioCode, FediafAssessmentTarget[]>();
  const result = new Map<string, InferredSupplementTarget[]>();
  const designRecipes = await (prisma as any).designRecipe.findMany({
    where: {
      items: {
        some: {
          ingredient: { type: 'SUPPLEMENT' },
        },
      },
    },
    select: {
      id: true,
      fediafDogScenario: true,
      items: {
        select: {
          id: true,
          ingredientId: true,
          weightG: true,
          includeInAssessment: true,
          supplementTargets: true,
          ingredient: {
            select: {
              id: true,
              name: true,
              type: true,
              unitDisplayLabel: true,
              purchaseUnit: true,
              properties: true,
              nutritionProfile: true,
            },
          },
          nutritionFood: {
            select: {
              id: true,
              name: true,
              nutritionData: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  for (const designRecipe of designRecipes) {
    const scenario = designRecipe.fediafDogScenario as FediafDogScenarioCode;
    let targets: FediafAssessmentTarget[];
    try {
      targets = await getTargetsForScenario(targetProvider, targetCache, scenario);
    } catch {
      continue;
    }

    let fullAssessment;
    try {
      fullAssessment = assessRecipeDraft({
        scenario,
        targets,
        items: buildAssessmentItems(designRecipe.items),
      });
    } catch {
      continue;
    }

    for (const item of designRecipe.items) {
      if (
        item.ingredient?.type !== 'SUPPLEMENT' ||
        item.includeInAssessment === false ||
        hasExistingTargets(item.supplementTargets)
      ) {
        continue;
      }

      try {
        const inferredTargets = inferSupplementTargetsByRemoval({
          itemId: item.id,
          itemName: resolveAssessmentItemName(item),
          itemNutritionProfile: toAssessmentNutritionProfile(item),
          itemWeightG: item.weightG,
          totalRecipeWeightG: fullAssessment.totalWeightG,
          fullAssessment,
          assessmentWithoutItem: assessRecipeDraft({
            scenario,
            targets,
            items: buildAssessmentItems(designRecipe.items, item.id),
          }),
        });
        if (inferredTargets.length > 0) {
          result.set(item.id, inferredTargets);
        }
      } catch {
        continue;
      }
    }
  }

  return result;
}

async function main() {
  const options = readSupplementTargetBackfillCliOptions(process.argv);
  const allowlist = options.allowlistJsonPath
    ? loadSupplementTargetBackfillAllowlist(options.allowlistJsonPath)
    : null;
  const prisma = new PrismaClient();

  try {
    const recipeItems = await (prisma as any).recipeItem.findMany({
      where: {
        ingredient: { type: 'SUPPLEMENT' },
      },
      include: {
        ingredient: { select: { name: true } },
        nutritionFood: { select: { nutritionData: true } },
        recipe: {
          select: {
            recipeId: true,
            version: true,
            name: true,
            items: {
              select: {
                exampleWeight: true,
                ratioPercent: true,
              },
            },
          },
        },
      },
      orderBy: [
        { recipeId: 'asc' },
        { recipeVersion: 'asc' },
        { sortOrder: 'asc' },
      ],
    });
    const designRecipeItems = await (prisma as any).designRecipeItem.findMany({
      where: {
        ingredient: { type: 'SUPPLEMENT' },
      },
      include: {
        ingredient: { select: { name: true } },
        designRecipe: {
          select: {
            id: true,
            name: true,
            status: true,
            fediafDogScenario: true,
            seriesLifeStage: true,
          },
        },
      },
      orderBy: [{ designRecipeId: 'asc' }, { sortOrder: 'asc' }],
    });
    const buildDesignGapAttribution = shouldBuildAttributedDesignTargets(
      process.argv,
    );
    const attributedDesignTargets = buildDesignGapAttribution
      ? await buildAttributedDesignTargetMap(prisma)
      : new Map<string, InferredSupplementTarget[]>();

    const plannedUpdates: PlannedRecipeSupplementTargetUpdate[] = [];
    const plannedDesignUpdates: PlannedDesignSupplementTargetUpdate[] = [];
    const manualReview: any[] = [];
    let skippedExisting = 0;
    let skippedDesignExisting = 0;

    for (const item of recipeItems) {
      const plan = planRecipeSupplementTargetBackfill({
        id: item.id,
        ingredientName: item.ingredient?.name,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue,
        supplementTargets: item.supplementTargets,
        nutritionProfile: item.nutritionFood?.nutritionData,
        exampleWeight: item.exampleWeight,
        ratioPercent: item.ratioPercent,
        totalRecipeWeightG: resolveRecipeTotalWeightG(item.recipe?.items ?? []),
      });

      if (plan.action === 'skip') {
        skippedExisting += 1;
        continue;
      }

      if (plan.action === 'manual_review') {
        manualReview.push({
          table: 'recipe_item',
          recipeItemId: item.id,
          recipeId: item.recipe?.recipeId,
          recipeVersion: item.recipe?.version,
          recipeName: item.recipe?.name,
          ingredientName: item.ingredient?.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
          reason: plan.reason,
        });
        continue;
      }

      if (plan.action === 'update') {
        plannedUpdates.push({
          id: item.id,
          recipeId: item.recipe?.recipeId,
          recipeVersion: item.recipe?.version,
          recipeName: item.recipe?.name,
          ingredientName: item.ingredient?.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
          reason: plan.reason,
          target: plan.target,
        });
      }
    }

    for (const item of designRecipeItems) {
      const plan = planDesignSupplementTargetBackfill({
        id: item.id,
        ingredientName: item.ingredient?.name,
        nutrientTargetKey: item.nutrientTargetKey,
        nutrientTargetValue: item.nutrientTargetValue,
        supplementTargets: item.supplementTargets,
        attributedTargets: attributedDesignTargets.get(item.id) ?? null,
      });

      if (plan.action === 'skip') {
        skippedDesignExisting += 1;
        continue;
      }

      if (plan.action === 'manual_review') {
        manualReview.push({
          table: 'design_recipe_item',
          designRecipeItemId: item.id,
          designRecipeId: item.designRecipe?.id,
          designRecipeName: item.designRecipe?.name,
          designRecipeStatus: item.designRecipe?.status,
          scenario: item.designRecipe?.fediafDogScenario,
          seriesLifeStage: item.designRecipe?.seriesLifeStage,
          ingredientName: item.ingredient?.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
          reason: plan.reason,
        });
        continue;
      }

      if (plan.action === 'update') {
        plannedDesignUpdates.push({
          id: item.id,
          designRecipeId: item.designRecipe?.id,
          designRecipeName: item.designRecipe?.name,
          designRecipeStatus: item.designRecipe?.status,
          scenario: item.designRecipe?.fediafDogScenario,
          seriesLifeStage: item.designRecipe?.seriesLifeStage,
          ingredientName: item.ingredient?.name,
          nutrientTargetKey: item.nutrientTargetKey,
          nutrientTargetValue: item.nutrientTargetValue,
          reason: plan.reason,
          target: plan.target,
        });
      }
    }

    let report = buildSupplementTargetBackfillReport({
      recipeItemsScanned: recipeItems.length,
      designRecipeItemsScanned: designRecipeItems.length,
      plannedUpdates,
      plannedDesignUpdates,
      skippedExisting,
      skippedDesignExisting,
      attributedDesignTargetCount: attributedDesignTargets.size,
      manualReview,
    });

    if (allowlist) {
      report = filterSupplementTargetBackfillReportByAllowlist(
        report,
        allowlist,
      );
    }

    const recipeItemIdsToApply = new Set(
      report.plannedRecipeItemUpdates.map((update) => update.recipeItemId),
    );
    const designRecipeItemIdsToApply = new Set(
      report.plannedDesignRecipeItemUpdates.map(
        (update) => update.designRecipeItemId,
      ),
    );
    const plannedUpdatesToApply = plannedUpdates.filter((update) =>
      recipeItemIdsToApply.has(update.id),
    );
    const plannedDesignUpdatesToApply = plannedDesignUpdates.filter((update) =>
      designRecipeItemIdsToApply.has(update.id),
    );

    console.log(
      options.apply
        ? 'Applying recipe supplement target v2 backfill...'
        : 'Dry run: recipe supplement target v2 backfill...',
    );
    console.log(
      `Scanned supplement recipe items: ${report.counts.recipeItemsScanned}`,
    );
    console.log(
      `Planned recipe item updates: ${report.counts.plannedRecipeItemUpdates}`,
    );
    console.log(
      `Skipped items already having v2 targets: ${report.counts.skippedRecipeItemsAlreadyHavingV2Targets}`,
    );
    console.log(
      `Scanned supplement design recipe items: ${report.counts.designRecipeItemsScanned}`,
    );
    console.log(
      `Planned design recipe item updates: ${report.counts.plannedDesignRecipeItemUpdates}`,
    );
    console.log(
      `Design recipe nutrient gap attributions: ${report.counts.designRecipeNutrientGapAttributions}`,
    );
    console.log(
      `Skipped design items already having v2 targets: ${report.counts.skippedDesignItemsAlreadyHavingV2Targets}`,
    );
    console.log(`Manual review items: ${report.counts.manualReviewItems}`);

    if (allowlist && !buildDesignGapAttribution) {
      console.log(
        'Allowlist mode: skipped design nutrient gap attribution. Pass --include-design-gap-attribution to include it.',
      );
    }

    if (report.allowlist) {
      console.log(`Allowlist approved rows: ${report.allowlist.approvedRows}`);
      console.log(
        `Allowlist matched planned updates: ${report.allowlist.matchedApprovedRows}`,
      );
      console.log(
        `Allowlist skipped non-approved planned updates: ${report.allowlist.skippedNonAllowlistedPlannedUpdates.length}`,
      );
      console.log(
        `Allowlist unmatched approved rows: ${report.allowlist.unmatchedApprovedRows.length}`,
      );
      console.log(
        `Allowlist target mismatches: ${report.allowlist.targetMismatches.length}`,
      );
    }

    if (report.manualReview.length > 0) {
      console.log('Manual review required:');
      console.log(JSON.stringify(report.manualReview, null, 2));
    }

    if (options.reportJsonPath) {
      writeFileSync(
        options.reportJsonPath,
        `${JSON.stringify(report, null, 2)}\n`,
      );
      console.log(`Report JSON written: ${options.reportJsonPath}`);
    }

    if (options.apply) {
      assertAllowlistReportCanApply(report);

      for (const update of plannedUpdatesToApply) {
        await (prisma as any).recipeItem.update({
          where: { id: update.id },
          data: {
            supplementTargets: Array.isArray(update.target)
              ? update.target
              : [update.target],
          },
        });
      }
      for (const update of plannedDesignUpdatesToApply) {
        await (prisma as any).designRecipeItem.update({
          where: { id: update.id },
          data: {
            supplementTargets: Array.isArray(update.target)
              ? update.target
              : [update.target],
          },
        });
      }
      console.log('Backfill applied successfully.');
    } else {
      console.log('No data changed. Re-run with --apply to update mapped rows.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to backfill recipe supplement targets v2:', error);
    process.exit(1);
  });
}
