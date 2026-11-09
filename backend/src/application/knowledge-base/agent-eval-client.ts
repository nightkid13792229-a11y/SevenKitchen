/**
 * L2 真实 Agent 评估的 HTTP 客户端（全库计划 Task 12）。
 *
 * 只做 HTTP + 轮询，不碰数据库；测试注入 fake fetch。
 * 终止态以 `RecipeAgentSessionStatus` 为准：
 * - 成功：WAITING_USER（Agent 每次跑完都会停在这里）、COMPLETED（保留兼容）
 * - 失败：FAILED / STOPPED / INTERRUPTED
 * - `DONE` 不存在（旧设计稿写错过）。
 */
export interface AgentEvalClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface LoginResult {
  token: string;
  userId: string;
}

export interface AgentSessionMessage {
  seq?: number;
  role: string;
  content?: string | null;
  toolName?: string | null;
  toolArgs?: unknown;
  toolResult?: unknown;
}

export interface AgentSessionView {
  session: {
    id: string;
    status: string;
    citationAudit?: unknown;
    promptTokens?: number;
    completionTokens?: number;
    lastError?: string | null;
    createdBy?: string;
  };
  messages: AgentSessionMessage[];
}

const SUCCESS_STATUSES = new Set(['WAITING_USER', 'COMPLETED']);
const FAILURE_STATUSES = new Set(['FAILED', 'STOPPED', 'INTERRUPTED']);

export class AgentEvalClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: AgentEvalClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
    this.timeoutMs = options.timeoutMs ?? 6 * 60 * 1000;
  }

  private async request<T>(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${path}: ${payload?.message ?? text.slice(0, 200)}`,
      );
    }
    if (payload && typeof payload.code === 'number' && payload.code !== 0) {
      throw new Error(`接口返回错误 ${payload.code}：${payload.message ?? ''}`);
    }
    return (payload?.data ?? payload) as T;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const data = await this.request<{ token?: string; userId?: string }>(
      'POST',
      '/auth/admin-login',
      undefined,
      { username, password },
    );
    if (!data?.token || !data?.userId) {
      throw new Error('登录成功但没有返回 token/userId');
    }
    return { token: data.token, userId: data.userId };
  }

  async createDraft(
    token: string,
    input: { name: string; scenario: string },
  ): Promise<{ id: string }> {
    const data = await this.request<{ id?: string }>(
      'POST',
      '/recipe-designer/drafts',
      token,
      input,
    );
    if (!data?.id) throw new Error('创建草稿没有返回 id');
    return { id: data.id };
  }

  async startRun(
    token: string,
    draftId: string,
    message: string,
  ): Promise<{ sessionId: string }> {
    const data = await this.request<{ sessionId?: string }>(
      'POST',
      `/recipe-designer/drafts/${draftId}/agent/runs`,
      token,
      { message },
    );
    if (!data?.sessionId) throw new Error('startRun 没有返回 sessionId');
    return { sessionId: data.sessionId };
  }

  async getSession(token: string, draftId: string): Promise<AgentSessionView> {
    return this.request<AgentSessionView>(
      'GET',
      `/recipe-designer/drafts/${draftId}/agent/session`,
      token,
    );
  }

  /** 轮询到终止态；成功返回会话视图，失败/超时抛错。 */
  async pollSession(
    token: string,
    draftId: string,
    options: { timeoutMs?: number; intervalMs?: number } = {},
  ): Promise<AgentSessionView> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const intervalMs = options.intervalMs ?? this.pollIntervalMs;
    const startedAt = Date.now();
    for (;;) {
      const view = await this.getSession(token, draftId);
      const status = String(view?.session?.status ?? '');
      if (SUCCESS_STATUSES.has(status)) return view;
      if (FAILURE_STATUSES.has(status)) {
        throw new Error(
          `会话 ${status}：${view?.session?.lastError ?? '无错误信息'}`,
        );
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`会话轮询超时（${timeoutMs}ms，最后状态 ${status}）`);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async deleteDraft(token: string, draftId: string): Promise<void> {
    await this.request<unknown>(
      'DELETE',
      `/recipe-designer/drafts/${draftId}`,
      token,
    );
  }
}
