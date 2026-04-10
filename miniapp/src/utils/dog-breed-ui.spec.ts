import { describe, expect, it } from 'vitest'
import {
  getBreedSearchUiState,
  getManualBreedDraftName,
  MANUAL_BREED_EMPTY_STATE_PREFIX,
  MANUAL_BREED_ENTRY_LABEL,
} from './dog-breed-ui'

describe('dog-breed-ui', () => {
  it('shows the card-selection hint only when there are search results', () => {
    expect(getBreedSearchUiState(3).showSelectionHint).toBe(true)
    expect(getBreedSearchUiState(0).showSelectionHint).toBe(false)
  })

  it('uses the new manual breed entry label consistently', () => {
    expect(MANUAL_BREED_ENTRY_LABEL).toBe('手动填写品种')
    expect(getBreedSearchUiState(0).manualEntryLabel).toBe('手动填写品种')
  })

  it('provides an empty-state hint tailored to missing results', () => {
    expect(MANUAL_BREED_EMPTY_STATE_PREFIX).toBe('未找到匹配品种？')
    expect(getBreedSearchUiState(0).emptyStateHint).toBe('未找到匹配品种？')
  })

  it('only shows the manual breed entry action when a search has no matches', () => {
    expect(getBreedSearchUiState(0, { hasKeyword: true }).showManualEntryAction).toBe(true)
    expect(getBreedSearchUiState(2, { hasKeyword: true }).showManualEntryAction).toBe(false)
    expect(getBreedSearchUiState(0, { hasKeyword: false }).showManualEntryAction).toBe(false)
  })

  it('hides the search input while manual breed entry is active', () => {
    expect(getBreedSearchUiState(0, { hasKeyword: true, isManualEntry: true }).showSearchInput).toBe(false)
    expect(getBreedSearchUiState(0, { hasKeyword: true, isManualEntry: false }).showSearchInput).toBe(true)
  })

  it('hides the card-selection hint after a standard breed has already been selected', () => {
    expect(getBreedSearchUiState(3, {
      hasKeyword: true,
      hasSelectedStandardBreed: true,
    }).showSelectionHint).toBe(false)
  })

  it('prefills manual breed entry with the current search keyword when no draft exists yet', () => {
    expect(getManualBreedDraftName(' 泰迪串串 ')).toBe('泰迪串串')
    expect(getManualBreedDraftName('柴犬', '田园犬')).toBe('田园犬')
    expect(getManualBreedDraftName('   ')).toBe('')
  })
})
