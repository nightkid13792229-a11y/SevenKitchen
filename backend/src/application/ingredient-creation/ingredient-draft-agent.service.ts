import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NUTRITION_FIELD_CATALOG } from '../../domain/ingredient/nutrition-field-catalog';
import {
  AgentProviderConfigService,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { IngredientCreationDraftService } from './ingredient-creation-draft.service';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
  INGREDIENT_INTAKE_AGENT_PURPOSES,
} from './ingredient-creation-intake.service';
import {
  IngredientCreationToolsService,
  type AgentCheckSummary,
  type AgentToolDefinition,
  type AgentToolExecution,
} from './ingredient-creation-tools.service';
import type { IngredientCreationDraft } from './ingredient-creation.types';

/**
 * 单轮最多执行多少次**工具调用**（不是模型轮次）。
 *
 * 模型一次回复可能带很多 tool_call，拿「步数」当动作数会被严重低估：
 * 线上 8 步实际写出了 34 个字段。这里直接按动作数设保险丝。
 */
export const INGREDIENT_AGENT_MAX_TOOL_CALLS = 80;
/** 一次起草的总时长上限：超时不再发起模型请求。 */
export const INGREDIENT_AGENT_TIMEOUT_MS = 180_000;
/** 连续多少次工具调用没有任何新进展就软停止。 */
export const INGREDIENT_AGENT_MAX_NO_PROGRESS = 3;
/** 单轮 token 成本预算默认值（输入 + 输出）；可用环境变量覆盖。 */
export const INGREDIENT_AGENT_DEFAULT_TOKEN_BUDGET = 600_000;
export const INGREDIENT_AGENT_TOKEN_BUDGET_ENV =
  'INGREDIENT_AGENT_TOKEN_BUDGET';

const AGENT_TEMPERATURE = 0.2;
/** 输出上限：1.5k 会在长 tool_call 参数中途截断，产生非法 JSON。 */
const AGENT_MAX_TOKENS = 8_000;
const REPLY_MAX = 500;
const TRANSCRIPT_SUMMARY_MAX = 240;
/** 工具结果超过这个长度就不回传给页面，避免一次大检索撑爆响应。 */
const TOOL_RESULT_MAX_CHARS = 8_000;

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
   * 注意：`ok=true` 只表示工具执行成功，像 searchLocalNutrition 还要看 `found`。
   */
  result?: unknown;
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
 * - `NO_PROGRESS`：连续多次工具调用没有新进展的软停止。
 */
export type IngredientAgentStopReason =
  | 'TOOL_CALL_LIMIT'
  | 'TIMEOUT'
  | 'TOKEN_BUDGET'
  | 'NO_PROGRESS';

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
  /** 正常给出最终回复时为 null。 */
  stopReason: IngredientAgentStopReason | null;
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

export interface RunIngredientAgentInput {
  draftId?: string;
  text: string;
  userId: string;
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

interface AgentAssistantTurn {
  content: string;
  toolCalls: AgentToolCallPayload[];
  /** 供应商返回的 usage.total_tokens；没返回时按 0（不猜）。 */
  totalTokens: number;
}

/** 模型请求失败（网络 / 非 2xx / 输出结构不对）。上层据此 503。 */
class AgentModelError extends Error {}

/** 供应商不认 `tools` 参数：只在第一步触发「退化为 JSON 动作」。 */
class AgentToolsUnsupportedError extends AgentModelError {}

/** 60 秒总预算用完：不是 AI 故障，按「跑到上限」收尾并带回 transcript。 */
class AgentDeadlineExceededError extends AgentModelError {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** searchLocalNutrition 的 found/keywords；不是这个工具的结果就返回 null。 */
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
  execution: { ok: boolean; content: string; error?: string },
  missedSearchKeywords: string[],
): AgentToolCallRecord {
  const result = parseToolResult(execution.content);
  if (name === 'searchLocalNutrition') {
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
  };
}

function deriveDraftName(text: string): string {
  const firstLine = text.split(/\r?\n/)[0].trim();
  return truncate(firstLine || '未命名原料', 60);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.message === 'This operation was aborted')
  );
}

/** 读 usage.total_tokens；兼容 prompt/completion 两段式，读不到返回 0。 */
function readUsageTotalTokens(body: unknown): number {
  if (!isRecord(body) || !isRecord(body.usage)) {
    return 0;
  }
  const usage = body.usage;
  const total = usage.total_tokens ?? usage.totalTokens;
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
    return Math.floor(total);
  }
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  if (
    typeof prompt === 'number' &&
    Number.isFinite(prompt) &&
    typeof completion === 'number' &&
    Number.isFinite(completion)
  ) {
    return Math.floor(prompt + completion);
  }
  return 0;
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
        `人工审核已改字段（updateIngredientFields 会拒绝覆盖，不要重复尝试）：${manualFields.join('、')}`,
      );
    }
  } else {
    lines.push(
      '（草稿还没有原料卡。可用 updateIngredientFields 写名称 / 英文名 / 类别 / 基准单位 / 展示名 / CFCT 分类 / 可食部。）',
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
      '（草稿还没有营养档案。第一次写入请用 updateNutritionFields，把 profileIndex 设为 0，并带上 searchLocalNutrition 返回的 sourceRecordId。）',
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
    '硬规则：',
    '- 只能读写草稿。系统没有提交、确认可用、批准例外的工具；不要假装能做，也不要建议用户让你做。',
    '- 每一轮可以返回一个或多个工具调用；也可以直接给出最终回复。',
    '- 读到多个营养值后，**优先用 updateNutritionFields 一次写入**（单次最多 70 条），不要 60 个字段调 60 次 updateNutritionField。',
    '- 原料卡（名称 / 英文名 / 类别 / 基准单位 / 展示名 / CFCT / 可食部）用 updateIngredientFields 写；人工审核改过的字段会被跳过，不要反复重试。',
    '- 不要编造营养数值。只写来源记录里有的值，或用户明确给出的值。',
    '- 工具报错表示输入不合法。按错误文本改正参数后重试；连续改不出来就停下，说明卡在哪。',
    '- searchLocalNutrition 返回 ok=true 只表示「查询执行成功」，不代表找到数据。看 found / candidateCount：found=false 或 0 条时必须明确说「没有找到匹配词条」，并列出 keywords 里已尝试的关键词；不要写成「成功找到」，也不要编造数据。',
    `- 本轮预算：最多 ${INGREDIENT_AGENT_MAX_TOOL_CALLS} 次工具调用 / ${INGREDIENT_AGENT_TIMEOUT_MS / 1000} 秒；连续 ${INGREDIENT_AGENT_MAX_NO_PROGRESS} 次工具调用没有新进展会被系统停止。`,
    '- 最终回复用一句中文，说清楚改了什么、还缺什么、下一步建议；找不到数据时要先说「没找到」并列出查过的关键词。不要粘贴 JSON。',
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

function buildInitialMessages(
  draft: IngredientCreationDraft,
  text: string,
  mode: IngredientAgentMode,
  toolNames: readonly string[],
): AgentMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(draft, mode, toolNames) },
    { role: 'user', content: text },
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
  reason: IngredientAgentStopReason;
  steps: number;
  toolCallCount: number;
  seenSourceCount: number;
  draft: IngredientCreationDraft;
  lastCheck: AgentCheckSummary | null;
}): string {
  const reasonText: Record<IngredientAgentStopReason, string> = {
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
 * - 工具层只有 6 个，全部只碰草稿；提交 / 确认可用不在这里；
 * - 硬保险丝：80 次工具调用 / 180 秒 / 可配 token 预算；
 * - 软停止：连续 3 次工具调用没有新进展（不写字段、不发现新来源）就停；
 * - 停下来不回滚：已写入的草稿保持原样，reply 说明还剩什么；
 * - 模型 / 配置失败直接 503，不偷偷回退到规则猜。
 */
@Injectable()
export class IngredientDraftAgentService {
  private readonly logger = new Logger(IngredientDraftAgentService.name);

  constructor(
    private readonly agentProviderConfig: AgentProviderConfigService,
    private readonly toolsService: IngredientCreationToolsService,
    private readonly draftService: IngredientCreationDraftService,
  ) {}

  async run(input: RunIngredientAgentInput): Promise<IngredientAgentRunResult> {
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

    let mode: IngredientAgentMode = 'FUNCTION_CALLING';
    let messages = buildInitialMessages(draft, text, mode, toolNames);
    let steps = 0;
    let toolCallCount = 0;
    let tokensUsed = 0;
    let noProgressStreak = 0;
    let reply = '';
    let stopReason: IngredientAgentStopReason | null = null;
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
          messages = buildInitialMessages(draft, text, mode, toolNames);
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

      tokensUsed += turn.totalTokens;

      if (mode === 'FUNCTION_CALLING') {
        messages.push({
          role: 'assistant',
          content: turn.content || null,
          ...(turn.toolCalls.length > 0 ? { tool_calls: turn.toolCalls } : {}),
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

          const execution = parseError
            ? {
                ok: false,
                error: parseError,
                content: JSON.stringify({ ok: false, error: parseError }),
                durationMs: 0,
              }
            : await this.toolsService.execute({
                runId,
                draftId: draft.id,
                name: toolName,
                args,
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

          if (
            this.recordProgress(execution, seenSourceIds, (check) => {
              lastCheck = check;
            })
          ) {
            noProgressStreak = 0;
          } else {
            noProgressStreak += 1;
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

      const execution = await this.toolsService.execute({
        runId,
        draftId: draft.id,
        name: toolName,
        args,
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

      if (
        this.recordProgress(execution, seenSourceIds, (check) => {
          lastCheck = check;
        })
      ) {
        noProgressStreak = 0;
      } else {
        noProgressStreak += 1;
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

    if (stopReason) {
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
    if (missedSearchKeywords.length > 0) {
      reply = appendMissedSearchNotice(reply, missedSearchKeywords);
    }

    this.logger.log(
      `[ingredient-agent] runEnd runId=${runId} draft=${draft.id} mode=${mode} ` +
        `steps=${steps} toolCalls=${toolCallCount} stopReason=${
          stopReason ?? 'none'
        } durationMs=${Date.now() - startedAt}`,
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
    };
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
          input.runtime.requestTimeoutMs > 0
            ? input.runtime.requestTimeoutMs
            : remainingMs,
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
            max_tokens: AGENT_MAX_TOKENS,
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
        throw new AgentModelError(
          `AI 生成失败（HTTP ${response.status}）：${detail}`,
        );
      }

      const message = readChoiceMessage(body);
      if (!message) {
        throw new AgentModelError('AI 生成失败：无效响应');
      }

      const content =
        typeof message.content === 'string' ? message.content.trim() : '';

      if (input.mode === 'JSON_ACTION') {
        if (!content) {
          throw new AgentModelError('AI 生成失败：无内容');
        }
        return {
          content,
          toolCalls: [],
          totalTokens: readUsageTotalTokens(body),
        };
      }

      const toolCalls = normalizeToolCalls(message.tool_calls);
      if (!content && toolCalls.length === 0) {
        throw new AgentModelError('AI 生成失败：无内容');
      }

      return { content, toolCalls, totalTokens: readUsageTotalTokens(body) };
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
