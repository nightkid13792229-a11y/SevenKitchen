import {
  SearchAliasRiskLevel,
  SearchAliasSuggestionAction,
  SearchGovernanceDomain,
} from '@prisma/client';

const DOMAINS = new Set<string>(['INGREDIENT', 'NUTRITION_FOOD', 'BREED', 'ORDER']);
const ACTIONS = new Set<string>([
  'CREATE_GROUP',
  'ADD_ALIAS',
  'MERGE_GROUPS',
  'DISABLE_ALIAS',
  'UPDATE_CANONICAL',
]);
const RISK_LEVELS = new Set<string>(['LOW', 'MEDIUM', 'HIGH']);

export interface NormalizedSearchAliasSuggestion {
  domain: SearchGovernanceDomain;
  action: SearchAliasSuggestionAction;
  payload: Record<string, unknown>;
  riskLevel: SearchAliasRiskLevel;
  agentRationale: string;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }

  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

export function normalizeSearchAliasSuggestionOutput(
  value: unknown,
): NormalizedSearchAliasSuggestion[] {
  const suggestions = Array.isArray((value as { suggestions?: unknown })?.suggestions)
    ? ((value as { suggestions: unknown[] }).suggestions)
    : [];

  return suggestions
    .map((item: unknown): NormalizedSearchAliasSuggestion | null => {
      const suggestion = item as Record<string, unknown> | null;
      if (
        !suggestion ||
        typeof suggestion.domain !== 'string' ||
        typeof suggestion.action !== 'string' ||
        typeof suggestion.canonicalTerm !== 'string' ||
        typeof suggestion.rationale !== 'string'
      ) {
        return null;
      }

      const domain = suggestion.domain;
      const action = suggestion.action;
      const canonicalTerm = suggestion.canonicalTerm.trim();
      const aliases = normalizeStringArray(suggestion?.aliases);
      const riskLevel = typeof suggestion.riskLevel === 'string'
        ? suggestion.riskLevel
        : 'MEDIUM';
      const agentRationale = suggestion.rationale.trim();

      if (!DOMAINS.has(domain) || !ACTIONS.has(action) || !canonicalTerm || !aliases || aliases.length === 0) {
        return null;
      }

      return {
        domain: domain as SearchGovernanceDomain,
        action: action as SearchAliasSuggestionAction,
        payload: { canonicalTerm, aliases },
        riskLevel: (RISK_LEVELS.has(riskLevel) ? riskLevel : 'MEDIUM') as SearchAliasRiskLevel,
        agentRationale,
      };
    })
    .filter((item): item is NormalizedSearchAliasSuggestion => Boolean(item));
}
