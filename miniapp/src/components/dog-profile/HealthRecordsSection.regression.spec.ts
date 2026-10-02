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
    // 2026-10-01：合并模式（'visit'）没有单一类型，附件接口类型集中到 attachmentApiType，
    // 它把 'visit' 显式映射成 'allergy'（历史上走的就是通用上传口，接口行为不变）
    expect(source).toContain('const uploadType = attachmentApiType.value')
    // 附件接口类型：合并模式映射成 'allergy'（历史上走的就是通用上传/删除口）
    expect(source).toContain(
      "const attachmentApiType = computed<HealthRecordType>(() => (\n  currentType.value === 'visit' ? 'allergy' : currentType.value\n))",
    )
    expect(source).toContain('findRecordIndexByKey')
    expect(source).toContain('const targetIndex = findRecordIndexByKey(uploadKey)')
    expect(source).toContain('const targetRecord = draftRecords.value[targetIndex]')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord"')
    expect(source).toContain(':disabled="loading || hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
    expect(source).toContain(':disabled="hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"')
    expect(source).toContain('type="text"\n            :disabled="hasSavingRecord"')
    expect(source).toContain('fieldConfigForRecord(record).primary.options')
    expect(source).toContain('fieldOptionLabels(fieldConfigForRecord(record).primary.options)')
    expect(source).toContain('updateOptionField(index, fieldConfigForRecord(record).primary.key, fieldConfigForRecord(record).primary.options, $event.detail.value)')
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
    // 2026-10-01：合并模式（activeType='visit'）下没有单一记录类型，
    // 这组 key/比对用途统一走 baseType（非合并时等于 currentType）
    expect(source).toContain('lastSyncedType.value === baseType.value')
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
    )).toContain('lastSyncedType.value = baseType.value')
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

  it('「病例」合并模式：一个列表装就诊与体检两类记录', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    // 合并只在界面层：逐条判断记录属于哪张表
    expect(source).toContain("const isVisitMode = computed(() => (props.activeType as string) === 'visit')")
    expect(source).toContain('function recordKindOf(record: Record<string, any>): HealthRecordType')
    expect(source).toContain('resolveHealthVisitKind(record)')
    expect(source).toContain('getHealthVisitSectionMeta()')

    // 病历/检查走自己的字段对照表（utils 里那张，有独立测试）
    expect(source).toContain('function visitConfig(record: Record<string, any>)')
    expect(source).toContain('getHealthVisitFieldConfig(resolveHealthVisitKind(record))')

    // 新增记录默认「就诊」，想记体检的人在表单里切
    expect(source).toContain("createHealthVisitDraft('medical')")

    // 保存与删除按记录自己的类型走
    expect(source).toContain('const type = recordKindOf(record)')
    expect(source).toContain("emit('save-record', { type, record: stripLocalFields(record), recordKey: key })")
    expect(source).toContain("emit('delete-record', { type: recordKindOf(record), record: stripLocalFields(record) })")

    // 校验用合并板块自己的规则：日期 +（主要问题 或 医生怎么说）至少一个
    expect(source).toContain('getHealthVisitValidationError(resolveHealthVisitKind(record), record)')

    // 摘要在合并模式下来自 visit 版本的构建函数
    expect(source).toContain('buildHealthVisitSummary(resolveHealthVisitKind(record), record)')
  })

  it('renders uploaded attachments as obvious previewable rows', () => {    const source = readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).title')
    expect(source).toContain('attachmentDisplay(attachment, attachmentIndex).detail')
    expect(source).toContain('attachment-item__hint')
    expect(source).toContain('attachment-item__action')
    expect(source).toContain('record-card__attachments-preview')
    expect(source).toContain('!isRecordExpanded(record, index) && attachmentList(record).length > 0')
    expect(source).toContain('record-card__attachment-preview')
    expect(source).toContain('@tap.stop="previewAttachment(attachment)"')
    expect(source).toContain('previewAttachment')
    expect(source).toContain('removeAttachment')
  })
})

/**
 * 病历/检查表单精简（2026-10-02，老板定稿）。
 *
 * 老板三句话：
 *   · 「我们要不先来精简一下表单需要录入的信息？」
 *   · 「状态这个字段，我觉得可以不要。」
 *   · 「（备注）保留但改名。」
 * 加上审计结论：备注零消费者、症状与用药被藏在「更多」里、
 * 必填的"诊断结果"很多家长根本拿不到。
 */
describe('病历/检查表单 · 精简版', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

  it('病历/检查走独立分支，过敏那条路原样包在 v-else 里', () => {
    const source = readSection()

    expect(source).toContain('<template v-if="isVisitMode">')
    expect(source).toContain('<template v-else>')
    // 独立分支之后，通用分支的字段配置只服务过敏
    expect(source).toContain('function fieldConfigForRecord(_record: Record<string, any>): FieldConfig')
    expect(source).toContain('return getFieldConfig(baseType.value)')
  })

  it('字段顺序＝家长填写顺序：日期 → 主要问题 → 医生怎么说 → 用药 → 其它想说的', () => {
    const source = readSection()
    const at = (needle: string) => source.indexOf(needle)

    const date = at("{{ visitConfig(record).dateLabel }}")
    const complaint = at("{{ visitConfig(record).complaintLabel }}")
    const primary = at("{{ visitConfig(record).primaryLabel }}")
    const advice = at("{{ visitConfig(record).adviceLabel }}")
    const medication = at("{{ visitConfig(record).medicationLabel }}")
    const notes = at("{{ visitConfig(record).notesLabel }}")

    expect(date).toBeGreaterThan(-1)
    expect(complaint).toBeGreaterThan(date)
    expect(primary).toBeGreaterThan(complaint)
    expect(advice).toBeGreaterThan(primary)
    expect(medication).toBeGreaterThan(advice)
    expect(notes).toBeGreaterThan(medication)
  })

  it('状态选择器从表单里去掉，改成存好后一键「已经好了」', () => {
    const source = readSection()

    // 病历/检查这一支里不再有状态下拉（只留一键「已经好了」）
    const visitBranch = source.slice(
      source.indexOf('<template v-if="isVisitMode">'),
      source.indexOf('<template v-else>'),
    )
    expect(visitBranch).not.toContain('statusField(record)')
    expect(visitBranch).not.toContain('getMedicalStatusOptions()')
    expect(visitBranch).toContain('status-switch')
    expect(source).toContain('class="status-switch"')
    expect(source).toContain('medicalStatusToggle(record)')
    // 只对已保存的记录显示（未保存的还没资格谈"好了"）
    expect(source).toContain('isSavedRecord(record, index)')
    // 只改草稿、由顾客点保存：这里不许直接发请求
    const toggleBlock = source.match(/function toggleVisitStatus[\s\S]*?\n}/)?.[0] || ''
    expect(toggleBlock).toContain('record.status = next.status')
    expect(toggleBlock).not.toContain('dogApi')
  })

  it('「更多」改成说清里面是什么的「选填」，不再藏症状/用药', () => {
    const source = readSection()

    expect(source).toContain('还有 ${labels.length} 项选填（${labels.join')
    // 症状与用药已经提到明面，折叠里只剩复查日期与兽医
    const optionalBlock = source.match(/function visitOptionalToggleLabel[\s\S]*?\n}/)?.[0] || ''
    expect(optionalBlock).toContain('config.followUpLabel')
    expect(optionalBlock).toContain('config.vetLabel')
    expect(optionalBlock).not.toContain('medicationLabel')
    expect(optionalBlock).not.toContain('complaintLabel')
  })

  it('附件说明压成一行（原来把六种格式都列出来）', () => {
    const source = readSection()

    expect(source).toContain('{{ attachmentHintText }}')

    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')
    expect(utils).toContain("'图片或 PDF，单个不超过 10MB'")
    expect(utils).not.toContain('HEIC、HEIF 或 PDF，单个文件不超过')
  })
})
