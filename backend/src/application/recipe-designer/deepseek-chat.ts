import { BadRequestException } from '@nestjs/common';

const DEEPSEEK_CHAT_PATH = '/chat/completions';

export interface DeepSeekChatOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  systemPrompt: string;
  /** 用户消息体（会被 JSON 序列化） */
  userPayload: unknown;
  temperature?: number;
  /** 输出 token 上限（推理模型可能把配额耗在推理上，默认给足） */
  maxTokens?: number;
}

/**
 * 调用 DeepSeek Chat Completions 并解析 JSON 输出。
 * 供 AI 设计建议相关服务复用（营养方案 / 食材推荐 / 审核 / SOP）。
 */
export async function callDeepSeekJson(
  options: DeepSeekChatOptions,
): Promise<Record<string, unknown>> {
  // 推理模型偶发“content 为空”（配额被推理耗尽），空内容时自动重试一次
  try {
    return await callDeepSeekJsonOnce(options);
  } catch (error) {
    if (
      error instanceof BadRequestException &&
      error.message === 'AI 生成失败：无内容'
    ) {
      return callDeepSeekJsonOnce(options);
    }
    throw error;
  }
}

async function callDeepSeekJsonOnce(
  options: DeepSeekChatOptions,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.requestTimeoutMs,
  );
  try {
    const response = await fetch(
      `${options.baseUrl.replace(/\/+$/, '')}${DEEPSEEK_CHAT_PATH}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: options.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: JSON.stringify(options.userPayload) },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 16384,
        }),
      },
    );

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.error(
        '[deepseek-chat] 非 2xx 响应',
        response.status,
        JSON.stringify(responseBody).slice(0, 600),
      );
      throw new BadRequestException('AI 生成失败');
    }
    return parseDeepSeekJsonOutput(responseBody);
  } finally {
    clearTimeout(timeout);
  }
}

export function parseDeepSeekJsonOutput(
  responseBody: unknown,
): Record<string, unknown> {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new BadRequestException('AI 生成失败：无效响应');
  }
  const choices = (responseBody as any).choices;
  const text = choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new BadRequestException('AI 生成失败：无内容');
  }
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new BadRequestException('AI 生成失败：结果不是有效 JSON');
  }
}

export function normalizeOptionalText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeOptionalText(entry))
    .filter((entry): entry is string => Boolean(entry));
}
