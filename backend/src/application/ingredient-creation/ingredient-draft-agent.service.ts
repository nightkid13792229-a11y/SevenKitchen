import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import type { PreparationState } from '../../domain/ingredient-creation/preparation-state';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
  INGREDIENT_INTAKE_AGENT_PURPOSE,
  INGREDIENT_INTAKE_AGENT_PURPOSES,
} from './ingredient-creation-intake.service';
import {
  IngredientCreationToolsService,
  type AgentCheckSummary,
  type AgentToolDefinition,
  type AgentToolExecution,
} from './ingredient-creation-tools.service';
import type {
  CandidateReviewVerdict,
  IngredientCreationDraft,
  PendingQuestion,
  PendingQuestionOption,
} from './ingredient-creation.types';

/**
 * 单轮最多执行多少次**工具调用**（不是模型轮次）。
 *
 * 模型一次回复可能带很多 tool_call，拿「步数」当动作数会被严重低估：
 * 线上 8 步实际写出了 34 个字段。这里直接按动作数设保险丝。
 */
export const INGREDIENT_AGENT_MAX_TOOL_CALLS = 200;
/** 一次起草的总时长上限：超时不再发起模型请求。 */
export const INGREDIENT_AGENT_TIMEOUT_MS = 600_000;
/** 连续多少次工具调用没有任何新进展就软停止。 */
export const INGREDIENT_AGENT_MAX_NO_PROGRESS = 3;
/** 单轮 token 成本预算默认值（输入 + 输出）；可用环境变量覆盖。 */
export const INGREDIENT_AGENT_DEFAULT_TOKEN_BUDGET = 600_000;
export const INGREDIENT_AGENT_TOKEN_BUDGET_ENV =
  'INGREDIENT_AGENT_TOKEN_BUDGET';

const AGENT_TEMPERATURE = 0.2;
/** 未探测成功前的保守默认输出上限：不再默认一上来就用 32k。 */
export const INGREDIENT_AGENT_DEFAULT_MAX_TOKENS = 8_192;
/**
 * 单次模型请求的硬超时。
 *
 * 不跟随整轮 600 秒总时长：供应商挂住时，一次请求最多等 90 秒，
 * 超时按失败处理、计入重试；否则一次调用就能卡掉三分钟。
 */
export const INGREDIENT_AGENT_REQUEST_TIMEOUT_MS = 90_000;
/**
 * 启动后首次调用时探测可用输出上限：从小到大试，拿到合法响应就停。
 *
 * 不同供应商 / 模型对 `max_tokens` 的接受度不同：32k 可能被“接受”却
 * 返回空响应 / 无效结构，所以探测的通过标准不是 HTTP 200，而是
 * `choices[0].message` 里确实有 content 或 tool_calls。
 * 探测成功后缓存在内存里，后续所有调用都直接用可用值。
 */
export const INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES = [
  INGREDIENT_AGENT_DEFAULT_MAX_TOKENS,
  16_384,
  32_768,
] as const;
const REPLY_MAX = 500;
const TRANSCRIPT_SUMMARY_MAX = 240;
/** 工具结果超过这个长度就不回传给页面，避免一次大检索撑爆响应。 */
const TOOL_RESULT_MAX_CHARS = 32_000;

/**
 * 模型输出协议。
 *
 * - `FUNCTION_CALLING`：OpenAI 兼容的 `tools` + `tool_calls`（首选）；
 * - `JSON_ACTION`：模型不支持 tools 时的退化协议，让它输出
 *   `{"tool":"...","args":{...}}` / `{"reply":"..."}`。
 */
export type IngredientAgentMode = 'FUNCTION_CALLING' | 'JSON_ACTION';

export interface AgentToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  error?: string;
  /**
   * 工具返回的结构化结果（已解析的 JSON）。
   *
   * 页面靠它展开「匹配依据」；过大的结果不塞进列表，避免一次长检索把响应撑大。
   * 注意：`ok=true` 只表示工具执行成功，像 searchNames 还要看 `found`。
   */
  result?: unknown;
  /** 单次工具耗时；页面展开时显示，报告汇总也用它。 */
  durationMs?: number;
}

/** 本轮运行结果分类，写进 AgentRunReport.result。 */
export type IngredientAgentRunOutcome =
  | 'FINISHED'
  | 'TIMEOUT'
  | 'NO_PROGRESS'
  | 'ERROR';

/** 运行报告里的一条失败工具记录。 */
export interface AgentRunReportFailedTool {
  name: string;
  error: string;
}

/**
 * 每一轮 run 结束时落日志、并随接口 / SSE 返回的运行报告。
 *
 * 只做留痕，不参与任何流程判断：看真实运行数据再决定加什么门禁。
 */
export interface AgentRunReport {
  runId: string;
  draftId: string;
  text: string;
  /** 模型轮次（一次请求算一轮）。 */
  steps: number;
  /** 实际执行的工具调用次数。 */
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  stopReason: IngredientAgentStopReason | 'ERROR' | null;
  /** 本次用过的工具名（去重、按首次出现顺序）。 */
  tools: string[];
  /** 失败的工具调用；成功的调用不在这里。 */
  failedTools: AgentRunReportFailedTool[];
  result: IngredientAgentRunOutcome;
}

/** 本次运行的留痕：每一步模型动作与工具结果。撞保险丝时原样带回。 */
export interface AgentTranscriptEntry {
  step: number;
  type: 'tool_call' | 'tool_result' | 'reply' | 'limit';
  atMs: number;
  tool?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
  summary?: string;
  stopReason?: IngredientAgentStopReason;
}

/**
 * 本轮为什么停下。
 *
 * - `TOOL_CALL_LIMIT` / `TIMEOUT` / `TOKEN_BUDGET`：硬保险丝；
 * - `NO_PROGRESS`：连续多次工具调用没有新进展的软停止；
 * - `waiting_user`：`askUser` 成功，循环正常结束、等用户回答（不是失败）。
 */
export type IngredientAgentStopReason =
  | 'TOOL_CALL_LIMIT'
  | 'TIMEOUT'
  | 'TOKEN_BUDGET'
  | 'NO_PROGRESS'
  | 'waiting_user';

export interface IngredientAgentRunResult {
  draftId: string;
  reply: string;
  toolCalls: AgentToolCallRecord[];
  /** 模型轮次（一次请求算一轮）。 */
  steps: number;
  /** 实际执行的工具调用次数（一轮可能带多个 tool_call）。 */
  toolCallCount: number;
  transcript: AgentTranscriptEntry[];
  /** 本次实际使用的协议；报告与排查用。 */
  mode: IngredientAgentMode;
  /** 正常给出最终回复 / 等用户回答时为 null。 */
  stopReason: IngredientAgentStopReason | null;
  /** 本轮运行报告：接口返回值与 SSE 都带上。 */
  report: AgentRunReport;
  /**
   * 本轮停下来问了人的问题；非流式接口靠它渲染提问气泡。
   * 正常跑完时为 null。
   */
  pendingQuestion?: PendingQuestion | null;
}

/**
 * 成本保险丝：单轮允许消耗的 token 总数（输入 + 输出）。
 *
 * 用 token 预算而不是写死金额，避免供应商调价后代码失效；
 * 未配置 / 非法 / 非正数时用默认值。设成很大的值等于放宽，不关闭硬上限。
 */
export function resolveIngredientAgentTokenBudget(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[INGREDIENT_AGENT_TOKEN_BUDGET_ENV];
  if (typeof raw !== 'string' || !raw.trim()) {
    return INGREDIENT_AGENT_DEFAULT_TOKEN_BUDGET;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : INGREDIENT_AGENT_DEFAULT_TOKEN_BUDGET;
}

/**
 * 查库命中的一条词条：只带页面展开所需字段。
 *
 * 与工具返回的 `foodName / matchedBy / matchedKeyword / score` 同口径，
 * 但改名为 `name` 并去掉 sourceRecordId、missingFields 等大字段，避免
 * 把整份工具结果塞进 SSE 事件。
 */
export interface IngredientAgentStreamClassification {
  state: string;
  method: string;
  cutLabel: string | null;
  cutGroup: string | null;
  evidence: string | null;
}

export interface IngredientAgentStreamMatch {
  name: string;
  matchedBy: string;
  matchedKeyword: string;
  score: number | null;
  /** 服务端 AI 复核判断；旧后端没有这个字段。 */
  review?: {
    verdict: CandidateReviewVerdict;
    reason: string;
  };
  /** AI 读词条名判出的生熟 / 做法 / 部位；旧后端没有这个字段。 */
  classification?: IngredientAgentStreamClassification;
}

/** 「读来源记录」这一步的精简摘要：词条名 / 覆盖率 / 读到多少项。 */
export interface IngredientAgentStreamRecord {
  name: string;
  coverage: number | null;
  valueCount: number;
}

/** 查库结果的部位分组概览：页面「匹配依据」直接显示每组条数。 */
export interface IngredientAgentStreamGroup {
  key: string;
  label: string;
  count: number;
  states: PreparationState[];
}

/** 查库复核概要：让页面能写「共 50 条候选 · 11 条相关」。 */
export interface IngredientAgentStreamReviewSummary {
  relevantCount: number;
  uncertainCount: number;
  irrelevantCount: number;
  failed: boolean;
}

/**
 * 流式运行事件（SSE `data:` 的 JSON）。
 *
 * 一次工具调用固定成对出现：先 `step_start`（页面立刻显示「执行中」），
 * 执行完再 `step_end`（页面改成成功 / 失败）。`reply` 是最终总结，
 * 正常结束时最后一条是 `done`；失败时只发 `error`，不发 `done`。
 */
export type IngredientAgentStreamEvent =
  | {
      type: 'step_start';
      index: number;
      name: string;
      summary: string;
    }
  | {
      type: 'step_end';
      index: number;
      ok: boolean;
      found?: boolean;
      resultSummary: string;
      error?: string;
      /** 查库：本次实际用过的关键词（含中文名扩展出的英文别名）。 */
      keywords?: string[];
      /** 查库：候选总数；页面用来提示还有多少条没有展示。 */
      candidateCount?: number;
      /** 查库：截断前的候选总数（与 candidateCount 同值，显式给新页面用）。 */
      totalCandidates?: number;
      /** 查库：部位分组概览（每组条数）。 */
      groups?: IngredientAgentStreamGroup[];
      /** 查库：AI 复核概要（相关 / 存疑 / 不相关）。 */
      reviewSummary?: IngredientAgentStreamReviewSummary;
      /** 查库：最多 5 条匹配依据。 */
      matches?: IngredientAgentStreamMatch[];
      /** 读来源记录：词条名 / 覆盖率 / 读到多少项。 */
      record?: IngredientAgentStreamRecord;
      /** 本次工具耗时；页面展开步骤时显示。 */
      durationMs?: number;
    }
  | {
      type: 'reply';
      reply: string;
      draftId: string;
      steps: number;
      toolCallCount: number;
      /** 本轮运行报告。 */
      report?: AgentRunReport;
    }
  /**
   * AI 停下来问人。`draftId` 一并带上：页面点选项回答时要用同一个草稿，
   * 不然会新建一份，问题与答案就接不上了。`ask` 之后紧接 `done`。
   */
  | {
      type: 'ask';
      question: string;
      options: string[];
      /** 每个选项的库内核实结果，与 options 同序；页面据此显示小标。 */
      optionChecks?: PendingQuestionOption[];
      draftId: string;
      /** 问人也是本轮正常结束：报告一并带回。 */
      report?: AgentRunReport;
    }
  | { type: 'done'; report?: AgentRunReport }
  | { type: 'error'; message: string; report?: AgentRunReport };

export interface RunIngredientAgentInput {
  draftId?: string;
  text: string;
  userId: string;
  /**
   * 边跑边回调；非流式接口不传，行为与以前完全一致。
   *
   * 回调抛错（例如客户端已断开）不会中断起草循环。
   */
  onEvent?: (event: IngredientAgentStreamEvent) => void;
}

interface AgentToolCallPayload {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: AgentToolCallPayload[];
  tool_call_id?: string;
}

interface AgentUsage {
  promptTokens: number;
  completionTokens: number;
  /** 输入 + 输出；供应商只给 total 时按 total 用。 */
  totalTokens: number;
}

interface AgentAssistantTurn {
  content: string;
  toolCalls: AgentToolCallPayload[];
  usage: AgentUsage;
}

/** 模型请求失败（网络 / 非 2xx / 输出结构不对）。上层据此 503。 */
class AgentModelError extends Error {}

/** 供应商不认 `tools` 参数：只在第一步触发「退化为 JSON 动作」。 */
class AgentToolsUnsupportedError extends AgentModelError {}

/**
 * 400 / 413 / 422 参数错误：探测输出上限时据此降一档。
 *
 * 超时 / 5xx 不在此列，不能靠降低 max_tokens 解决。
 */
class AgentOutputLimitError extends AgentModelError {}

/**
 * HTTP 200 但响应结构不可用：没有 message，或 content / tool_calls 都为空。
 *
 * 供应商“接受”了大 max_tokens 却给出空响应时，这一档不能算探测通过；
 * 缓存的档位遇到这种响应也要失效，重新探测。
 */
class AgentInvalidResponseError extends AgentModelError {}

/** 总时长预算用完：不是 AI 故障，按「跑到上限」收尾并带回 transcript。 */
class AgentDeadlineExceededError extends AgentModelError {}

/** 包住循环错误，让 run() 能在发 error 事件时带上同一份报告。 */
class AgentRunFailedError extends Error {
  constructor(
    readonly causeError: unknown,
    readonly report: AgentRunReport,
  ) {
    super(
      causeError instanceof Error ? causeError.message : String(causeError),
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : `${chars.slice(0, max).join('')}…`;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  }
  return result;
}

/** 工具结果是 JSON 文本；解析不了或过大就当作没有结构化结果。 */
function parseToolResult(content: string): unknown {
  if (content.length > TOOL_RESULT_MAX_CHARS) {
    return undefined;
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

/** searchNames 的 found/keywords；不是这个工具的结果就返回 null。 */
function readSearchOutcome(
  content: string,
): { found: boolean; keywords: string[] } | null {
  const parsed = parseToolResult(content);
  if (
    !isRecord(parsed) ||
    parsed.ok !== true ||
    typeof parsed.found !== 'boolean'
  ) {
    return null;
  }

  const keywords = Array.isArray(parsed.keywords)
    ? uniqueNonEmpty(
        parsed.keywords.filter(
          (keyword): keyword is string => typeof keyword === 'string',
        ),
      )
    : [];
  return { found: parsed.found, keywords };
}

/**
 * 工具执行成功 ≠ 找到数据：查库零命中时，最终回复必须说「没找到」并列出
 * 已尝试的关键词（模型没说就由这里补一句，不让人误以为已经找到）。
 */
function appendMissedSearchNotice(reply: string, keywords: string[]): string {
  if (keywords.length === 0) {
    return reply;
  }

  const notice = `本地库没有找到匹配词条（已尝试关键词：${keywords.join('、')}）。`;
  const mentionsMiss = /没找到|没有找到|未找到/u.test(reply);
  const listsAllKeywords = keywords.every((keyword) => reply.includes(keyword));
  if (mentionsMiss && listsAllKeywords) {
    return reply;
  }

  const base = reply.trim();
  return truncate(base ? `${base}\n${notice}` : notice, REPLY_MAX);
}

/** 一次工具调用 → 响应里的留痕（含结构化结果与零命中关键词收集）。 */
function buildToolCallRecord(
  name: string,
  args: Record<string, unknown>,
  execution: {
    ok: boolean;
    content: string;
    error?: string;
    durationMs: number;
  },
  missedSearchKeywords: string[],
): AgentToolCallRecord {
  const result = parseToolResult(execution.content);
  if (name === 'searchNames') {
    const outcome = readSearchOutcome(execution.content);
    if (outcome) {
      if (outcome.found) {
        missedSearchKeywords.length = 0;
      } else {
        for (const keyword of outcome.keywords) {
          if (!missedSearchKeywords.includes(keyword)) {
            missedSearchKeywords.push(keyword);
          }
        }
      }
    }
  }

  return {
    name,
    args,
    ok: execution.ok,
    ...(execution.error ? { error: execution.error } : {}),
    ...(result !== undefined ? { result } : {}),
    durationMs: execution.durationMs,
  };
}

/** 把循环状态折成一份 AgentRunReport；成功、超时、失败共用。 */
function buildAgentRunReport(input: {
  runId: string;
  draftId: string;
  text: string;
  steps: number;
  toolCallCount: number;
  tokensIn: number;
  tokensOut: number;
  startedAt: number;
  stopReason: IngredientAgentStopReason | 'ERROR' | null;
  result: IngredientAgentRunOutcome;
  toolCalls: readonly AgentToolCallRecord[];
}): AgentRunReport {
  const toolNames: string[] = [];
  for (const call of input.toolCalls) {
    if (!toolNames.includes(call.name)) {
      toolNames.push(call.name);
    }
  }

  return {
    runId: input.runId,
    draftId: input.draftId,
    text: input.text,
    steps: input.steps,
    toolCalls: input.toolCallCount,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    stopReason: input.stopReason,
    tools: toolNames,
    failedTools: input.toolCalls
      .filter((call) => !call.ok)
      .map((call) => ({
        name: call.name,
        error: call.error ?? '工具执行失败（没有返回原因）。',
      })),
    result: input.result,
  };
}

/** 停止原因归一成报告里的四分类；工具 / token 硬保险丝算「撞上限」。 */
function resolveAgentRunOutcome(
  stopReason: IngredientAgentStopReason | null,
): IngredientAgentRunOutcome {
  if (!stopReason || stopReason === 'waiting_user') {
    return 'FINISHED';
  }
  if (stopReason === 'NO_PROGRESS') {
    return 'NO_PROGRESS';
  }
  return 'TIMEOUT';
}

function deriveDraftName(text: string): string {
  const firstLine = text.split(/\r?\n/)[0].trim();
  return truncate(firstLine || '未命名原料', 60);
}

/** 事件摘要都是一行，太长会撑坏左侧对话面板。 */
const STEP_SUMMARY_MAX = 120;

function readTextValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readDisplayValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return '—';
}

function oneLine(value: string, max = STEP_SUMMARY_MAX): string {
  return truncate(value.replace(/\s+/g, ' ').trim(), max);
}

/** 原料卡字段 → 中文，与页面同口径。 */
const INGREDIENT_STEP_FIELD_LABELS: Record<string, string> = {
  name: '名称',
  nameEn: '英文名',
  category: '类别',
  baseUnit: '基准单位',
  unitDisplayLabel: '展示名',
  cfctClass: 'CFCT',
  edibleYieldPercent: '可食部',
};

/**
 * 工具调用开始时的中文摘要，例如「查本地库 西洋菜·生」。
 *
 * 只做展示，不参与任何校验；模型传入未知工具 / 奇怪参数也不能抛错。
 */
export function buildToolStepSummary(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case 'searchNames': {
      const keyword = readTextValue(args.keyword) || '（未填关键词）';
      return oneLine(`查名字 ${keyword}`);
    }
    case 'summarizeNames': {
      const names = Array.isArray(args.names) ? args.names.length : 0;
      return oneLine(`汇总名字 ${names} 条`);
    }
    case 'getRecord': {
      const id =
        readTextValue(args.id) ||
        readTextValue(args.sourceRecordId) ||
        '（未填来源记录）';
      return oneLine(`读来源记录 ${id}`);
    }
    case 'writeNutrition': {
      const entries = Array.isArray(args.entries) ? args.entries.length : 0;
      const profileIndex =
        args.profileIndex === undefined
          ? '自动'
          : readDisplayValue(args.profileIndex);
      return oneLine(`写营养 档案 ${profileIndex} · ${entries} 项`);
    }
    case 'writeIngredient': {
      const fields = isRecord(args.fields) ? args.fields : {};
      const parts = Object.entries(fields)
        .filter(([key]) => key in INGREDIENT_STEP_FIELD_LABELS)
        .map(
          ([key, value]) =>
            `${INGREDIENT_STEP_FIELD_LABELS[key]}=${readDisplayValue(value)}`,
        );
      return oneLine(`改原料卡 ${parts.join(' · ') || '（无字段）'}`);
    }
    case 'runCheck':
      return '跑终检';
    case 'askUser':
      return oneLine(
        `向你提问 ${readTextValue(args.question) || '（未填问题）'}`,
      );
    case 'finish':
      return oneLine(
        readTextValue(args.summary) ? '结束本轮并给出结论' : '结束本轮',
      );
    default: {
      try {
        const argsText = JSON.stringify(args);
        return oneLine(
          `调用 ${name}${argsText && argsText !== '{}' ? ` ${argsText}` : ''}`,
        );
      } catch {
        return oneLine(`调用 ${name}`);
      }
    }
  }
}

/** 工具结束时的结果摘要；失败时统一写「执行失败」，具体原因放 error 字段。 */
export function buildToolResultSummary(
  name: string,
  execution: { ok: boolean; content: string },
): string {
  if (!execution.ok) {
    return '执行失败';
  }
  const result = parseToolResult(execution.content);
  if (!isRecord(result)) {
    return '完成';
  }

  switch (name) {
    case 'searchNames': {
      const total =
        typeof result.total === 'number' && Number.isFinite(result.total)
          ? Math.floor(result.total)
          : 0;
      const returned = Array.isArray(result.names) ? result.names.length : 0;
      if (result.found !== true) {
        return '没有找到匹配词条';
      }
      return `列出 ${total} 条名字（返回 ${returned} 条）`;
    }
    case 'summarizeNames': {
      if (result.degraded === true) {
        return '汇总完成（按关键词粗略计数）';
      }
      const byState = isRecord(result.byState) ? result.byState : {};
      const raw = typeof byState.RAW === 'number' ? byState.RAW : 0;
      const cooked = typeof byState.COOKED === 'number' ? byState.COOKED : 0;
      const total =
        typeof result.total === 'number' && Number.isFinite(result.total)
          ? Math.floor(result.total)
          : 0;
      return `汇总 ${total} 条 · 生 ${raw} / 熟 ${cooked}`;
    }
    case 'getRecord': {
      const record = isRecord(result.record) ? result.record : null;
      const count =
        record && Array.isArray(record.values) ? record.values.length : 0;
      return count > 0 ? `读到 ${count} 项营养值` : '没有可用的营养值';
    }
    case 'writeNutrition': {
      const applied = typeof result.applied === 'number' ? result.applied : 0;
      const failed = Array.isArray(result.failed) ? result.failed.length : 0;
      return failed > 0
        ? `写入 ${applied} 项，失败 ${failed} 项`
        : `写入 ${applied} 项`;
    }
    case 'writeIngredient': {
      const changed = Array.isArray(result.changed) ? result.changed.length : 0;
      const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0;
      if (changed === 0) {
        return skipped > 0
          ? `没有改动，跳过 ${skipped} 个字段`
          : '没有字段需要更新';
      }
      return skipped > 0
        ? `更新 ${changed} 个字段，跳过 ${skipped} 个`
        : `更新 ${changed} 个字段`;
    }
    case 'runCheck': {
      const counts = isRecord(result.counts) ? result.counts : {};
      if (result.passed === true) {
        const warnings =
          typeof counts.warnings === 'number' ? counts.warnings : 0;
        return `终检通过（${warnings} 条提醒）`;
      }
      const blocking =
        typeof counts.blocking === 'number' ? counts.blocking : 0;
      return `终检未通过（${blocking} 项拦死）`;
    }
    case 'askUser':
      return '等你回答';
    case 'finish':
      return '结束本轮';
    default:
      return '完成';
  }
}

/** 只有查库需要区分「工具成功」与「真的找到数据」。 */
function readToolFound(
  name: string,
  execution: { ok: boolean; content: string },
): boolean | undefined {
  if (name !== 'searchNames' || !execution.ok) {
    return undefined;
  }
  return readSearchOutcome(execution.content)?.found;
}

/** step_end 最多带 12 条命中（与单次检索 / 复核上限一致），页面要能逐条显示 AI 判断。 */
const STEP_MATCH_LIMIT = 12;
/** 关键词 / 词条名都是展示用，超长截断，避免单条事件体积失控。 */
const STEP_KEYWORD_MAX = 80;
const STEP_KEYWORD_LIMIT = 10;
const STEP_NAME_MAX = 120;

interface SearchStepEvidence {
  matches: IngredientAgentStreamMatch[];
  keywords: string[];
  candidateCount: number;
  totalCandidates: number;
  groups: IngredientAgentStreamGroup[];
  reviewSummary: IngredientAgentStreamReviewSummary | null;
}

function buildSearchStepEvidence(
  name: string,
  execution: { ok: boolean; content: string },
): SearchStepEvidence | null {
  if (name !== 'searchNames' || !execution.ok) {
    return null;
  }
  const parsed = parseToolResult(execution.content);
  if (
    !isRecord(parsed) ||
    parsed.ok !== true ||
    typeof parsed.found !== 'boolean'
  ) {
    return null;
  }

  const matches: IngredientAgentStreamMatch[] = [];
  const matchedKeyword = truncate(
    readTextValue(parsed.keyword),
    STEP_KEYWORD_MAX,
  );
  if (Array.isArray(parsed.names)) {
    for (const entry of parsed.names) {
      if (!isRecord(entry)) {
        continue;
      }
      matches.push({
        name:
          oneLine(readTextValue(entry.name) || '（未知词条）', STEP_NAME_MAX) ||
          '（未知词条）',
        // searchNames 只按名字命中；没有 AI 复核与分类。
        matchedBy: 'NAME',
        matchedKeyword,
        score: null,
      });
      if (matches.length >= STEP_MATCH_LIMIT) {
        break;
      }
    }
  }

  const keywords = (Array.isArray(parsed.keywords) ? parsed.keywords : [])
    .filter((keyword): keyword is string => typeof keyword === 'string')
    .map((keyword) => truncate(keyword.trim(), STEP_KEYWORD_MAX))
    .filter(Boolean);
  const uniqueKeywords = uniqueNonEmpty(keywords).slice(0, STEP_KEYWORD_LIMIT);

  const candidateCount =
    typeof parsed.total === 'number' &&
    Number.isFinite(parsed.total) &&
    parsed.total >= 0
      ? Math.floor(parsed.total)
      : matches.length;
  const totalCandidates =
    typeof parsed.total === 'number' &&
    Number.isFinite(parsed.total) &&
    parsed.total >= 0
      ? Math.floor(parsed.total)
      : candidateCount;

  const groups: IngredientAgentStreamGroup[] = [];
  if (Array.isArray(parsed.groups)) {
    for (const group of parsed.groups) {
      if (!isRecord(group)) {
        continue;
      }
      const key = readTextValue(group.key);
      const label = readTextValue(group.label);
      const count =
        typeof group.count === 'number' &&
        Number.isFinite(group.count) &&
        group.count >= 0
          ? Math.floor(group.count)
          : 0;
      if (!key || !label) {
        continue;
      }
      groups.push({
        key,
        label,
        count,
        states: (Array.isArray(group.states) ? group.states : []).filter(
          (state): state is PreparationState =>
            state === 'RAW' || state === 'COOKED',
        ),
      });
    }
  }

  const reviewSummary = isRecord(parsed.reviewSummary)
    ? {
        relevantCount:
          typeof parsed.reviewSummary.relevantCount === 'number' &&
          Number.isFinite(parsed.reviewSummary.relevantCount)
            ? Math.max(0, Math.floor(parsed.reviewSummary.relevantCount))
            : 0,
        uncertainCount:
          typeof parsed.reviewSummary.uncertainCount === 'number' &&
          Number.isFinite(parsed.reviewSummary.uncertainCount)
            ? Math.max(0, Math.floor(parsed.reviewSummary.uncertainCount))
            : 0,
        irrelevantCount:
          typeof parsed.reviewSummary.irrelevantCount === 'number' &&
          Number.isFinite(parsed.reviewSummary.irrelevantCount)
            ? Math.max(0, Math.floor(parsed.reviewSummary.irrelevantCount))
            : 0,
        failed: parsed.reviewSummary.failed === true,
      }
    : null;

  return {
    matches,
    keywords: uniqueKeywords,
    candidateCount,
    totalCandidates,
    groups,
    reviewSummary,
  };
}

/**
 * 读来源记录 step_end 的摘要：词条名 / 覆盖率 / 读到多少项。
 *
 * `valueCount` 统计记录里真实存在的目录字段（含因目录上限被省略的项），
 * 不补 0、不推算。
 */
function buildRecordStepEvidence(
  name: string,
  execution: { ok: boolean; content: string },
): IngredientAgentStreamRecord | null {
  if (name !== 'getRecord' || !execution.ok) {
    return null;
  }
  const parsed = parseToolResult(execution.content);
  if (!isRecord(parsed) || parsed.ok !== true || !isRecord(parsed.record)) {
    return null;
  }

  const record = parsed.record;
  const values = Array.isArray(record.values) ? record.values.length : 0;
  const omitted =
    typeof record.omittedFieldCount === 'number' &&
    Number.isFinite(record.omittedFieldCount) &&
    record.omittedFieldCount > 0
      ? Math.floor(record.omittedFieldCount)
      : 0;
  return {
    name:
      oneLine(readTextValue(record.name) || '（未知词条）', STEP_NAME_MAX) ||
      '（未知词条）',
    coverage:
      typeof record.coverage === 'number' && Number.isFinite(record.coverage)
        ? record.coverage
        : null,
    valueCount: values + omitted,
  };
}

/** 流式错误事件要给人看：HTTP 异常取业务文案，其余一律按 AI 暂不可用兜底。 */
function readStreamErrorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string' && response.trim()) {
      return response.trim();
    }
    if (isRecord(response)) {
      const message = response.message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
      if (Array.isArray(message)) {
        const text = message
          .filter((entry): entry is string => typeof entry === 'string')
          .join('；');
        if (text) {
          return text;
        }
      }
    }
    if (error.message.trim()) {
      return error.message.trim();
    }
  }
  return AI_TEMPORARILY_UNAVAILABLE_MESSAGE;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'This operation was aborted')
  );
}

/** 读 usage.total_tokens；兼容 prompt/completion 两段式，读不到返回 0。 */
function readUsage(body: unknown): AgentUsage {
  const usage = isRecord(body) && isRecord(body.usage) ? body.usage : null;
  if (!usage) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  const readNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : null;

  const total = readNumber(usage.total_tokens ?? usage.totalTokens);
  const prompt = readNumber(usage.prompt_tokens ?? usage.promptTokens);
  const completion = readNumber(
    usage.completion_tokens ?? usage.completionTokens,
  );

  let promptTokens = prompt ?? 0;
  let completionTokens = completion ?? 0;
  let totalTokens = total ?? promptTokens + completionTokens;

  // 只给了 total 时按输入记，输出记 0：不猜供应商没给的拆分。
  if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
    promptTokens = totalTokens;
  }
  if (totalTokens === 0 && promptTokens + completionTokens > 0) {
    totalTokens = promptTokens + completionTokens;
  }
  if (totalTokens > 0 && completionTokens === 0 && prompt !== null) {
    completionTokens = Math.max(0, totalTokens - promptTokens);
  }
  if (totalTokens > 0 && prompt === null && completionTokens > 0) {
    promptTokens = Math.max(0, totalTokens - completionTokens);
  }

  return { promptTokens, completionTokens, totalTokens };
}

function readChoiceMessage(body: unknown): Record<string, unknown> | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return null;
  }
  const first = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }
  return first.message;
}

function normalizeToolCalls(value: unknown): AgentToolCallPayload[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const calls: AgentToolCallPayload[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry) || !isRecord(entry.function)) {
      return;
    }
    const name =
      typeof entry.function.name === 'string' ? entry.function.name.trim() : '';
    if (!name) {
      return;
    }
    const rawArguments =
      typeof entry.function.arguments === 'string'
        ? entry.function.arguments
        : JSON.stringify(entry.function.arguments ?? {});
    const id =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id
        : `call_${index + 1}`;
    calls.push({
      id,
      type: 'function',
      function: { name, arguments: rawArguments },
    });
  });

  return calls;
}

function parseJsonAction(
  content: string,
): { tool?: unknown; args?: unknown; reply?: unknown } | null {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    const parsed: unknown = JSON.parse(stripped);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 营养字段目录按表分组，压成几行塞进提示词，让模型知道合法路径与单位。 */
function buildCatalogPromptLines(): string[] {
  const lines: string[] = [];
  const tabs = [
    'macros',
    'minerals',
    'vitamins',
    'fattyAcids',
    'aminoAcids',
  ] as const;

  for (const tab of tabs) {
    const fields = NUTRITION_FIELD_CATALOG.filter(
      (field) => field.tabKey === tab,
    ).map((field) => `${field.fieldKey}(${field.unit})`);
    if (fields.length > 0) {
      lines.push(`- ${tab}: ${fields.join(', ')}`);
    }
  }

  return lines;
}

/** 当前草稿摘要：让模型知道已有几份档案、哪些字段填过。 */
function buildDraftPromptLines(draft: IngredientCreationDraft): string[] {
  const lines = [
    `草稿 id：${draft.id}`,
    `草稿名称：${draft.name}`,
    `当前站点：${draft.step}`,
  ];

  const intake = isRecord(draft.payload.intake) ? draft.payload.intake : null;
  if (intake && Array.isArray(intake.requiredStates)) {
    lines.push(
      `必需的营养档案状态：${intake.requiredStates
        .filter((state) => typeof state === 'string')
        .join('、')}`,
    );
  }

  const ingredient = isRecord(draft.payload.ingredient)
    ? draft.payload.ingredient
    : null;
  if (ingredient) {
    const percent =
      typeof ingredient.edibleYieldRate === 'number'
        ? `${Math.round(ingredient.edibleYieldRate * 10000) / 100}%`
        : '待补';
    lines.push(
      `原料卡：名称=${String(ingredient.name ?? '')} 英文名=${String(
        ingredient.nameEn ?? '待补',
      )} 类别=${String(ingredient.category ?? '待补')} 基准单位=${String(
        ingredient.baseUnit ?? 'G',
      )} 展示名=${String(ingredient.unitDisplayLabel ?? '')} CFCT=${String(
        ingredient.cfctClass ?? '待补',
      )} 可食部=${percent}`,
    );
    const manualFields = Array.isArray(ingredient.manualFields)
      ? ingredient.manualFields.filter((field) => typeof field === 'string')
      : [];
    if (manualFields.length > 0) {
      lines.push(
        `人工审核已改字段（writeIngredient 会拒绝覆盖，不要重复尝试）：${manualFields.join('、')}`,
      );
    }
  } else {
    lines.push(
      '（草稿还没有原料卡。可用 writeIngredient.fields 写名称 / 英文名 / 类别 / 基准单位 / 展示名 / CFCT 分类 / 可食部。）',
    );
  }

  const profiles = Array.isArray(draft.payload.profiles)
    ? draft.payload.profiles
    : [];
  lines.push(`营养档案数：${profiles.length}`);

  profiles.slice(0, 10).forEach((profile, index) => {
    if (!isRecord(profile)) return;
    const entries = Array.isArray(profile.entries) ? profile.entries : [];
    const filled = entries
      .filter((entry) => isRecord(entry))
      .slice(0, 30)
      .map(
        (entry) =>
          `${String(entry.fieldPath)}=${String(entry.finalValue)}${
            entry.unit ? String(entry.unit) : ''
          }`,
      )
      .join('、');
    lines.push(
      `- [${index}] 状态=${String(profile.preparationState)} 来源=${String(
        profile.sourceRecordId,
      )}；已填 ${entries.length} 项：${filled || '无'}`,
    );
  });

  if (profiles.length === 0) {
    lines.push(
      '（草稿还没有营养档案。第一次写入用 writeNutrition：省略 profileIndex，并按来源记录带上 sourceRecordId，工具会按来源的生熟状态建档案。）',
    );
  }

  return lines;
}

function buildSystemPrompt(
  draft: IngredientCreationDraft,
  mode: IngredientAgentMode,
  toolNames: readonly string[],
): string {
  const lines = [
    '你是宠物鲜食后台的「AI 添加原料」助手。你的工作是通过工具把一份**草稿**填好；正式原料与营养档案不在你的权限内。',
    '',
    '硬规则（工具层写死，绕不过）：',
    '- 只能读写草稿。系统没有提交、确认可用、批准例外的工具；不要假装能做，也不要建议用户让你做。',
    '- 每条营养写入都必须带 sourceRecordId。没有来源的数值一律不写：先 searchNames 找词条、getRecord 读来源。',
    '- 字段必须在营养字段目录里，单位必须与目录一致。工具报错就按错误文本改参数后重试；连续改不出来就停下，说明卡在哪。',
    '- 不要编造营养数值。只写来源记录里有的值，或用户明确给出的值。',
    '- 你可以自由决定工具调用顺序；调用 finish 结束本轮。',
    '',
    '作业指引（完整版：skills/ingredient-agent/SKILL.md）：',
    '- 模糊词（牛肉 / 山药 / 鸡肝）先 searchNames 看 total；命中多就先 summarizeNames 看分布，再按「状态 → 部位 → 具体词条」的顺序用 askUser 收窄。不要自己按关键词猜部位。',
    '- 生熟可以多选：用户说「生 + 熟都要」就分别找生、熟来源，建两份档案；不要替用户默认只做生。',
    '- 候选多时按组给，每组最多 5 条 + 最后一条「都不对，我直接说」；该组只剩 1 条时直接用它，并在结论里说明理由。',
    '- 拿不准就问（部位 / 加工态 / 种类有歧义、多个候选难分、主次不明），不要自己挑一条凑合。一次只问一个问题，给 2–5 个具体可点选项。',
    '- summarizeNames 返回 degraded=true 时，据实说明「AI 分类不可用，数字是粗算」，不要把粗算当精确分类。',
    '- searchNames 返回 found=false 时，必须明确说「没有找到匹配词条」并列出 keywords 里已尝试的关键词；不要写成「成功找到」。',
    '- 最终结论用一两句中文：改了什么、还缺什么、下一步建议；找不到数据时先说「没找到」。不要粘贴 JSON。',
    `- 本轮预算：最多 ${INGREDIENT_AGENT_MAX_TOOL_CALLS} 次工具调用 / ${INGREDIENT_AGENT_TIMEOUT_MS / 1000} 秒；连续 ${INGREDIENT_AGENT_MAX_NO_PROGRESS} 次工具调用没有新进展会被系统停止。`,
    `可用工具：${toolNames.join('、')}`,
    '',
    '【营养字段目录】fieldPath 形如「表名.字段名」，单位必须用括号里的目录单位：',
    ...buildCatalogPromptLines(),
    '',
    '【当前草稿】',
    ...buildDraftPromptLines(draft),
    '',
  ];

  if (mode === 'FUNCTION_CALLING') {
    lines.push(
      '需要调用工具时使用 function calling。不需要工具时直接输出最终回复文本。',
    );
  } else {
    lines.push(
      '【输出格式（JSON 动作模式）】只输出 JSON，不要 Markdown、不要解释。两种之一：',
      '{"tool":"工具名","args":{...}}',
      '{"reply":"最终回复"}',
    );
  }

  return lines.join('\n');
}

/**
 * 读取草稿里存的选项核实结果。
 *
 * 旧草稿没有 `optionChecks`；这里只在它确实是数组时补默认值，
 * 不因为缺字段就让整份问题读不出来。
 */
function readPendingQuestionOptionChecks(
  value: unknown,
  options: readonly string[],
): PendingQuestionOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return options.map((label, index) => {
    const raw = isRecord(value[index]) ? value[index] : null;
    const inLibrary =
      raw && typeof raw.inLibrary === 'boolean' ? raw.inLibrary : null;
    const matchedName =
      raw && typeof raw.matchedName === 'string' && raw.matchedName.trim()
        ? raw.matchedName.trim()
        : null;
    const displayLabel =
      raw && typeof raw.displayLabel === 'string' && raw.displayLabel.trim()
        ? raw.displayLabel.trim()
        : label;
    const candidateLabel =
      raw && typeof raw.candidateLabel === 'string' && raw.candidateLabel.trim()
        ? raw.candidateLabel.trim()
        : null;
    const aiVerdict =
      raw &&
      (raw.aiVerdict === 'RELEVANT' ||
        raw.aiVerdict === 'UNCERTAIN' ||
        raw.aiVerdict === 'IRRELEVANT')
        ? raw.aiVerdict
        : null;
    const aiReason =
      raw && typeof raw.aiReason === 'string' ? raw.aiReason.trim() : '';

    return {
      label,
      inLibrary,
      matchedName,
      displayLabel,
      ...(candidateLabel ? { candidateLabel } : {}),
      ...(aiVerdict ? { aiVerdict, aiReason } : {}),
    };
  });
}

/**
 * 读草稿里存的问题；payload 可以被人工编辑，认不出来就当没有。
 *
 * 只用于拼提示词，所以缺 `askedAt` 时补空串而不是拒绝整条问题。
 */
function readPendingQuestion(value: unknown): PendingQuestion | null {
  if (!isRecord(value)) {
    return null;
  }
  const question =
    typeof value.question === 'string' ? value.question.trim() : '';
  if (!question) {
    return null;
  }
  const options = Array.isArray(value.options)
    ? value.options
        .filter(
          (option): option is string =>
            typeof option === 'string' && option.trim().length > 0,
        )
        .map((option) => option.trim())
    : [];
  const askedAt = typeof value.askedAt === 'string' ? value.askedAt.trim() : '';
  const optionChecks = readPendingQuestionOptionChecks(
    value.optionChecks,
    options,
  );
  return {
    question,
    options,
    ...(optionChecks.length > 0 ? { optionChecks } : {}),
    askedAt,
  };
}

/** 回答上一轮的问题时，把「问过什么 + 用户答了什么」一起交给模型。 */
function buildUserPrompt(
  text: string,
  pendingQuestion: PendingQuestion | null,
): string {
  if (!pendingQuestion) {
    return text;
  }

  const lines = [`你刚问：${pendingQuestion.question}`, `用户答：${text}`];
  const selected = pendingQuestion.optionChecks?.find(
    (option) => option.label === text || option.displayLabel === text,
  );
  if (selected?.inLibrary === false) {
    // 用户点了一个本地库没有的选项：明确告诉他走线上或留空，绝不编数值。
    lines.push(
      '（这个选项库里未收录：请走线上检索；线上也没有就先留空，不要编造营养数值。）',
    );
  } else if (selected?.inLibrary === true) {
    lines.push(
      `（这个选项库里已收录${
        selected.matchedName ? `：${selected.matchedName}` : ''
      }；请优先用本地来源。）`,
    );
  }
  if (selected?.aiVerdict) {
    const verdictText =
      selected.aiVerdict === 'RELEVANT'
        ? '相关'
        : selected.aiVerdict === 'IRRELEVANT'
          ? '不相关'
          : '存疑';
    lines.push(
      `（AI 当时的判断：${verdictText}${
        selected.aiReason ? `——${selected.aiReason}` : ''
      }。用户已经选了这条，以用户的选择为准。）`,
    );
  }
  lines.push(
    '（请按用户回答继续；不要假装早已知道答案，也不要重复问同一个问题。）',
  );
  return lines.join('\n');
}

function buildInitialMessages(
  draft: IngredientCreationDraft,
  text: string,
  mode: IngredientAgentMode,
  toolNames: readonly string[],
  pendingQuestion: PendingQuestion | null = null,
): AgentMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(draft, mode, toolNames) },
    { role: 'user', content: buildUserPrompt(text, pendingQuestion) },
  ];
}

interface DraftProgressSummary {
  profileCount: number;
  entryCount: number;
  missingFieldCount: number;
}

/** 停止时按**库里的最终草稿**统计，不用中途快照。 */
function summarizeDraftProgress(
  draft: IngredientCreationDraft,
): DraftProgressSummary {
  const profiles = Array.isArray(draft.payload.profiles)
    ? draft.payload.profiles
    : [];
  let entryCount = 0;
  // 没有档案时整份目录都缺；有多份时按「最不完整的那份」报，避免熟档案空着却显示已齐。
  let missingFieldCount =
    profiles.length === 0 ? NUTRITION_FIELD_CATALOG.length : 0;

  for (const profile of profiles) {
    // payload 可以被人工编辑，停止摘要不能因为一份脏档案把整轮打成 500。
    if (!isRecord(profile)) {
      continue;
    }
    const entries = Array.isArray(profile.entries) ? profile.entries : [];
    entryCount += entries.length;

    const fieldPaths = new Set<string>();
    for (const entry of entries) {
      if (
        isRecord(entry) &&
        typeof entry.fieldPath === 'string' &&
        entry.fieldPath
      ) {
        fieldPaths.add(entry.fieldPath);
      }
    }
    const missing = NUTRITION_FIELD_CATALOG.filter(
      (field) => !fieldPaths.has(field.fieldPath),
    ).length;
    missingFieldCount = Math.max(missingFieldCount, missing);
  }

  return {
    profileCount: profiles.length,
    entryCount,
    missingFieldCount,
  };
}

/**
 * 停止回复：先说为什么停、做了多少、还剩什么，最后明确草稿不回滚。
 *
 * `NO_PROGRESS` 的文案必须含「没有新进展」，这是线上排查与用户提示的锚点。
 */
function buildStopReply(input: {
  reason: Exclude<IngredientAgentStopReason, 'waiting_user'>;
  steps: number;
  toolCallCount: number;
  seenSourceCount: number;
  draft: IngredientCreationDraft;
  lastCheck: AgentCheckSummary | null;
}): string {
  const reasonText: Record<
    Exclude<IngredientAgentStopReason, 'waiting_user'>,
    string
  > = {
    NO_PROGRESS: `连续 ${INGREDIENT_AGENT_MAX_NO_PROGRESS} 次工具调用没有新进展，我停了下来`,
    TIMEOUT: `我跑到上限了（总时长 ${INGREDIENT_AGENT_TIMEOUT_MS / 1000} 秒用完）`,
    TOKEN_BUDGET: '我跑到上限了（本轮 token 成本预算用完了）',
    TOOL_CALL_LIMIT: `我跑到上限了（单轮最多 ${INGREDIENT_AGENT_MAX_TOOL_CALLS} 次工具调用）`,
  };
  const summary = summarizeDraftProgress(input.draft);
  const checkText = input.lastCheck
    ? input.lastCheck.passed
      ? `终检已通过（还有 ${input.lastCheck.warnings} 条提醒）`
      : `终检还没过（${input.lastCheck.blocking} 项拦死、${input.lastCheck.exceptionable} 项可例外）`
    : '还没跑终检';

  return truncate(
    `${reasonText[input.reason]}（共 ${input.steps} 轮、${input.toolCallCount} 次工具调用）。` +
      `已完成：写入 ${summary.entryCount} 条营养值（${summary.profileCount} 份营养档案），检索到 ${input.seenSourceCount} 条来源。` +
      `还没做完：${checkText}；营养目录 ${NUTRITION_FIELD_CATALOG.length} 项里，最不完整的一份档案还有 ${summary.missingFieldCount} 项没有值。` +
      '已写入的草稿内容保持不动，请人工检查还没做完的部分。',
    REPLY_MAX,
  );
}

/**
 * AI 起草循环（P1）。
 *
 * 只做一件事：把一句话 + 草稿交给模型，让它在**受控长度**内自己调工具
 * （查库 → 写字段 → 跑校验 → 按报错改），直到给出最终回复或撞上限。
 *
 * 安全边界不靠模型自觉：
 * - 工具层只有 8 个原子工具，全部只碰草稿；提交 / 确认可用不在这里；
 * - 硬保险丝：200 次工具调用 / 600 秒 / 可配 token 预算；
 * - 软停止：连续 3 次工具调用没有新进展（不写字段、不发现新来源）就停；
 * - 停下来不回滚：已写入的草稿保持原样，reply 说明还剩什么；
 * - 模型 / 配置失败直接 503，不偷偷回退到规则猜。
 */
@Injectable()
export class IngredientDraftAgentService {
  private readonly logger = new Logger(IngredientDraftAgentService.name);
  /**
   * 已探测到的可用输出上限：key = baseUrl|model。
   *
   * 首次调用时从 8192 往上试；成功后缓存，之后同一个模型的所有请求
   * 都直接用这个值。不同模型可能上限不同，所以按模型分别缓存。
   */
  private readonly outputLimitCache = new Map<string, number>();

  constructor(
    private readonly agentProviderConfig: AgentProviderConfigService,
    private readonly toolsService: IngredientCreationToolsService,
    private readonly draftService: IngredientCreationDraftService,
  ) {}

  /**
   * 跑一轮起草。
   *
   * 传了 `onEvent` 就边跑边推流；不传时行为与旧的非流式接口完全一致。
   * `reply` / `done` 只在成功收尾时发；任何异常都先发 `error` 再把原异常抛给
   * 非流式调用方（流式控制器会吞掉，避免已发出的错误再变成 HTTP 500）。
   */
  async run(
    input: RunIngredientAgentInput,
    onEvent?: (event: IngredientAgentStreamEvent) => void,
  ): Promise<IngredientAgentRunResult> {
    // 兼容两种接法：把回调放进 input，或作为第二个参数传入。
    const effectiveInput = onEvent ? { ...input, onEvent } : input;
    try {
      const result = await this.runLoop(effectiveInput);
      if (result.stopReason === 'waiting_user' && result.pendingQuestion) {
        // 等用户回答：只发 ask + done，不发「最终回复」，页面不把问题当结论。
        this.emitEvent(effectiveInput.onEvent, {
          type: 'ask',
          question: result.pendingQuestion.question,
          options: result.pendingQuestion.options,
          ...(result.pendingQuestion.optionChecks
            ? { optionChecks: result.pendingQuestion.optionChecks }
            : {}),
          draftId: result.draftId,
          report: result.report,
        });
        this.emitEvent(effectiveInput.onEvent, {
          type: 'done',
          report: result.report,
        });
        return result;
      }
      this.emitEvent(effectiveInput.onEvent, {
        type: 'reply',
        reply: result.reply,
        draftId: result.draftId,
        steps: result.steps,
        toolCallCount: result.toolCallCount,
        report: result.report,
      });
      this.emitEvent(effectiveInput.onEvent, {
        type: 'done',
        report: result.report,
      });
      return result;
    } catch (error) {
      // 循环内部已把失败折成报告；error 事件也带上，页面失败态也能显示耗时。
      const failure = error instanceof AgentRunFailedError ? error : null;
      const cause = failure ? failure.causeError : error;
      this.emitEvent(effectiveInput.onEvent, {
        type: 'error',
        message: readStreamErrorMessage(cause),
        ...(failure ? { report: failure.report } : {}),
      });
      throw cause;
    }
  }

  private emitEvent(
    onEvent: RunIngredientAgentInput['onEvent'],
    event: IngredientAgentStreamEvent,
  ): void {
    if (!onEvent) {
      return;
    }
    try {
      onEvent(event);
    } catch (error) {
      // 页面关了 / 网络断了不应该让 AI 循环崩掉；事件是展示层的旁路。
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[ingredient-agent] 流式事件发送失败（客户端可能已断开）：${reason}`,
      );
    }
  }

  /**
   * 执行一次工具调用，并在开始 / 结束时各发一条事件。
   *
   * 参数解析失败也走这里：页面仍能看到这一步「开始 → 失败」，
   * 而不是整轮只剩一句最终报错。
   */
  private async executeToolStep(input: {
    onEvent: RunIngredientAgentInput['onEvent'];
    index: number;
    name: string;
    args: Record<string, unknown>;
    runId: string;
    draftId: string;
    parseError?: string | null;
  }): Promise<AgentToolExecution> {
    this.emitEvent(input.onEvent, {
      type: 'step_start',
      index: input.index,
      name: input.name,
      summary: buildToolStepSummary(input.name, input.args),
    });

    const execution: AgentToolExecution = input.parseError
      ? {
          ok: false,
          error: input.parseError,
          content: JSON.stringify({ ok: false, error: input.parseError }),
          durationMs: 0,
        }
      : await this.toolsService.execute({
          runId: input.runId,
          draftId: input.draftId,
          name: input.name,
          args: input.args,
        });

    const found = readToolFound(input.name, execution);
    const searchEvidence = buildSearchStepEvidence(input.name, execution);
    const recordEvidence = buildRecordStepEvidence(input.name, execution);
    this.emitEvent(input.onEvent, {
      type: 'step_end',
      index: input.index,
      ok: execution.ok,
      resultSummary: buildToolResultSummary(input.name, execution),
      ...(found === undefined ? {} : { found }),
      ...(execution.error ? { error: execution.error } : {}),
      durationMs: execution.durationMs,
      ...(searchEvidence
        ? {
            matches: searchEvidence.matches,
            keywords: searchEvidence.keywords,
            candidateCount: searchEvidence.candidateCount,
            totalCandidates: searchEvidence.totalCandidates,
            groups: searchEvidence.groups,
            ...(searchEvidence.reviewSummary
              ? { reviewSummary: searchEvidence.reviewSummary }
              : {}),
          }
        : {}),
      ...(recordEvidence ? { record: recordEvidence } : {}),
    });

    return execution;
  }

  private async runLoop(
    input: RunIngredientAgentInput,
  ): Promise<IngredientAgentRunResult> {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) {
      throw new BadRequestException('请输入要添加的原料');
    }

    const runtime = await this.loadRuntimeConfig();
    const startedAt = Date.now();
    const deadline = startedAt + INGREDIENT_AGENT_TIMEOUT_MS;
    const tokenBudget = resolveIngredientAgentTokenBudget();
    const runId = randomUUID();

    // 没有 draftId 时先建草稿；从这里开始，AI 的所有写入都只落在这份草稿上。
    const draft = input.draftId
      ? await this.draftService.get(input.draftId)
      : await this.draftService.create({
          name: deriveDraftName(text),
          type: 'FOOD',
          createdBy: input.userId,
        });

    const toolDefinitions = this.toolsService.getDefinitions();
    const toolNames = this.toolsService.availableToolNames();
    const models = uniqueNonEmpty([runtime.model, runtime.reviewModel]);
    if (models.length === 0) {
      throw new ServiceUnavailableException(AI_NOT_CONFIGURED_MESSAGE);
    }

    /**
     * 上一轮问过的问题：带同一 draftId 再跑时，用户这句话就是答案。
     *
     * 先把问答拼进提示词，再把草稿里的问题置 null（清空），避免同一个问题
     * 被下一次 run 重复消费、重复追问。
     */
    const previousQuestion = readPendingQuestion(draft.payload.pendingQuestion);
    if (previousQuestion) {
      await this.draftService.patch(draft.id, draft.step, {
        pendingQuestion: null,
      });
      draft.payload.pendingQuestion = null;
    }

    let mode: IngredientAgentMode = 'FUNCTION_CALLING';
    let messages = buildInitialMessages(
      draft,
      text,
      mode,
      toolNames,
      previousQuestion,
    );
    let steps = 0;
    let toolCallCount = 0;
    let tokensUsed = 0;
    let tokensIn = 0;
    let tokensOut = 0;
    let noProgressStreak = 0;
    let reply = '';
    let stopReason: IngredientAgentStopReason | null = null;
    let pendingQuestion: PendingQuestion | null = null;
    let lastCheck: AgentCheckSummary | null = null;
    const seenSourceIds = new Set<string>();
    const toolCalls: AgentToolCallRecord[] = [];
    /** 查库零命中的关键词；后续真找到数据就清空。 */
    const missedSearchKeywords: string[] = [];
    const transcript: AgentTranscriptEntry[] = [];

    this.logger.log(
      `[ingredient-agent] runStart runId=${runId} draft=${draft.id} mode=${mode} ` +
        `maxToolCalls=${INGREDIENT_AGENT_MAX_TOOL_CALLS} timeoutMs=${INGREDIENT_AGENT_TIMEOUT_MS} ` +
        `tokenBudget=${tokenBudget}`,
    );

    try {
      // 不设固定「步数」上限：模型一轮可能带很多 tool_call，循环靠硬保险丝 + 进展感知收口。
      runLoop: while (true) {
        if (toolCallCount >= INGREDIENT_AGENT_MAX_TOOL_CALLS) {
          stopReason = 'TOOL_CALL_LIMIT';
          break;
        }
        if (Date.now() >= deadline) {
          stopReason = 'TIMEOUT';
          break;
        }
        if (tokenBudget > 0 && tokensUsed >= tokenBudget) {
          stopReason = 'TOKEN_BUDGET';
          break;
        }

        steps += 1;
        const remainingMs = Math.max(1, deadline - Date.now());
        this.logger.log(
          `[ingredient-agent] step=${steps} runId=${runId} draft=${draft.id} ` +
            `mode=${mode} toolCalls=${toolCallCount}/${INGREDIENT_AGENT_MAX_TOOL_CALLS} ` +
            `tokens=${tokensUsed}/${tokenBudget} remainingMs=${remainingMs}`,
        );

        let turn: AgentAssistantTurn;
        try {
          turn = await this.callModelWithRetry({
            runtime,
            models,
            mode,
            messages,
            toolDefinitions,
            deadline,
            runId,
            step: steps,
          });
        } catch (error) {
          // 总时长用完不算 AI 故障：把已完成的 transcript 交回，让人接着看。
          if (
            error instanceof AgentDeadlineExceededError ||
            Date.now() >= deadline
          ) {
            stopReason = 'TIMEOUT';
            this.logger.warn(
              `[ingredient-agent] 总时长用完 runId=${runId} draft=${draft.id} steps=${steps}`,
            );
            break;
          }

          // 只在第一步、还没产生任何工具结果时退化：之前的 messages 里没有
          // role=tool，重建成 JSON 动作协议不会丢掉任何上下文。
          if (
            error instanceof AgentToolsUnsupportedError &&
            mode === 'FUNCTION_CALLING' &&
            steps === 1 &&
            toolCalls.length === 0
          ) {
            mode = 'JSON_ACTION';
            messages = buildInitialMessages(
              draft,
              text,
              mode,
              toolNames,
              previousQuestion,
            );
            steps -= 1;
            this.logger.warn(
              `[ingredient-agent] 模型不支持 tools，退化为 JSON 动作模式 runId=${runId} draft=${draft.id}`,
            );
            continue;
          }

          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `[ingredient-agent] 模型调用失败 runId=${runId} draft=${draft.id} ` +
              `step=${steps} mode=${mode}: ${reason}`,
          );
          throw new ServiceUnavailableException(
            AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
          );
        }

        tokensUsed += turn.usage.totalTokens;
        tokensIn += turn.usage.promptTokens;
        tokensOut += turn.usage.completionTokens;

        if (mode === 'FUNCTION_CALLING') {
          messages.push({
            role: 'assistant',
            content: turn.content || null,
            ...(turn.toolCalls.length > 0
              ? { tool_calls: turn.toolCalls }
              : {}),
          });

          if (turn.toolCalls.length === 0) {
            reply = this.normalizeReply(turn.content);
            transcript.push({
              step: steps,
              type: 'reply',
              atMs: Date.now() - startedAt,
              summary: truncate(reply, TRANSCRIPT_SUMMARY_MAX),
            });
            break;
          }

          for (const call of turn.toolCalls) {
            // 硬保险丝：动作数到时立即停，不再执行后面的 tool_call。
            if (toolCallCount >= INGREDIENT_AGENT_MAX_TOOL_CALLS) {
              stopReason = 'TOOL_CALL_LIMIT';
              break runLoop;
            }
            if (Date.now() >= deadline) {
              stopReason = 'TIMEOUT';
              break runLoop;
            }

            toolCallCount += 1;
            const toolName = call.function.name;
            const { args, parseError } = this.parseToolArguments(
              call.function.arguments,
            );

            transcript.push({
              step: steps,
              type: 'tool_call',
              atMs: Date.now() - startedAt,
              tool: toolName,
              args,
            });

            const execution = await this.executeToolStep({
              onEvent: input.onEvent,
              index: toolCallCount,
              name: toolName,
              args,
              runId,
              draftId: draft.id,
              parseError,
            });

            toolCalls.push(
              buildToolCallRecord(
                toolName,
                args,
                execution,
                missedSearchKeywords,
              ),
            );
            transcript.push({
              step: steps,
              type: 'tool_result',
              atMs: Date.now() - startedAt,
              tool: toolName,
              ok: execution.ok,
              ...(execution.error ? { error: execution.error } : {}),
              summary: truncate(execution.content, TRANSCRIPT_SUMMARY_MAX),
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: execution.content,
            });

            // finish 是明确的结束信号：立刻收尾，同一条回复里剩下的 tool_call 不再执行。
            if (execution.finished) {
              reply = this.resolveFinishReply(
                execution.finished.reply,
                turn.content,
              );
              transcript.push({
                step: steps,
                type: 'reply',
                atMs: Date.now() - startedAt,
                summary: truncate(reply, TRANSCRIPT_SUMMARY_MAX),
              });
              break runLoop;
            }

            if (
              this.recordProgress(execution, seenSourceIds, (check) => {
                lastCheck = check;
              })
            ) {
              noProgressStreak = 0;
            } else {
              noProgressStreak += 1;
            }

            // 问完人立刻收尾：同一轮里剩下的 tool_call 不再执行，避免它先猜着写。
            if (execution.pendingQuestion) {
              pendingQuestion = execution.pendingQuestion;
              stopReason = 'waiting_user';
              break runLoop;
            }

            if (Date.now() >= deadline) {
              stopReason = 'TIMEOUT';
              break runLoop;
            }
            if (toolCallCount >= INGREDIENT_AGENT_MAX_TOOL_CALLS) {
              stopReason = 'TOOL_CALL_LIMIT';
              break runLoop;
            }
            if (noProgressStreak >= INGREDIENT_AGENT_MAX_NO_PROGRESS) {
              stopReason = 'NO_PROGRESS';
              break runLoop;
            }
          }

          continue;
        }

        // JSON 动作模式：没有 tool_calls，动作写在 content 里。
        const action = parseJsonAction(turn.content);
        messages.push({ role: 'assistant', content: turn.content });

        if (!action) {
          this.logger.error(
            `[ingredient-agent] JSON 动作无法解析 runId=${runId} draft=${draft.id} step=${steps}`,
          );
          throw new ServiceUnavailableException(
            AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
          );
        }

        const replyText = typeof action.reply === 'string' ? action.reply : '';
        if (replyText.trim()) {
          reply = this.normalizeReply(replyText);
          transcript.push({
            step: steps,
            type: 'reply',
            atMs: Date.now() - startedAt,
            summary: truncate(reply, TRANSCRIPT_SUMMARY_MAX),
          });
          break;
        }

        const toolName =
          typeof action.tool === 'string' ? action.tool.trim() : '';
        if (!toolName) {
          this.logger.error(
            `[ingredient-agent] JSON 动作既没有 tool 也没有 reply runId=${runId} step=${steps}`,
          );
          throw new ServiceUnavailableException(
            AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
          );
        }

        // 总时长在模型思考时已经用完：不要再执行工具，直接收尾。
        if (Date.now() >= deadline) {
          stopReason = 'TIMEOUT';
          break;
        }
        if (toolCallCount >= INGREDIENT_AGENT_MAX_TOOL_CALLS) {
          stopReason = 'TOOL_CALL_LIMIT';
          break;
        }

        toolCallCount += 1;
        const args = isRecord(action.args) ? action.args : {};
        transcript.push({
          step: steps,
          type: 'tool_call',
          atMs: Date.now() - startedAt,
          tool: toolName,
          args,
        });

        const execution = await this.executeToolStep({
          onEvent: input.onEvent,
          index: toolCallCount,
          name: toolName,
          args,
          runId,
          draftId: draft.id,
        });
        toolCalls.push(
          buildToolCallRecord(toolName, args, execution, missedSearchKeywords),
        );
        transcript.push({
          step: steps,
          type: 'tool_result',
          atMs: Date.now() - startedAt,
          tool: toolName,
          ok: execution.ok,
          ...(execution.error ? { error: execution.error } : {}),
          summary: truncate(execution.content, TRANSCRIPT_SUMMARY_MAX),
        });
        messages.push({
          role: 'user',
          content: `工具 ${toolName} 返回：${execution.content}`,
        });

        // finish 是明确的结束信号：不再请求下一次模型。
        if (execution.finished) {
          reply = this.resolveFinishReply(
            execution.finished.reply,
            turn.content,
          );
          transcript.push({
            step: steps,
            type: 'reply',
            atMs: Date.now() - startedAt,
            summary: truncate(reply, TRANSCRIPT_SUMMARY_MAX),
          });
          break;
        }

        if (
          this.recordProgress(execution, seenSourceIds, (check) => {
            lastCheck = check;
          })
        ) {
          noProgressStreak = 0;
        } else {
          noProgressStreak += 1;
        }

        if (execution.pendingQuestion) {
          pendingQuestion = execution.pendingQuestion;
          stopReason = 'waiting_user';
          break;
        }

        if (Date.now() >= deadline) {
          stopReason = 'TIMEOUT';
          break;
        }
        if (noProgressStreak >= INGREDIENT_AGENT_MAX_NO_PROGRESS) {
          stopReason = 'NO_PROGRESS';
          break;
        }
      }

      if (stopReason === 'waiting_user' && pendingQuestion) {
        // 问人不是失败：本轮正常结束，回复就是问题本身。
        reply = truncate(pendingQuestion.question, REPLY_MAX);
        transcript.push({
          step: steps,
          type: 'reply',
          atMs: Date.now() - startedAt,
          summary: truncate(reply, TRANSCRIPT_SUMMARY_MAX),
        });
        this.logger.log(
          `[ingredient-agent] waitingUser runId=${runId} draft=${draft.id} ` +
            `question="${truncate(pendingQuestion.question, 80)}" options=${pendingQuestion.options.length}`,
        );
      } else if (stopReason && stopReason !== 'waiting_user') {
        // 停止时读最终草稿：reply 里的「已完成 / 还剩」必须与库里一致。
        let finalDraft = draft;
        try {
          finalDraft = await this.draftService.get(draft.id);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[ingredient-agent] 停止时读草稿失败 runId=${runId} draft=${draft.id}: ${reason}`,
          );
        }

        reply = buildStopReply({
          reason: stopReason,
          steps,
          toolCallCount,
          seenSourceCount: seenSourceIds.size,
          draft: finalDraft,
          lastCheck,
        });
        transcript.push({
          step: steps,
          type: 'limit',
          atMs: Date.now() - startedAt,
          summary: reply,
          stopReason,
        });
        this.logger.warn(
          `[ingredient-agent] 停止 runId=${runId} draft=${draft.id} reason=${stopReason} ` +
            `steps=${steps} toolCalls=${toolCallCount} tokens=${tokensUsed}`,
        );
      }

      // 查库零命中时兜一句：工具调用成功不代表找到数据，回复必须明确说「没找到」。
      // 等用户回答时不追加：问题后面不该跟一句「没找到」，那是下一轮的事。
      if (missedSearchKeywords.length > 0 && stopReason !== 'waiting_user') {
        reply = appendMissedSearchNotice(reply, missedSearchKeywords);
      }

      const report = buildAgentRunReport({
        runId,
        draftId: draft.id,
        text,
        steps,
        toolCallCount,
        tokensIn,
        tokensOut,
        startedAt,
        stopReason,
        result: resolveAgentRunOutcome(stopReason),
        toolCalls,
      });
      this.logger.log(`[ingredient-agent] runReport ${JSON.stringify(report)}`);
      this.logger.log(
        `[ingredient-agent] runEnd runId=${runId} draft=${draft.id} mode=${mode} ` +
          `steps=${steps} toolCalls=${toolCallCount} stopReason=${
            stopReason ?? 'none'
          } durationMs=${report.durationMs}`,
      );

      return {
        draftId: draft.id,
        reply,
        toolCalls,
        steps,
        toolCallCount,
        transcript,
        mode,
        stopReason,
        report,
        pendingQuestion,
      };
    } catch (error) {
      // 模型 / 工具异常也留一份报告：日志与 SSE error 事件用同一份数据。
      const report = buildAgentRunReport({
        runId,
        draftId: draft.id,
        text,
        steps,
        toolCallCount,
        tokensIn,
        tokensOut,
        startedAt,
        stopReason: 'ERROR',
        result: 'ERROR',
        toolCalls,
      });
      this.logger.log(`[ingredient-agent] runReport ${JSON.stringify(report)}`);
      this.logger.error(
        `[ingredient-agent] runFailed runId=${runId} draft=${draft.id} ` +
          `steps=${steps} toolCalls=${toolCallCount} durationMs=${report.durationMs}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      throw new AgentRunFailedError(error, report);
    }
  }

  /**
   * 把一次工具结果折算成「有没有新进展」。
   *
   * 新进展只有两种：本次新写入（新增或改变）字段，或读到此前没出现过的来源 id。
   * 失败调用、重复检索、重复写同一个值都不算。
   */
  private recordProgress(
    execution: AgentToolExecution,
    seenSourceIds: Set<string>,
    onCheck: (check: AgentCheckSummary) => void,
  ): boolean {
    const progress = execution.progress;
    if (!progress) {
      return false;
    }

    let progressed = false;
    for (const sourceRecordId of progress.sourceRecordIds) {
      if (!seenSourceIds.has(sourceRecordId)) {
        seenSourceIds.add(sourceRecordId);
        progressed = true;
      }
    }
    if (progress.writtenFieldPaths.length > 0) {
      progressed = true;
    }
    if (progress.check) {
      onCheck(progress.check);
    }

    return progressed;
  }

  /** 与 intake 同一条回落链：INGREDIENT_INTAKE → DEFAULT → RECIPE_DESIGN。 */
  private async loadRuntimeConfig(): Promise<DeepSeekRuntimeConfig> {
    const skipped: string[] = [];

    for (const purpose of INGREDIENT_INTAKE_AGENT_PURPOSES) {
      try {
        const runtime =
          await this.agentProviderConfig.getEnabledDeepSeekRuntimeConfig({
            purpose,
            fallbackToDefault: false,
          });
        const fallbackNote = skipped.length
          ? ` fallbackFrom=${skipped.join(',')}`
          : '';
        this.logger.log(
          `[ingredient-agent] 使用 AI 配置 purpose=${purpose}${fallbackNote}`,
        );
        if (purpose !== INGREDIENT_INTAKE_AGENT_PURPOSE) {
          this.logger.warn(
            `[ingredient-agent] 使用回落配置 purpose=${purpose}${fallbackNote}；` +
              `建议单独启用 INGREDIENT_INTAKE 配置`,
          );
        }
        return runtime;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push(purpose);
        this.logger.warn(
          `[ingredient-agent] 跳过 AI 配置 purpose=${purpose}: ${reason}`,
        );
      }
    }

    this.logger.error(
      `[ingredient-agent] AI 配置不可用 tried=${INGREDIENT_INTAKE_AGENT_PURPOSES.join(',')}`,
    );
    throw new ServiceUnavailableException(AI_NOT_CONFIGURED_MESSAGE);
  }

  private parseToolArguments(raw: string): {
    args: Record<string, unknown>;
    parseError: string | null;
  } {
    try {
      const parsed: unknown = JSON.parse(raw || '{}');
      if (!isRecord(parsed)) {
        return { args: {}, parseError: '工具参数必须是 JSON 对象。' };
      }
      return { args: parsed, parseError: null };
    } catch {
      return {
        args: {},
        parseError: `工具参数不是合法 JSON：${truncate(raw, 200)}`,
      };
    }
  }

  /**
   * finish 的结论：优先用工具参数里的 summary，其次用同一条 assistant 回复；
   * 都没有时给一句中性收尾，不能把空字符串当成最终回复。
   */
  private resolveFinishReply(
    finishedReply: string | null,
    assistantContent: string | null,
  ): string {
    const text =
      (finishedReply ?? '').trim() ||
      (assistantContent ?? '').trim() ||
      '本轮已完成。';
    return this.normalizeReply(text);
  }

  private normalizeReply(reply: string): string {
    const normalized = truncate(reply.trim(), REPLY_MAX);
    return normalized || '这次没有生成回复，请重试。';
  }

  /**
   * 单步模型调用：先主模型、再 review 模型各试一次。
   *
   * `tools` 被明确拒绝时立刻上抛（交给外层退化为 JSON 动作），
   * 其它失败（超时 / 5xx / 空输出）才换模型重试。
   */
  private async callModelWithRetry(input: {
    runtime: DeepSeekRuntimeConfig;
    models: string[];
    mode: IngredientAgentMode;
    messages: AgentMessage[];
    toolDefinitions: readonly AgentToolDefinition[];
    deadline: number;
    runId: string;
    step: number;
  }): Promise<AgentAssistantTurn> {
    let lastError: unknown = null;

    for (const model of input.models) {
      const remainingMs = input.deadline - Date.now();
      if (remainingMs <= 0) {
        throw new AgentDeadlineExceededError('总时长已用完');
      }
      const timeoutMs = Math.max(
        1,
        Math.min(
          remainingMs,
          INGREDIENT_AGENT_REQUEST_TIMEOUT_MS,
          input.runtime.requestTimeoutMs > 0
            ? input.runtime.requestTimeoutMs
            : INGREDIENT_AGENT_REQUEST_TIMEOUT_MS,
        ),
      );

      try {
        return await this.callModelOnce({
          baseUrl: input.runtime.baseUrl,
          apiKey: input.runtime.apiKey,
          model,
          mode: input.mode,
          messages: input.messages,
          toolDefinitions: input.toolDefinitions,
          timeoutMs,
          deadline: input.deadline,
        });
      } catch (error) {
        if (error instanceof AgentToolsUnsupportedError) {
          throw error;
        }
        lastError = error;
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[ingredient-agent] 模型调用失败 runId=${input.runId} step=${input.step} ` +
            `model=${model}: ${reason}`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new AgentModelError('AI 生成失败');
  }

  private async callModelOnce(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
    mode: IngredientAgentMode;
    messages: AgentMessage[];
    toolDefinitions: readonly AgentToolDefinition[];
    timeoutMs: number;
    deadline: number;
  }): Promise<AgentAssistantTurn> {
    const { deadline, ...request } = input;
    const cacheKey = `${input.baseUrl.replace(/\/+$/, '')}|${input.model}`;
    const cached = this.outputLimitCache.get(cacheKey);

    if (cached !== undefined) {
      try {
        const timeoutMs = this.resolveRequestTimeout(
          deadline,
          request.timeoutMs,
        );
        return await this.requestModelOnce({
          ...request,
          timeoutMs,
          maxTokens: cached,
        });
      } catch (error) {
        if (error instanceof AgentToolsUnsupportedError) {
          throw error;
        }
        if (
          !(error instanceof AgentOutputLimitError) &&
          !(error instanceof AgentInvalidResponseError)
        ) {
          throw error;
        }
        // 供应商改了限额 / 大值返回空响应：清掉缓存，重新探测，而不是永远卡在旧值。
        this.outputLimitCache.delete(cacheKey);
        this.logger.warn(
          `[ingredient-agent] maxTokensProbe cachedRejected cached=${cached} ` +
            `model=${input.model}: ${error.message}`,
        );
      }
    }

    return this.probeModelOutputLimit({ ...request, deadline, cacheKey });
  }

  /**
   * 每次真正发请求前重算剩余时间。
   *
   * 探测会连续发多档请求，必须受整轮 deadline 约束；否则一次探测就能
   * 越过 600 秒硬上限。
   */
  private resolveRequestTimeout(deadline: number, capMs: number): number {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new AgentDeadlineExceededError('总时长已用完');
    }
    return Math.max(1, Math.min(capMs, remainingMs));
  }

  /**
   * 输出上限探测：8192 → 16384 → 32768。
   *
   * 通过标准不是 HTTP 200，而是拿到真正可用的 assistant turn：
   * 有 `choices[0].message`，且 content / tool_calls 至少一个非空。
   * 参数错误、超时、网络错误、空响应都算这一档失败，继续升档。
   * 三档全失败时按保守值 8192 再发一次，并记 `probeExhausted`。
   */
  private async probeModelOutputLimit(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
    mode: IngredientAgentMode;
    messages: AgentMessage[];
    toolDefinitions: readonly AgentToolDefinition[];
    timeoutMs: number;
    deadline: number;
    cacheKey: string;
  }): Promise<AgentAssistantTurn> {
    const { deadline, cacheKey, ...request } = input;
    let lastError: unknown = null;

    for (
      let index = 0;
      index < INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES.length;
      index += 1
    ) {
      const maxTokens = INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES[index];
      try {
        const timeoutMs = this.resolveRequestTimeout(
          deadline,
          request.timeoutMs,
        );
        const turn = await this.requestModelOnce({
          ...request,
          timeoutMs,
          maxTokens,
        });
        // 探测成功：同一 baseUrl + model 的后续调用都直接用这一档。
        this.outputLimitCache.set(cacheKey, maxTokens);
        this.logger.log(
          `[ingredient-agent] maxTokensProbe selected=${maxTokens} ` +
            `tried=${INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES.join('→')} ` +
            `model=${input.model}`,
        );
        return turn;
      } catch (error) {
        lastError = error;
        if (
          error instanceof AgentToolsUnsupportedError ||
          error instanceof AgentDeadlineExceededError
        ) {
          // 协议问题交给外层退化 JSON；总时长用完交给外层按 TIMEOUT 收尾。
          throw error;
        }
        const next = INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES[index + 1];
        if (next === undefined) {
          break;
        }
        this.logger.warn(
          `[ingredient-agent] maxTokensProbe rejected=${maxTokens} next=${next} ` +
            `model=${input.model}: ${errorMessage(error)}`,
        );
      }
    }

    const fallback = INGREDIENT_AGENT_DEFAULT_MAX_TOKENS;
    // 全部探测失败也固定用 8192：后续调用不再每次从 32k 试错。
    this.outputLimitCache.set(cacheKey, fallback);
    this.logger.error(
      `[ingredient-agent] maxTokensProbe probeExhausted fallback=${fallback} ` +
        `tried=${INGREDIENT_AGENT_MAX_TOKENS_CANDIDATES.join('→')} ` +
        `model=${input.model}: ${errorMessage(lastError)}`,
    );

    const timeoutMs = this.resolveRequestTimeout(deadline, request.timeoutMs);
    const turn = await this.requestModelOnce({
      ...request,
      timeoutMs,
      maxTokens: fallback,
    });
    this.logger.log(
      `[ingredient-agent] maxTokensProbe selected=${fallback} fallback=true ` +
        `model=${input.model}`,
    );
    return turn;
  }

  /** 真正发一次模型请求；`maxTokens` 由探测 / 缓存决定。 */
  private async requestModelOnce(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
    mode: IngredientAgentMode;
    messages: AgentMessage[];
    toolDefinitions: readonly AgentToolDefinition[];
    timeoutMs: number;
    maxTokens: number;
  }): Promise<AgentAssistantTurn> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

    try {
      const response = await fetch(
        `${input.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: input.model,
            messages: input.messages,
            ...(input.mode === 'FUNCTION_CALLING'
              ? { tools: input.toolDefinitions, tool_choice: 'auto' }
              : { response_format: { type: 'json_object' } }),
            temperature: AGENT_TEMPERATURE,
            max_tokens: input.maxTokens,
          }),
        },
      );

      const body: unknown = await response.json().catch(() => ({}));

      if (!response.ok) {
        const detail = truncate(JSON.stringify(body), 600);
        const lower = detail.toLowerCase();
        if (
          [400, 404, 422].includes(response.status) &&
          (lower.includes('tool') || lower.includes('function'))
        ) {
          throw new AgentToolsUnsupportedError(
            `供应商不支持 tools 参数（HTTP ${response.status}）`,
          );
        }
        if ([400, 413, 422].includes(response.status)) {
          // 参数错误：可能是 max_tokens 超上限，交给探测循环降一档。
          throw new AgentOutputLimitError(
            `AI 生成失败（HTTP ${response.status}）：${detail}`,
          );
        }
        throw new AgentModelError(
          `AI 生成失败（HTTP ${response.status}）：${detail}`,
        );
      }

      const message = readChoiceMessage(body);
      if (!message) {
        throw new AgentInvalidResponseError('AI 生成失败：无效响应');
      }

      const content =
        typeof message.content === 'string' ? message.content.trim() : '';
      const usage = readUsage(body);

      if (input.mode === 'JSON_ACTION') {
        if (!content) {
          throw new AgentInvalidResponseError('AI 生成失败：无内容');
        }
        return {
          content,
          toolCalls: [],
          usage,
        };
      }

      const toolCalls = normalizeToolCalls(message.tool_calls);
      if (!content && toolCalls.length === 0) {
        throw new AgentInvalidResponseError('AI 生成失败：无内容');
      }

      return { content, toolCalls, usage };
    } catch (error) {
      if (error instanceof AgentModelError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new AgentModelError('AI 请求超时');
      }
      throw new AgentModelError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
