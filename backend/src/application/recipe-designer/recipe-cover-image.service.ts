import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  ARK_PROVIDER,
  RECIPE_COVER_IMAGE_PURPOSE,
  RECIPE_COVER_PROMPT_PURPOSE,
} from '../nutrition-governance/agent-provider-config.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ImageOptimizationService } from '../../infrastructure/services/image-optimization.service';
import { RecipeCoverConfigService } from './recipe-cover-config.service';
import { RecipeCoverVisualBriefService } from './recipe-cover-visual-brief.service';
import {
  buildRecipeCoverPrompt,
  type RecipeCoverIngredient,
} from './recipe-cover-prompt';
import { callSeedreamImage } from './seedream-image';

/** 生图用途的 provider 配置标识（后台「AI 食谱封面」那条） */
export { RECIPE_COVER_IMAGE_PURPOSE, ARK_PROVIDER };

/** 封面生图至少等 200 秒；Seedream 实测 30–60 秒，留足余量 */
const COVER_IMAGE_REQUEST_TIMEOUT_MS = 200_000;

/** 画面比例：COVER_16_9 走 750×422 压缩；SQUARE 仅兼容旧调用 */
export type RecipeCoverLayout = 'SQUARE' | 'COVER_16_9';

export interface GenerateRecipeCoverInput {
  recipeName: string;
  /** 兼容旧入口；新链路只用 ingredients */
  lifeStageLabels?: string[];
  /** 兼容旧入口；系列 / 定制都用 ingredients */
  foodNames?: string[];
  /** 系列 / 定制封面的完整食材数据（名字 / 部位状态预处理 / 占比） */
  ingredients?: RecipeCoverIngredient[];
  /**
   * 工具取数：写提示词的服务在模型调用 `get_recipe_ingredients` 时才取。
   * 草稿 / 系列各自绑定自己的取数逻辑（权限、阶段优先级仍在后端）。
   */
  loadIngredients?: () => Promise<RecipeCoverIngredient[]>;
  /** 兼容旧字段；Seedream 不传终端用户 */
  customerId?: string | null;
  layout?: RecipeCoverLayout;
}

/**
 * AI 生成食谱封面（DeepSeek prompt + Seedream 5.0 Pro）
 *
 * ```
 * ① DeepSeek 写 Seedream prompt（视觉 brief + 固定约束）
 * ② Seedream 5.0 Pro 生图（2048×1152，watermark:false）
 * ③ 立刻下载 → 750×422 压缩 → 转存 COS
 * ```
 *
 * 不把临时 URL 存库：所有结果立即转存 COS。
 */
@Injectable()
export class RecipeCoverImageService {
  private readonly logger = new Logger(RecipeCoverImageService.name);

  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
    private readonly cosService: TencentCosService,
    private readonly imageOptimizationService: ImageOptimizationService,
    private readonly visualBriefService: RecipeCoverVisualBriefService,
    private readonly recipeCoverConfigService: RecipeCoverConfigService,
  ) {}

  /** DeepSeek / Ark / 提示词三者都就绪才可用 */
  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
        purpose: RECIPE_COVER_PROMPT_PURPOSE,
        fallbackToDefault: false,
      });
      await this.agentProviderConfigService.getEnabledProviderRuntimeConfig({
        purpose: RECIPE_COVER_IMAGE_PURPOSE,
        provider: ARK_PROVIDER,
      });
      await this.recipeCoverConfigService.getPromptTemplate();
      return true;
    } catch {
      return false;
    }
  }

  async generate(input: GenerateRecipeCoverInput): Promise<{
    url: string;
    provider: string;
    model: string;
  }> {
    const config =
      await this.agentProviderConfigService.getEnabledProviderRuntimeConfig({
        purpose: RECIPE_COVER_IMAGE_PURPOSE,
        provider: ARK_PROVIDER,
      });

    // 系列 / 定制：DeepSeek 通过工具取食材再写封面提示词；旧入口才走 foodNames
    const inlineIngredients = input.ingredients ?? [];
    const loadIngredients =
      input.loadIngredients ??
      (inlineIngredients.length
        ? async () => inlineIngredients
        : undefined);
    const imageBrief = loadIngredients
      ? await this.visualBriefService.build(loadIngredients)
      : undefined;

    const prompt = buildRecipeCoverPrompt({
      recipeName: input.recipeName,
      lifeStageLabels: input.lifeStageLabels,
      foodNames: input.foodNames,
      ingredients: input.ingredients,
      imageBrief,
    });

    const layout: RecipeCoverLayout = input.layout ?? 'SQUARE';

    this.logger.log(`[cover] 开始生成：${input.recipeName}`);

    // ① Seedream 生图；size 是 API 参数，不是提示词约束
    const { url: temporaryUrl } = await callSeedreamImage({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: Math.max(
        config.requestTimeoutMs,
        COVER_IMAGE_REQUEST_TIMEOUT_MS,
      ),
      prompt,
      size: '2048x1152',
      watermark: false,
    });

    // ② 立刻下载临时图
    const buffer = await this.downloadTemporaryImage(temporaryUrl);

    // ③ 转存 COS；16:9 走 750×422 / ≤160KB
    let uploadBuffer = buffer;
    let uploadFilename = `ai-cover-${Date.now()}.jpg`;
    if (layout === 'COVER_16_9') {
      const optimized = await this.imageOptimizationService.optimizeForUpload(
        buffer,
        'recipe-cover',
      );
      uploadBuffer = optimized.buffer;
      uploadFilename = optimized.filename;
    }

    const uploaded = await this.cosService.uploadImage(
      uploadBuffer,
      uploadFilename,
      'recipes/covers',
    );

    this.logger.log(`[cover] 生成完成：${uploaded.url}`);

    return {
      url: uploaded.url,
      provider: config.provider,
      model: config.model,
    };
  }

  private async downloadTemporaryImage(url: string): Promise<Buffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) {
        throw new Error('图片内容为空');
      }
      return buffer;
    } catch (error: any) {
      this.logger.error(`[cover] 下载临时图失败：${error?.message}`);
      throw new BadRequestException(
        '图片已生成但下载失败（链接可能已过期），请重新生成',
      );
    }
  }
}
