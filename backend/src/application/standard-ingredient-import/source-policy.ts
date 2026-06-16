export type ApprovedNutritionSource =
  | 'USDA_FDC'
  | 'NZFCD'
  | 'NEVO'
  | 'MEXT'
  | 'AFCD'
  | 'AUSNUT'
  | 'CNF'
  | 'COFID'
  | 'CIQUAL'
  | 'CFCT';

export type NutritionStateTag =
  | 'raw'
  | 'cooked'
  | 'dried'
  | 'peeled'
  | 'unpeeled'
  | 'oil'
  | 'powder'
  | 'prepared';

export interface NutritionSourceCandidate {
  source: string;
  matchedName?: string;
  stateTags?: NutritionStateTag[];
  essentialCoveragePercent: number;
}

export interface RankNutritionSourceCandidatesInput {
  requestedState: NutritionStateTag;
  candidates: NutritionSourceCandidate[];
}

export interface RankedNutritionSourceCandidate
  extends NutritionSourceCandidate {
  source: ApprovedNutritionSource;
  stateTags: NutritionStateTag[];
  fallbackOnly: boolean;
  score: number;
  scoreComponents: NutritionSourceScoreComponents;
}

export interface NutritionSourceScoreComponents {
  primaryApprovedOfficialSource: number;
  exactSemanticStateMatch: number;
  sameSourceRawCookedPairAvailability: number;
  essentialCoverage: number;
  cfctFallbackOnlyPenalty: number;
}

const approvedNutritionSources: ApprovedNutritionSource[] = [
  'USDA_FDC',
  'NZFCD',
  'NEVO',
  'MEXT',
  'AFCD',
  'AUSNUT',
  'CNF',
  'COFID',
  'CIQUAL',
  'CFCT',
];

const cfctSource: ApprovedNutritionSource = 'CFCT';

/**
 * Ranks approved nutrition source candidates with deterministic policy scores.
 *
 * These scores are selection aids for import tooling. They do not replace
 * operator review of semantic fit, nutrient completeness, or final acceptance.
 */
export function rankNutritionSourceCandidates(
  input: RankNutritionSourceCandidatesInput,
): RankedNutritionSourceCandidate[] {
  const sourceStateAvailability = collectSourceStateAvailability(
    input.candidates,
  );

  return input.candidates
    .map((candidate, originalIndex) => ({
      candidate,
      originalIndex,
      source: toApprovedNutritionSource(candidate.source),
    }))
    .filter(
      (
        entry,
      ): entry is {
        candidate: NutritionSourceCandidate;
        originalIndex: number;
        source: ApprovedNutritionSource;
      } =>
        entry.source !== undefined &&
        hasDeclaredStateTags(entry.candidate) &&
        entry.candidate.stateTags.includes(input.requestedState),
    )
    .map(({ candidate, originalIndex, source }) => {
      const fallbackOnly = source === cfctSource;
      const scoreComponents = buildScoreComponents({
        candidate,
        source,
        fallbackOnly,
        sourceStateAvailability,
      });

      return {
        ...candidate,
        source,
        stateTags: candidate.stateTags,
        fallbackOnly,
        score: sumScoreComponents(scoreComponents),
        scoreComponents,
        originalIndex,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map(({ originalIndex: _originalIndex, ...candidate }) => candidate);
}

function collectSourceStateAvailability(
  candidates: NutritionSourceCandidate[],
): Map<ApprovedNutritionSource, Set<NutritionStateTag>> {
  const sourceStateAvailability = new Map<
    ApprovedNutritionSource,
    Set<NutritionStateTag>
  >();

  candidates.forEach((candidate) => {
    const source = toApprovedNutritionSource(candidate.source);

    if (source === undefined || !hasDeclaredStateTags(candidate)) {
      return;
    }

    const stateTags =
      sourceStateAvailability.get(source) ?? new Set<NutritionStateTag>();
    candidate.stateTags.forEach((stateTag) => stateTags.add(stateTag));
    sourceStateAvailability.set(source, stateTags);
  });

  return sourceStateAvailability;
}

function buildScoreComponents(input: {
  candidate: NutritionSourceCandidate & { stateTags: NutritionStateTag[] };
  source: ApprovedNutritionSource;
  fallbackOnly: boolean;
  sourceStateAvailability: Map<ApprovedNutritionSource, Set<NutritionStateTag>>;
}): NutritionSourceScoreComponents {
  return {
    primaryApprovedOfficialSource: input.fallbackOnly ? 0 : 1000,
    exactSemanticStateMatch: 100,
    sameSourceRawCookedPairAvailability: hasRawCookedPairAvailability(
      input.source,
      input.sourceStateAvailability,
    )
      ? 60
      : 0,
    essentialCoverage: input.candidate.essentialCoveragePercent * 0.5,
    cfctFallbackOnlyPenalty: input.fallbackOnly ? -500 : 0,
  };
}

function hasRawCookedPairAvailability(
  source: ApprovedNutritionSource,
  sourceStateAvailability: Map<ApprovedNutritionSource, Set<NutritionStateTag>>,
): boolean {
  const sourceStates = sourceStateAvailability.get(source);

  return (
    sourceStates !== undefined &&
    sourceStates.has('raw') &&
    sourceStates.has('cooked')
  );
}

function sumScoreComponents(
  scoreComponents: NutritionSourceScoreComponents,
): number {
  return Object.values(scoreComponents).reduce(
    (total, scoreComponent) => total + scoreComponent,
    0,
  );
}

function hasDeclaredStateTags(
  candidate: NutritionSourceCandidate,
): candidate is NutritionSourceCandidate & { stateTags: NutritionStateTag[] } {
  return candidate.stateTags !== undefined && candidate.stateTags.length > 0;
}

function toApprovedNutritionSource(
  source: string,
): ApprovedNutritionSource | undefined {
  return approvedNutritionSources.find(
    (approvedSource) => approvedSource === source,
  );
}
