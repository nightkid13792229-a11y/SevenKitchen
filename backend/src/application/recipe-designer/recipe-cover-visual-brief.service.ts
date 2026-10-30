import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import {
  AgentProviderConfigService,
  RECIPE_COVER_PROMPT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import {
  callDeepSeekTools,
  type DeepSeekToolCall,
  type DeepSeekToolDefinition,
  type DeepSeekToolsMessage,
} from './deepseek-tools-chat';
import { RecipeCoverConfigService } from './recipe-cover-config.service';
import type { RecipeCoverIngredient } from './recipe-cover-prompt';

const INGREDIENT_TOOL_NAME = 'get_recipe_ingredients';
const USER_TRIGGER = '生成封面提示词。';

/** 只读工具：模型需要先取当前食谱的食材，才能写提示词 */
const INGREDIENT_TOOL: DeepSeekToolDefinition = {
  type: 'function',
  function: {
    name: INGREDIENT_TOOL_NAME,
    description: '返回当前食谱的食材，每行一种；括号里是处理方式。',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

/** 封面要一律画生的：这些状态词从工具结果里去掉，只保留切割/部位信息 */
const RAW_STATE_TOKENS = new Set([
  '生',
  '熟',
  '干',
  '生重',
  '熟重',
  '干重',
  '煮熟',
  '蒸熟',
  '烤',
  '煎',
  '炸',
]);

/**
 * 让 DeepSeek 当「摄影指导」（2026-10-31 工具取数版）
 *
 * 模型不再被动接收食材 JSON，而是先调用 `get_recipe_ingredients`
 * 取当前草稿 / 系列的食材（名称 + 处理方式，不含占比），再写一段
 * 中文封面提示词。这样提示词里没有数据结构，也没有百分比可抄。
 */
@Injectable()
export class RecipeCoverVisualBriefService {
  private readonly logger = new Logger(RecipeCoverVisualBriefService.name);

  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
    private readonly recipeCoverConfigService: RecipeCoverConfigService,
  ) {}

  async build(
    loadIngredients: () => Promise<RecipeCoverIngredient[]>,
  ): Promise<string> {
    let config: Awaited<
      ReturnType<
        AgentProviderConfigService['getEnabledDeepSeekRuntimeConfig']
      >
    >;
    try {
      config =
        await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
          purpose: RECIPE_COVER_PROMPT_PURPOSE,
          fallbackToDefault: false,
        });
    } catch (error: any) {
      throw new BadRequestException(
        `封面提示词生成失败：${error?.message || '文本模型未配置'}。请到后台「AI / Agent 配置 → AI 食谱封面」配置 DeepSeek`,
      );
    }

    const systemPrompt = await this.recipeCoverConfigService.getPromptTemplate();
    const baseMessages: DeepSeekToolsMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: USER_TRIGGER },
    ];

    let first: Awaited<ReturnType<typeof callDeepSeekTools>>;
    try {
      first = await callDeepSeekTools({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        requestTimeoutMs: config.requestTimeoutMs,
        messages: baseMessages,
        tools: [INGREDIENT_TOOL],
        toolChoice: {
          type: 'function',
          function: { name: INGREDIENT_TOOL_NAME },
        },
        // 取数是确定性的，不需要思考，避免白等
        thinking: 'disabled',
        temperature: 0.3,
        maxTokens: 1000,
      });
    } catch (error: any) {
      throw new BadRequestException(
        `封面提示词生成失败：${error?.message || '文本模型调用失败'}`,
      );
    }

    const toolCall = this.pickIngredientToolCall(first.toolCalls);
    if (!toolCall) {
      throw new BadRequestException(
        '封面提示词生成失败：模型没有读取食材',
      );
    }

    const ingredients = await loadIngredients();
    const rows = ingredients
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        preparationMethod: String(item?.preparationMethod ?? '').trim(),
      }))
      .filter((item) => Boolean(item.name));

    if (rows.length === 0) {
      throw new BadRequestException('这个食谱没有可用于生成封面的食材');
    }

    const toolResult = rows
      .map((row) => formatIngredientLine(row.name, row.preparationMethod))
      .join('\n');

    const messages: DeepSeekToolsMessage[] = [
      ...baseMessages,
      { role: 'assistant', content: null, tool_calls: [toolCall] },
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      },
    ];

    let second: Awaited<ReturnType<typeof callDeepSeekTools>>;
    try {
      second = await callDeepSeekTools({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        requestTimeoutMs: config.requestTimeoutMs,
        messages,
        tools: [INGREDIENT_TOOL],
        toolChoice: 'none',
        // 写提示词这一步按老板要求先开着 thinking
        thinking: 'enabled',
        temperature: 0.7,
        maxTokens: 8000,
      });
    } catch (error: any) {
      throw new BadRequestException(
        `封面提示词生成失败：${error?.message || '文本模型调用失败'}`,
      );
    }

    const prompt = sanitizePrompt(second.content);
    if (!prompt) {
      throw new BadRequestException(
        '封面提示词生成失败：文本模型没有返回提示词',
      );
    }

    this.logUsage(first.usage, second.usage);
    this.logger.log(`[cover-brief] ${prompt}`);
    return prompt;
  }

  private pickIngredientToolCall(
    toolCalls: DeepSeekToolCall[],
  ): DeepSeekToolCall | null {
    return (
      toolCalls.find(
        (call) => call.function.name === INGREDIENT_TOOL_NAME,
      ) ??
      toolCalls[0] ??
      null
    );
  }

  private logUsage(
    first: { promptTokens: number; completionTokens: number } | null,
    second: { promptTokens: number; completionTokens: number } | null,
  ): void {
    if (!first && !second) return;
    const promptTokens =
      (first?.promptTokens ?? 0) + (second?.promptTokens ?? 0);
    const completionTokens =
      (first?.completionTokens ?? 0) + (second?.completionTokens ?? 0);
    this.logger.log(
      `[cover-tokens] prompt=${promptTokens} completion=${completionTokens}`,
    );
  }
}

/**
 * 工具结果用自然的一行一种：名称（处理方式）。
 * 不带占比、不带数字；熟/生/干等状态词去掉，封面一律画生的。
 */
function formatIngredientLine(name: string, preparation: string): string {
  const cleaned = cleanPreparation(preparation);
  return cleaned ? `${name}（${cleaned}）` : name;
}

function cleanPreparation(value: string): string {
  return String(value ?? '')
    .split(/[\/、]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !RAW_STATE_TOKENS.has(token))
    .join('、');
}

/** 保留中文；只去代码块、提示词前缀、包裹引号，不按字数截断 */
function sanitizePrompt(value: unknown): string {
  return String(value ?? '')
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .replace(/^(?:提示词|画面描述|Prompt)\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’]+/, '')
    .replace(/["'“”‘’]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
