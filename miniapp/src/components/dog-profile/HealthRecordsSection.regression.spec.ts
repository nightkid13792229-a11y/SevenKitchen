import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('HealthRecordsSection regressions', () => {
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
    expect(source).toContain(':disabled="loading || hasUploadingRecords"')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || isRecordSaving(record, index)"')
    expect(source).toContain(':disabled="hasUploadingRecords || isRecordSaving(record, index)"')
    expect(source).toContain('hasUploadingRecords.value ||\n    isUploading(record, index)')
    expect(source).toContain('function addRecord() {\n  if (hasUploadingRecords.value)')
    expect(source).toContain('function saveRecord(index: number) {\n  if (hasUploadingRecords.value)')
    expect(source).toContain('function cancelRecord(index: number) {\n  if (hasUploadingRecords.value)')
    expect(source).toContain('async function removeRecord(index: number) {\n  if (hasUploadingRecords.value)')
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
