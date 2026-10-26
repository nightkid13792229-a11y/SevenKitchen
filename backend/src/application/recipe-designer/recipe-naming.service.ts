import { BadRequestException, Injectable } from '@nestjs/common';

import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { callDeepSeekJson } from './deepseek-chat';
import { getForbiddenClaimPatterns, scanForbiddenClaims } from './recipe-copywriting-compliance';

/**
 * 食谱命名（2026-10-27 第二阶段）。
 *
 * 与 `recipe-copywriting.service.ts` 同构：一次性调用，不建会话、不写库。
 * 区别只有两点：
 *   · 输出是**名字候选**而不是文案；
 *   · 温度更高（0.7），因为名字需要发散，文案需要稳。
 *
 * 硬约束只有一条：**每个名字 ≤ 12 字**（全角计）。
 * 标签是 70mm 纸、5mm 字号、单行不换行，61mm 可用宽度装不下第 13 个字——
 * 超长的候选直接丢弃，不做截断（截断会造出一个意思不通的词）。
 */

export const RECIPE_NAMING_AGENT_PURPOSE = 'RECIPE_NAMING';

/** 名称硬上限：与生产标签的单行宽度对齐。 */
export const RECIPE_NAME_MAX_LENGTH = 12;

export interface RecipeNamingFoodItem {
  name: string;
  ratio: number | null;
}

export interface RecipeNamingInput {
  foodItems: RecipeNamingFoodItem[];
  energyDensityKcalPerKg?: number | null;
  moisturePercent?: number | null;
  proteinPercentDm?: number | null;
  fatPercentDm?: number | null;
  lifeStageLabels: string[];
  currentName?: string | null;
}

export interface RecipeNameCandidate {
  name: string;
  valuePoint: string;
  ingredients: string;
  reason: string;
  /** 命中了现有禁用词表：保留候选但提醒，不拒绝（词表尚未完善） */
  complianceWarning: boolean;
}

export interface RecipeNamingResult {
  candidates: RecipeNameCandidate[];
  provider: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

@Injectable()
export class RecipeNamingService {
  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_NAMING_AGENT_PURPOSE,
      });
      return true;
    } catch {
      return false;
    }
  }

  async generate(input: RecipeNamingInput): Promise<RecipeNamingResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_NAMING_AGENT_PURPOSE,
      });

    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildRecipeNamingSystemPrompt(),
      temperature: 0.7,
      userPayload: {
        task: 'generate_recipe_names',
        recipe: {
          foodItems: input.foodItems,
          energyDensityKcalPerKg: input.energyDensityKcalPerKg ?? null,
          moisturePercent: input.moisturePercent ?? null,
          proteinPercentDm: input.proteinPercentDm ?? null,
          fatPercentDm: input.fatPercentDm ?? null,
          lifeStages: input.lifeStageLabels,
          currentName: input.currentName ?? null,
        },
        maxLength: RECIPE_NAME_MAX_LENGTH,
        forbiddenPatterns: getForbiddenClaimPatterns(),
      },
    });

    return {
      candidates: this.normalizeCandidates(parsed),
      provider: config.provider,
    };
  }

  private normalizeCandidates(
    parsed: Record<string, unknown>,
  ): RecipeNameCandidate[] {
    const raw = Array.isArray(parsed.candidates) ? parsed.candidates : [];

    const candidates = raw
      .map((item) => {
        const source = (item ?? {}) as Record<string, unknown>;
        const name = text(source.name);
        if (!name) return null;
        // 超长的直接丢，不截断
        if ([...name].length > RECIPE_NAME_MAX_LENGTH) return null;

        return {
          name,
          valuePoint: text(source.valuePoint),
          ingredients: text(source.ingredients),
          reason: text(source.reason),
          complianceWarning: scanForbiddenClaims(name).length > 0,
        } satisfies RecipeNameCandidate;
      })
      .filter((item): item is RecipeNameCandidate => item !== null);

    if (candidates.length === 0) {
      throw new BadRequestException(
        'AI 没能给出可用的名字（可能都超了 12 字），请重试',
      );
    }

    return candidates;
  }
}

export function buildRecipeNamingSystemPrompt(): string {
  return [
    '你是宠物鲜食工作室的命名编辑。你要为一个**已经定稿的食谱**起名字，顾客会在小程序货架上看到它，这个名字还会印到生产标签上。',
    '',
    '【命名格式】必须是「价值点｜食材」两段，用全角竖线「｜」分隔。',
    '  · 价值点：顾客为什么买。例如 全价、低脂、高蛋白、单一动物蛋白、鲜肉、蒸煮、均衡营养。',
    '  · 食材：主蛋白放第一位，可以带一个主碳水。例如「红薯鸡胸肉」「三文鱼牛霖」。',
    '',
    '【硬性要求】',
    `- 每条名字**最多 ${RECIPE_NAME_MAX_LENGTH} 个字**（中文按字算，含分隔符）。超过的不要输出——标签是一行不换行的，多一个字就印不下。`,
    '- 价值点必须能从输入事实推出来（配料占比、能量密度、水分、蛋白、脂肪、生命阶段），**不得虚构**。',
    '- 食材必须是输入的 foodItems 里真实存在的，按占比从高到低取。',
    '- 不要出现疾病名、医疗用语、功效承诺（改善/预防/治疗/护肝/护肾/增强免疫），也不要使用「低敏」「脱敏」这类不规范声称。',
    '- 不要出现数字和百分比，顾客看不懂，也不进名字。',
    '',
    '【给什么就写什么】',
    '- 输入里没有的事实，一律不要写。比如没告诉你「无谷」，就不要写无谷。',
    '- 拿不准某个价值点是否成立时，换一个更保守的说法（例如「均衡营养」）。',
    '',
    '输出必须是 JSON 对象：',
    'candidates: 数组，3 条候选，每条包含：',
    '  name: string，完整名字，格式「价值点｜食材」，≤12 字；',
    '  valuePoint: string，你选的价值点；',
    '  ingredients: string，你用的食材；',
    '  reason: string，一句话说明这个价值点是从哪个输入事实推出来的。',
  ].join('\n');
}
