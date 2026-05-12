export type AgentReviewVerdict =
  | 'MATCH'
  | 'POSSIBLE_MATCH'
  | 'MISMATCH'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type AgentProcessingVerdict =
  | 'ACCEPTABLE'
  | 'RISKY'
  | 'INCOMPATIBLE'
  | 'UNKNOWN';

export type AgentReviewRecommendedAction =
  | 'CONFIRM_PRIMARY'
  | 'CONFIRM_SECONDARY'
  | 'NEEDS_HUMAN_REVIEW'
  | 'REJECT'
  | 'FIND_ALTERNATIVE_SOURCE';

export type AgentReviewConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type CandidateReviewGroup =
  | 'AUTO_REVIEWABLE'
  | 'NEEDS_REVIEW'
  | 'NOT_RECOMMENDED'
  | 'MISSING_SOURCE';

export interface NutritionCandidateAgentReview {
  provider?: string;
  model?: string;
  promptVersion?: string;
  identityVerdict: AgentReviewVerdict;
  stateVerdict: AgentReviewVerdict;
  ediblePortionVerdict: AgentReviewVerdict;
  processingVerdict: AgentProcessingVerdict;
  recommendedAction: AgentReviewRecommendedAction;
  preparationState?: string | null;
  preparationStateLabel?: string | null;
  ediblePortionLabel?: string | null;
  processingLabel?: string | null;
  riskFlags: string[];
  rationale: string;
  confidence: AgentReviewConfidence;
}

export interface CandidateHardGateResult {
  canBatchConfirm: boolean;
  blockingReasons: string[];
  warningReasons: string[];
}
