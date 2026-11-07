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

/** 只读工具：模型需要先取当前食谱的食材，才能写形态说明 */
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
 * 让 DeepSeek 当「食物造型师」（2026-11-07 结构化版）
 *
 * 模型只负责一件事：给每样食材写一句「形态说明」（整块/切片/堆成小堆……）。
 * 摆在哪、台面是什么、光线怎么打，全部由 `cover-style.ts` 的模板固定，
 * 这样同一套规则下的输出才稳定、可回归，也不会每张都换一个风格。
 *
 * 返回 `名称 → 形态` 的映射；解析失败时返回空对象，调用方会退回
 * 「处理方式 + 自然形态」，保证不会因为模型话术变化就生成不了封面。
 */
@Injectable()
export class RecipeCoverVisualBriefService {
  private readonly logger = new Logger(RecipeCoverVisualBriefService.name);

  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
    private readonly recipeCoverConfigService: RecipeCoverConfigService,
  ) {}

  async buildForms(
    loadIngredients: () => Promise<RecipeCoverIngredient[]>,
  ): Promise<Record<string, string>> {
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
      throw new BadRequestException('封面提示词生成失败：模型没有读取食材');
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
      {
        role: 'assistant',
        content: null,
        // 第二轮开启思考时，DeepSeek 要求把上一轮 assistant 的 reasoning_content 带回；
        // 取数那一轮是关闭状态，回传空串即可。
        reasoning_content: '',
        tool_calls: [toolCall],
      },
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
        // 写形态说明要一点联想，但别太飘；0.4 比 0.7 稳定
        thinking: 'disabled',
        temperature: 0.4,
        maxTokens: 1200,
      });
    } catch (error: any) {
      throw new BadRequestException(
        `封面提示词生成失败：${error?.message || '文本模型调用失败'}`,
      );
    }

    const forms = parseForms(
      second.content,
      rows.map((row) => row.name),
    );
    const filled = Object.keys(forms).length;
    this.logUsage(first.usage, second.usage);
    this.logger.log(
      `[cover-forms] ${filled}/${rows.length} 项：${JSON.stringify(forms)}`,
    );

    if (filled === 0) {
      // 不阻断：调用方会用「处理方式」兜底
      this.logger.warn(
        '[cover-forms] 模型没有按「名称｜形态」返回，改用处理方式兜底',
      );
    }
    return forms;
  }

  private pickIngredientToolCall(
    toolCalls: DeepSeekToolCall[],
  ): DeepSeekToolCall | null {
    return (
      toolCalls.find((call) => call.function.name === INGREDIENT_TOOL_NAME) ??
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

/**
 * 解析「名称｜形态」行。
 * 容错：去掉列表符号/序号、全角半角竖线、书名号；名称对不上时按包含匹配。
 * 没有一条能对上时返回空对象，让调用方兜底。
 */
export function parseForms(
  content: unknown,
  ingredientNames: string[],
): Record<string, string> {
  const text = String(content ?? '')
    .replace(/```[a-zA-Z]*/g, '')
    .replace(/```/g, '')
    .trim();
  if (!text) return {};

  const result: Record<string, string> = {};
  const names = ingredientNames.map((name) => String(name ?? '').trim());

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(
      /^[\s\-*•\d.、)）]*([^｜|:：]{1,30})[｜|:：]\s*(.+)$/,
    );
    if (!match) continue;

    const rawName = match[1]
      .replace(/[《》「」【】"“”']/g, '')
      .replace(/[（(].*?[)）]/g, '')
      .trim();
    const form = match[2].replace(/[。；;]$/, '').trim();
    if (!rawName || !form) continue;

    const exact = names.find((name) => name === rawName);
    const loose =
      exact ??
      names.find(
        (name) =>
          name.includes(rawName) ||
          rawName.includes(name) ||
          name.replace(/[（(].*?[)）]/g, '').trim() === rawName,
      );
    if (loose && !result[loose]) {
      result[loose] = form.length > 40 ? form.slice(0, 40) : form;
    }
  }

  return result;
}
