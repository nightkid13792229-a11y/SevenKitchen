export type HealthRecordType = 'medical' | 'checkup' | 'allergy'

/**
 * 附件上传的类别。
 *
 * 比 HealthRecordType 多一个 `vaccine`：疫苗本也要能上传照片，
 * 而它走的是通用图片上传口（`/health/upload-image`，与过敏同一支）——
 * 见 buildHealthAttachmentUploadUrl 的兜底分支。
 * 之前这里的类型比实际支持的范围窄，扫描疫苗本时类型对不上。
 */
export type HealthAttachmentUploadType = HealthRecordType | 'vaccine'
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
/**
 * 附件区的说明（2026-10-02 精简）。
 *
 * 原来把六种格式全列出来，是表单上最长的一行字，家长读不完；
 * 真正有用的信息只有两条：能传什么、多大。格式细节留给出错时的提示。
 */
export const HEALTH_ATTACHMENT_HINT_TEXT = '图片或 PDF，单个不超过 10MB'
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

/**
 * 附件列表归一化（2026-10-01 第九期起对外共用）。
 *
 * 后端存的是 URL 字符串数组，但历史数据/中间层有时给的是 { url } 对象，
 * 两种都认，读不到的一律丢掉（不返回空串、不返回 null）。
 * 疫苗记录的卡片与病历/检查的记录卡都调它，避免两处各写一套过滤规则。
 */
export function normalizeHealthAttachmentList(value: unknown): string[] {
  return normalizeAttachments(value)
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

/** 病史状态（与后端枚举一致） */
export type MedicalStatusValue =
  | 'PENDING_CONFIRMATION'
  | 'TREATING'
  | 'RECOVERED'
  | 'CHRONIC'

/**
 * 三类记录的提交结构（2026-10-01 自查补）。
 *
 * 原来这几套结构在 `api/dogs.ts` 里另写了一份，两边字段与可选性对不上：
 * 类型检查一跑到"按类型分派保存"就报错，实际运行时却没问题。
 * 现在以这里为唯一来源，接口层直接引用。
 *
 * 字段可选性与后端 DTO 对齐：新建时前端一定会带上这些字段，
 * 但更新接口用的是 `Partial<>`，所以结构上允许缺省。
 */
export interface MedicalRecordPayload {
  chiefComplaint: string
  visitDate: string
  diagnosis: string
  treatment?: string | null
  medications?: string[]
  status?: MedicalStatusValue
  followUpDate?: string | null
  veterinarian?: string | null
  notes?: string | null
  attachments?: string[]
  /** 这次就诊做的化验数据（2026-10-02 新增） */
  labValues?: string | null
  /** 这次做的检查（2026-10-02 新增） */
  exams?: string | null
  /** 体征：体温、体重、BCS（2026-10-02 新增） */
  vitals?: string | null
}

export interface CheckupRecordPayload {
  checkupType: string
  checkupDate: string
  findings?: string | null
  /** 化验数据原文（2026-10-02 从 findings 里拆出来的一栏） */
  labValues?: string | null
  recommendations?: string | null
  veterinarian?: string | null
  attachments?: string[]
  notes?: string | null
}

export interface AllergyRecordPayload {
  allergen: string
  notes?: string | null
  attachments?: string[]
}

export type HealthRecordPayload =
  | MedicalRecordPayload
  | CheckupRecordPayload
  | AllergyRecordPayload

export function buildHealthRecordPayload(type: 'medical', record: HealthRecordShape): MedicalRecordPayload
export function buildHealthRecordPayload(type: 'checkup', record: HealthRecordShape): CheckupRecordPayload
export function buildHealthRecordPayload(type: 'allergy', record: HealthRecordShape): AllergyRecordPayload
export function buildHealthRecordPayload(type: HealthRecordType, record: HealthRecordShape): HealthRecordPayload
export function buildHealthRecordPayload(
  type: HealthRecordType,
  record: HealthRecordShape,
): HealthRecordPayload {
  if (type === 'medical') {
    const status = String(record.status || '').trim()

    return {
      chiefComplaint: normalizeOptionalText(record.chiefComplaint) || '',
      visitDate: normalizeOptionalText(record.visitDate) || '',
      diagnosis: normalizeOptionalText(record.diagnosis) || '',
      // 缺省是"待确认"，不是后端的默认值"治疗中"
      // 上面已按白名单校验过，这里只是把类型收紧到后端枚举
      status: (getMedicalStatusOptions().some(option => option.value === status)
        ? status
        : 'PENDING_CONFIRMATION') as MedicalStatusValue,
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

export function buildCrudHealthRecordPayload(type: 'medical', record: HealthRecordShape): MedicalRecordPayload
export function buildCrudHealthRecordPayload(type: 'checkup', record: HealthRecordShape): CheckupRecordPayload
export function buildCrudHealthRecordPayload(type: 'allergy', record: HealthRecordShape): AllergyRecordPayload
export function buildCrudHealthRecordPayload(type: HealthRecordType, record: HealthRecordShape): HealthRecordPayload
export function buildCrudHealthRecordPayload(
  type: HealthRecordType,
  record: HealthRecordShape,
): HealthRecordPayload {
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
  /**
   * 只用到 id，但调用方传进来的往往是完整的狗对象（还带 name 等字段），
   * 所以这里允许额外字段 —— 否则测试与调用方每次都得先裁一遍对象。
   */
  dogs: Array<{ id?: string; [key: string]: unknown }>,
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
  type: HealthAttachmentUploadType,
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

export function buildHealthAttachmentDeletePath(
  type: HealthRecordType | 'checkup' | 'vaccine',
) {
  if (type === 'medical') {
    return '/dogs/medical-records/attachments'
  }

  if (type === 'checkup') {
    return '/dogs/checkup-records/attachments'
  }

  // 过敏与疫苗（疫苗本原图，第九期）都走通用删除口
  return '/health/attachments'
}

/**
 * 从 URL 里取 pathname —— **不用 `URL` 全局**。
 *
 * 为什么不用：`URL` 在小程序基础库里不是必备全局（同一份代码在开发者工具里
 * 能跑、到真机基础库版本低一点就可能没有），而这里只是取路径，
 * 正则足够且没有环境依赖。非绝对地址一律返回空串，与改前行为一致
 * （改前 `new URL('a/b')` 会抛错，被 catch 成空）。
 */
function extractUrlPathname(url: string) {
  const text = String(url || '').trim()
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return ''
  }

  return text
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i, '')
    .split(/[?#]/)[0] || ''
}

export function extractHealthAttachmentKey(url: string) {
  const normalized = extractUrlPathname(url).replace(/^\/+/, '')
  return normalized || null
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

/**
 * 识别失败时给顾客看的文案（2026-10-01）。
 *
 * 为什么需要：识别走的是腾讯云 OCR，**它自己的报错会被后端原样抛出来**，
 * 例如服务没开通时是「服务未开通，请前往控制台开通相应服务」——
 * 这句话是给运维看的，弹给顾客只会让人一头雾水。
 * 这里只把"基础设施类"的报错换成顾客能懂、且知道下一步怎么做的话；
 * 其余后端文案（"没识别到内容，请换一张更清晰的图片"这类）本来就是说给顾客的，照原样显示。
 */
export function resolveHealthScanErrorMessage(raw: unknown): string {
  const text = String(raw ?? '').trim()
  if (!text) {
    return '识别失败，可以手工填写'
  }

  // 腾讯云 OCR：服务未开通 / 密钥没配 / 鉴权失败 —— 都属于"功能还没准备好"
  if (/未开通|UnOpenError|AuthFailure|密钥未配置|未配置密钥/.test(text)) {
    return '图片识别功能正在开通中，这次先用「手动填写」吧'
  }

  // 调用频率或额度超限：让顾客等一会儿再来
  if (/频率|超限|LimitExceeded|RequestLimitExceeded/.test(text)) {
    return '识别的人有点多，稍等一会儿再试'
  }

  if (/超时|timeout/i.test(text)) {
    return '这次识别超时了，可以再试一次，或直接手工填写'
  }

  // 后端已经写成顾客能懂的话（"没识别到内容…"等），照原样
  return text
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

/**
 * 打开附件（2026-10-01 第九期：从「病历/检查」板块抽出来共用）。
 *
 * 原来只有病历/检查的记录卡会预览附件；疫苗记录现在也能留原件了，
 * 同一段逻辑抄两遍迟早会走偏（一边能看 PDF、一边不能），所以提到这里，
 * 两个板块都调它。
 *
 *   · 图片 → 微信自带的大图预览
 *   · PDF  → 先下载再交给微信的文档查看器（可转发）
 *   · 其它 → 老实说"打不开"，不假装成功
 */
export async function previewHealthAttachment(url: string): Promise<void> {
  const previewType = resolveHealthAttachmentPreviewType(url)

  if (previewType === 'image') {
    uni.previewImage({
      urls: [url],
      current: url,
    })
    return
  }

  if (previewType === 'pdf') {
    try {
      uni.showLoading({ title: '打开中...' })
      const downloadRes: any = await new Promise((resolve, reject) => {
        uni.downloadFile({
          url,
          success: resolve,
          fail: reject,
        })
      })

      if (downloadRes.statusCode !== 200 || !downloadRes.tempFilePath) {
        throw new Error('文件下载失败')
      }

      await new Promise((resolve, reject) => {
        uni.openDocument({
          filePath: downloadRes.tempFilePath,
          showMenu: true,
          success: resolve,
          fail: reject,
        })
      })
      uni.hideLoading()
    } catch (error: any) {
      uni.hideLoading()
      uni.showToast({ title: error?.message || '暂时无法预览该附件', icon: 'none' })
    }
    return
  }

  uni.showToast({ title: '暂时无法预览该附件', icon: 'none' })
}

function readHealthAttachmentFileName(value: string) {
  const fileName = extractUrlPathname(value).split('/').filter(Boolean).pop() || ''
  if (!fileName) {
    return ''
  }

  try {
    return decodeURIComponent(fileName)
  } catch {
    return fileName
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
    return '取消新增记录'
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

/** 体检类型缺省值：默认「常规体检」，家长不用先做选择题 */
export const HEALTH_VISIT_DEFAULT_CHECKUP_TYPE = 'ROUTINE'

/**
 * 「病历/检查」表单的字段对照表（2026-10-02 按老板要求精简过一版）。
 *
 * 精简的原则（老板定的，也是审计结论）：
 *   · **状态字段从表单里拿掉** —— 家长填表时不该做"待确认/治疗中/已康复/慢性"
 *     这种系统选择题。库里仍然有 status（缺省待确认，算作"还没好"进 AI 分析），
 *     记录存好之后卡片上给一个一键切换「已经好了」。
 *   · **必填只剩两件**：日期 +（症状 或 医生诊断）至少一条。
 *     很多家长拿不到明确诊断（医生只说"可能是肠胃炎"），不该被卡住。
 *   · **备注改名「补充说明」**（2026-10-02 老板要求更专业）——
 *     原来的"备注"后端/营养师端/AI 都不读，是个纯废字段；
 *     改名之后它是"家长还想补充的话"，并且已经接进 AI 分析（第九期）。
 *   · 体检类型、用药这些"能一眼答上来"的字段从「更多」里提到明面；
 *     只有复查日期、兽医这种少数情况才有的收进「选填」。
 *
 * 每个字段的 key 就是接口/数据库的字段名，不另造一套。
 */
export interface HealthVisitFieldConfig {
  kind: HealthVisitKind
  kindLabel: string
  dateKey: string
  dateLabel: string
  /** 主内容字段：就诊=医生诊断；体检=检查结论 */
  primaryKey: string
  primaryLabel: string
  primaryPlaceholder: string
  /**
   * 就诊独有的「主要问题」（症状）。
   * 它和 primaryKey **至少填一个**：它是饮食标签派生的输入之一，
   * 也是家长最容易答上来的那一项（体检为 null）。
   */
  complaintKey: string | null
  complaintLabel: string
  complaintPlaceholder: string
  /**
   * 化验数据（只有体检有，2026-10-02 从 findings 里拆出来）。
   * 一张化验单几十项数值，混在「检查结论」里家长看到的是数字墙。
   */
  labValuesKey: string | null
  labValuesLabel: string
  /** 医嘱/建议：就诊=医嘱（回家注意，treatment）；体检=医生建议（recommendations） */
  adviceKey: string
  adviceLabel: string
  advicePlaceholder: string
  /**
   * 这次做的检查（exams，只有就诊有，2026-10-02 新增）。
   * 从处置处方照抄的检查项目清单 —— 原来它被塞进"处理与提醒"，
   * 和医嘱、其它想说的三样挤在一起（老板实测提的）。
   */
  examsKey: string | null
  examsLabel: string
  examsPlaceholder: string
  /** 体征（vitals，只有就诊有，2026-10-02 新增）：体温/体重/BCS */
  vitalsKey: string | null
  vitalsLabel: string
  vitalsPlaceholder: string
  /** 用药：只有就诊有这一列（体检表没有） */
  medicationKey: string | null
  medicationLabel: string
  /** 补充说明（notes，两张表都有；曾用名「备注」「其它想说的」） */
  notesKey: string
  notesLabel: string
  notesPlaceholder: string
  /**
   * 兽医 / 复查日期：**2026-10-02 老板要求从表单里去掉**，不再有输入框。
   * key 仍然留着 —— 拍报告识别出来的值照旧存进记录、保存时照旧提交，
   * 只是不许顾客手填（想补也只能通过识别或以后另开入口）。
   */
  vetKey: string
  vetLabel: string
  followUpKey: string | null
  followUpLabel: string
  /**
   * 体检类型：**2026-10-02 老板要求从表单里删掉**（家长不该被问这个）。
   * 手工记的体检记录一律用缺省「常规体检」（接口这一栏必填，由 payload 兜底）；
   * 拍报告识别出来的类型照旧存进记录。
   */
  checkupTypeKey: string | null
  checkupTypeLabel: string
}

const HEALTH_VISIT_FIELD_CONFIG: Record<HealthVisitKind, HealthVisitFieldConfig> = {
  medical: {
    kind: 'medical',
    kindLabel: HEALTH_VISIT_KIND_LABELS.medical,
    dateKey: 'visitDate',
    dateLabel: '就诊日期',
    primaryKey: 'diagnosis',
    // 2026-10-02 老板定稿：「医生怎么说」改回专业说法「医生诊断」
    primaryLabel: '医生诊断',
    primaryPlaceholder: '例如：急性肠胃炎、胆汁淤积',
    complaintKey: 'chiefComplaint',
    // 2026-10-02 老板：文案就叫「症状」，家长一眼就懂
    complaintLabel: '症状',
    complaintPlaceholder: '例如：呕吐、拉稀、精神差',
    // 2026-10-02 老板定：一次就诊里的化验单/检查报告，数字就落在这条就诊记录里
    labValuesKey: 'labValues',
    labValuesLabel: '化验数据',
    adviceKey: 'treatment',
    // 2026-10-02 老板定稿：这一栏收窄成"医生交代回家要做的"，
    // 检查项目清单挪去 exams（原来三样挤一栏，家长看到的是"无 + 一长串"）
    adviceLabel: '医嘱（回家注意）',
    advicePlaceholder: '例如：清淡饮食，按时吃药，两周后复查',
    examsKey: 'exams',
    examsLabel: '这次做的检查',
    examsPlaceholder: '例如：全腹部彩超、血常规、生化、CRP',
    vitalsKey: 'vitals',
    vitalsLabel: '体征',
    vitalsPlaceholder: '例如：体温 38.4℃、体重 6.7kg、BCS 3',
    medicationKey: 'medications',
    medicationLabel: '用药',
    notesKey: 'notes',
    notesLabel: '补充说明',
    notesPlaceholder: '报告上还有该记下来的？例如：样本存在异常：溶血+',
    vetKey: 'veterinarian',
    vetLabel: '兽医',
    followUpKey: 'followUpDate',
    followUpLabel: '复查日期',
    checkupTypeKey: null,
    checkupTypeLabel: '',
  },
  checkup: {
    kind: 'checkup',
    kindLabel: HEALTH_VISIT_KIND_LABELS.checkup,
    dateKey: 'checkupDate',
    dateLabel: '体检日期',
    primaryKey: 'findings',
    // 体检没有"诊断"：措辞上不能让家长以为体检也能下诊断
    primaryLabel: '检查结论',
    primaryPlaceholder: '例如：血常规正常，生化轻度升高',
    complaintKey: null,
    complaintLabel: '',
    complaintPlaceholder: '',
    labValuesKey: 'labValues',
    labValuesLabel: '化验数据',
    adviceKey: 'recommendations',
    adviceLabel: '医生建议',
    advicePlaceholder: '例如：两周后复查，注意饮水',
    // 检查项目与体征只有就诊表有这两列（2026-10-02）：体检的检查项目由
    // 体检类型 + 化验数据本身表达，体征写进「补充说明」就够
    examsKey: null,
    examsLabel: '',
    examsPlaceholder: '',
    vitalsKey: null,
    vitalsLabel: '',
    vitalsPlaceholder: '',
    medicationKey: null,
    medicationLabel: '',
    notesKey: 'notes',
    notesLabel: '补充说明',
    notesPlaceholder: '报告上还有该记下来的？例如：样本存在异常：溶血+',
    vetKey: 'veterinarian',
    vetLabel: '兽医',
    followUpKey: null,
    followUpLabel: '',
    checkupTypeKey: 'checkupType',
    checkupTypeLabel: '体检类型',
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
      notes: source.notes ?? '',
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

/**
 * 一次选了多张图 → 合成一条记录（2026-10-01 第九期，老板定的）。
 *
 * 老板问"一次能传几张"时确认的规则：**一次选中的多张图当成同一份资料**。
 * 一份 3 页的体检报告应该是 1 条记录、3 张原图，而不是 3 条各说一半的记录。
 *
 * 合并规则（保守，只做"合"不做"猜"）：
 *   · 日期、类型、兽医这类**只有一个答案**的字段：以第一页为准，后面只补空
 *   · 结论、建议、症状、诊断、处理、备注这类**一段话**的字段：
 *     后面的页接着往下写（已经出现过的整段不重复抄）
 *   · 用药是清单：去重合并
 *   · 附件：每一页的原图都留下，按页序排列、去重
 *
 * ⚠️ 疫苗本不走这里 —— 一张疫苗本读出的是**多条独立的接种记录**，
 *    合并会把几针并成一针（那是数据错误，不是省事）。
 */
const MULTILINE_DRAFT_KEYS = new Set([
  'findings',
  'recommendations',
  'chiefComplaint',
  'diagnosis',
  'treatment',
  'notes',
  /**
   * 化验数据必须能跨页拼起来（2026-10-02 修的一个**数据丢失** bug）。
   *
   * 一次化验常常是好几张单子：生化一张、血常规一张、CRP 一张。
   * 它们各自成一页草稿，而这一栏原来不在"可拼接"名单里 ——
   * 合并时"只有一个答案的字段保留第一页的值"，于是**后面几页的数值全被丢掉**，
   * 家长看到的是"化验数据只有生化"（老板这次传的 5 张里，血常规与 CRP 就是这么没的）。
   * 同一份报告的复印件/双面扫描重复时，下面已有的 includes 判断会去重。
   */
  'labValues',
  /** 这次做的检查同理：处置单可能分两页写 */
  'exams',
])

function isFilledDraftValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  return String(value ?? '').trim() !== ''
}

/**
 * 把一次拍的多页纸合成**一条记录**：**入口决定记录类型**（2026-10-02 老板定稿）。
 *
 * ── 为什么改成这样 ─────────────────────────────────────────
 *
 *   老板实测：从「就诊」进去传了 2 页病历 + 3 张化验单，结果裂成两条记录
 *   （一条就诊、一条体检），他的疑问是"我走的不是就诊吗？为什么识别成体检报告？"
 *   —— 记录类型原来是由 AI 的**文档类型**决定的，而化验单天然会被判成体检类。
 *
 *   现在：**你从哪个入口进，这一批就合成那个入口的一条记录**。
 *   AI 的判断只用来决定"这页的字往哪个字段填"：
 *     · 从就诊进：化验页 → 化验数据；影像页 → 检查项/附件；病历页 → 诊断/医嘱/用药…
 *     · 从体检进：化验页 → 化验数据；病历页的文字 → 归到「补充说明」并标明来源
 *   目标类型那一类的内容永远优先，另一类的文字**不丢**，而是带前缀并进「补充说明」。
 *
 *   疫苗本 / 过敏报告不属于这两类：不并进来，单独回报（各自的板块有更合适的表单）。
 */
export function buildSingleScannedRecord(
  groups: { type: string; drafts: Record<string, any>[] }[],
  targetType: 'MEDICAL_RECORD' | 'CHECKUP_REPORT',
): {
  draft: Record<string, any> | null
  /** 这一批里有没有"入口那一类"的内容（没有 → 卡片上要说明一句） */
  matchedEntryType: boolean
  /** 被排除在外的页（疫苗本 / 过敏报告），用于提示顾客去对应板块 */
  ignored: { type: string; count: number }[]
} {
  const normalized = (value: string) => String(value || '').toUpperCase()
  const byType = new Map<string, Record<string, any>[]>()
  for (const group of groups || []) {
    const key = normalized(group?.type)
    const list = Array.isArray(group?.drafts) ? group.drafts : []
    if (!key || list.length === 0) continue
    byType.set(key, [...(byType.get(key) || []), ...list])
  }

  const otherType = targetType === 'MEDICAL_RECORD' ? 'CHECKUP_REPORT' : 'MEDICAL_RECORD'
  const targetDrafts = byType.get(targetType) || []
  const otherDrafts = byType.get(otherType) || []
  const imagingDrafts = byType.get('IMAGING') || []

  const ignored: { type: string; count: number }[] = []
  for (const type of ['VACCINE_BOOK', 'ALLERGY_REPORT', 'NOT_MEDICAL']) {
    const list = byType.get(type) || []
    if (list.length > 0) ignored.push({ type, count: list.length })
  }

  const base = mergeScannedReportDrafts(targetDrafts)[0] || {}
  const folded = mergeScannedReportDrafts(otherDrafts)[0]
  const imaging = mergeScannedReportDrafts(imagingDrafts)[0]

  const draft: Record<string, any> = { ...base }
  const appendText = (key: string, extra: unknown, prefix = '') => {
    const text = String(extra ?? '').trim()
    if (!text) return
    const line = `${prefix}${text}`
    const current = String(draft[key] ?? '').trim()
    draft[key] = current ? `${current}\n${line}` : line
  }

  if (folded) {
    const foldedDate = folded.visitDate || folded.checkupDate
    if (!draft.visitDate && !draft.checkupDate && foldedDate) {
      draft[targetType === 'MEDICAL_RECORD' ? 'visitDate' : 'checkupDate'] = foldedDate
    }

    if (targetType === 'MEDICAL_RECORD') {
      // 化验页的数字进「化验数据」；结论/建议没有对应栏目 → 补充说明（标明来源，不丢）
      appendText('labValues', folded.labValues)
      appendText('notes', folded.findings, '检查结论：')
      appendText('notes', folded.recommendations, '医生建议：')
    } else {
      appendText('labValues', folded.labValues)
      appendText('notes', folded.diagnosis, '医生诊断：')
      appendText('notes', folded.treatment, '医嘱：')
      appendText(
        'notes',
        Array.isArray(folded.medications) ? folded.medications.join('、') : folded.medications,
        '用药：',
      )
      appendText('notes', folded.chiefComplaint, '症状：')
    }

    if (!draft.patientName && folded.patientName) {
      draft.patientName = folded.patientName
    }
  }

  if (imaging) {
    // 影像片只归档、不解读：它的 notes 是"检查部位"，正好属于「这次做的检查」
    if (targetType === 'MEDICAL_RECORD') {
      appendText('exams', imaging.notes)
    } else {
      appendText('notes', imaging.notes)
    }
    if (!draft.patientName && imaging.patientName) {
      draft.patientName = imaging.patientName
    }
  }

  const attachments = [base, folded, imaging]
    .flatMap((item) => (Array.isArray(item?.attachments) ? item.attachments : []))
    .map((url) => String(url || '').trim())
    .filter(Boolean)
  draft.attachments = Array.from(new Set(attachments))
  draft.__documentType = targetType

  const hasContent =
    Object.entries(draft).some(
      ([key, value]) =>
        !key.startsWith('__') && key !== 'attachments' && isFilledDraftValue(value),
    ) || draft.attachments.length > 0

  return {
    draft: hasContent ? draft : null,
    matchedEntryType: targetDrafts.length > 0,
    ignored,
  }
}

export function mergeScannedReportDrafts(
  drafts: Record<string, any>[] | null | undefined,
): Record<string, any>[] {
  const list = Array.isArray(drafts) ? drafts.filter(Boolean) : []
  if (list.length === 0) {
    return []
  }

  const merged: Record<string, any> = { ...list[0] }

  for (const draft of list.slice(1)) {
    for (const [key, value] of Object.entries(draft)) {
      // 附件最后统一合并，避免中途把某一页的图覆盖掉
      if (key === 'attachments') {
        continue
      }

      if (!isFilledDraftValue(value)) {
        continue
      }

      const current = merged[key]

      // 前面几页没读到的字段，用后面这几页补上
      if (!isFilledDraftValue(current)) {
        merged[key] = value
        continue
      }

      if (Array.isArray(current)) {
        merged[key] = Array.from(
          new Set([
            ...current.map((item) => String(item ?? '').trim()).filter(Boolean),
            ...(Array.isArray(value) ? value : [value])
              .map((item) => String(item ?? '').trim())
              .filter(Boolean),
          ]),
        )
        continue
      }

      if (MULTILINE_DRAFT_KEYS.has(key) && typeof current === 'string' && typeof value === 'string') {
        const next = value.trim()
        const existing = current.trim()
        // 两页写着同一句话时不再抄一遍（复印件、双面扫描很常见）
        if (!next || existing.includes(next)) {
          continue
        }

        merged[key] = `${existing}\n${next}`
      }

      // 其余"只有一个答案"的字段（日期、类型、兽医…）：保留第一页读到的值，
      // 不猜、不拼接 —— 拼出"2026-09-012026-09-02"这种日期只会更糟
    }
  }

  const images = list.flatMap((draft) => (
    Array.isArray(draft?.attachments) ? draft.attachments : []
  ))
  // 一条记录里附件类型是字符串数组；顺序按页走，重复的（同一页被选两次）去掉
  merged.attachments = Array.from(new Set(normalizeAttachments(images)))

  return [merged]
}

/**
 * 多张图各自判了类型 → 按"多数页"定这份资料是哪一类。
 *
 * 后端对每一张图独立判定（AUTO 模式），一页被读成"病历"不该把整份
 * 3 页体检报告带成病历 —— 原来取最后一张的判定，纯看运气。
 * 票数相同时以**先出现**的那类为准（页码顺序），结果稳定、可解释。
 * 一张都没判出来时用调用方给的兜底类型。
 */
export function resolveScannedDocumentType(
  votes: (string | null | undefined)[] | null | undefined,
  fallback: string,
): string {
  const counts = new Map<string, number>()

  for (const vote of votes || []) {
    const key = String(vote || '').trim().toUpperCase()
    if (!key || key === 'AUTO') {
      continue
    }

    counts.set(key, (counts.get(key) || 0) + 1)
  }

  let winner = ''
  let winnerCount = 0

  // Map 按插入顺序遍历：票数相同时先出现的那类胜出
  for (const [key, count] of counts) {
    if (count > winnerCount) {
      winner = key
      winnerCount = count
    }
  }

  return winner || fallback
}

/** 合并列表里这条记录的日期（用于排序与摘要） */
export function resolveHealthVisitDate(record: Record<string, any> | null | undefined): string {
  const kind = resolveHealthVisitKind(record)
  const config = getHealthVisitFieldConfig(kind)
  return String(record?.[config.dateKey] || '').trim()
}

/**
 * 「已经好了」一键切换（2026-10-02 老板定：状态不进表单）。
 *
 * 表单里不再问状态，但库里的 status 仍然决定这条记录算不算"还没结束的问题"
 * （时间线把它喂给 AI 七项分析）。所以给已保存的就诊记录留一个一键开关：
 * 好了点一下 → 已康复（不再进 AI）；点错了再点回来 → 治疗中。
 *
 * 体检没有这个概念（检查是一次性的事实），所以只有就诊有。
 */
export function resolveMedicalStatusToggle(record: Record<string, any> | null | undefined): {
  status: MedicalStatusValue
  label: string
  hint: string
} {
  const current = String(record?.status || '').trim()
  if (current === 'RECOVERED') {
    return {
      status: 'TREATING',
      label: '还在治疗中？点一下改回来',
      hint: '已标记为"已经好了"，不再算进 AI 分析',
    }
  }

  return {
    status: 'RECOVERED',
    label: '已经好了',
    hint: '还没好就别点，没好之前会一直算进 AI 分析',
  }
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
 * 校验：**必填只剩两件**（2026-10-02 老板定的精简版）。
 *
 *   · 日期必填 —— 它是时间线上唯一的时间锚点
 *   · 就诊：**「症状」和「医生诊断」至少填一个**
 *     （很多家长拿不到明确诊断，医生只说"可能是肠胃炎"；
 *      这两项都是饮食标签派生的输入，填哪个都不亏）
 *   · 体检：检查结论必填（体检的价值就在结论上）
 *
 * 用药、医嘱、这次做的检查、体征、补充说明、复查日期、兽医一律不拦着保存。
 */
export function getHealthVisitValidationError(
  kind: HealthVisitKind,
  record: Record<string, any>,
): string | null {
  const config = getHealthVisitFieldConfig(kind)

  if (!normalizeOptionalText(record?.[config.dateKey])) {
    return `请选择${config.dateLabel}`
  }

  // 内容必填：**两个字段填一个就行**（2026-10-02 复审后统一成同一套规则）
  //   · 就诊：症状 / 医生诊断 —— 很多家长拿不到明确诊断
  //   · 体检：检查结论 / 医生建议 —— 有的报告只有一堆指标（写在结论里），
  //     有的只写了几句医嘱；两个都是饮食标签派生与 AI 分析的输入，填哪个都不亏
  const contentKeys = config.complaintKey
    ? [config.complaintKey, config.primaryKey]
    : [config.primaryKey, config.adviceKey]
  const contentLabels = config.complaintKey
    ? [config.complaintLabel, config.primaryLabel]
    : [config.primaryLabel, config.adviceLabel]

  const hasContent = contentKeys.some((key) => normalizeOptionalText(record?.[key]))
  if (hasContent) {
    return null
  }

  // 只留了原件的记录也放行（2026-10-02）：X 光片、超声图像这类资料没有文字可抄，
  // 家长的诉求就是"把片子存进档案" —— 有了日期 + 附件，这条记录就是有意义的。
  const hasAttachment = normalizeAttachments(record?.attachments).length > 0
  if (hasAttachment) {
    return null
  }

  return `请至少填写「${contentLabels[0]}」或「${contentLabels[1]}」，或上传报告原件`
}

/** 表单草稿 → 接口载荷（按类型分别对回两张表的字段） */
export function buildHealthVisitPayload(kind: 'checkup', record: Record<string, any>): CheckupRecordPayload
export function buildHealthVisitPayload(kind: 'medical', record: Record<string, any>): MedicalRecordPayload
export function buildHealthVisitPayload(
  kind: HealthVisitKind,
  record: Record<string, any>,
): MedicalRecordPayload | CheckupRecordPayload {
  const config = getHealthVisitFieldConfig(kind)
  const notes = config.notesKey ? normalizeOptionalText(record?.[config.notesKey]) : null

  if (kind === 'checkup') {
    return {
      checkupType: resolveHealthCheckupTypeValue(record?.checkupType) || HEALTH_VISIT_DEFAULT_CHECKUP_TYPE,
      checkupDate: normalizeOptionalText(record?.checkupDate) || '',
      findings: normalizeOptionalText(record?.findings),
      labValues: normalizeOptionalText(record?.labValues),
      recommendations: normalizeOptionalText(record?.recommendations),
      // 备注：体检表 2026-10-01（第五期）才加这一列，此前合并表单里
      // "就诊能写备注、体检不能"说不通，现在补齐。
      notes: normalizeOptionalText(record?.notes),
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
    labValues: normalizeOptionalText(record?.labValues),
    // treatment = 医嘱/回家注意；exams = 这次做的检查；vitals = 体征（2026-10-02）
    treatment: normalizeOptionalText(record?.treatment),
    exams: normalizeOptionalText(record?.exams),
    vitals: normalizeOptionalText(record?.vitals),
    medications: normalizeMedicationList(record?.medications),
    // 缺省是"待确认"，不是后端的默认值"治疗中"
    // （下面已按白名单校验，这里把类型收紧到后端枚举）
    status: (getMedicalStatusOptions().some((option) => option.value === status)
      ? status
      : 'PENDING_CONFIRMATION') as MedicalStatusValue,
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

/**
 * 列表行的标题与摘要（2026-10-02 改）。
 *
 * 标题改成**"有什么就显示什么"**：
 *   · 就诊：症状 → 医生诊断 → 新记录
 *   · 体检：体检类型 → 检查结论 → 新记录
 *
 * 原来固定用"症状"当标题，可症状藏在「更多」里 ——
 * 家长只填了诊断+日期，卡片上却写着「未填写症状」；
 * 定制食谱下单时系统代写的那条记录更是直接显示"定制食谱时提供"。
 *
 * 摘要里不再显示状态：状态已经不在表单里问了（老板 2026-10-02 定），
 * 卡片上摆一个家长改不了的标签只会让人困惑；营养师端照旧能看到。
 */
export function buildHealthVisitSummary(
  kind: HealthVisitKind,
  record: Record<string, any>,
): HealthRecordSummary {
  const config = getHealthVisitFieldConfig(kind)
  const attachmentCount = normalizeAttachments(record?.attachments).length

  // 体检的标题：检查结论 → 「体检记录」。
  // 结论太长（多半是识别出来的化验数据堆在里头的旧记录）就不当标题 ——
  // 家长在列表里看到的会是一堵数字墙（2026-10-02 老板实测反馈）。
  const findingsText = kind === 'checkup' ? String(record?.[config.primaryKey] || '').trim() : ''
  const shortFindings = findingsText && findingsText.length <= 24 ? findingsText : ''

  const candidates = kind === 'checkup'
    ? [shortFindings, formatHealthCheckupTypeLabel(record?.checkupType)]
    : [record?.[config.complaintKey as string], record?.[config.primaryKey]]

  const title = candidates
    .map((value) => String(value || '').trim())
    .find(Boolean) || (kind === 'checkup' ? '体检记录' : '新记录')

  // 就诊与体检都可能带化验数据（2026-10-02 起病史表也有 lab_values）
  const labValues = String(record?.labValues || '').trim()

  const parts = [
    // 用调用方传进来的 kind 取日期字段，而不是再从记录里反查归属 ——
    // 记录的 __visitKind 标记是界面层贴的，工具函数不该依赖它
    String(record?.[config.dateKey] || '').trim(),
    String(record?.[config.adviceKey] || '').trim(),
    // 有化验数据但不适合当标题时，摘要里说一句"这条里有化验数据"
    // （2026-10-02 起就诊记录也能装化验，所以两类都要显示）
    labValues ? '含化验数据' : '',
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
export function getHealthVisitSectionMeta(
  kind: HealthVisitKind = 'medical',
): HealthRecordTypeMeta {
  // 2026-10-02：就诊与体检**已拆成两个标签**，
  // 所以空态文案也要跟着分开 —— 原来那句"还没有病历或检查记录"
  // 会在两个标签下都出现，等于又把两类混在一起说了。
  return {
    type: 'medical',
    label: kind === 'checkup' ? '体检' : '就诊',
    addLabel: '新增记录',
    emptyTitle: kind === 'checkup' ? '还没有体检记录' : '还没有就诊记录',
    accentClass: 'health-records--visit',
  }
}

/** 空态下面那句引导（六个板块统一都要有一句） */
export function getHealthVisitEmptyDescription(): string {
  return '带狗看过病、做过检查，记一条，下次就诊和体检都用得上。'
}
