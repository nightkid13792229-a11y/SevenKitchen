import { BadRequestException, Injectable } from '@nestjs/common';

import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { callDeepSeekJson } from './deepseek-chat';
import {
  assertCopywritingCompliant,
  getForbiddenClaimPatterns,
  normalizeCopywritingOutput,
  type RecipeCopywritingPayload,
} from './recipe-copywriting-compliance';

/** 食谱文案生成对应的 Agent 用途（未单独配置时回退全局默认） */
export const RECIPE_COPYWRITING_AGENT_PURPOSE = 'RECIPE_COPYWRITING';

export interface RecipeCopywritingFoodItem {
  name: string;
  ratio?: number | null;
}

export interface RecipeCopywritingSupplementItem {
  name: string;
  /** 已格式化的目标文案，如「每kg食材添加2800mg钙」 */
  targetText: string;
}

export interface RecipeCopywritingInput {
  recipeName: string;
  nutritionStandard: string;
  lifeStageLabels: string[];
  energyDensityKcalPerKg?: number | null;
  moisturePercent?: number | null;
  fatPercentDm?: number | null;
  proteinPercentDm?: number | null;
  foodItems: RecipeCopywritingFoodItem[];
  supplementItems: RecipeCopywritingSupplementItem[];
  /** 当前已有说明（供参考，避免大改风格） */
  currentDescription?: string | null;
  /** 允许推荐的标签（合规白名单，通常为叶子标签） */
  allowedTags: string[];
}

export interface RecipeCopywritingResult extends RecipeCopywritingPayload {
  provider: string;
}

@Injectable()
export class RecipeCopywritingService {
  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_COPYWRITING_AGENT_PURPOSE,
      });
      return true;
    } catch {
      return false;
    }
  }

  async generate(
    input: RecipeCopywritingInput,
  ): Promise<RecipeCopywritingResult> {
    const config =
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_COPYWRITING_AGENT_PURPOSE,
      });

    const parsed = await callDeepSeekJson({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      systemPrompt: buildRecipeCopywritingSystemPrompt(),
      temperature: 0.4,
      userPayload: {
        task: 'generate_recipe_selling_point',
        recipe: {
          name: input.recipeName,
          nutritionStandard: input.nutritionStandard,
          lifeStages: input.lifeStageLabels,
          energyDensityKcalPerKg: input.energyDensityKcalPerKg ?? null,
          moisturePercent: input.moisturePercent ?? null,
          fatPercentDm: input.fatPercentDm ?? null,
          proteinPercentDm: input.proteinPercentDm ?? null,
          foodItems: input.foodItems,
          supplementItems: input.supplementItems,
          currentDescription: input.currentDescription ?? null,
        },
        allowedTags: input.allowedTags,
        forbiddenPatterns: getForbiddenClaimPatterns(),
      },
    });

    const payload = normalizeCopywritingOutput(parsed, input.allowedTags);
    // 合规硬校验：命中禁用表述则整条拒绝，并指出命中的词
    assertCopywritingCompliant(payload);

    if (!payload.sellingPoint || !payload.description) {
      throw new BadRequestException('AI 生成结果不完整，请重试');
    }

    return { ...payload, provider: config.provider };
  }
}

export function buildRecipeCopywritingSystemPrompt(): string {
  return [
    '你是宠物鲜食工作室的合规文案编辑。你的任务是为一个**已经定稿的食谱**撰写对顾客展示的卖点与说明。',
    '',
    '【最重要的合规红线】',
    '依据《宠物饲料标签规定》第二十条第（一）项：禁止对宠物饲料作具有预防或者治疗宠物疾病的说明或者宣传。',
    '因此你**绝对不能**写出任何：疾病名（肾/肝/关节/心脏/肿瘤/结石/糖尿病/炎症/过敏等）、医疗用语（抗炎/消炎/治疗/处方/药物）、',
    '功效承诺（改善/预防/增强免疫/排毒/护肝/护肾）或不规范声称（低敏/脱敏）。',
    '你会收到 forbiddenPatterns 列表，**任何一项都不允许出现在输出中**。',
    '',
    '【可用的卖点维度】只能使用以下几类事实型表述：',
    '1. 原料事实：如「含鳕鱼」「含红薯」「单一动物蛋白」——必须与 foodItems 一致。',
    '2. 工艺特性：如「鲜肉现制」「低温蒸煮」「冷链配送」「无防腐剂」。',
    '3. 适用对象：如「成犬维持」「老年犬」「挑食友好」——必须与 lifeStages 一致。',
    '4. 标准背书：如「符合 FEDIAF 2025」——必须与 nutritionStandard 一致。',
    '',
    '【硬性要求】',
    '- 只允许基于给定的 recipe 事实描述，**不得虚构**任何成分、功效、认证或数字。',
    '- suggestedTags 只能从 allowedTags 中挑选（0-4 个），不得创造新标签。',
    '- sellingPoint 为一句话（不超过 30 个汉字），要具体、有信息量，避免空泛形容词。',
    '- description 为 80~150 字的客观描述：说明主要动物蛋白来源、碳水/蔬菜搭配、适用阶段与标准依据。',
    '- 语气专业平实，面向宠物家长，不使用夸张营销语（如「顶级」「神仙」「必买」）。',
    '- **不要在文案里出现技术指标裸值**：如「含水量 69.16%」「能量密度 1244 kcal/kg」「干物质脂肪 10.5%」。',
    '  家长看不懂这些数字（详情页也只以通俗方式呈现）。要表达水分高就说「鲜食含水量高，口感湿润」，而不是给百分比。',
    '- 不要在文案里出现「原料表」「配方食材」「本配方」这类内部/表格化表述，直接自然叙述即可。',
    '- sellingPoint 建议句式：「含 A 与 B，适合 X，符合 Y」——一句话讲清成分、适用对象与标准。',
    '- basis 用一句话说明你的依据来源（如「依据配方原料与营养标准」）。',
    '',
    '输出必须是 JSON 对象，字段如下：',
    'sellingPoint: string，一句话卖点。',
    'description: string，详细说明。',
    'suggestedTags: string[]，从 allowedTags 中选择的推荐标签。',
    'basis: string，生成依据的一句话说明。',
  ].join('\n');
}
