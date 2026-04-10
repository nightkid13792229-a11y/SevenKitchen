import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('home runtime regressions', () => {
  it('keeps the feedback quick action entry on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('建议反馈')
    expect(source).toContain('@tap="goToFeedback"')
    expect(source).toContain("/pages/feedback-list/index")
  })

  it('uses explicit drawer apply actions for recipe filters on the home page', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/home/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const draftFilterState = ref<FilterState>({')
    expect(source).toContain('class="drawer-actions"')
    expect(source).toContain('@tap="cancelLifeStageDrawer"')
    expect(source).toContain('@tap="resetLifeStageDraft"')
    expect(source).toContain('@tap="cancelHealthTagsDrawer"')
    expect(source).toContain('@tap="resetHealthTagsDraft"')
    expect(source).toContain('@tap="cancelExcludedTagsDrawer"')
    expect(source).toContain('@tap="resetExcludedTagsDraft"')
    expect(source).toContain('查看结果')
    expect(source).toContain('filterState.value.selectedLifeStages = [...draftFilterState.value.selectedLifeStages]')
    expect(source).toContain('filterState.value.selectedHealthTags = [...draftFilterState.value.selectedHealthTags]')
    expect(source).toContain('filterState.value.excludedIngredients = [...draftFilterState.value.excludedIngredients]')
  })
})
