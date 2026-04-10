export const MANUAL_BREED_ENTRY_LABEL = '手动填写品种'
export const MANUAL_BREED_EMPTY_STATE_PREFIX = '未找到匹配品种？'

interface BreedSearchUiStateOptions {
  hasKeyword?: boolean
  isManualEntry?: boolean
  hasSelectedStandardBreed?: boolean
}

export function getBreedSearchUiState(
  matchCount: number,
  options: BreedSearchUiStateOptions = {},
) {
  const hasKeyword = Boolean(options.hasKeyword)
  const isManualEntry = Boolean(options.isManualEntry)
  const hasSelectedStandardBreed = Boolean(options.hasSelectedStandardBreed)

  return {
    showSelectionHint: matchCount > 0 && !hasSelectedStandardBreed,
    showManualEntryAction: hasKeyword && matchCount === 0 && !isManualEntry,
    showSearchInput: !isManualEntry,
    manualEntryLabel: MANUAL_BREED_ENTRY_LABEL,
    emptyStateHint: MANUAL_BREED_EMPTY_STATE_PREFIX,
  }
}

export function getManualBreedDraftName(searchKeyword: string, currentDraft = '') {
  const trimmedDraft = currentDraft.trim()
  if (trimmedDraft) {
    return trimmedDraft
  }

  return searchKeyword.trim()
}
