import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('HealthRecordsSection regressions', () => {
  it('renders uploaded attachments as obvious previewable rows', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).title')
    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).detail')
    expect(source).toContain('attachment-item__hint')
    expect(source).toContain('attachment-item__action')
  })

  it('does not mark remote health records as saved unless the server returns the saved record', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(source).toContain("throw new Error('保存成功但未返回最新记录，请重试')")
    expect(source).not.toContain('findSavedRecordFromProfile(resolveProfileRecords(res.data.profile), record, index) ||')
  })
})
