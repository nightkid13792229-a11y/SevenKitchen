export type HealthRecordType = 'medical' | 'checkup' | 'allergy'
export type HealthAttachmentSelectionType = 'image' | 'pdf'
export type HealthAttachmentPreviewType = 'image' | 'pdf' | 'file'
export interface HealthRecordSummary {
  title: string
  detail: string
}

export interface HealthRecordTypeMeta {
  type: HealthRecordType
  label: string
  addLabel: string
  emptyTitle: string
  accentClass: string
}

export interface HealthCheckupTypeOption {
  value: string
  label: string
}

export interface DogHealthStateSnapshot {
  medicalRecords: any[]
  checkupRecords: any[]
  allergyRecords: any[]
  pickyFoods: string
}

export const HEALTH_RECORD_TYPES: HealthRecordType[] = ['medical', 'checkup', 'allergy']
export const HEALTH_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const HEALTH_ATTACHMENT_MAX_SIZE_LABEL = '10MB'
export const HEALTH_ATTACHMENT_HINT_TEXT =
  '支持 JPG、PNG、GIF、WEBP、HEIC、HEIF 或 PDF，单个文件不超过 10MB，上传后可点击预览。'
const HEALTH_RECORD_ATTACHMENT_CACHE_PREFIX = 'dog-health-record-attachments'

const HEALTH_CHECKUP_TYPE_OPTIONS: HealthCheckupTypeOption[] = [
  { value: 'ROUTINE', label: '常规体检' },
  { value: 'PRE_PURCHASE', label: '购前体检' },
  { value: 'SENIOR_WELLNESS', label: '老年健康检查' },
  { value: 'PRE_ANESTHESIA', label: '麻醉前检查' },
  { value: 'EMERGENCY', label: '急诊检查' },
  { value: 'FOLLOW_UP', label: '复查' },
]

const LEGACY_CHECKUP_TYPE_VALUE_MAP: Record<string, string> = {
  annual: 'ROUTINE',
  routine: 'ROUTINE',
  年度体检: 'ROUTINE',
  常规体检: 'ROUTINE',
  普通体检: 'ROUTINE',
  购前体检: 'PRE_PURCHASE',
  购犬体检: 'PRE_PURCHASE',
  购买前体检: 'PRE_PURCHASE',
  老年体检: 'SENIOR_WELLNESS',
  老年健康检查: 'SENIOR_WELLNESS',
  麻醉前检查: 'PRE_ANESTHESIA',
  术前检查: 'PRE_ANESTHESIA',
  急诊: 'EMERGENCY',
  急诊检查: 'EMERGENCY',
  复查: 'FOLLOW_UP',
  术后复查: 'FOLLOW_UP',
  牙齿复查: 'FOLLOW_UP',
}

type HealthRecordShape = Record<string, any>

function normalizeOptionalText(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim()
      }

      if (item && typeof item === 'object' && typeof item.url === 'string') {
        return item.url.trim()
      }

      return ''
    })
    .filter(Boolean)
}

const HEALTH_RECORD_TYPE_META: Record<HealthRecordType, HealthRecordTypeMeta> = {
  medical: {
    type: 'medical',
    label: '病史',
    addLabel: '新增病史',
    emptyTitle: '还没有病史记录',
    accentClass: 'health-records--medical',
  },
  checkup: {
    type: 'checkup',
    label: '体检',
    addLabel: '新增体检',
    emptyTitle: '还没有体检记录',
    accentClass: 'health-records--checkup',
  },
  allergy: {
    type: 'allergy',
    label: '过敏',
    addLabel: '新增过敏',
    emptyTitle: '还没有过敏记录',
    accentClass: 'health-records--allergy',
  },
}

export function getHealthRecordTypeMeta(type: HealthRecordType) {
  return HEALTH_RECORD_TYPE_META[type]
}

export function getHealthCheckupTypeOptions() {
  return HEALTH_CHECKUP_TYPE_OPTIONS.map(option => ({ ...option }))
}

export function resolveHealthCheckupTypeValue(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return ''
  }

  const upperValue = normalized.toUpperCase()
  if (HEALTH_CHECKUP_TYPE_OPTIONS.some(option => option.value === upperValue)) {
    return upperValue
  }

  return LEGACY_CHECKUP_TYPE_VALUE_MAP[normalized] || ''
}

export function formatHealthCheckupTypeLabel(value: unknown) {
  const resolvedValue = resolveHealthCheckupTypeValue(value)
  const matchedOption = HEALTH_CHECKUP_TYPE_OPTIONS.find(option => option.value === resolvedValue)
  return matchedOption?.label || (typeof value === 'string' ? value.trim() : '')
}

export function createHealthRecordDraft(type: HealthRecordType): HealthRecordShape {
  const baseRecord: HealthRecordShape = {
    __localId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notes: '',
    attachments: [],
  }

  if (type === 'medical') {
    return {
      ...baseRecord,
      chiefComplaint: '',
      visitDate: '',
      diagnosis: '',
      status: 'PENDING_CONFIRMATION',
    }
  }

  if (type === 'checkup') {
    return {
      ...baseRecord,
      checkupType: '',
      checkupDate: '',
    }
  }

  return {
    ...baseRecord,
    allergen: '',
  }
}

export function getHealthRecordValidationError(
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  if (type === 'medical') {
    if (!normalizeOptionalText(record.chiefComplaint)) {
      return '请补充症状或疾病'
    }

    if (!normalizeOptionalText(record.visitDate)) {
      return '请补充发病日期'
    }

    if (!normalizeOptionalText(record.diagnosis)) {
      return '请补充诊断结果'
    }

    return null
  }

  if (type === 'checkup') {
    if (!resolveHealthCheckupTypeValue(record.checkupType)) {
      return '请选择体检类型'
    }

    if (!normalizeOptionalText(record.checkupDate)) {
      return '请补充体检日期'
    }

    return null
  }

  if (!normalizeOptionalText(record.allergen)) {
    return '请补充过敏原'
  }

  return null
}

export function buildHealthRecordPayload(
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  if (type === 'medical') {
    const status = String(record.status || '').trim()

    return {
      chiefComplaint: normalizeOptionalText(record.chiefComplaint) || '',
      visitDate: normalizeOptionalText(record.visitDate) || '',
      diagnosis: normalizeOptionalText(record.diagnosis) || '',
      // 缺省是"待确认"，不是后端的默认值"治疗中"
      status: getMedicalStatusOptions().some(option => option.value === status)
        ? status
        : 'PENDING_CONFIRMATION',
      notes: normalizeOptionalText(record.notes),
      attachments: normalizeAttachments(record.attachments),
    }
  }

  if (type === 'checkup') {
    return {
      checkupType: resolveHealthCheckupTypeValue(record.checkupType),
      checkupDate: normalizeOptionalText(record.checkupDate) || '',
      notes: normalizeOptionalText(record.notes),
      attachments: normalizeAttachments(record.attachments),
    }
  }

  return {
    allergen: normalizeOptionalText(record.allergen) || '',
    notes: normalizeOptionalText(record.notes),
    attachments: normalizeAttachments(record.attachments),
  }
}

export function buildCrudHealthRecordPayload(
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  const payload = buildHealthRecordPayload(type, record)

  if (type !== 'checkup') {
    return payload
  }

  const { notes, ...checkupPayload } = payload
  return {
    ...checkupPayload,
    findings: notes,
  }
}

export function normalizeHealthRecordResponse(record: HealthRecordShape) {
  const source = record && typeof record === 'object' && !Array.isArray(record) && record.record
    ? record.record
    : record

  return {
    ...source,
    notes: source?.notes ?? source?.findings ?? '',
    attachments: normalizeAttachments(source?.attachments),
  }
}

export function normalizeSavedHealthRecordResponse(
  responseRecord: HealthRecordShape,
  submittedRecord: HealthRecordShape,
) {
  const normalizedRecord = normalizeHealthRecordResponse(responseRecord)
  const submittedAttachments = normalizeAttachments(submittedRecord?.attachments)

  if (submittedAttachments.length === 0 || normalizedRecord.attachments.length > 0) {
    return normalizedRecord
  }

  return {
    ...normalizedRecord,
    attachments: submittedAttachments,
  }
}

export function normalizeHealthRecordListResponse(response: Record<string, any> | null | undefined) {
  const records = response?.data?.records
  if (!Array.isArray(records)) {
    return []
  }

  return records.map(record => normalizeHealthRecordResponse(record))
}

export function replaceHealthRecordInList(
  records: HealthRecordShape[],
  nextRecord: HealthRecordShape,
) {
  if (!nextRecord?.id) {
    return records
  }

  const existingIndex = records.findIndex(record => record?.id === nextRecord.id)
  if (existingIndex < 0) {
    return [nextRecord, ...records]
  }

  return records.map((record, index) => (index === existingIndex ? nextRecord : record))
}

export function removeHealthRecordFromList(
  records: HealthRecordShape[],
  recordId: string,
) {
  return records.filter(record => record?.id !== recordId)
}

function getHealthRecordAttachmentCacheKey(dogId: string, type: HealthRecordType) {
  return `${HEALTH_RECORD_ATTACHMENT_CACHE_PREFIX}:${dogId}:${type}`
}

function hasMiniProgramStorage() {
  return typeof uni !== 'undefined' &&
    typeof uni.getStorageSync === 'function' &&
    typeof uni.setStorageSync === 'function'
}

function readHealthRecordAttachmentCache(
  dogId: string,
  type: HealthRecordType,
): Record<string, string[]> {
  if (!dogId || !hasMiniProgramStorage()) {
    return {}
  }

  try {
    const cached = uni.getStorageSync(getHealthRecordAttachmentCacheKey(dogId, type))
    return cached && typeof cached === 'object' && !Array.isArray(cached)
      ? cached as Record<string, string[]>
      : {}
  } catch {
    return {}
  }
}

function writeHealthRecordAttachmentCacheEntries(
  dogId: string,
  type: HealthRecordType,
  cache: Record<string, string[]>,
) {
  if (!dogId || !hasMiniProgramStorage()) {
    return
  }

  const key = getHealthRecordAttachmentCacheKey(dogId, type)
  const hasEntries = Object.keys(cache).length > 0

  try {
    if (hasEntries) {
      uni.setStorageSync(key, cache)
      return
    }

    if (typeof uni.removeStorageSync === 'function') {
      uni.removeStorageSync(key)
    } else {
      uni.setStorageSync(key, {})
    }
  } catch {
    // Ignore cache failures; remote health records remain the source of truth.
  }
}

function getHealthRecordAttachmentCacheIdentities(
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  return [
    typeof record?.id === 'string' && record.id ? `id:${record.id}` : '',
    buildHealthRecordFocusIdentity(type, record),
  ].filter(Boolean)
}

export function writeHealthRecordAttachmentCache(
  dogId: string,
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  const cache = readHealthRecordAttachmentCache(dogId, type)
  const attachments = normalizeAttachments(record?.attachments)
  const identities = getHealthRecordAttachmentCacheIdentities(type, record)

  for (const identity of identities) {
    if (attachments.length > 0) {
      cache[identity] = attachments
    } else {
      delete cache[identity]
    }
  }

  writeHealthRecordAttachmentCacheEntries(dogId, type, cache)
}

export function removeHealthRecordAttachmentCache(
  dogId: string,
  type: HealthRecordType,
  record: HealthRecordShape,
) {
  const cache = readHealthRecordAttachmentCache(dogId, type)
  for (const identity of getHealthRecordAttachmentCacheIdentities(type, record)) {
    delete cache[identity]
  }
  writeHealthRecordAttachmentCacheEntries(dogId, type, cache)
}

export function mergeHealthRecordListWithCachedAttachments(
  dogId: string,
  type: HealthRecordType,
  records: HealthRecordShape[],
) {
  const cache = readHealthRecordAttachmentCache(dogId, type)

  return records.map((record) => {
    const attachments = normalizeAttachments(record?.attachments)
    if (attachments.length > 0) {
      writeHealthRecordAttachmentCache(dogId, type, record)
      return record
    }

    const cachedAttachments = getHealthRecordAttachmentCacheIdentities(type, record)
      .map(identity => cache[identity])
      .find(value => Array.isArray(value) && value.length > 0)

    return cachedAttachments
      ? { ...record, attachments: cachedAttachments }
      : record
  })
}

export function buildHealthRecordSectionPayload(
  type: HealthRecordType,
  records: HealthRecordShape[],
) {
  if (type === 'medical') {
    return {
      medicalRecords: records.map((record) => buildHealthRecordPayload(type, record)),
    }
  }

  if (type === 'checkup') {
    return {
      checkupRecords: records.map((record) => buildHealthRecordPayload(type, record)),
    }
  }

  return {
    allergyRecords: records.map((record) => buildHealthRecordPayload(type, record)),
  }
}

export function doHealthRecordsMatchPersistedPayload(
  type: HealthRecordType,
  localRecord: HealthRecordShape,
  persistedRecord: HealthRecordShape,
) {
  return (
    JSON.stringify(buildHealthRecordPayload(type, localRecord)) ===
    JSON.stringify(buildHealthRecordPayload(type, persistedRecord))
  )
}

export function findPersistedHealthRecordMatch(
  type: HealthRecordType,
  profileRecords: HealthRecordShape[],
  localRecord: HealthRecordShape,
  otherKnownIds: unknown[] = [],
) {
  if (!Array.isArray(profileRecords)) {
    return null
  }

  if (localRecord?.id) {
    const sameIdRecord = profileRecords.find((item) => item?.id === localRecord.id)
    if (sameIdRecord) {
      return sameIdRecord
    }
  }

  const knownIds = new Set(
    otherKnownIds.filter((id): id is string => typeof id === 'string' && Boolean(id)),
  )

  return (
    profileRecords.find((item) => {
      const itemId = typeof item?.id === 'string' ? item.id : ''
      return (
        !knownIds.has(itemId) &&
        doHealthRecordsMatchPersistedPayload(type, localRecord, item)
      )
    }) || null
  )
}

export function buildDietRemindersPayload(form: {
  allergyFoods?: unknown
  preferredFoods?: unknown
  pickyFoods?: unknown
}) {
  const payload: Record<string, string | null> = {}

  if (Object.prototype.hasOwnProperty.call(form, 'allergyFoods')) {
    payload.allergyFoods = normalizeOptionalText(form.allergyFoods)
  }

  // 喜欢吃的食材（2026-09-27）：这一列配方设计器与 AI 早就在读，
  // 但顾客端一直没有入口，生产 4544 只狗整列为空。
  if (Object.prototype.hasOwnProperty.call(form, 'preferredFoods')) {
    payload.preferredFoods = normalizeOptionalText(form.preferredFoods)
  }

  if (Object.prototype.hasOwnProperty.call(form, 'pickyFoods')) {
    payload.pickyFoods = normalizeOptionalText(form.pickyFoods)
  }

  return payload
}

export function hasUnsavedDietReminderChange(current: unknown, saved: unknown) {
  return normalizeOptionalText(current) !== normalizeOptionalText(saved)
}

export function resolveDogHealthSelectionState(
  dogs: Array<{ id?: string }>,
  preferredDogId = '',
) {
  if (!Array.isArray(dogs) || dogs.length === 0) {
    return {
      hasNoDogs: true,
      selectedIndex: -1,
      selectedDogId: '',
    }
  }

  const preferredIndex = preferredDogId
    ? dogs.findIndex(dog => dog?.id === preferredDogId)
    : -1
  const selectedIndex = preferredIndex >= 0 ? preferredIndex : 0

  return {
    hasNoDogs: false,
    selectedIndex,
    selectedDogId: dogs[selectedIndex]?.id || '',
  }
}

export function shouldDiscardDogHealthProfileResponse({
  requestedDogId,
  latestRequestedDogId,
}: {
  requestedDogId: string
  latestRequestedDogId: string
}) {
  return !requestedDogId || requestedDogId !== latestRequestedDogId
}

function cloneHealthStateValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function normalizeHealthStateRecords(value: unknown) {
  return Array.isArray(value) ? cloneHealthStateValue(value) : []
}

function mergeHealthStateRecordSection(
  current: any[],
  incoming: Record<string, any> | null | undefined,
  key: 'medicalRecords' | 'checkupRecords' | 'allergyRecords',
) {
  if (!Object.prototype.hasOwnProperty.call(incoming || {}, key)) {
    return cloneHealthStateValue(current)
  }

  const nextValue = incoming?.[key]
  if (nextValue == null) {
    return cloneHealthStateValue(current)
  }

  return normalizeHealthStateRecords(nextValue)
}

function normalizeHealthStatePickyFoods(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function buildDogHealthStateSnapshot(source: Record<string, any> | null | undefined): DogHealthStateSnapshot {
  return {
    medicalRecords: normalizeHealthStateRecords(source?.medicalRecords),
    checkupRecords: normalizeHealthStateRecords(source?.checkupRecords),
    allergyRecords: normalizeHealthStateRecords(source?.allergyRecords),
    pickyFoods: normalizeHealthStatePickyFoods(source?.pickyFoods),
  }
}

export function mergeDogHealthStateSnapshot(
  current: DogHealthStateSnapshot,
  incoming: Record<string, any> | null | undefined,
): DogHealthStateSnapshot {
  return {
    medicalRecords: mergeHealthStateRecordSection(current.medicalRecords, incoming, 'medicalRecords'),
    checkupRecords: mergeHealthStateRecordSection(current.checkupRecords, incoming, 'checkupRecords'),
    allergyRecords: mergeHealthStateRecordSection(current.allergyRecords, incoming, 'allergyRecords'),
    pickyFoods: Object.prototype.hasOwnProperty.call(incoming || {}, 'pickyFoods')
      ? normalizeHealthStatePickyFoods(incoming?.pickyFoods)
      : normalizeHealthStatePickyFoods(current.pickyFoods),
  }
}

export function getDogHealthStateCacheKey(dogId: string) {
  return `dog-health-state:${dogId}`
}

export function readDogHealthStateSnapshotCache(dogId: string): DogHealthStateSnapshot | null {
  if (!dogId || typeof uni === 'undefined') {
    return null
  }

  try {
    const cached = uni.getStorageSync(getDogHealthStateCacheKey(dogId))
    if (!cached || typeof cached !== 'object') {
      return null
    }

    return buildDogHealthStateSnapshot(cached as Record<string, any>)
  } catch {
    return null
  }
}

export function writeDogHealthStateSnapshotCache(
  dogId: string,
  snapshot: DogHealthStateSnapshot,
) {
  if (!dogId || typeof uni === 'undefined') {
    return
  }

  try {
    uni.setStorageSync(getDogHealthStateCacheKey(dogId), cloneHealthStateValue(snapshot))
  } catch {
    // Ignore storage failures in health-state cache fallback.
  }
}

export function shouldUseRemoteHealthRecordSync(dogId: unknown) {
  return typeof dogId === 'string' && dogId.trim().length > 0
}

export function buildHealthAttachmentUploadUrl(
  baseUrl: string,
  type: HealthRecordType,
) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  if (type === 'medical') {
    return `${normalizedBaseUrl}/dogs/medical-records/upload-attachment`
  }

  if (type === 'checkup') {
    return `${normalizedBaseUrl}/dogs/checkup-records/upload-attachment`
  }

  return `${normalizedBaseUrl}/health/upload-image`
}

export function buildHealthAttachmentDeletePath(type: HealthRecordType) {
  if (type === 'medical') {
    return '/dogs/medical-records/attachments'
  }

  if (type === 'checkup') {
    return '/dogs/checkup-records/attachments'
  }

  return '/health/attachments'
}

export function extractHealthAttachmentKey(url: string) {
  try {
    const { pathname } = new URL(url)
    const normalized = pathname.replace(/^\/+/, '')
    return normalized || null
  } catch {
    return null
  }
}

function resolveHealthAttachmentUploadParseError(uploadRes: {
  statusCode: number
  data: string | Record<string, any>
}) {
  const rawText = typeof uploadRes.data === 'string' ? uploadRes.data.trim() : ''

  if (
    uploadRes.statusCode === 413 ||
    /Request Entity Too Large/i.test(rawText)
  ) {
    return new Error('服务器当前上传上限过小，请联系管理员调整')
  }

  if (rawText.startsWith('<')) {
    return new Error('上传服务暂时异常，请稍后再试')
  }

  return new Error(`上传失败: ${uploadRes.statusCode}`)
}

export function parseHealthAttachmentUploadResponse(uploadRes: {
  statusCode: number
  data: string | Record<string, any>
}) {
  let payload: Record<string, any>

  if (typeof uploadRes.data === 'string') {
    try {
      payload = JSON.parse(uploadRes.data)
    } catch {
      throw resolveHealthAttachmentUploadParseError(uploadRes)
    }
  } else {
    payload = uploadRes.data
  }

  if (
    (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) &&
    payload?.code === 0 &&
    payload?.data?.url
  ) {
    return {
      url: payload.data.url,
      key: payload.data.key || extractHealthAttachmentKey(payload.data.url),
    }
  }

  throw new Error(payload?.message || `上传失败: ${uploadRes.statusCode}`)
}

export function resolveHealthAttachmentUploadErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message.trim() : ''

  if (!rawMessage) {
    return '附件上传失败，请稍后再试'
  }

  if (
    rawMessage.includes('COS credentials not configured') ||
    rawMessage.includes('Failed to upload attachment') ||
    rawMessage.includes('Failed to upload file') ||
    rawMessage.includes('Failed to upload image to COS')
  ) {
    return '附件上传功能暂未配置，请稍后再试'
  }

  if (
    rawMessage.includes('File size exceeds 10MB limit') ||
    rawMessage.includes('单个附件不能超过 10MB')
  ) {
    return `单个附件不能超过 ${HEALTH_ATTACHMENT_MAX_SIZE_LABEL}`
  }

  if (rawMessage.includes('服务器当前上传上限过小')) {
    return '服务器当前上传上限过小，请联系管理员调整'
  }

  if (rawMessage.includes('上传服务暂时异常')) {
    return '附件上传失败，请稍后再试'
  }

  if (rawMessage.includes('Invalid file type')) {
    return '仅支持 JPG、PNG、GIF、WEBP、HEIC、HEIF 或 PDF'
  }

  return rawMessage
}

export function readHealthAttachmentFileSize(filePath: string): Promise<number | null> {
  if (!filePath || typeof uni === 'undefined' || typeof uni.getFileInfo !== 'function') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    uni.getFileInfo({
      filePath,
      success: (res: any) => {
        const resolvedSize = typeof res?.size === 'number' ? res.size : null
        resolve(resolvedSize)
      },
      fail: () => resolve(null),
    })
  })
}

export function resolveHealthAttachmentFileSizeError(size: number | null | undefined) {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return null
  }

  return size > HEALTH_ATTACHMENT_MAX_SIZE_BYTES
    ? `单个附件不能超过 ${HEALTH_ATTACHMENT_MAX_SIZE_LABEL}`
    : null
}

export function buildHealthAttachmentFieldHint() {
  return HEALTH_ATTACHMENT_HINT_TEXT
}

function normalizeHealthAttachmentValue(value: string) {
  return value.trim().toLowerCase()
}

export function resolveHealthAttachmentSelectionError(
  type: HealthAttachmentSelectionType,
  fileName: string,
) {
  const normalized = normalizeHealthAttachmentValue(fileName)
  if (!normalized) {
    return type === 'pdf' ? '请选择 PDF 文件' : '请选择图片文件'
  }

  const isPdf = normalized.endsWith('.pdf')
  const isImage = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(normalized)

  if (type === 'pdf') {
    return isPdf ? null : '请选择 PDF 文件'
  }

  return isImage ? null : '请选择图片文件'
}

export function resolveHealthAttachmentPreviewType(
  value: string,
): HealthAttachmentPreviewType {
  const normalized = normalizeHealthAttachmentValue(value)
  if (normalized.endsWith('.pdf')) {
    return 'pdf'
  }

  if (/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(normalized)) {
    return 'image'
  }

  return 'file'
}

function readHealthAttachmentFileName(value: string) {
  try {
    const { pathname } = new URL(value)
    const fileName = pathname.split('/').filter(Boolean).pop() || ''
    return decodeURIComponent(fileName)
  } catch {
    return ''
  }
}

export function buildHealthAttachmentDisplayMeta(value: string, index: number) {
  const previewType = resolveHealthAttachmentPreviewType(value)
  const typeLabel = previewType === 'pdf'
    ? 'PDF 附件'
    : previewType === 'image'
      ? '图片附件'
      : '附件'
  const fileName = readHealthAttachmentFileName(value)
  const fallbackIndex = Number.isFinite(index) && index >= 0 ? index + 1 : 1

  return {
    title: `${typeLabel} ${fallbackIndex}`,
    detail: fileName ? `${fileName} · 点击预览` : '点击预览',
  }
}

export function resolveHealthRecordSecondaryActionText(
  isSaved: boolean,
  isDirty: boolean,
) {
  if (!isSaved) {
    return '取消新增'
  }

  if (isDirty) {
    return '撤销修改'
  }

  return null
}

export function buildHealthRecordFocusIdentity(
  type: HealthRecordType,
  record: Record<string, any>,
) {
  const persistedId = typeof record?.id === 'string' ? record.id.trim() : ''
  if (persistedId) {
    return `id:${persistedId}`
  }

  if (type === 'medical') {
    return `medical:${String(record?.chiefComplaint || '').trim()}|${String(record?.visitDate || '').trim()}|${String(record?.diagnosis || '').trim()}`
  }

  if (type === 'checkup') {
    return `checkup:${resolveHealthCheckupTypeValue(record?.checkupType)}|${String(record?.checkupDate || '').trim()}|${String(record?.notes || '').trim()}`
  }

  return `allergy:${String(record?.allergen || '').trim()}|${String(record?.notes || '').trim()}`
}

export function findHealthRecordFocusIndex(
  type: HealthRecordType,
  records: Record<string, any>[],
  identity: string | null | undefined,
) {
  if (!identity) {
    return -1
  }

  return records.findIndex(record => buildHealthRecordFocusIdentity(type, record) === identity)
}

/**
 * 疾病状态选项。
 *
 * 2026-09-28 新增 PENDING_CONFIRMATION（待确认）：
 * 顾客自述的疾病（例如在食谱定制页填的）一律先记为"待确认"，
 * 由顾客/客服在「健康管理」页改成实际情况 —— 系统不替兽医下结论。
 */
export function getMedicalStatusOptions(): HealthCheckupTypeOption[] {
  return [
    { value: 'PENDING_CONFIRMATION', label: '待确认' },
    { value: 'TREATING', label: '治疗中' },
    { value: 'RECOVERED', label: '已康复' },
    { value: 'CHRONIC', label: '慢性' },
  ]
}

export function formatMedicalStatusLabel(status: unknown): string {
  const normalized = String(status || '').trim()
  return getMedicalStatusOptions().find(option => option.value === normalized)?.label || ''
}

export function buildHealthRecordSummary(
  type: HealthRecordType,
  record: Record<string, any>,
): HealthRecordSummary {
  const attachmentCount = normalizeAttachments(record?.attachments).length
  const attachmentSummary = attachmentCount > 0 ? `含 ${attachmentCount} 个附件` : ''
  const joinDetailParts = (parts: string[]) => (
    [...parts, attachmentSummary].filter(Boolean).join(' · ')
  )

  if (type === 'medical') {
    const title = String(record?.chiefComplaint || '').trim() || '未填写症状'
    const parts = [
      // 状态放在最前面：顾客自述来的记录要先让人看到"待确认"
      formatMedicalStatusLabel(record?.status),
      String(record?.visitDate || '').trim(),
      String(record?.diagnosis || '').trim(),
    ].filter(Boolean)

    return {
      title,
      detail: joinDetailParts(parts),
    }
  }

  if (type === 'checkup') {
    const title = formatHealthCheckupTypeLabel(record?.checkupType) || '未填写体检类型'
    const detail = String(record?.checkupDate || '').trim()

    return {
      title,
      detail: joinDetailParts([detail]),
    }
  }

  const title = String(record?.allergen || '').trim() || '未填写过敏原'
  const detail = String(record?.notes || '').trim()

  return {
    title,
    detail: joinDetailParts([detail]),
  }
}

/* ==========================================================================
 * 「病例」板块：病史 + 体检合并（2026-10-01，老板第 1 条要求）
 *
 * 背景：病史和体检在顾客眼里就是一件事——"带狗去看了一次医生"。
 * 分成两个板块，家长要先想"这算病史还是体检"才能动手记，是负担。
 *
 * ★ 合并只发生在界面层：
 *   · 数据库的 medical_record / checkup_record 两张表原样保留；
 *   · 保存时按记录的「类型」分别调原来的两个接口；
 *   · 顾客已经存进去的记录一条都不动、不迁移，将来要拆回来随时可以。
 * ========================================================================== */

/** 合并板块里一条记录的真实归属：它到底存在哪张表里 */
export type HealthVisitKind = 'medical' | 'checkup'

/** 健康管理页的五个板块 */
export type HealthSectionKey = 'visit' | 'allergy' | 'vaccine' | 'diet' | 'weight'

export const HEALTH_VISIT_KINDS: HealthVisitKind[] = ['medical', 'checkup']

/** 给顾客看的类型叫法（不叫"病史/体检"，而是他填的时候选的那两个词） */
export const HEALTH_VISIT_KIND_LABELS: Record<HealthVisitKind, string> = {
  medical: '就诊',
  checkup: '体检',
}

/** 合并列表里挂在每条记录上的归属标记（只在内存里用，不落库） */
export const HEALTH_VISIT_KIND_FIELD = '__visitKind'

/** 体检类型缺省值：收进「更多」也不会卡住保存 */
export const HEALTH_VISIT_DEFAULT_CHECKUP_TYPE = 'ROUTINE'

export interface HealthVisitFieldConfig {
  kind: HealthVisitKind
  kindLabel: string
  dateKey: string
  dateLabel: string
  /** 就诊=诊断结果；体检=检查结论（体检没有"诊断"，措辞上不能让家长误会） */
  primaryKey: string
  primaryLabel: string
  adviceKey: string
  adviceLabel: string
  /** 备注只有就诊有地方存——体检表里没有 notes 字段 */
  notesKey: string | null
  notesLabel: string
  showsComplaint: boolean
  showsCheckupType: boolean
  showsMedications: boolean
  showsStatus: boolean
  showsFollowUpDate: boolean
}

const HEALTH_VISIT_FIELD_CONFIG: Record<HealthVisitKind, HealthVisitFieldConfig> = {
  medical: {
    kind: 'medical',
    kindLabel: HEALTH_VISIT_KIND_LABELS.medical,
    dateKey: 'visitDate',
    dateLabel: '就诊日期',
    primaryKey: 'diagnosis',
    primaryLabel: '诊断结果',
    adviceKey: 'treatment',
    adviceLabel: '处理或建议',
    notesKey: 'notes',
    notesLabel: '备注',
    showsComplaint: true,
    showsCheckupType: false,
    showsMedications: true,
    showsStatus: true,
    showsFollowUpDate: true,
  },
  checkup: {
    kind: 'checkup',
    kindLabel: HEALTH_VISIT_KIND_LABELS.checkup,
    dateKey: 'checkupDate',
    dateLabel: '体检日期',
    primaryKey: 'findings',
    primaryLabel: '检查结论',
    adviceKey: 'recommendations',
    adviceLabel: '处理或建议',
    notesKey: null,
    notesLabel: '备注',
    showsComplaint: false,
    showsCheckupType: true,
    showsMedications: false,
    showsStatus: false,
    showsFollowUpDate: false,
  },
}

export function getHealthVisitFieldConfig(kind: HealthVisitKind): HealthVisitFieldConfig {
  return HEALTH_VISIT_FIELD_CONFIG[kind === 'checkup' ? 'checkup' : 'medical']
}

/** 从合并列表里的记录反查它属于哪张表 */
export function resolveHealthVisitKind(record: Record<string, any> | null | undefined): HealthVisitKind {
  return record?.[HEALTH_VISIT_KIND_FIELD] === 'checkup' ? 'checkup' : 'medical'
}

export function createHealthVisitDraft(kind: HealthVisitKind): HealthRecordShape {
  const base: HealthRecordShape = {
    __localId: `visit-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [HEALTH_VISIT_KIND_FIELD]: kind,
    attachments: [],
  }

  if (kind === 'checkup') {
    return {
      ...base,
      checkupType: HEALTH_VISIT_DEFAULT_CHECKUP_TYPE,
      checkupDate: '',
      findings: '',
      recommendations: '',
      veterinarian: '',
    }
  }

  return {
    ...base,
    visitDate: '',
    diagnosis: '',
    treatment: '',
    veterinarian: '',
    chiefComplaint: '',
    medications: '',
    status: 'PENDING_CONFIRMATION',
    followUpDate: '',
    notes: '',
  }
}

/** 接口返回的记录 → 合并列表里的一条（补上归属标记，字段名与接口保持一致） */
export function normalizeHealthVisitRecord(
  kind: HealthVisitKind,
  record: Record<string, any> | null | undefined,
): HealthRecordShape {
  const source = record && typeof record === 'object' && !Array.isArray(record) && record.record
    ? record.record
    : (record || {})

  const base: HealthRecordShape = {
    ...source,
    [HEALTH_VISIT_KIND_FIELD]: kind,
    attachments: normalizeAttachments(source.attachments),
    veterinarian: source.veterinarian ?? '',
  }

  if (kind === 'checkup') {
    return {
      ...base,
      checkupType: resolveHealthCheckupTypeValue(source.checkupType) || HEALTH_VISIT_DEFAULT_CHECKUP_TYPE,
      checkupDate: source.checkupDate ?? '',
      findings: source.findings ?? '',
      recommendations: source.recommendations ?? '',
    }
  }

  return {
    ...base,
    visitDate: source.visitDate ?? '',
    diagnosis: source.diagnosis ?? '',
    treatment: source.treatment ?? '',
    chiefComplaint: source.chiefComplaint ?? '',
    // 用药在接口里是数组，表单里按顿号串成一行更好填
    medications: Array.isArray(source.medications) ? source.medications.join('、') : (source.medications ?? ''),
    status: source.status || 'PENDING_CONFIRMATION',
    followUpDate: source.followUpDate ?? '',
    notes: source.notes ?? '',
  }
}

/** 合并列表里这条记录的日期（用于排序与摘要） */
export function resolveHealthVisitDate(record: Record<string, any> | null | undefined): string {
  const kind = resolveHealthVisitKind(record)
  const config = getHealthVisitFieldConfig(kind)
  return String(record?.[config.dateKey] || '').trim()
}

/**
 * 病史 + 体检 → 一条按日期从新到旧的列表。
 *
 * 排序规则：日期倒序；同一天**就诊排在体检前面**（先看病、后体检更符合直觉）；
 * 没填日期的草稿一律排到最前面，免得新建的记录跑到列表底部找不着。
 */
export function mergeHealthVisitRecords(
  medicalRecords: Record<string, any>[] | null | undefined,
  checkupRecords: Record<string, any>[] | null | undefined,
): HealthRecordShape[] {
  const medical = (medicalRecords || []).map((record) => normalizeHealthVisitRecord('medical', record))
  const checkup = (checkupRecords || []).map((record) => normalizeHealthVisitRecord('checkup', record))

  return [...medical, ...checkup].sort((a, b) => {
    const dateA = resolveHealthVisitDate(a)
    const dateB = resolveHealthVisitDate(b)

    if (!dateA && !dateB) return 0
    if (!dateA) return -1
    if (!dateB) return 1
    if (dateA !== dateB) return dateA < dateB ? 1 : -1

    // 同一天：就诊在前
    const kindA = resolveHealthVisitKind(a) === 'medical' ? 0 : 1
    const kindB = resolveHealthVisitKind(b) === 'medical' ? 0 : 1
    return kindA - kindB
  })
}

/**
 * 校验：**只有「诊断结果 / 检查结论」是必填的内容字段**。
 *
 * 老板第 3 条明确"病史可以只保留一个诊断结果"——症状描述、用药、状态
 * 这些一律不拦着保存，家长想记多少记多少。
 */
export function getHealthVisitValidationError(
  kind: HealthVisitKind,
  record: Record<string, any>,
): string | null {
  const config = getHealthVisitFieldConfig(kind)

  if (!normalizeOptionalText(record?.[config.dateKey])) {
    return `请选择${config.dateLabel}`
  }

  if (!normalizeOptionalText(record?.[config.primaryKey])) {
    return `请填写${config.primaryLabel}`
  }

  return null
}

/** 表单草稿 → 接口载荷（按类型分别对回两张表的字段） */
export function buildHealthVisitPayload(
  kind: HealthVisitKind,
  record: Record<string, any>,
): Record<string, unknown> {
  const config = getHealthVisitFieldConfig(kind)
  const notes = config.notesKey ? normalizeOptionalText(record?.[config.notesKey]) : null

  if (kind === 'checkup') {
    return {
      checkupType: resolveHealthCheckupTypeValue(record?.checkupType) || HEALTH_VISIT_DEFAULT_CHECKUP_TYPE,
      checkupDate: normalizeOptionalText(record?.checkupDate) || '',
      findings: normalizeOptionalText(record?.findings),
      recommendations: normalizeOptionalText(record?.recommendations),
      veterinarian: normalizeOptionalText(record?.veterinarian),
      attachments: normalizeAttachments(record?.attachments),
    }
  }

  const status = String(record?.status || '').trim()

  return {
    visitDate: normalizeOptionalText(record?.visitDate) || '',
    // chiefComplaint 在后端是必填字符串（@IsString），这里给空串而不是 null：
    // 家长可能只填了诊断结果，后端本来就允许这一栏是空串。
    chiefComplaint: normalizeOptionalText(record?.chiefComplaint) || '',
    diagnosis: normalizeOptionalText(record?.diagnosis) || '',
    treatment: normalizeOptionalText(record?.treatment),
    medications: normalizeMedicationList(record?.medications),
    // 缺省是"待确认"，不是后端的默认值"治疗中"
    status: getMedicalStatusOptions().some((option) => option.value === status)
      ? status
      : 'PENDING_CONFIRMATION',
    followUpDate: normalizeOptionalText(record?.followUpDate),
    veterinarian: normalizeOptionalText(record?.veterinarian),
    notes,
    attachments: normalizeAttachments(record?.attachments),
  }
}

/** 用药：表单里按顿号/逗号/换行填，存库时拆成数组 */
export function normalizeMedicationList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  const text = typeof value === 'string' ? value : ''
  return text
    .split(/[、,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 列表行的标题与摘要 */
export function buildHealthVisitSummary(
  kind: HealthVisitKind,
  record: Record<string, any>,
): HealthRecordSummary {
  const config = getHealthVisitFieldConfig(kind)
  const attachmentCount = normalizeAttachments(record?.attachments).length

  const title = String(record?.[config.primaryKey] || '').trim()
    || `未填写${config.primaryLabel}`

  const parts = [
    resolveHealthVisitDate(record),
    kind === 'checkup'
      ? formatHealthCheckupTypeLabel(record?.checkupType)
      : formatMedicalStatusLabel(record?.status),
    String(record?.[config.adviceKey] || '').trim(),
    attachmentCount > 0 ? `含 ${attachmentCount} 个附件` : '',
  ].filter(Boolean)

  return { title, detail: parts.join(' · ') }
}

/**
 * 「病例」板块的元信息（标题/按钮/空态文案）。
 *
 * 形状与 HealthRecordTypeMeta 保持一致，这样组件里 activeTypeMeta.xxx
 * 那套写法不用改。空态文案按老板的口径写得具体一点——
 * "还没有记录"太干，家长不知道该记什么。
 */
export function getHealthVisitSectionMeta(): HealthRecordTypeMeta {
  return {
    type: 'medical',
    label: '病例',
    addLabel: '新增记录',
    emptyTitle: '还没有病例记录',
    accentClass: 'health-records--visit',
  }
}

/** 空态下面那句引导（六个板块统一都要有一句） */
export function getHealthVisitEmptyDescription(): string {
  return '带狗看过病、做过检查，记一条，下次就诊和体检都用得上。'
}
