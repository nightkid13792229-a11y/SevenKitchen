import type {
  RankedSearchCandidate,
  SearchCandidate,
  SearchMatch,
  SearchMatchType,
} from './search-governance.types';
import {
  calculateEditDistance,
  isCjkOnlyQuery,
  normalizeSearchText,
} from './search-text';

const MATCH_SCORES: Record<SearchMatchType, number> = {
  EXACT: 120,
  ALIAS_EXACT: 116,
  PREFIX: 105,
  CONTAINS: 95,
  REVERSE_CONTAINS: 90,
  NEAR_CJK: 72,
  SECONDARY: 60,
};

function buildSearchMatch(
  candidateText: string,
  rawQuery: string,
  matchedType: SearchMatchType,
  typeOverride?: SearchMatchType,
): SearchMatch {
  const type = typeOverride ?? matchedType;
  return { type, score: MATCH_SCORES[type], matchedText: candidateText, query: rawQuery };
}

export function getSearchMatch(
  candidateText: string,
  rawQuery: string,
  typeOverride?: SearchMatchType,
): SearchMatch | null {
  const text = normalizeSearchText(candidateText);
  const query = normalizeSearchText(rawQuery);

  if (!text || !query) {
    return null;
  }

  if (text === query) {
    return buildSearchMatch(candidateText, rawQuery, 'EXACT', typeOverride);
  }

  if (text.startsWith(query)) {
    return buildSearchMatch(candidateText, rawQuery, 'PREFIX', typeOverride);
  }

  if (text.includes(query)) {
    return buildSearchMatch(candidateText, rawQuery, 'CONTAINS', typeOverride);
  }

  if (query.includes(text)) {
    return buildSearchMatch(candidateText, rawQuery, 'REVERSE_CONTAINS', typeOverride);
  }

  if (
    isCjkOnlyQuery(text) &&
    isCjkOnlyQuery(query) &&
    Math.abs(text.length - query.length) <= 1 &&
    calculateEditDistance(text, query) <= 1
  ) {
    return buildSearchMatch(candidateText, rawQuery, 'NEAR_CJK', typeOverride);
  }

  return null;
}

function bestMatchForTexts(
  texts: readonly string[],
  query: string,
  typeOverride?: SearchMatchType,
): SearchMatch | null {
  return texts.reduce<SearchMatch | null>((best, text) => {
    const next = getSearchMatch(text, query, typeOverride);
    if (!next) {
      return best;
    }
    return !best || next.score > best.score ? next : best;
  }, null);
}

function bestAliasMatchForTexts(texts: readonly string[], query: string): SearchMatch | null {
  return texts.reduce<SearchMatch | null>((best, text) => {
    const next = getSearchMatch(text, query);
    if (!next) {
      return best;
    }

    const aliasMatch =
      next.type === 'EXACT'
        ? { ...next, type: 'ALIAS_EXACT' as const, score: MATCH_SCORES.ALIAS_EXACT }
        : next;
    return !best || aliasMatch.score > best.score ? aliasMatch : best;
  }, null);
}

export function rankSearchCandidates<T extends SearchCandidate>(
  candidates: readonly T[],
  rawQuery: string,
): RankedSearchCandidate<T>[] {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return candidates.map((candidate) => ({ ...candidate, match: null }));
  }

  return candidates
    .map((candidate) => {
      const primaryMatch = bestMatchForTexts(candidate.primaryTexts, rawQuery);
      const aliasMatch = bestAliasMatchForTexts(candidate.aliasTexts ?? [], rawQuery);
      const secondaryMatch = bestMatchForTexts(candidate.secondaryTexts ?? [], rawQuery, 'SECONDARY');
      const match = [primaryMatch, aliasMatch, secondaryMatch]
        .filter((item): item is SearchMatch => Boolean(item))
        .sort((left, right) => right.score - left.score)[0] ?? null;

      return { ...candidate, match };
    })
    .filter((candidate) => candidate.match)
    .sort((left, right) => {
      const scoreDiff = (right.match?.score ?? 0) - (left.match?.score ?? 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const popularityDiff = (right.popularityScore ?? 0) - (left.popularityScore ?? 0);
      if (popularityDiff !== 0) {
        return popularityDiff;
      }

      return left.label.localeCompare(right.label, 'zh-Hans-CN');
    });
}
