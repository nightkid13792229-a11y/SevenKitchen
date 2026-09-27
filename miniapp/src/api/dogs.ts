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
  healthRecords: {
    medical: healthRecordCrud<MedicalRecordCreatePayload>('medical-records'),
    checkup: healthRecordCrud<CheckupRecordCreatePayload>('checkups'),
    allergy: healthRecordCrud<AllergyRecordCreatePayload>('allergies'),
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
