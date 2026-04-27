import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('dog profile health page regressions', () => {
  function functionSource(source: string, startMarker: string, endMarker: string) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

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
    expect(source).toContain(':primary-disabled="!dogId || isProfileLoading || isSaving || savingRecordKey"')
  })

  it('guards dog switching when diet reminders have unsaved changes', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('const hasUnsavedDietReminder = computed(() =>')
    expect(source).toContain('hasUnsavedRecordDraft')
    expect(source).toContain('confirmSwitchDogWithUnsavedChanges')
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
    expect(source).toContain('populateForm(res.data.profile)')
    expect(source).toContain('loadAllHealthRecordLists(requestedDogId)')
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

  it('uses segmented health record CRUD endpoints instead of profile-array persistence', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain(':active-type="activeRecordType"')
    expect(source).toContain(':records="recordsByType[activeRecordType]"')
    expect(source).toContain(':loading="loadingByType[activeRecordType]"')
    expect(source).toContain(':saving-record-key="savingRecordKey"')
    expect(source).toContain(':primary-disabled="!dogId || isProfileLoading || isSaving || savingRecordKey"')
    expect(source).toContain(':secondary-disabled="isLoading || isSaving || savingRecordKey"')
    expect(source).toContain('@save-record="saveHealthRecord"')
    expect(source).toContain('@delete-record="deleteHealthRecord"')
    expect(source).toContain('@dirty-change="hasUnsavedRecordDraft = $event"')
    expect(source).toContain('const activeRecordType = ref<HealthRecordType>(\'medical\')')
    expect(source).toContain('recordsByType = reactive<Record<HealthRecordType, Record<string, any>[]>>')
    expect(source).toContain('loadingByType = reactive<Record<HealthRecordType, boolean>>')
    expect(source).toContain('dogApi.healthRecords.medical.list')
    expect(source).toContain('dogApi.healthRecords.checkup.list')
    expect(source).toContain('dogApi.healthRecords.allergy.list')
    expect(source).toContain('function recordApiForType(type: HealthRecordType)')
    expect(source).toContain('async function loadHealthRecordList(')
    expect(source).toContain('async function loadAllHealthRecordLists')
    expect(source).toContain('async function saveHealthRecord')
    expect(source).toContain('.create(targetDogId')
    expect(source).toContain('.update(targetDogId')
    expect(source).toContain('async function deleteHealthRecord')
    expect(source).toContain('removeHealthRecordFromList')
    expect(functionSource(
      source,
      'async function saveHealthRecord',
      'async function deleteHealthRecord',
    )).not.toContain('hasUnsavedRecordDraft.value = false')
    expect(functionSource(
      source,
      'async function deleteHealthRecord',
      'async function saveDietReminders',
    )).not.toContain('uni.showModal')
    expect(functionSource(
      source,
      'async function saveDietReminders',
      'function goBack',
    )).toContain('savingRecordKey.value')
    expect(functionSource(
      source,
      'function goBack',
      'function goToDogCreate',
    )).toContain('savingRecordKey.value')
    expect(source).not.toContain('dogApi.updateHealthRecords')
    expect(source).not.toContain('buildDogHealthStateSnapshot')
    expect(source).not.toContain('mergeDogHealthStateSnapshot')
    expect(source).not.toContain('readDogHealthStateSnapshotCache')
    expect(source).not.toContain('writeDogHealthStateSnapshotCache')
  })

  it('keeps diet reminders isolated from health record CRUD', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/pages/dog-profile-health/index.vue'),
      'utf-8',
    )

    expect(source).toContain('diet-reminder-card')
    expect(source).toContain('saveDietReminders')
    expect(source).toContain('dogApi.updateDietReminders')
    expect(source).not.toContain('dogApi.updateHealthRecords')
  })
})
