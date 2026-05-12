import { normalizeNutritionProfile } from '../ingredient/nutrition-profile.utils';
import type { NutritionProfile } from '../ingredient/types';
import type {
  CandidateHardGateResult,
  CandidateReviewGroup,
  NutritionCandidateAgentReview,
} from './agent-review.types';

const CRITICAL_FIELDS = [
  'macros.energyKcal',
  'macros.crudeProtein',
  'macros.crudeFat',
] as const;

export interface NutritionCandidateHardGateInput {
  normalizedNutrition?: unknown;
  sourceRecord?: unknown;
  agentReview?: Partial<NutritionCandidateAgentReview> | null;
}

export function evaluateNutritionCandidateHardGates(
  candidate: NutritionCandidateHardGateInput,
): CandidateHardGateResult {
  const blockingReasons: string[] = [];
  const warningReasons: string[] = [];

  if (!candidate.sourceRecord) {
    blockingReasons.push('MISSING_SOURCE_RECORD');
  }

  const profile = normalizeNutritionProfile(
    candidate.normalizedNutrition as NutritionProfile,
  );

  if (!profile) {
    blockingReasons.push('MISSING_NORMALIZED_NUTRITION');
  } else {
    const missingCritical = CRITICAL_FIELDS.filter(
      (field) => !hasFiniteField(profile, field),
    );

    if (missingCritical.length > 0) {
      blockingReasons.push('MISSING_CRITICAL_NUTRIENTS');
    }

    if (!profile.meta?.rawBasisType) {
      warningReasons.push('MISSING_RAW_BASIS');
    }
  }

  if (!candidate.agentReview) {
    blockingReasons.push('MISSING_AGENT_REVIEW');
  } else {
    if (candidate.agentReview.confidence === 'LOW') {
      blockingReasons.push('LOW_AGENT_CONFIDENCE');
    }
    if (candidate.agentReview.recommendedAction === 'REJECT') {
      blockingReasons.push('AGENT_RECOMMENDS_REJECT');
    }
    if (
      candidate.agentReview.recommendedAction === 'FIND_ALTERNATIVE_SOURCE'
    ) {
      blockingReasons.push('AGENT_RECOMMENDS_ALTERNATIVE');
    }
  }

  return {
    canBatchConfirm: blockingReasons.length === 0,
    blockingReasons,
    warningReasons,
  };
}

export function resolveCandidateReviewGroup(
  hardGateResult: CandidateHardGateResult,
  agentReview?: Partial<NutritionCandidateAgentReview> | null,
): CandidateReviewGroup {
  if (hardGateResult.blockingReasons.includes('MISSING_SOURCE_RECORD')) {
    return 'MISSING_SOURCE';
  }

  if (
    hardGateResult.blockingReasons.includes('AGENT_RECOMMENDS_REJECT') ||
    hardGateResult.blockingReasons.includes('AGENT_RECOMMENDS_ALTERNATIVE')
  ) {
    return 'NOT_RECOMMENDED';
  }

  if (
    hardGateResult.canBatchConfirm &&
    agentReview?.recommendedAction === 'CONFIRM_PRIMARY'
  ) {
    return 'AUTO_REVIEWABLE';
  }

  return 'NEEDS_REVIEW';
}

function hasFiniteField(value: unknown, fieldPath: string): boolean {
  const fieldValue = fieldPath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);

  return typeof fieldValue === 'number' && Number.isFinite(fieldValue);
}
