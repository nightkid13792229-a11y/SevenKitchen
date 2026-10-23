/**
 * AI 辅助新建标准原料 API
 *
 * 后端前缀 `/api/v1/admin/ingredient-creation`；`api` 实例的 baseURL 已经是
 * `/api/v1`，所以这里只写 `/admin/ingredient-creation`。
 * 响应外层 `{ code, message, data }` 由 axios 拦截器统一拆掉。
 */
import api from './index'
import type {
  CandidateSearchResult,
  CommitIngredientCreationInput,
  CommitIngredientCreationResult,
  CreateDraftResult,
  CreateMergePlanInput,
  FinalCheckResult,
  FindCandidatesInput,
  IngredientCreationAudit,
  IngredientCreationDraft,
  IngredientCreationDraftPayload,
  IngredientCreationDraftSummary,
  IntakeClassification,
  IntakeCurrentIngredient,
  IntakeHistoryTurn,
  MergePlan,
  OnlineCandidateSearchResult,
  CreationStep,
  IngredientAgentRunResult,
  ResolveMergeConflictInput,
  RunIngredientAgentInput
} from '@/types/ingredientCreation'

const BASE = '/admin/ingredient-creation'

export const ingredientCreationApi = {
  /**
   * 第一步：判断一句话说的是食材还是补剂。
   *
   * `history` 是最近几轮对话（最多 6 条），`current` 是已经判出的原料；
   * 后端靠这两项区分「新原料」和「纠正上一条」。
   * `UNKNOWN` 不是错误：后端会在 `reply` 里追问，并给可点的补全建议。
   * AI 未启用 / 不可用时后端返回 503 + 中文提示，由页面原样显示成对话气泡。
   */
  classifyIntake: (
    text: string,
    history: IntakeHistoryTurn[] = [],
    current?: IntakeCurrentIngredient
  ): Promise<IntakeClassification> =>
    api.post(`${BASE}/intake/classify`, { text, history, current }),

  /** 起手：创建一条 `step = INTAKE` 的空草稿 */
  createDraft: (name: string): Promise<CreateDraftResult> =>
    api.post(`${BASE}/drafts`, { name }),

  /** 列出当前登录人未完成的草稿（按最近编辑倒序，最多 20 条，不含 payload） */
  listDrafts: (): Promise<IngredientCreationDraftSummary[]> =>
    api.get(`${BASE}/drafts`),

  /** 读取草稿（刷新后按 draftId 恢复向导） */
  getDraft: (id: string): Promise<IngredientCreationDraft> =>
    api.get(`${BASE}/drafts/${id}`),

  /** 推进站点，并浅合并本站 payload（不传 proposalHistory） */
  patchDraft: (
    id: string,
    step: CreationStep,
    payload: Partial<IngredientCreationDraftPayload> = {}
  ): Promise<IngredientCreationDraft> =>
    api.patch(`${BASE}/drafts/${id}`, { step, payload }),

  /** ② 按名字与生熟状态检索本地候选 */
  findCandidates: (
    id: string,
    input: FindCandidatesInput
  ): Promise<CandidateSearchResult> =>
    api.post(`${BASE}/drafts/${id}/candidates`, input),

  /**
   * ② 本地零候选时的线上白名单兜底检索。
   * 后端会把抓到的数据落成来源记录，同一查询第二次直接命中缓存。
   */
  findOnlineCandidates: (
    id: string,
    input: FindCandidatesInput
  ): Promise<OnlineCandidateSearchResult> =>
    api.post(`${BASE}/drafts/${id}/candidates/online`, input),

  /** ② 选主来源与补位来源，生成缝合方案 */
  createMergePlan: (
    id: string,
    input: CreateMergePlanInput
  ): Promise<MergePlan> =>
    api.post(`${BASE}/drafts/${id}/merge`, input),

  /** ② 人工裁决一个冲突字段 */
  resolveMergeConflict: (
    id: string,
    input: ResolveMergeConflictInput
  ): Promise<MergePlan> =>
    api.post(`${BASE}/drafts/${id}/merge/resolve`, input),

  /** ④ 跑服务端终检；前端只展示，不自己判定通过 */
  runCheck: (id: string): Promise<FinalCheckResult> =>
    api.post(`${BASE}/drafts/${id}/check`),

  /** 按原料读 AI 创建记录（提案 / 人工改动 / 提交人）；没有 → 404 */
  getAudit: (ingredientId: string): Promise<IngredientCreationAudit> =>
    api.get(`${BASE}/audits/${ingredientId}`),

  /** ⑥ 一次性提交原料、营养档案与映射 */
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
