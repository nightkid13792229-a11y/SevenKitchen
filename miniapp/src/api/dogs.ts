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
  /**
   * 可信度（2026-10-04 第一期）：
   * CONFIRMED 确诊 / SUSPECTED 可疑 / TO_VERIFY 待排查 / RULED_OUT 已排除。
   * 确诊的会让含它的食谱**彻底不进推荐**。
   */
  certainty?: 'CONFIRMED' | 'SUSPECTED' | 'TO_VERIFY' | 'RULED_OUT'
  /** 来源：REPORT / OWNER / STAFF / ORDER / PLAN */
  source?: string
}

/**
 * 过敏检测报告（2026-10-04，第二期）。
 *
 * level 照抄报告原文的语义：
 *   POSITIVE 阳性 / WEAK_POSITIVE 弱阳性 / SUSPECTED 疑似 /
 *   NEGATIVE 阴性 / UNKNOWN 报告没写
 * 系统不做医学判断 —— 阳性记成"确诊"，其余记成"可疑"，阴性**不记成过敏**。
 */
export type AllergyReportPayload = {
  testDate?: string | null
  testMethod?: 'SERUM' | 'INTRADERMAL' | 'ELIMINATION' | 'OTHER' | 'UNKNOWN'
  institution?: string | null
  summary?: string | null
  ocrText?: string | null
  attachments?: string[]
  results?: Array<{
    allergen: string
    level?: string
    notes?: string | null
  }>
}

type VaccineRecordCreatePayload = {
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
   * 过敏档案（2026-10-04，过敏重构第一期）。
   *
   * 返回这只狗的过敏原清单 + **原料库里会被这些过敏原命中的食材名**。
   *
   * 为什么要这个接口：首页那个「挑食/过敏」筛选过去**完全不读档案里的过敏**，
   * 顾客得自己再挑一遍 —— 于是"填了过敏 → 首页自动避开"这件事，
   * 在最显眼的那个入口上是断的。现在首页用它把已记录的过敏默认带出来。
   */
  allergenProfile: (dogId: string) =>
    request({
      url: `/dogs/${dogId}/allergen-profile`,
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    }),
  /**
   * 常见过敏原词表（2026-10-04）。
   *
   * 改造前那 12 个标签是**硬编码在小程序里**的，后台无法维护，
   * 而且实测有 8 个匹配不到任何真实食材。现在改成读后端词表，
   * 顺序按知识库 skin-005 的循证常见度排。
   */
  commonAllergens: () =>
    request({
      url: '/allergens/common',
      method: 'GET',
      quiet: true,
      suppressErrorToast: true,
    }),
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
   * ✅ 顾客侧已开放（2026-10-02 起）：
   *    知识库 189 条已由合作兽医全数审核通过，生产环境后端开了 HEALTH_ANALYSIS=customer。
   *    分析只引用已审核条目，未审核的条目顾客侧拿不到。
   *    （若哪天把开关关掉，后端会返回 available=false，页面会如实说明原因。）
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
  /**
   * 疫苗名称库 + 归类闭集（2026-10-05）。
   *
   * 界面靠它渲染：归类必选项（四类）、一点即选的名字（每个带已知归类）、
   * 产品库（含国产 —— 可选但不可推荐）。
   *
   * 为什么不写在前端：分类与产品是后端的 domain 知识，
   * 前端复制一份迟早对不上。
   */
  /**
   * ⚠️ 路径是 `vaccines/catalog`（**两段**），别改成一段的 `vaccine-catalog` ——
   * 那会被 DogsController 的 `@Get(':id')` 当成 dogId 吃掉（踩过一次）。
   */
  vaccineCatalog: () =>
    request({ url: '/dogs/vaccines/catalog', method: 'GET', suppressErrorToast: true }),

  /**
   * 边打字边判归类（2026-10-05）。
   *
   * 老板："在输入疫苗名称之后，为什么归类还是需要手动选择呢？"
   * 分类逻辑只有后端一份，所以输入停顿一下来问一次。
   * 返回空数组 = 认不出来，界面要求顾客自己指定 —— 不猜。
   */
  classifyVaccineName: (name: string) =>
    request({
      url: `/dogs/vaccines/classify?name=${encodeURIComponent(name)}`,
      method: 'GET',
      suppressErrorToast: true,
    }),
  /**
   * 过敏原排查计划（2026-10-04，过敏重构第三期）。
   *
   * 老板第 2 条："可以创建过敏原的排查计划。"
   * 「排除性饮食试验」是国内外指南唯一认可的食物过敏确诊路径。
   *
   * `getActive` 会一并下发规则表（建议时长 / 必守清单 / 再挑战窗口 /
   * 兽医边界提示）—— 那些数字都带出处，不该散落在客户端。
   */
  allergyTrial: {
    getActive: (dogId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-trial`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      }),
    history: (dogId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/history`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      }),
    create: (dogId: string, data: Record<string, any>) =>
      request({
        url: `/dogs/${dogId}/allergy-trials`,
        method: 'POST',
        data,
        suppressErrorToast: true,
      }),
    update: (dogId: string, trialId: string, data: Record<string, any>) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/${trialId}`,
        method: 'PUT',
        data,
        suppressErrorToast: true,
      }),
    logDay: (dogId: string, trialId: string, data: Record<string, any>) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/${trialId}/logs`,
        method: 'POST',
        data,
        suppressErrorToast: true,
      }),
    startChallenge: (dogId: string, trialId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/${trialId}/challenges`,
        method: 'POST',
        suppressErrorToast: true,
      }),
    /**
     * 记录再挑战结论 —— 会**回写过敏记录的可信度**：
     * 复发了 → 确诊（食谱彻底避开）；没反应 → 已排除（不再避开）。
     */
    concludeChallenge: (
      dogId: string,
      trialId: string,
      allergen: string,
      data: { outcome: string; reactionNote?: string },
    ) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/${trialId}/challenges/${encodeURIComponent(allergen)}`,
        method: 'PUT',
        data,
        suppressErrorToast: true,
      }),
    conclude: (dogId: string, trialId: string, data: Record<string, any>) =>
      request({
        url: `/dogs/${dogId}/allergy-trials/${trialId}/conclude`,
        method: 'POST',
        data,
        suppressErrorToast: true,
      }),
  },
  /**
   * 过敏检测报告（2026-10-04，过敏重构第二期）。
   *
   * 老板第 1 条："可以记录自己狗狗的过敏检查报告。"
   *
   * 改造前系统里没有"报告"这个概念，只有一行行散装的过敏原：
   *   · 一份写了 12 项结果的报告 = 12 条互不相干的记录
   *   · 记录里没有检测日期，时间线只能拿"录入时间"冒充
   *   · **顾客上传的报告原件传完就丢**，再也看不到
   *
   * 现在报告成为实体：检测日期 / 方式 / 机构 / 原件 / 识别原文，
   * 每条结论挂在报告下面。
   */
  allergyReports: {
    list: (dogId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-reports`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      }),
    create: (dogId: string, data: AllergyReportPayload) =>
      request({
        url: `/dogs/${dogId}/allergy-reports`,
        method: 'POST',
        data,
        suppressErrorToast: true,
      }),
    get: (dogId: string, reportId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-reports/${reportId}`,
        method: 'GET',
        suppressErrorToast: true,
      }),
    update: (dogId: string, reportId: string, data: AllergyReportPayload) =>
      request({
        url: `/dogs/${dogId}/allergy-reports/${reportId}`,
        method: 'PUT',
        data,
        suppressErrorToast: true,
      }),
    /** 删除报告**不会**连带删掉过敏记录 —— 依据没了，结论仍然成立 */
    remove: (dogId: string, reportId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-reports/${reportId}`,
        method: 'DELETE',
        suppressErrorToast: true,
      }),
    /** 这份报告让原料库里哪些食材要避开（给顾客看"报告真的被用上了"） */
    impact: (dogId: string, reportId: string) =>
      request({
        url: `/dogs/${dogId}/allergy-reports/${reportId}/impact`,
        method: 'GET',
        quiet: true,
        suppressErrorToast: true,
      }),
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
