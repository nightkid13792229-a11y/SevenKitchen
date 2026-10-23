import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AgentProviderConfigService,
  DEFAULT_AGENT_PURPOSE,
  type DeepSeekRuntimeConfig,
} from '../nutrition-governance/agent-provider-config.service';
import { RECIPE_DESIGN_AGENT_PURPOSE } from '../recipe-designer/ai-design-suggestion.service';
import {
  callDeepSeekJson,
  normalizeOptionalText,
} from '../recipe-designer/deepseek-chat';

/** 原料录入的第一步判断单独走这个用途；没单独配就按下面的链回落。 */
export const INGREDIENT_INTAKE_AGENT_PURPOSE = 'INGREDIENT_INTAKE';

/**
 * 取运行时配置的回落链。
 *
 * 线上只有 RECIPE_DESIGN / RECIPE_COPYWRITING / HEALTH_REPORT_EXTRACTION /
 * HEALTH_ANALYSIS 四条，既没有 INGREDIENT_INTAKE 也没有 DEFAULT；只回落到
 * DEFAULT 会让接口一直 503。RECIPE_DESIGN 在生产上一定存在且已启用，用它兜底。
 */
export const INGREDIENT_INTAKE_AGENT_PURPOSES = [
  INGREDIENT_INTAKE_AGENT_PURPOSE,
  DEFAULT_AGENT_PURPOSE,
  RECIPE_DESIGN_AGENT_PURPOSE,
] as const;

export const INTAKE_KINDS = ['FOOD', 'SUPPLEMENT', 'UNKNOWN'] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];

export interface IntakeClassification {
  kind: IntakeKind;
  reply: string;
  suggestions: string[];
}

/** 这一步只是分类判断，不需要模型想很久。 */
const CLASSIFY_TIMEOUT_MS = 8_000;
const CLASSIFY_TEMPERATURE = 0.2;
const CLASSIFY_MAX_TOKENS = 1_200;
/** UNKNOWN 必须给用户可点的下一步，不能只丢一句追问。 */
const UNKNOWN_SUGGESTION_MIN = 2;
const SUGGESTION_MAX = 3;

const AI_NOT_CONFIGURED_MESSAGE =
  'AI 当前不可用，请在「原料营养治理 → Agent 设置」里启用并配置模型';
const AI_TEMPORARILY_UNAVAILABLE_MESSAGE = 'AI 暂时不可用，请稍后重试';

/**
 * 判断用户输入的是食材还是补剂。
 *
 * 只做分类，不做规则兜底：AI 没启用/没配 Key 或两次调用都失败时直接 503，
 * 避免用规则猜出来的类别把用户带进错误的那条线。
 */
@Injectable()
export class IngredientCreationIntakeService {
  private readonly logger = new Logger(IngredientCreationIntakeService.name);

  constructor(
    private readonly agentProviderConfig: AgentProviderConfigService,
  ) {}

  async classify(text: string): Promise<IntakeClassification> {
    const normalizedText = normalizeOptionalText(text);
    if (!normalizedText) {
      throw new BadRequestException('请输入要添加的原料名称');
    }

    // 取配置本身就是回落链：每一级都要求 enabled 且有 key，不满足就跳下一级。
    const runtime = await this.loadRuntimeConfig();

    const primaryModel = normalizeOptionalText(runtime.model);
    // review_model 可能是 null：配置服务会回落成 model，
    // 这里仍按“没配备模型 = 用同一个 model 再试一次”处理，不因空值提前失败。
    const reviewModel = normalizeOptionalText(runtime.reviewModel);
    const models = [primaryModel, reviewModel || primaryModel];

    for (let index = 0; index < models.length; index += 1) {
      const model = models[index];
      try {
        const result = await this.classifyWithModel({
          baseUrl: runtime.baseUrl,
          apiKey: runtime.apiKey,
          model,
          text: normalizedText,
        });
        this.logger.log(
          `[intake-classify] 判定成功 model=${model} kind=${result.kind}`,
        );
        return result;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[intake-classify] 判定失败 model=${model} attempt=${index + 1}/${models.length}: ${reason}`,
        );
      }
    }

    this.logger.error(
      `[intake-classify] 两次判定均失败 models=${models.join(',')}`,
    );
    throw new ServiceUnavailableException(AI_TEMPORARILY_UNAVAILABLE_MESSAGE);
  }

  /**
   * 按 INGREDIENT_INTAKE → DEFAULT → RECIPE_DESIGN 依次取配置。
   *
   * `fallbackToDefault: false` 是刻意的：配置服务自己的 DEFAULT 回落只能兜到第二级，
   * 而且看不出实际用了哪一级；这里逐级显式尝试，命中哪级就记哪级。
   */
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
          `[intake-classify] 使用 AI 配置 purpose=${purpose}${fallbackNote}`,
        );
        return runtime;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        skipped.push(purpose);
        this.logger.warn(
          `[intake-classify] 跳过 AI 配置 purpose=${purpose}: ${reason}`,
        );
      }
    }

    this.logger.error(
      `[intake-classify] AI 配置不可用 tried=${INGREDIENT_INTAKE_AGENT_PURPOSES.join(',')}`,
    );
    throw new ServiceUnavailableException(AI_NOT_CONFIGURED_MESSAGE);
  }

  private async classifyWithModel(input: {
    baseUrl: string;
    apiKey: string;
    model: string;
    text: string;
  }): Promise<IntakeClassification> {
    const parsed = await callDeepSeekJson({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
      requestTimeoutMs: CLASSIFY_TIMEOUT_MS,
      temperature: CLASSIFY_TEMPERATURE,
      maxTokens: CLASSIFY_MAX_TOKENS,
      systemPrompt: buildIngredientIntakeClassifyPrompt(),
      userPayload: { text: input.text },
    });

    return normalizeClassification(parsed);
  }
}

export function buildIngredientIntakeClassifyPrompt(): string {
  return [
    '你是宠物鲜食后台的原料录入助手。用户会给你一句话，你只做一件事：判断它指的是「食材」还是「补剂」。',
    '',
    '判定标准：',
    '- FOOD（食材）：肉类、内脏、水产、蛋、蔬菜、谷物、水果等可食用农产品。',
    '- SUPPLEMENT（补剂）：矿物质、维生素、鱼油、益生菌、氨基酸制剂等营养补充剂。',
    '- UNKNOWN：不是原料（例如“今天天气”）、你拿不准、或一句话里同时出现食材和补剂。',
    '',
    '硬约束：',
    '- 只判断类别，不评价营养、不给建议、不推荐做法、不输出营养数值。',
    '- 拿不准就返回 UNKNOWN 并追问，不要硬猜。',
    '- reply 是给用户看的一句中文，要短、口语、不要客套。',
    '  - FOOD 用：「这是食材。好，我们走食材这条路。」',
    '  - SUPPLEMENT 用：「这是补剂。好，我们走补剂这条路。」',
    '  - UNKNOWN 用一句追问，例如：「我没太确定，你想加的是食材还是补剂？」',
    '- kind 为 UNKNOWN 时，suggestions 给 2–3 个用户可以直接点的中文回复；',
    '  kind 为 FOOD 或 SUPPLEMENT 时，suggestions 返回空数组。',
    '- 只输出 JSON，不要 Markdown、不要解释。',
    '输出格式严格为：',
    '{"kind":"FOOD|SUPPLEMENT|UNKNOWN","reply":"...","suggestions":["..."]}',
  ].join('\n');
}

function normalizeClassification(
  parsed: Record<string, unknown>,
): IntakeClassification {
  const kind = normalizeOptionalText(parsed.kind).toUpperCase();
  if (!isIntakeKind(kind)) {
    throw new BadRequestException('AI 返回的分类无效');
  }

  const reply = normalizeOptionalText(parsed.reply);
  if (!reply) {
    throw new BadRequestException('AI 返回的回复为空');
  }

  if (kind !== 'UNKNOWN') {
    return { kind, reply, suggestions: [] };
  }

  const suggestions = Array.isArray(parsed.suggestions)
    ? Array.from(
        new Set(
          parsed.suggestions
            .map((entry) => normalizeOptionalText(entry))
            .filter((entry): entry is string => Boolean(entry)),
        ),
      ).slice(0, SUGGESTION_MAX)
    : [];

  if (suggestions.length < UNKNOWN_SUGGESTION_MIN) {
    throw new BadRequestException('AI 返回的追问建议不足');
  }

  return { kind, reply, suggestions };
}

function isIntakeKind(value: string): value is IntakeKind {
  return (INTAKE_KINDS as readonly string[]).includes(value);
}
