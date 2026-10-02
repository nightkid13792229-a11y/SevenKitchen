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
    expect(source).toContain('function saveRecord(index: number): boolean {\n  if (hasSavingRecord.value)')
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

  it('折叠彻底取消：症状、用药、其它想说的全在明面上', () => {
    const source = readSection()
    const visitBranch = source.slice(
      source.indexOf('<template v-if="isVisitMode">'),
      source.indexOf('<template v-else>'),
    )

    // 2026-10-02 第二轮：复查日期与兽医也去掉之后，「更多/选填」没有存在意义了
    expect(visitBranch).not.toContain('more-toggle')
    expect(visitBranch).not.toContain('toggleMore')
    // 该露的字段都在明面上
    expect(visitBranch).toContain('complaintLabel')
    expect(visitBranch).toContain('medicationLabel')
    expect(visitBranch).toContain('notesLabel')
  })

  it('附件格式/大小提示放在上传弹窗里，表单上不再占一行', () => {
    const source = readSection()

    // 弹窗（action sheet）里带提示
    expect(source).toContain('alertText: attachmentHintText')
    // 表单里不再渲染那行小字
    expect(source).not.toContain('{{ attachmentHintText }}')

    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')
    expect(utils).toContain("'图片或 PDF，单个不超过 10MB'")
    expect(utils).not.toContain('HEIC、HEIF 或 PDF，单个文件不超过')
  })
})

/**
 * 五条收尾（2026-10-02 老板逐条提的）。
 */
describe('病历/检查表单 · 五条收尾', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

  it('① 切换就诊/体检：不再弹提醒，已填内容全部保留', () => {
    const source = readSection()
    const fn = source.match(/function changeVisitKind[\s\S]*?\n}/)?.[0] || ''

    expect(fn).not.toBe('')
    // 不再弹"内容会清空"的确认框
    expect(fn).not.toContain('uni.showModal')
    expect(source).not.toContain('已填的内容会清空')
    // 不重开草稿：原地改这条草稿的归属，字段留着
    expect(fn).toContain('[HEALTH_VISIT_KIND_FIELD]: kind')
    expect(fn).not.toContain('createHealthVisitDraft(kind)')
    // 日期在两个类型下字段名不同（visitDate / checkupDate），必须搬一次
    expect(fn).toContain('next[targetConfig.dateKey] = date')
    // 切回体检要有默认体检类型（后端这一栏必填）
    expect(fn).toContain('HEALTH_VISIT_DEFAULT_CHECKUP_TYPE')
    // 已保存的记录不许换类型：换类型＝换一张表，硬换会在库里留下两条
    expect(fn).toContain('已保存的记录不能改类型')
  })

  it('① 切换后明确告诉家长"刚填的还在"，不让人以为白填了', () => {
    const source = readSection()

    expect(source).toContain('function visitCarryOverHint(record: Record<string, any>)')
    expect(source).toContain('切回「体检」还能看到刚填的检查结论')
    expect(source).toContain('切回「就诊」还能看到刚填的')
  })

  it('③ 复查日期与兽医从表单里去掉，但保存时照旧提交（识别出来的值不能丢）', () => {
    const source = readSection()
    const visitBranch = source.slice(
      source.indexOf('<template v-if="isVisitMode">'),
      source.indexOf('<template v-else>'),
    )

    expect(visitBranch).not.toContain('followUpLabel')
    expect(visitBranch).not.toContain('vetLabel')
    // 连带整个「还有 N 项选填」折叠一起去掉
    expect(visitBranch).not.toContain('more-toggle')
    expect(source).not.toContain('function visitOptionalToggleLabel')

    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')
    expect(utils).toContain('veterinarian: normalizeOptionalText(record?.veterinarian)')
    expect(utils).toContain('followUpDate: normalizeOptionalText(record?.followUpDate)')
  })

  it('⑤ 「取消新增」按钮文案改成「取消新增记录」', () => {
    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')

    expect(utils).toContain("return '取消新增记录'")
    expect(utils).not.toContain("return '取消新增'\n")
  })
})

/**
 * 第三轮收尾（2026-10-02 老板继续提的）。
 */
describe('病历/检查表单 · 第三轮', () => {
  const readSection = () =>
    readFileSync(
      resolve(process.cwd(), 'src/components/dog-profile/HealthRecordsSection.vue'),
      'utf-8',
    )

  it('① 体检类型从表单里删掉（接口那一栏由缺省值兜底），卡片标题改用检查结论', () => {
    const source = readSection()
    const visitBranch = source.slice(
      source.indexOf('<template v-if="isVisitMode">'),
      source.indexOf('<template v-else>'),
    )

    expect(visitBranch).not.toContain('checkupTypeKey')
    expect(visitBranch).not.toContain('checkupTypeOptions')

    const utils = readFileSync(resolve(process.cwd(), 'src/utils/health-records.ts'), 'utf-8')
    // 缺省值仍然送给后端（这一栏是必填的）
    expect(utils).toContain('|| HEALTH_VISIT_DEFAULT_CHECKUP_TYPE')
    // 标题：先看结论，再退回识别出来的类型
    expect(utils).toContain("? [record?.[config.primaryKey], formatHealthCheckupTypeLabel(record?.checkupType)]")
  })

  it('① 上传附件按钮带括弧提示，讲清这个按钮是干什么的', () => {
    const source = readSection()

    expect(source).toContain('上传附件（检查报告、化验单等）')
  })

  it('③ 缺信息时把那条展开并滚到眼前，不是只弹一句话', () => {
    const source = readSection()
    const fn = source.match(/function saveRecord\(index: number\): boolean \{[\s\S]*?\n\}/)?.[0] || ''

    expect(fn).toContain('expandedRecordKey.value = recordKey(record, index)')
    expect(fn).toContain('scrollToRecord(index)')
    expect(fn).toContain('return false')
  })

  it('点一次「从相册选择」就要弹出选择器（组件提前挂好，不等下一次渲染）', () => {
    const source = readSection()

    // 2026-10-02 老板报的："每次都要点第二次才弹出文件管理器，第一次没反应"
    // 根因：扫描组件原来靠 scanActive 懒挂载，第一次点击时 ref 还是空的，
    // 调用被 ?. 静默吞掉。现在常驻挂载、空闲时 display:none。
    expect(source).toContain('v-if="isVisitMode && dogId"')
    expect(source).not.toContain('v-if="isVisitMode && dogId && scanActive"')
    expect(source).toContain("'scan-entry--hidden': !scanActive")
    expect(source).toContain('.scan-entry--hidden {')

    const fn = source.match(/function startScan\(\)[\s\S]*?\n}/)?.[0] || ''
    expect(fn).toContain('scanActive.value = true')
    // 就绪就直接调，不再无脑等 nextTick
    expect(fn).toContain('if (scanRef.value) {')
    expect(fn).toContain('scanRef.value.startScan?.()')
  })

  it('③ 批量保存逐条等存完再下一条（否则第二条开始会被"保存中"挡回来）', () => {
    const source = readSection()

    expect(source).toContain('function waitForPendingSave(): Promise<void>')
    expect(source).toContain('await waitForPendingSave()')
    // 兜底：父组件万一没清 key，15 秒也要放行
    expect(source).toContain('15000')
    // 有一条缺信息就停下来，并说清还剩几条
    expect(source).toContain('还有 ${remaining} 条待保存')
  })
})
