import { request } from '../utils/api'
import { getBaseUrl } from '../utils/config'
import { getToken } from '../utils/api'
import {
  type AllergyRecordPayload,
  type CheckupRecordPayload,
  type HealthAttachmentUploadType,
  type HealthRecordType,
  type MedicalRecordPayload,
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

/**
 * 三类记录的提交结构统一来自 `utils/health-records`（2026-10-01 自查）。
 *
 * 原来这里另写了一份，与工具层的结构字段/可选性不一致，
 * "按类型分派保存"那段就会报类型错，而运行时其实是对的 —— 两份定义本身就是隐患。
 */
type MedicalRecordCreatePayload = MedicalRecordPayload
type CheckupRecordCreatePayload = CheckupRecordPayload
type AllergyRecordCreatePayload = AllergyRecordPayload

export type VaccineRecordCreatePayload = {
  vaccineName: string
  vaccinationDate: string
  nextDueDate?: string | null
  notes?: string | null
  status?: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /** 报告原件（2026-10-01 第九期）：拍疫苗本留下的原图 URL */
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
  /**
   * 健康时间线（2026-10-01，第二期）。
   *
   * 把六类记录一次取回并按日期倒序排好 —— 后端聚合，前端不拼。
   */
  healthTimeline: (dogId: string) =>
    request({ url: `/dogs/${dogId}/health/timeline`, method: 'GET' }),
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
  /**
   * 结构化饮食偏好（2026-10-01，第五期）。
   *
   * 老板第 9 条：饮食偏好的变化要能看到历史。
   * 与旧的两个文本框并存 —— 旧字段不动，配方设计继续用它们。
   */
  dietPreferences: (dogId: string) =>
    request({ url: `/dogs/${dogId}/diet-preferences`, method: 'GET' }),
  addDietPreference: (dogId: string, kind: 'LIKED' | 'DISLIKED', foodName: string) =>
    request({
      url: `/dogs/${dogId}/diet-preferences`,
      method: 'POST',
      data: { kind, foodName },
    }),
  removeDietPreference: (dogId: string, kind: 'LIKED' | 'DISLIKED', foodName: string) =>
    request({
      url: `/dogs/${dogId}/diet-preferences?kind=${kind}&foodName=${encodeURIComponent(foodName)}`,
      method: 'DELETE',
    }),
  /** 把旧文本框里的内容整理成条目（顾客确认后才会真的写库） */
  importDietPreferences: (
    dogId: string,
    data: { liked?: string[]; disliked?: string[] },
  ) => request({
    url: `/dogs/${dogId}/diet-preferences/import-legacy`,
    method: 'POST',
    data,
  }),
  /**
   * AI 健康分析与建议（2026-10-01，第七期）。
   *
   * 七项产出；严格不做诊断，只做初步分析。
   *
   * ⚠️ 顾客侧默认关闭（后端 HEALTH_ANALYSIS=customer 才开）：
   *    知识库里的免疫/化验/就医时机条目尚未经兽医审核，
   *    而分析只能引用知识条目 —— 没有已审核条目就给不出有依据的结论。
   *
   * ⚠️ 免责声明**不在返回值里**，由界面写死：AI 不该有机会改写它。
   */
  healthAnalysis: (dogId: string, audience: 'customer' | 'staff' = 'customer') =>
    request({
      url: `/dogs/${dogId}/health-analysis?audience=${audience}`,
      method: 'GET',
      // 要跑一次完整的 AI 推理，默认 15s 不够
      timeout: 60000,
      suppressErrorToast: true,
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
  /**
   * 更新饮食提醒（含"喜欢吃的食材"）。
   *
   * `preferredFoods` 这一列配方设计器与 AI 一直在读（见 buildDietRemindersPayload），
   * 只是类型里漏了它 —— 顾客侧保存时会被类型检查误拦（2026-10-01 自查补）。
   */
  updateDietReminders: (
    dogId: string,
    data: { allergyFoods?: unknown; preferredFoods?: unknown; pickyFoods?: unknown },
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
    /**
     * 识别哪类文档（2026-10-01 第六期）。
     * 缺省 ALLERGY_REPORT，保持既有调用方行为不变。
     */
    /**
     * 识别哪类文档。
     *
     * `'AUTO'`（2026-10-01）= 不告诉后端是哪一类，由它自己判断 ——
     * 病历/检查板块就是这样把"拍病历 / 拍体检报告"两个入口合并成一个的。
     * 传 AUTO 时，返回的 `documentType` 是**判定结果**，调用方按它决定填哪张表。
     */
    documentType?:
      | 'AUTO'
      | 'ALLERGY_REPORT'
      | 'CHECKUP_REPORT'
      | 'VACCINE_BOOK'
      | 'MEDICAL_RECORD'
  }) => request<{
    /** 本次识别的是哪类文档（传 AUTO 时这里是后端判定出来的类型） */
    documentType: 'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'
    /** 可直接填表的草稿；疫苗本可能多条，其余类型一条 */
    drafts: Record<string, any>[]
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
    type: HealthAttachmentUploadType,
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
  // 疫苗记录也能留原件之后（第九期），这里的类型跟着上传口一起放宽
  deleteHealthAttachment: (
    type: HealthRecordType | 'checkup' | 'vaccine',
    key: string,
  ) =>
    request({
      url: buildHealthAttachmentDeletePath(type),
      method: 'DELETE',
      data: { key },
    }),
  createWeightRecord: (dogId: string, data: Record<string, any>) =>
    request({ url: `/dogs/${dogId}/weight-records`, method: 'POST', data }),
}
