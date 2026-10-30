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

export const ingredientCreationApi = {
  /**
   * 确认（可修改）AI 提交的检索方案；确认后 AI 才能写原料卡与营养。
   *
   * 只传人改过的东西；确认人与时间由服务端按当前登录人写。
   */
  confirmSearchPlan: (
    id: string,
    input: ConfirmSearchPlanInput = {}
  ): Promise<SearchPlan> =>
    api.post(`${BASE}/drafts/${id}/search-plan/confirm`, input),

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

  /** 两域各自最新报告 + 是否仍对应当前草稿（改过一格就会变成 false）。 */
  getDraftChecks: (id: string): Promise<IngredientDraftChecksView> =>
    api.get(`${BASE}/drafts/${id}/checks`),

  /**
   * 授权写入正式库：后端四条件全过才写，否则 400 且 body 顶层带 `reasons`。
   *
   * 只传主档案下标；原料与档案一律由服务端从当前草稿读，前端不能替它选数据。
   */
  authorize: (
    id: string,
    input: { primaryProfileIndex: number }
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
