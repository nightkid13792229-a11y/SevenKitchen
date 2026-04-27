import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('HealthRecordsSection regressions', () => {
  function functionSource(source: string, startMarker: string, endMarker: string) {
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it('uses the segmented CRUD event contract instead of profile-array persistence', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(source).not.toContain('dogApi.updateHealthRecords')
    expect(source).not.toContain('buildPersistedRecordsForSave')
    expect(source).not.toContain('findSavedRecordFromProfile')
    expect(source).toContain('record-type-tabs')
    expect(source).toContain('保存这一条')
    expect(source).toContain('getHealthRecordTypeMeta')
    expect(source).toContain('hasDirtyRecords.value')
    expect(source).toContain('uni.showModal')
    expect(source).toContain('recordKey: key')
    expect(source).not.toContain("emit('record-saved', buildHealthRecordFocusIdentity")
    expect(source).toContain('hasUploadingRecords')
    expect(source).toContain('附件上传中，请稍候')
    expect(source).toContain('const uploadType = currentType.value')
    expect(source).toContain('findRecordIndexByKey')
    expect(source).toContain('const targetIndex = findRecordIndexByKey(uploadKey)')
    expect(source).toContain('const targetRecord = draftRecords.value[targetIndex]')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord"')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
    expect(source).toContain(':disabled="hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
    expect(source).toContain('type="text"\n            :disabled="hasSavingRecord"')
    expect(source).toContain('mode="date"\n            :disabled="hasSavingRecord"')
    expect(source).toContain('class="field-textarea"\n            :disabled="hasSavingRecord"')
    expect(source).toContain('hasUploadingRecords.value ||\n    isUploading(record, index)')
    expect(source).toContain('function addRecord() {\n  if (hasSavingRecord.value)')
    expect(source).toContain('function saveRecord(index: number) {\n  if (hasSavingRecord.value)')
    expect(source).toContain('function cancelRecord(index: number) {\n  if (hasSavingRecord.value)')
    expect(source).toContain('async function removeRecord(index: number) {\n  if (hasSavingRecord.value)')
    expect(functionSource(
      source,
      'function updateTextField',
      'function addRecord',
    )).toContain('if (hasSavingRecord.value)')
    expect(source).toContain('function preserveUnsavedDrafts')
    expect(source).toContain('const lastSyncedType = ref<HealthRecordType | null>(null)')
    expect(source).toContain('lastSyncedType.value === currentType.value')
    expect(source).toContain('function shouldSkipPreservingSavingRecord')
    expect(source).toContain('function replaceIncomingRecordWithDirtyDraft')
    expect(source).toContain('function shouldUseIncomingSavingRecord')
    expect(source).toContain('props.savingRecordKey')
    expect(source).toContain('const recentSavingRecordKey = ref(\'\')')
    expect(source).toContain('recentSavingRecordKey.value = nextKey')
    expect(source).toContain('props.savingRecordKey || recentSavingRecordKey.value')
    expect(functionSource(
      source,
      'function syncDraftRecords',
      'function recordKey',
    )).toContain('preserveUnsavedDrafts')
    expect(functionSource(
      source,
      'function preserveUnsavedDrafts',
      'function replaceIncomingRecordWithDirtyDraft',
    )).toContain('shouldSkipPreservingSavingRecord')
    expect(functionSource(
      source,
      'function syncDraftRecords',
      'function recordKey',
    )).toContain('lastSyncedType.value = currentType.value')
    expect(functionSource(
      source,
      'function replaceIncomingRecordWithDirtyDraft',
      'function syncDraftRecords',
    )).toContain('shouldUseIncomingSavingRecord')
    expect(functionSource(
      source,
      'function shouldUseIncomingSavingRecord',
      'function syncDraftRecords',
    )).toContain('recentSavingRecordKey.value = \'\'')
    expect(source).toContain('const hasSavingRecord = computed(() => Boolean(props.savingRecordKey))')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord"')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
    expect(source).toContain(':disabled="hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
  })

  it('renders uploaded attachments as obvious previewable rows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).title')
    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).detail')
    expect(source).toContain('attachment-item__hint')
    expect(source).toContain('attachment-item__action')
    expect(source).toContain('previewAttachment')
    expect(source).toContain('removeAttachment')
  })
})
