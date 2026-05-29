export type SearchGovernanceDomain =
  | 'INGREDIENT'
  | 'NUTRITION_FOOD'
  | 'BREED'
  | 'ORDER';

export type SearchMatchType =
  | 'EXACT'
  | 'ALIAS_EXACT'
  | 'PREFIX'
  | 'CONTAINS'
  | 'REVERSE_CONTAINS'
  | 'NEAR_CJK'
  | 'SECONDARY';

export interface SearchCandidate {
  id: string;
  label: string;
  primaryTexts: string[];
  aliasTexts?: string[];
  secondaryTexts?: string[];
  popularityScore?: number;
  payload?: unknown;
}

export interface SearchMatch {
  type: SearchMatchType;
  score: number;
  matchedText: string;
  query: string;
}

export type RankedSearchCandidate<T extends SearchCandidate = SearchCandidate> = T & {
  match: SearchMatch | null;
};
