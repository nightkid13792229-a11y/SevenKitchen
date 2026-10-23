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
  type AgentToolDefinition,
} from './ingredient-creation-tools.service';
import type { IngredientCreationDraft } from './ingredient-creation.types';

/** 一次起草最多问模型 8 次（一次工具往返算一步）。 */
export const INGREDIENT_AGENT_MAX_STEPS = 8;
/** 一次起草的总时长上限：超时不再发起模型请求。 */
export const INGREDIENT_AGENT_TIMEOUT_MS = 60_000;

const AGENT_TEMPERATURE = 0.2;
const AGENT_MAX_TOKENS = 1_500;
const REPLY_MAX = 500;
const TRANSCRIPT_SUMMARY_MAX = 240;

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
}

/** 本次运行的留痕：每一步模型动作与工具结果。超步数时原样带回。 */
export interface AgentTranscriptEntry {
  step: number;
  type: 'tool_call' | 'tool_result' | 'reply' | 'limit';
  atMs: number;
  tool?: string;
  args?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
  summary?: string;
}

export interface IngredientAgentRunResult {
  draftId: string;
  reply: string;
  toolCalls: AgentToolCallRecord[];
  steps: number;
  transcript: AgentTranscriptEntry[];
  /** 本次实际使用的协议；报告与排查用。 */
  mode: IngredientAgentMode;
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
      '（草稿还没有营养档案。第一次写入请把 profileIndex 设为 0，并带上 searchLocalNutrition 返回的 sourceRecordId。）',
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
    '- 每一步二选一：调用一个工具，或给出最终回复（不再调用工具）。',
    '- 不要编造营养数值。只写来源记录里有的值，或用户明确给出的值。',
    '- 工具报错表示输入不合法。按错误文本改正参数后重试；连续改不出来就停下，说明卡在哪。',
    '- 最终回复用一句中文，说清楚改了什么、还缺什么、下一步建议；不要粘贴 JSON。',
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

function buildLimitReply(toolCallCount: number, draftId: string): string {
  return (
    `我跑到上限了（最多 ${INGREDIENT_AGENT_MAX_STEPS} 步 / ${
      INGREDIENT_AGENT_TIMEOUT_MS / 1000
    } 秒）。已完成 ${toolCallCount} 次工具调用，草稿 ${draftId} 里的改动已保存，` +
    '请人工检查还没做完的部分。'
  );
}

/**
 * AI 起草循环（P1）。
 *
 * 只做一件事：把一句话 + 草稿交给模型，让它在**受控长度**内自己调工具
 * （查库 → 写字段 → 跑校验 → 按报错改），直到给出最终回复或撞上限。
 *
 * 安全边界不靠模型自觉：
 * - 工具层只有 4 个，全部只碰草稿；提交 / 确认可用不在这里；
 * - 步数（8）与总时长（60s）都是硬上限；
 * - 模型 / 配置失败直接 503，不偷偷回退到规则猜。
 */
@Injectable()
export class IngredientCreationAgentService {
  private readonly logger = new Logger(IngredientCreationAgentService.name);

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
    let reply = '';
    let limitReached = false;
    const toolCalls: AgentToolCallRecord[] = [];
    const transcript: AgentTranscriptEntry[] = [];

    this.logger.log(
      `[ingredient-agent] runStart runId=${runId} draft=${draft.id} mode=${mode} ` +
        `maxSteps=${INGREDIENT_AGENT_MAX_STEPS} timeoutMs=${INGREDIENT_AGENT_TIMEOUT_MS}`,
    );

    while (steps < INGREDIENT_AGENT_MAX_STEPS) {
      if (Date.now() >= deadline) {
        limitReached = true;
        break;
      }

      steps += 1;
      const remainingMs = Math.max(1, deadline - Date.now());
      this.logger.log(
        `[ingredient-agent] step=${steps}/${INGREDIENT_AGENT_MAX_STEPS} ` +
          `runId=${runId} draft=${draft.id} mode=${mode} remainingMs=${remainingMs}`,
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
          limitReached = true;
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
          // 总时长在模型思考时已经用完：不要再执行工具，直接收尾。
          if (Date.now() >= deadline) {
            limitReached = true;
            break;
          }

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

          toolCalls.push({
            name: toolName,
            args,
            ok: execution.ok,
            ...(execution.error ? { error: execution.error } : {}),
          });
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

          if (Date.now() >= deadline) {
            limitReached = true;
            break;
          }
        }

        if (limitReached) break;
        if (steps >= INGREDIENT_AGENT_MAX_STEPS) {
          limitReached = true;
          break;
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
        limitReached = true;
        break;
      }

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
      toolCalls.push({
        name: toolName,
        args,
        ok: execution.ok,
        ...(execution.error ? { error: execution.error } : {}),
      });
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

      if (steps >= INGREDIENT_AGENT_MAX_STEPS) {
        limitReached = true;
        break;
      }
    }

    if (limitReached) {
      reply = buildLimitReply(toolCalls.length, draft.id);
      transcript.push({
        step: steps,
        type: 'limit',
        atMs: Date.now() - startedAt,
        summary: reply,
      });
      this.logger.warn(
        `[ingredient-agent] 达到上限 runId=${runId} draft=${draft.id} ` +
          `steps=${steps} toolCalls=${toolCalls.length}`,
      );
    }

    this.logger.log(
      `[ingredient-agent] runEnd runId=${runId} draft=${draft.id} mode=${mode} ` +
        `steps=${steps} toolCalls=${toolCalls.length} durationMs=${
          Date.now() - startedAt
        }`,
    );

    return {
      draftId: draft.id,
      reply,
      toolCalls,
      steps,
      transcript,
      mode,
    };
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
        return { content, toolCalls: [] };
      }

      const toolCalls = normalizeToolCalls(message.tool_calls);
      if (!content && toolCalls.length === 0) {
        throw new AgentModelError('AI 生成失败：无内容');
      }

      return { content, toolCalls };
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
