/**
 * AI 辅助新建标准原料 API
 *
 * 后端前缀 `/api/v1/admin/ingredient-creation`；`api` 实例的 baseURL 已经是
 * `/api/v1`，所以这里只写 `/admin/ingredient-creation`。
 * 响应外层 `{ code, message, data }` 由 axios 拦截器统一拆掉。
 */
import api from './index'
import type {
  AuthorizeResult,
  CreateSupplementIngredientPayload,
  CreateSupplementIngredientResultDto,
  PendingSupplementArchiveDto,
  SupplementEvidenceDto,
  SupplementCandidateDto,
  SupplementChatReplyDto,
  SupplementLinkPreviewDto,
  CheckDomain,
  CheckRunView,
  CommitIngredientCreationInput,
  CommitIngredientCreationResult,
  CreationStep,
  FinalCheckResult,
  IngredientAgentRunResult,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientDraftChecksView,
  RunIngredientAgentInput,
  ConfirmSearchPlanInput,
  SearchPlan
} from '@/types/ingredientCreation'

const BASE = '/admin/ingredient-creation'

/**
 * 商品详情页截图识别出来的采购商品草稿（2026-11-08）。
 *
 * 读不到的字段一律 null 并进 `missing`；`confidence` 里 `low` 的表示模型没把握，
 * 页面上要标「AI 推测·可改」。金额与净含量都已经换算到原料的基准单位。
 */
export interface ProcurementSkuDraftDto {
  name: string | null
  brand: string | null
  productModel: string | null
  purchaseChannel: string | null
  purchaseUnit: string | null
  packCount: number | null
  netContentPerPack: number | null
  netContentUnitText: string | null
  unitPrice: number | null
  missing: string[]
  confidence: Record<string, 'high' | 'low'>
}

export const ingredientCreationApi = {
  /** 补剂建档：一条标准原料 + 一份待验证营养档案 + 主映射 + 标签证据。 */
  createSupplement: (
    payload: CreateSupplementIngredientPayload
  ): Promise<CreateSupplementIngredientResultDto> =>
    api.post(`${BASE}/supplements`, payload),

  /** 补剂对话：把一句话翻译成回复 + 要执行的动作。 */
  supplementChat: (payload: {
    message: string
    draft: Record<string, unknown>
    history?: { role: 'user' | 'assistant'; text: string }[]
  }): Promise<SupplementChatReplyDto> =>
    // 一次对话可能要调好几轮工具（读商品页每轮可达 25s），默认 30s 必然超时
    api.post('/admin/ingredient-supplement-chat/respond', payload, { timeout: 190000 }),

  /** 按关键词去电商搜候选（只有链接、名字、标价，没有成分表）。 */
  searchSupplementCandidates: (keyword: string): Promise<SupplementCandidateDto[]> =>
    api.post(`${BASE}/supplements/search-candidates`, { keyword }),

  /** 按商品链接读初稿；读不出会 400，调用方退回手填。 */
  previewSupplementLink: (url: string): Promise<SupplementLinkPreviewDto> =>
    api.post(`${BASE}/supplements/preview-link`, { url }),

  /** 待验证的补剂档案：关掉页面后还能找回来确认。 */
  listPendingSupplements: (): Promise<PendingSupplementArchiveDto[]> =>
    api.get(`${BASE}/supplements/pending`),

  /** 回查当时那张标签：原文、原图、每份几粒。 */
  getSupplementEvidence: (ingredientId: string): Promise<SupplementEvidenceDto | null> =>
    api.get(`${BASE}/supplements/${ingredientId}/evidence`),

  /**
   * 确认（可修改）AI 提交的检索方案；确认后 AI 才能写原料卡与营养。
   *
   * 只传人改过的东西；确认人与时间由服务端按当前登录人写。
   */
  confirmSearchPlan: (
    id: string,
    input: ConfirmSearchPlanInput
  ): Promise<SearchPlan> =>
    api.post(`${BASE}/drafts/${id}/search-plan/confirm`, input),

  /** 跳过当前待确认方案；不写正式库，写工具仍需新方案确认。 */
  dismissSearchPlan: (id: string): Promise<null> =>
    api.delete(`${BASE}/drafts/${id}/search-plan`),

  /** 读取草稿（刷新后按 draftId 恢复现场） */
  getDraft: (id: string): Promise<IngredientCreationDraft> =>
    api.get(`${BASE}/drafts/${id}`),

  /** 保存草稿 payload（浅合并；不传 proposalHistory） */
  patchDraft: (
    id: string,
    step: CreationStep,
    payload: Partial<IngredientCreationDraftPayload> = {}
  ): Promise<IngredientCreationDraft> =>
    api.patch(`${BASE}/drafts/${id}`, { step, payload }),

  /** ④ 跑服务端终检；前端只展示，不自己判定通过（旧的整份终检，授权不看它） */
  runCheck: (id: string): Promise<FinalCheckResult> =>
    api.post(`${BASE}/drafts/${id}/check`),

  /**
   * 按域核验并落一份报告（trigger 固定 USER、createdBy 由服务端取登录人）。
   *
   * 授权只认这份报告：`POST /check` 不落库、也不算「人核验过」。
   */
  runDomainCheck: (id: string, domain: CheckDomain): Promise<CheckRunView> =>
    api.post(`${BASE}/drafts/${id}/checks`, { domain }),

  /** Agent 写完后自动跑两页核验；报告 trigger=AGENT，仍不授权。 */
  runAutoChecks: (
    id: string
  ): Promise<{ ingredient: CheckRunView; nutrition: CheckRunView }> =>
    api.post(`${BASE}/drafts/${id}/checks/auto`),

  /** 两域各自最新报告 + 是否仍对应当前草稿（改过一格就会变成 false）。 */
  getDraftChecks: (id: string): Promise<IngredientDraftChecksView> =>
    api.get(`${BASE}/drafts/${id}/checks`),

  /**
   * 收尾「采购商品」：从商品详情页截图识别（2026-11-08）。
   *
   * 与员工端同一套识别服务、同一份提示词与每日配额；**只出草稿不落库**，
   * 人核对完才随建档一起提交。识别不了时 `degraded=true`、`draft=null`，退回手填。
   */
  recognizeProcurementSku: (
    id: string,
    imageUrl: string
  ): Promise<{ draft: ProcurementSkuDraftDto | null; degraded: boolean }> =>
    api.post(`${BASE}/drafts/${id}/procurement-sku-draft`, { imageUrl }),

  /**
   * 识别前先把截图传到 COS（复用员工端同一个上传口，同一套存储目录）。
   *
   * 视觉模型读的是图片地址，不是文件本身；传这里之后拿到 url 再调识别。
   */
  uploadProcurementSkuScreenshot: async (
    file: File
  ): Promise<{ url: string; key: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/staff/purchasing/upload-sku-screenshot', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },

  /**
   * 授权写入正式库：后端四条件全过才写，否则 400 且 body 顶层带 `reasons`。
   *
   * 只传主档案下标；原料与档案一律由服务端从当前草稿读，前端不能替它选数据。
   */
  authorize: (
    id: string,
    input: {
      primaryProfileIndex: number
      /**
       * 建档必须一起提交的采购商品（2026-11-07 硬门禁）。
       * 它是原料成本的唯一初始来源：没有它，这条原料建出来就是 0 元。
       */
      procurementSku: {
        name?: string
        purchaseUnit: string
        packCount: number
        netContentPerPack: number
        currentPurchasePrice: number
      }
    }
  ): Promise<AuthorizeResult> =>
    api.post(`${BASE}/drafts/${id}/authorize`, input),

  /** 旧提交入口（后端已与 authorize 共用同一闸门）；页面只调 authorize。 */
  commit: (
    id: string,
    input: CommitIngredientCreationInput
  ): Promise<CommitIngredientCreationResult> =>
    api.post(`${BASE}/drafts/${id}/commit`, input),

  /**
   * Agent 起草循环：给一句话，让 AI 在草稿上受控地查库 / 写字段 / 跑终检。
   *
   * 第一轮不传 `draftId`（后端新建草稿），之后带上上一轮返回的
   * `draftId`，就能在同一份草稿上连续对话。
   *
   * 后端一轮最多跑 180 秒，axios 默认 30 秒会提前断掉，所以单独放宽。
   */
  runAgent: (
    input: RunIngredientAgentInput
  ): Promise<IngredientAgentRunResult> =>
    api.post(`${BASE}/agent/run`, input, { timeout: 190000 })
}
