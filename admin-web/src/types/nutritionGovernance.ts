import type { NutritionProfile } from "./ingredient";

export type NutritionGovernanceSourceType =
  | "USDA"
  | "NZFCD"
  | "CFCT"
  | "SUPPLEMENT_LABEL"
  | "MANUAL";

export type NutritionGovernanceRecordStatus = "ACTIVE" | "DEPRECATED";

export type NutritionMatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export type NutritionCandidateReviewGroup =
  | "AUTO_REVIEWABLE"
  | "NEEDS_REVIEW"
  | "NOT_RECOMMENDED"
  | "MISSING_SOURCE";

export type NutritionCandidateStatus =
  | "CANDIDATE"
  | "CONFIRMED"
  | "REJECTED"
  | "SKIPPED";

export type SupplementNutritionDraftStatus = "DRAFT" | "CONFIRMED" | "REJECTED";

export type NutritionMatchReasonCode =
  | "NAME_EXACT"
  | "NAME_PARTIAL"
  | "TYPE_MATCH"
  | "STATE_MATCH"
  | "PORTION_MATCH"
  | "PORTION_CONFLICT"
  | "SOURCE_PRIORITY"
  | "MANUAL";

export interface NutritionGovernanceOverview {
  foodIngredientCount: number;
  supplementIngredientCount: number;
  confirmedNutritionProfileCount: number;
  incompleteProfileCount: number;
  candidateCount: number;
  supplementDraftCount: number;
}

export interface AgentProviderSettings {
  provider: "DEEPSEEK";
  enabled: boolean;
  baseUrl: string;
  model: string;
  reviewModel: string;
  apiKeyConfigured: boolean;
  apiKeyLast4?: string | null;
  maxConcurrency: number;
  requestTimeoutMs: number;
  retryCount: number;
}

export interface UpdateAgentProviderSettingsPayload {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  reviewModel?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  maxConcurrency?: number;
  requestTimeoutMs?: number;
  retryCount?: number;
}

export interface AgentSettingsTestResult {
  ok: boolean;
  provider?: string;
  model?: string;
  recommendedAction?: string;
}

export interface BatchAgentReviewPayload {
  limit?: number;
  forceRerun?: boolean;
  confidence?: NutritionMatchConfidence;
  reviewGroup?: NutritionCandidateReviewGroup | string;
}

export interface RankFoodCandidatesWithAgentPayload {
  ingredientId: string;
  reviewerRequirement?: string | null;
  onlineWhitelistSearch?: boolean;
}

export interface NutritionAgentReviewJob {
  id: string;
  status: string;
  provider: string;
  model: string;
  scope?: Record<string, unknown> | null;
  forceRerun: boolean;
  limit: number;
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  failureDetails?:
    | Array<Record<string, unknown>>
    | Record<string, unknown>
    | null;
  lastError?: string | null;
  createdBy?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface NutritionMatchReason {
  code: NutritionMatchReasonCode | string;
  label: string;
  scoreDelta: number;
}

export interface NutritionCandidateAgentReview {
  provider?: string;
  model?: string;
  promptVersion?: string;
  recommendedAction: string;
  confidence: NutritionMatchConfidence;
  rationale: string;
  riskFlags: string[];
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
}

export interface CandidateHardGateResults {
  canBatchConfirm: boolean;
  blockingReasons: string[];
  warningReasons: string[];
}

export type NutritionCandidateDataValidationStatus =
  | "PASS"
  | "WARNING"
  | "FAIL";

export interface NutritionCandidateDataValidationFieldIssue {
  fieldPath: string;
  sourceNutrientId?: string | number | null;
  sourceNutrientName?: string | null;
  expectedValue?: number | null;
  actualValue?: number | null;
  canonicalUnit?: string | null;
}

export interface NutritionCandidateDataValidationResult {
  status: NutritionCandidateDataValidationStatus;
  checkedFieldCount: number;
  expectedFieldCount: number;
  missingExpectedFields: NutritionCandidateDataValidationFieldIssue[];
  mismatchedFields: NutritionCandidateDataValidationFieldIssue[];
  missingSourceFormFields: NutritionCandidateDataValidationFieldIssue[];
  warnings: string[];
}

export interface NutritionValidationAgentReview {
  provider?: string;
  model?: string;
  promptVersion?: string;
  verdict: "PASS" | "NEEDS_HUMAN_REVIEW" | "FAIL";
  confidence: NutritionMatchConfidence;
  summary: string;
  riskFlags: string[];
}

export interface CandidateNutritionValidationWithAgentResult {
  system: NutritionCandidateDataValidationResult;
  agent: NutritionValidationAgentReview | null;
}

export interface NutritionSourceRecord {
  id: string;
  sourceType: NutritionGovernanceSourceType;
  sourceKey: string;
  sourceTitle: string;
  sourceDetail?: Record<string, unknown> | null;
  foodName: string;
  foodNameEn?: string | null;
  dataType?: string | null;
  category?: string | null;
  rawData?: Record<string, unknown>;
  normalizedNutrition?: NutritionProfile | null;
  status?: NutritionGovernanceRecordStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CfctReviewedSourceSegment {
  kind: "PRIMARY" | "CONTINUATION";
  page: string | number;
  row: string | number;
  rawOcrText: string;
  ocrConfidence?: number | null;
  nutrientKeys?: string[];
}

export interface CfctReviewedSourceRow {
  volume: string;
  page: string | number;
  row: string | number;
  foodName: string;
  category?: string | null;
  foodCode?: string | null;
  ediblePortionPercent?: number | null;
  energyKj?: number | null;
  nutrients: Record<string, number | null | undefined>;
  sourcePdf?: string;
  ocrPage?: string | number;
  ocrLine?: string | number;
  rawOcrText?: string;
  ocrConfidence?: number;
  qualityFlags?: string[];
  reviewStatus?: string;
  sourceSegments?: CfctReviewedSourceSegment[];
  unmappedNutrients?: Record<string, number | null | undefined>;
}

export interface ImportCfctReviewedSourceRowsPayload {
  rows: CfctReviewedSourceRow[];
}

export interface ImportCfctReviewedSourceRowsResult {
  importedCount: number;
  records: NutritionSourceRecord[];
}

export type CfctLocalStructuredLibraryQueue =
  | "full"
  | "auto-ready"
  | "needs-review";

export interface CfctLocalStructuredLibrarySummary {
  generatedAt?: string;
  totalRows?: number;
  autoReadyRows?: number;
  needsReviewRows?: number;
  byVolume?: Record<
    string,
    {
      totalRows: number;
      autoReadyRows: number;
      needsReviewRows: number;
    }
  >;
  qualityFlagCounts?: Record<string, number>;
}

export interface CfctLocalStructuredLibrary {
  queue: CfctLocalStructuredLibraryQueue;
  generatedAt: string | null;
  sourceFile: string;
  summaryFile: string;
  rowCount: number;
  summary: CfctLocalStructuredLibrarySummary;
  rows: CfctReviewedSourceRow[];
}

export interface NutritionGovernanceIngredientSummary {
  id: string;
  name: string;
  type: string;
  nutritionProfile?: NutritionProfile | null;
}

export interface IngredientNutritionCandidate {
  id: string;
  ingredientId: string;
  sourceRecordId: string;
  sourcePriority: number;
  confidence: NutritionMatchConfidence;
  score: number;
  matchReasons: NutritionMatchReason[];
  agentReview?: NutritionCandidateAgentReview | null;
  agentReviewStatus?: string | null;
  hardGateResults?: CandidateHardGateResults | null;
  reviewGroup?: NutritionCandidateReviewGroup | string | null;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  reviewNote?: string | null;
  normalizedNutrition: NutritionProfile;
  status: NutritionCandidateStatus;
  confirmationSnapshot?: Record<string, unknown> | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  ingredient?: NutritionGovernanceIngredientSummary;
  sourceRecord?: NutritionSourceRecord;
}

export interface IngredientNutritionCandidateListItem extends IngredientNutritionCandidate {
  ingredient: NutritionGovernanceIngredientSummary;
  sourceRecord: NutritionSourceRecord;
}

export interface LabelExtractionItem {
  fieldPath: string;
  label: string;
  value: number;
  unit: string;
  rawBasisType: string;
}

export interface LabelExtractionResult {
  ocrText: string;
  extractedItems: LabelExtractionItem[];
  missingFields: string[];
  normalizedNutrition: NutritionProfile | null;
}

export interface SupplementNutritionDraft {
  id: string;
  ingredientId: string;
  sourceRecordId?: string | null;
  imageUrl: string;
  imageKey: string;
  ocrText?: string | null;
  aiExtraction: LabelExtractionResult | Record<string, unknown>;
  normalizedNutrition?: NutritionProfile | null;
  missingFields: string[];
  status: SupplementNutritionDraftStatus;
  createdBy?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  ingredient?: NutritionGovernanceIngredientSummary;
  sourceRecord?: NutritionSourceRecord | null;
}

export interface ListNutritionCandidatesParams {
  status?: NutritionCandidateStatus;
  confidence?: NutritionMatchConfidence;
  reviewGroup?: NutritionCandidateReviewGroup | string;
  ingredientId?: string;
}

export interface ConfirmNutritionCandidatePayload {
  mappingRole: "PRIMARY" | "SECONDARY";
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  reviewNote?: string | null;
}

export interface IngredientCandidateConfigurationEntry extends ConfirmNutritionCandidatePayload {
  candidateId: string;
}

export interface ApplyIngredientCandidateConfigurationPayload {
  ingredientId: string;
  entries: IngredientCandidateConfigurationEntry[];
}

export interface ListSupplementDraftsParams {
  status?: SupplementNutritionDraftStatus;
  ingredientId?: string;
}
