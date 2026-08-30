import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import type {
  DogDesignHistorySummary,
  DogOrderSummary,
} from '../../domain/recipe-designer/dog-design-insight';

const DEEPSEEK_CHAT_PATH = '/chat/completions';

export interface AiSuggestionIngredientItem {
  name: string;
  reason: string;
}

export interface AiSuggestionNutritionPoint {
  point: string;
  reason: string;
}

export interface AiSuggestionSupplementItem {
  name: string;
  reason: string;
}

export interface AiDesignSuggestionResult {
  summary: string;
  ingredientSuggestions: AiSuggestionIngredientItem[];
  avoidIngredients: AiSuggestionIngredientItem[];
  nutritionFocus: AiSuggestionNutritionPoint[];
  supplementSuggestions: AiSuggestionSupplementItem[];
  reuseSuggestions: AiSuggestionIngredientItem[];
  warnings: string[];
  provider: string;
}

export interface AiDesignSuggestionInput {
  dog: {
    name: string;
    breedName: string | null;
    lifeStageLabel: string | null;
    currentWeightKg: number;
    allergyFoods: string | null;
    pickyFoods: string | null;
    preferredFoods: string | null;
    medicalHistory: string | null;
  };
  designHistory: DogDesignHistorySummary;
  orderSummary: DogOrderSummary;
  currentDraft?: {
    name: string;
    scenario: string;
    items: Array<{ name: string; weightG: number; isSupplement: boolean }>;
    assessmentSummary?: string;
  } | null;
}

@Injectable()
export class AiDesignSuggestionService {
  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.assertCanRun();
      return true;
    } catch {
      return false;
    }
  }

  async generate(
    input: AiDesignSuggestionInput,
  ): Promise<AiDesignSuggestionResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig();

    const parsed = await this.callDeepSeek({
      input,
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
    });

    return normalizeSuggestionResult(parsed, {
      provider: config.provider,
    });
  }

  private async callDeepSeek(input: {
    input: AiDesignSuggestionInput;
    baseUrl: string;
    model: string;
    apiKey: string;
    requestTimeoutMs: number;
  }): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      input.requestTimeoutMs,
    );
    try {
      const response = await fetch(
        `${input.baseUrl.replace(/\/+$/, '')}${DEEPSEEK_CHAT_PATH}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: input.model,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: buildAiSuggestionSystemPrompt(),
              },
              {
                role: 'user',
                content: JSON.stringify({
                  task: 'generate_dog_recipe_design_suggestions',
                  dog: input.input.dog,
                  designHistory: input.input.designHistory,
                  orderSummary: input.input.orderSummary,
                  currentDraft: input.input.currentDraft ?? null,
                }),
              },
            ],
            temperature: 0.3,
          }),
        },
      );

      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new BadRequestException('AI 设计建议生成失败');
      }
      return parseDeepSeekJsonOutput(responseBody);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildAiSuggestionSystemPrompt(): string {
  return [
    '你是一名资深宠物犬鲜食营养师，为宠物鲜食工作室的配方设计提供辅助建议。',
    '你会收到一只犬的档案信息、历史设计食谱使用过的食材汇总、历史订单信息，以及当前正在设计的配方（可能为空）。',
    '请基于这些信息，给出针对这只犬的食谱设计建议，帮助营养师快速决定食材选择与营养方案。',
    '输出必须是 JSON 对象，字段如下：',
    'summary: string，用 1-2 句话概括这只犬的核心营养要点与设计方向。',
    'ingredientSuggestions: [{name: string, reason: string}]，推荐使用的食材（0-8 项），reason 说明推荐理由（结合过敏、疾病、体重、阶段、既往喜好）。',
    'avoidIngredients: [{name: string, reason: string}]，应避免的食材（0-8 项），reason 说明原因（过敏、疾病禁忌、既往不爱吃等）。',
    'nutritionFocus: [{point: string, reason: string}]，营养注意点（0-6 项），如控制脂肪、补钙、低磷、增加纤维等，reason 说明依据。',
    'supplementSuggestions: [{name: string, reason: string}]，补剂建议（0-6 项），如钙粉、鱼油、维生素 E 等，reason 说明依据（如钙磷比不足）。',
    'reuseSuggestions: [{name: string, reason: string}]，可从既往设计中沿用的食材（0-6 项，来自 designHistory.ingredients），reason 说明为何可沿用。',
    'warnings: string[]，任何需要人工核对的注意点（如档案信息缺失、既往食材与当前疾病冲突）。',
    '要求：只基于提供的信息推断，不要虚构；涉及疾病/药物建议时保持克制，标注需咨询兽医；所有建议均为辅助参考，最终由营养师人工判断。',
  ].join('\n');
}

export function normalizeSuggestionResult(
  parsed: Record<string, unknown>,
  context: { provider: string },
): AiDesignSuggestionResult {
  const warnings = normalizeStringArray(parsed.warnings);
  if (!Array.isArray(parsed.ingredientSuggestions)) {
    warnings.push('AI 未返回食材建议，请人工设计');
  }
  return {
    summary: normalizeOptionalText(parsed.summary) || '暂无总结',
    ingredientSuggestions: normalizeItemList(parsed.ingredientSuggestions),
    avoidIngredients: normalizeItemList(parsed.avoidIngredients),
    nutritionFocus: normalizePointList(parsed.nutritionFocus),
    supplementSuggestions: normalizeItemList(parsed.supplementSuggestions),
    reuseSuggestions: normalizeItemList(parsed.reuseSuggestions),
    warnings,
    provider: context.provider,
  };
}

function normalizeItemList(
  value: unknown,
): Array<{ name: string; reason: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      name: normalizeOptionalText(entry.name) || '未命名',
      reason: normalizeOptionalText(entry.reason) || '',
    }))
    .filter((entry) => Boolean(entry.name && entry.name !== '未命名'));
}

function normalizePointList(
  value: unknown,
): Array<{ point: string; reason: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      point: normalizeOptionalText(entry.point) || normalizeOptionalText(entry.name) || '',
      reason: normalizeOptionalText(entry.reason) || '',
    }))
    .filter((entry) => Boolean(entry.point));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeOptionalText(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeOptionalText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseDeepSeekJsonOutput(responseBody: unknown): Record<string, unknown> {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new BadRequestException('AI 设计建议生成失败：无效响应');
  }
  const choices = (responseBody as any).choices;
  const text = choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new BadRequestException('AI 设计建议生成失败：无内容');
  }
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    const parsed = JSON.parse(stripped);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new BadRequestException('AI 设计建议生成失败：结果不是有效 JSON');
  }
}
