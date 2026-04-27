export type HealthRecordType = 'medical' | 'checkup' | 'allergy'
export type HealthAttachmentSelectionType = 'image' | 'pdf'
export type HealthAttachmentPreviewType = 'image' | 'pdf' | 'file'
export interface HealthRecordSummary {
  title: string
  detail: string
}

export interface DogHealthStateSnapshot {
  medicalRecords: any[]
  checkupRecords: any[]
  allergyRecords: any[]
  pickyFoods: string
}

export const HEALTH_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
export const HEALTH_ATTACHMENT_MAX_SIZE_LABEL = '10MB'
export const HEALTH_ATTACHMENT_HINT_TEXT =
  '支持 JPG、PNG、GIF、WEBP、HEIC、HEIF 或 PDF，单个文件不超过 10MB，上传后可点击预览。'

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
    if (!normalizeOptionalText(record.checkupType)) {
      return '请补充体检类型'
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
    return {
      chiefComplaint: normalizeOptionalText(record.chiefComplaint) || '',
      visitDate: normalizeOptionalText(record.visitDate) || '',
      diagnosis: normalizeOptionalText(record.diagnosis) || '',
      notes: normalizeOptionalText(record.notes),
      attachments: normalizeAttachments(record.attachments),
    }
  }

  if (type === 'checkup') {
    return {
      checkupType: normalizeOptionalText(record.checkupType) || '',
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
  pickyFoods?: unknown
}) {
  const payload: Record<string, string | null> = {}

  if (Object.prototype.hasOwnProperty.call(form, 'allergyFoods')) {
    payload.allergyFoods = normalizeOptionalText(form.allergyFoods)
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
    return `checkup:${String(record?.checkupType || '').trim()}|${String(record?.checkupDate || '').trim()}|${String(record?.notes || '').trim()}`
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
      String(record?.visitDate || '').trim(),
      String(record?.diagnosis || '').trim(),
    ].filter(Boolean)

    return {
      title,
      detail: joinDetailParts(parts),
    }
  }

  if (type === 'checkup') {
    const title = String(record?.checkupType || '').trim() || '未填写体检类型'
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
