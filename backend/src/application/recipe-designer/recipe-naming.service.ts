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

/**
 * 命名没有单独配置时，复用这些用途的模型配置。
 *
 * 为什么不是回退到 `DEFAULT`：`DEFAULT_AGENT_PURPOSE = 'DEFAULT'` 只是一个
 * 名义上的兜底，生产库**从来没有这一行**（只有 RECIPE_DESIGN / RECIPE_COPYWRITING
 * 等具名用途）。所以"回退到默认"实际上等于"没有配置"，按钮永远是灰的。
 * 这里按顺序找一个**确实存在**的文本模型用途。
 */
const RECIPE_NAMING_FALLBACK_PURPOSES = ['RECIPE_COPYWRITING', 'RECIPE_DESIGN'];

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
  /** 已在架的产品线名字：模型据此避重，服务端再兜一次 */
  existingNames?: string[];
}

export interface RecipeNameCandidate {
  name: string;
  valuePoint: string;
  ingredients: string;
  /** 已不再要求模型输出，保留字段兼容历史响应 */
  reason: string;
  /** 命中了现有禁用词表：保留候选但提醒，不拒绝（词表尚未完善） */
  complianceWarning: boolean;
  /** 与在架食谱同名 */
  duplicate: boolean;
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
      await this.resolveRuntimeConfig();
      return true;
    } catch {
      return false;
    }
  }

  /** 依次尝试：命名专用配置 → 文案/设计用途 → 名义默认（会抛原始错误） */
  private async resolveRuntimeConfig() {
    const purposes = [
      RECIPE_NAMING_AGENT_PURPOSE,
      ...RECIPE_NAMING_FALLBACK_PURPOSES,
    ];
    let lastError: unknown = null;
    for (const purpose of purposes) {
      try {
        return await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig(
          { purpose, fallbackToDefault: false },
        );
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    throw new BadRequestException('DeepSeek Agent 设置未启用');
  }

  async generate(input: RecipeNamingInput): Promise<RecipeNamingResult> {
    const config = await this.resolveRuntimeConfig();

    const startedAt = Date.now();
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
        existingNames: input.existingNames ?? [],
      },
    });

    // 命名是用户要盯着转圈的动作，耗时值得留痕（模型/超时都能从这一行看出来）
    console.log(
      `[RecipeNaming] provider=${config.provider} model=${config.model} 耗时=${Date.now() - startedAt}ms`,
    );

    return {
      candidates: this.normalizeCandidates(parsed, input.existingNames ?? []),
      provider: config.provider,
    };
  }

  private normalizeCandidates(
    parsed: Record<string, unknown>,
    existingNames: string[],
  ): RecipeNameCandidate[] {
    const taken = new Set(existingNames.map((name) => name.trim()));
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
          // 不依赖模型自觉：服务端再比一次，重名必须显式标出来
          duplicate: taken.has(name),
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
    '你是宠物鲜食工作室的命名编辑，给一道已定稿的食谱起名。这个名字会出现在小程序货架上，也会印到生产标签上。',
    '',
    '格式：价值点｜食材（全角竖线）。',
    '  · 价值点＝顾客为什么买；食材＝碳水/辅料在前、主蛋白在最后。',
    '  · 例：低脂｜红薯鸡胸肉、均衡营养｜三文鱼牛霖。',
    '',
    `硬要求：≤${RECIPE_NAME_MAX_LENGTH} 个字（含竖线）；价值点必须能从给定事实推出，不得虚构；食材必须来自 foodItems；不写数字、百分比、疾病名、医疗用语和功效承诺（含「低敏」）。`,
    '输入里没有的事实一律不写；拿不准就换成更保守的说法。',
    '',
    '不能与 existingNames 里的任何名字重复（那些是在架食谱）。',
    '',
    '输出 JSON：candidates 数组，2 条，每条含 name / valuePoint / ingredients。',
    '两条的价值点不能重复：一条讲配方构成，一条讲适用场景或工艺。',
  ].join('\n');
}
