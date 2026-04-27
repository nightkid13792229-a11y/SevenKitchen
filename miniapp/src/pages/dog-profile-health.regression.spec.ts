import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog profile health page regressions', () => {
  it('supports opening health records from the home tools without a dogId parameter', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('<picker mode="selector" :range="dogs"')
    expect(source).toContain('const dogs = ref<DogProfileSummary[]>([])')
    expect(source).toContain("async function loadDogs(preferredDogId = '')")
    expect(source).toContain('function selectDogByIndex(index: number)')
    expect(source).toContain('loadDogs()')
    expect(source).toContain("dog_profile_step_viewed")
  })

  it('hides health record editors while a selected dog profile is loading', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const isProfileLoading = ref(false)')
    expect(source).toContain('<template v-else-if="dogId">')
    expect(source).toContain('v-if="isProfileLoading"')
    expect(source).toContain(':primary-disabled="!dogId || isProfileLoading || isSaving"')
  })

  it('guards dog switching when diet reminders have unsaved changes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasUnsavedDietReminder = computed(() =>')
    expect(source).toContain('confirmSwitchDogWithUnsavedDietReminder')
    expect(source).toContain('uni.showModal({')
    expect(source).toContain('selectedDogIndex.value = getCurrentDogIndex()')
  })

  it('uses requested dog ids to discard stale health profile responses', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const latestRequestedDogId = ref(\'\')')
    expect(source).toContain('async function loadDogProfile(requestedDogId: string)')
    expect(source).toContain('shouldDiscardDogHealthProfileResponse({')
    expect(source).toContain('populateForm(res.data.profile, requestedDogId)')
  })

  it('shows a real empty-dog state instead of treating no dogs as load failure', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasNoDogs = ref(false)')
    expect(source).toContain('v-else-if="hasNoDogs"')
    expect(source).not.toContain("loadError.value = '还没有狗狗档案，请先创建档案。'")
  })
})
