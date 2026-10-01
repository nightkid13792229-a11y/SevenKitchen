import { request } from '../utils/api'
import { getBaseUrl } from '../utils/config'
import { getToken } from '../utils/api'
import {
  type HealthRecordType,
  buildDietRemindersPayload,
  buildHealthAttachmentDeletePath,
  buildHealthAttachmentUploadUrl,
  buildHealthRecordSectionPayload,
  parseHealthAttachmentUploadResponse,
} from '../utils/health-records'
import {
  buildDogAvatarUploadUrl,
  parseDogAvatarUploadResponse,
} from '../utils/dog-avatar'

export interface DogProfileFormValue {
  name: string
  breedId: string
  customBreedName?: string
  birthday: string
  gender: string
  isNeutered: boolean
  currentWeightKg: string
  bcsScore: number
  activityLevel: string
  lifeStageOverride: string
  sizeClassOverride: string | null
  mealsPerDay: string
  treatInputMode: string
  treatLevel: string
  manualTreatKcal: string
  allergyFoods: string
  pickyFoods: string
  medicalRecords?: any[]
  checkupRecords?: any[]
  allergyRecords?: any[]
}

type MedicalRecordStatus = 'TREATING' | 'RECOVERED' | 'CHRONIC'

type MedicalRecordCreatePayload = {
  chiefComplaint: string
  visitDate: string
  diagnosis: string
  notes?: string | null
  treatment?: string | null
  medications?: string[]
  status?: MedicalRecordStatus
  followUpDate?: string | null
  veterinarian?: string | null
  attachments?: string[]
}

type CheckupRecordCreatePayload = {
  checkupType: string
  checkupDate: string
  findings?: string | null
  recommendations?: string | null
  veterinarian?: string | null
  attachments?: string[]
}

type AllergyRecordCreatePayload = {
  allergen: string
  notes?: string | null
  attachments?: string[]
}

type VaccineRecordCreatePayload = {
  vaccineName: string
  vaccinationDate: string
  nextDueDate?: string | null
  notes?: string | null
  status?: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
}

const healthRecordCrud = <
  TCreatePayload,
  TUpdatePayload = Partial<TCreatePayload>,
>(basePath: string) => ({
  list: (dogId: string) => request({ url: `/dogs/${dogId}/${basePath}`, method: 'GET' }),
  create: (dogId: string, data: TCreatePayload) =>
    request({ url: `/dogs/${dogId}/${basePath}`, method: 'POST', data }),
  update: (dogId: string, recordId: string, data: TUpdatePayload) =>
    request({ url: `/dogs/${dogId}/${basePath}/${recordId}`, method: 'PUT', data }),
  delete: (dogId: string, recordId: string) =>
    request({ url: `/dogs/${dogId}/${basePath}/${recordId}`, method: 'DELETE' }),
})

export const dogApi = {
  list: () => request({ url: '/dogs', method: 'GET' }),
  detail: (dogId: string) => request({ url: `/dogs/${dogId}`, method: 'GET' }),
  finishedFoodHistory: (dogId: string) =>
    request({ url: `/dogs/${dogId}/finished-food-history`, method: 'GET' }),
  breeds: () => request({ url: '/dogs/breeds', method: 'GET' }),
  hotBreeds: () => request({ url: '/dogs/breeds/hot', method: 'GET' }),
  preview: (data: Record<string, any>) =>
    request({ url: '/dogs/calc-preview', method: 'POST', data }),
  create: (data: Record<string, any>) => request({ url: '/dogs', method: 'POST', data }),
  update: (dogId: string, data: Record<string, any>) =>
    request({ url: `/dogs/${dogId}`, method: 'PUT', data }),
  /**
   * 健康时间线（2026-10-01，第二期）。
   *
   * 把五类记录一次取回并按日期倒序排好 —— 后端聚合，前端不拼。
   * 就诊前摘要与时间线共用同一份数据来源。
   */
  healthTimeline: (dogId: string) =>
    request({ url: `/dogs/${dogId}/health/timeline`, method: 'GET' }),
  /**
   * 就诊前摘要（2026-10-01，第二期）。
   *
   * 老板需求 8："带狗去看病前，我最想看到的是过往病史的摘要。"
   * 排序按医生问诊的实际顺序：过敏 → 还没好的病 → 最近就诊 → 体检 → 疫苗 → 体重 → 饮食。
   */
  healthVisitSummary: (dogId: string) =>
    request({ url: `/dogs/${dogId}/health/visit-summary`, method: 'GET' }),
  /**
   * 健康信息分享（2026-10-01，第三期）。
   *
   * 内容三选一（摘要 / 报告原件 / 合并），医疗信息默认全给、顾客可逐项取消；
   * 不设有效期，所以必须能"停止分享"。
   */
  createHealthShare: (
    dogId: string,
    data: { contentMode?: string; sections?: string[] },
  ) => request({
    url: `/dogs/${dogId}/health/shares`,
    method: 'POST',
    data,
    suppressErrorToast: true,
  }),
  listHealthShares: (dogId: string) =>
    request({ url: `/dogs/${dogId}/health/shares`, method: 'GET' }),
  revokeHealthShare: (dogId: string, token: string) =>
    request({
      url: `/dogs/${dogId}/health/shares/${encodeURIComponent(token)}`,
      method: 'DELETE',
    }),
  /**
   * 疫苗计划（2026-10-01，第四期）。
   *
   * 按免疫程序算出"还需要打哪些、什么时候打"。老板第 16 条要求
   * **引导顾客自己决策**，所以有 decisions 接口存顾客的选择。
   *
   * ⚠️ 顾客侧默认关闭（后端 VACCINE_PLAN=customer 才开）：
   *    免疫程序尚未经兽医审核。接口会返回 available: false 说明原因。
   */
  vaccinePlan: (dogId: string, audience: 'customer' | 'staff' = 'customer') =>
    request({
      url: `/dogs/${dogId}/vaccine-plan?audience=${audience}`,
      method: 'GET',
      suppressErrorToast: true,
    }),
  /** 完整免疫程序表（营养师/管理端审核用，不对顾客开放） */
  vaccineSchedule: (dogId: string) =>
    request({ url: `/dogs/${dogId}/vaccine-plan/schedule`, method: 'GET' }),
  /** 顾客对某一步的决定：ACCEPT 按建议 / DEFER 推迟 / SKIP 不做 */
  setVaccineDecision: (dogId: string, stepKey: string, decision: string) =>
    request({
      url: `/dogs/${dogId}/vaccine-plan/decisions/${encodeURIComponent(stepKey)}`,
      method: 'PUT',
      data: { decision },
    }),
  clearVaccineDecision: (dogId: string, stepKey: string) =>
    request({
      url: `/dogs/${dogId}/vaccine-plan/decisions/${encodeURIComponent(stepKey)}`,
      method: 'DELETE',
    }),
  healthRecords: {
    medical: healthRecordCrud<MedicalRecordCreatePayload>('medical-records'),
    checkup: healthRecordCrud<CheckupRecordCreatePayload>('checkups'),
    allergy: healthRecordCrud<AllergyRecordCreatePayload>('allergies'),
    // 疫苗记录（2026-09-27 加入「健康管理」板块）：
    // 后端 /dogs/:dogId/vaccines 早就有了，但顾客端一直没有入口 ——
    // 生产 4544 只狗里疫苗记录为 0 条。
    vaccine: healthRecordCrud<VaccineRecordCreatePayload>('vaccines'),
  },
  uploadAvatar: (dogId: string, filePath: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const token = getToken()
      const uploadUrl = buildDogAvatarUploadUrl(getBaseUrl(), dogId)

      uni.uploadFile({
        url: uploadUrl,
        filePath,
        name: 'file',
        header: {
          Authorization: token ? `Bearer ${token}` : '',
          'X-Customer-Id': uni.getStorageSync('userId') || '',
        },
        success: (res) => {
          try {
            resolve(parseDogAvatarUploadResponse(res))
          } catch (error) {
            const responsePreview =
              typeof res.data === 'string'
                ? res.data.trim().slice(0, 120)
                : JSON.stringify(res.data).slice(0, 120)

            console.error('[DogAvatarUpload] Failed to parse upload response', {
              uploadUrl,
              dogId,
              filePath,
              statusCode: res.statusCode,
              responsePreview,
              errorMessage: error instanceof Error ? error.message : String(error),
            })
            reject(error)
          }
        },
        fail: (error) => {
          console.error('[DogAvatarUpload] Upload request failed', {
            uploadUrl,
            dogId,
            filePath,
            error,
          })
          reject(error)
        },
      })
    }),
  updateHealthRecords: (
    dogId: string,
    type: HealthRecordType,
    records: Record<string, any>[],
  ) => request({
    url: `/dogs/${dogId}`,
    method: 'PUT',
    data: buildHealthRecordSectionPayload(type, records),
  }),
  updateDietReminders: (
    dogId: string,
    data: { allergyFoods?: unknown; pickyFoods?: unknown },
  ) => request({
    url: `/dogs/${dogId}`,
    method: 'PUT',
    data: buildDietRemindersPayload(data),
  }),
  /**
   * 过敏原检测报告识别（AI）
   *
   * 传入 uploadHealthAttachment('allergy', filePath) 拿到的地址，
   * 返回候选过敏原与病史 —— **只是候选，必须由顾客确认后才写入档案**。
   * 识别失败会 reject，调用方应降级为手工填写（不阻断建档）。
   */
  extractHealthReport: (data: {
    imageUrl: string
    originalFilename?: string
  }) => request<{
    allergies: string[]
    medicalConditions: string[]
    ocrText: string
    confidence: 'HIGH' | 'MEDIUM' | 'LOW'
    warnings: string[]
  }>({
    url: '/health/extract-report',
    method: 'POST',
    data,
    // 报告识别要跑 OCR + AI，默认 15s 不够
    timeout: 60000,
    suppressErrorToast: true,
  }),
  uploadHealthAttachment: (
    type: HealthRecordType,
    filePath: string,
  ): Promise<{ url: string; key: string | null }> =>
    new Promise((resolve, reject) => {
      const token = getToken()
      const uploadUrl = buildHealthAttachmentUploadUrl(getBaseUrl(), type)

      uni.uploadFile({
        url: uploadUrl,
        filePath,
        name: 'file',
        header: {
          Authorization: token ? `Bearer ${token}` : '',
          'X-Customer-Id': uni.getStorageSync('userId') || '',
        },
        success: (res) => {
          try {
            resolve(parseHealthAttachmentUploadResponse(res))
          } catch (error) {
            const responsePreview =
              typeof res.data === 'string'
                ? res.data.trim().slice(0, 120)
                : JSON.stringify(res.data).slice(0, 120)
            const contentType =
              res.header?.['content-type'] ||
              res.header?.['Content-Type'] ||
              ''

            console.error('[HealthAttachmentUpload] Failed to parse upload response', {
              uploadUrl,
              filePath,
              statusCode: res.statusCode,
              contentType,
              responsePreview,
              errorMessage: error instanceof Error ? error.message : String(error),
            })
            reject(error)
          }
        },
        fail: (error) => {
          console.error('[HealthAttachmentUpload] Upload request failed', {
            uploadUrl,
            filePath,
            error,
          })
          reject(error)
        },
      })
    }),
  deleteHealthAttachment: (type: HealthRecordType, key: string) =>
    request({
      url: buildHealthAttachmentDeletePath(type),
      method: 'DELETE',
      data: { key },
    }),
  createWeightRecord: (dogId: string, data: Record<string, any>) =>
    request({ url: `/dogs/${dogId}/weight-records`, method: 'POST', data }),
}
