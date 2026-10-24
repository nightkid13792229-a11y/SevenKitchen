import { BadRequestException } from '@nestjs/common';

const DEEPSEEK_CHAT_PATH = '/chat/completions';

/** 网络错误 / 429 / 5xx 的自动重试上限（总尝试次数） */
const MAX_ATTEMPTS = 3;

export interface DeepSeekToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface DeepSeekToolsMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: DeepSeekToolCall[];
  tool_call_id?: string;
}

export interface DeepSeekToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface DeepSeekToolsUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface DeepSeekToolsResult {
  content: string | null;
  toolCalls: DeepSeekToolCall[];
  usage: DeepSeekToolsUsage | null;
}

export interface DeepSeekToolsOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  messages: DeepSeekToolsMessage[];
  tools: DeepSeekToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  /**
   * 这一调的 token 用量回调（成本统计用）。
   * 响应里没有 usage 时不回调；只在**成功**那一调回调一次。
   */
  onUsage?: (usage: DeepSeekToolsUsage) => void;
}

/**
 * 调用 DeepSeek Chat Completions 的工具调用（function calling）接口。
 *
 * 与 `deepseek-chat.ts` 的区别：
 * - 不传 `response_format`（工具调用与强制 JSON 输出互斥）；
 * - 返回 `content` + `toolCalls`，而不是解析成 JSON 对象；
 * - 网络错误 / 429 / 5xx 自动重试，最多 3 次；其它 4xx 立即失败。
 *
 * 超时（AbortController）**不重试**：调用方的总时长预算已经超了，
 * 再试两次只会把等待时间翻三倍。
 */
export async function callDeepSeekTools(
  options: DeepSeekToolsOptions,
): Promise<DeepSeekToolsResult> {
  const url = `${options.baseUrl.replace(/\/+$/, '')}${DEEPSEEK_CHAT_PATH}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.requestTimeoutMs,
    );

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model,
            messages: options.messages,
            tools: options.tools,
            tool_choice: 'auto',
            // DeepSeek 新模型默认开启 thinking（effort=high）：工具调用场景
            // 会把大量时间/配额花在思维链上，实测单轮可达数分钟。
            // 与健康报告抽取一致，显式关闭；需要推理时由业务提示词约束。
            thinking: { type: 'disabled' },
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 16384,
          }),
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new BadRequestException('AI 工具调用失败：请求超时');
        }
        if (attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw new BadRequestException('AI 工具调用失败：网络错误');
      }

      if (!response.ok) {
        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          continue;
        }
        // 只带状态码，不带响应体（可能含供应商内部信息）。
        throw new BadRequestException(
          `AI 工具调用失败（HTTP ${response.status}）`,
        );
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          throw new BadRequestException('AI 工具调用失败：请求超时');
        }
        // 2xx 但响应不是 JSON：当作空结果交给 loop 处理，不抛错。
        body = null;
      }

      return parseDeepSeekToolsResponse(body, options.onUsage);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new BadRequestException('AI 工具调用失败');
}

function parseDeepSeekToolsResponse(
  body: unknown,
  onUsage?: (usage: DeepSeekToolsUsage) => void,
): DeepSeekToolsResult {
  const message = readChoicesMessage(body);
  const content = typeof message?.content === 'string' ? message.content : null;
  const toolCalls = normalizeToolCalls(message?.tool_calls);
  const usage = readUsage(body);

  if (usage && onUsage) {
    onUsage(usage);
  }

  return { content, toolCalls, usage };
}

function readChoicesMessage(
  body: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return undefined;
  }
  const choices: unknown[] = body.choices;
  const choice = choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return undefined;
  }
  return choice.message;
}

/**
 * 只保留结构合法的 tool call：id / function.name / function.arguments
 * 三者都必须是非空字符串。模型偶发返回半截结构，坏的那条直接丢掉，
 * 不能因为一条坏数据让整轮对话失败。
 */
function normalizeToolCalls(value: unknown): DeepSeekToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const toolCalls: DeepSeekToolCall[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const id = entry.id;
    const fn = entry.function;
    if (typeof id !== 'string' || !id || !isRecord(fn)) {
      continue;
    }
    const name = fn.name;
    const args = fn.arguments;
    if (typeof name !== 'string' || !name || typeof args !== 'string') {
      continue;
    }
    toolCalls.push({
      id,
      type: 'function',
      function: { name, arguments: args },
    });
  }
  return toolCalls;
}

function readUsage(body: unknown): DeepSeekToolsUsage | null {
  if (!isRecord(body) || !isRecord(body.usage)) {
    return null;
  }
  const promptTokens = Number(body.usage.prompt_tokens);
  const completionTokens = Number(body.usage.completion_tokens);
  return {
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
  };
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === 'AbortError' ||
    error.message === 'This operation was aborted' ||
    error.message === 'The operation was aborted'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
