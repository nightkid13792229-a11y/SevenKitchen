import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  AgentProviderConfigService,
  RECIPE_COVER_IMAGE_PURPOSE,
  ZHIPU_PROVIDER,
} from '../nutrition-governance/agent-provider-config.service';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';
import { ImageOptimizationService } from '../../infrastructure/services/image-optimization.service';
import { buildRecipeCoverPrompt, callZhipuImage } from './zhipu-image';

/** 生图用途的 provider 配置标识（后台「智谱封面图」那条） */
export { RECIPE_COVER_IMAGE_PURPOSE, ZHIPU_PROVIDER };

/**
 * 封面图的画面比例（2026-10-27）。
 *
 * - `SQUARE`：旧「编辑食谱」页的单食谱封面，方图，行为保持不变；
 * - `COVER_16_9`：产品线系列封面，小程序首页/详情页是横图，
 *   方图会被上下裁掉近一半，所以单独出 16:9 再压成 750×422。
 */
export type RecipeCoverLayout = 'SQUARE' | 'COVER_16_9';

export interface GenerateRecipeCoverInput {
  recipeName: string;
  /** 适用生命阶段的中文标签，只用于提示词 */
  lifeStageLabels?: string[];
  /** 主要食材名，只用于提示词 */
  foodNames?: string[];
  /** 传了就以平台身份标识给智谱（官方建议，便于内容安全干预） */
  customerId?: string | null;
  /** 画面比例，缺省 = SQUARE（旧入口零变化） */
  layout?: RecipeCoverLayout;
}

/**
 * AI 生成食谱封面图（2026-10-18）
 *
 * ## 三步，一步都不能省
 *
 * ```
 * ① 调智谱生图  → 拿到一个**临时链接**
 * ② 立刻下载    → 转成 Buffer
 * ③ 上传 COS    → 换成**我们自己的**地址
 * ```
 *
 * ## ⚠️ 为什么必须有第 ②③ 步
 *
 * 智谱官方原文：**"The temporary link expires after 30 days, please store it promptly."**
 *
 * 如果图省事把 ① 返回的 url 直接存进数据库，**30 天后所有封面图会变空白** ——
 * 而且是**静默失效**：没有任何报错，顾客只是看到一片空白。
 *
 * 所以第 ②③ 步不是"优化"，是**正确性要求**。
 *
 * ## 失败会对顾客造成什么
 *
 * 不会。这个功能只被后台管理员手动触发，失败就是"这次没生成出来，再点一次"。
 * 已有的封面图不受影响。
 */
@Injectable()
export class RecipeCoverImageService {
  private readonly logger = new Logger(RecipeCoverImageService.name);

  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
    private readonly cosService: TencentCosService,
    private readonly imageOptimizationService: ImageOptimizationService,
  ) {}

  /** 后台按钮要根据它决定"能不能点" —— 没配就不让点，而不是点了才报错 */
  async isAvailable(): Promise<boolean> {
    try {
      await this.agentProviderConfigService.getEnabledProviderRuntimeConfig({
        purpose: RECIPE_COVER_IMAGE_PURPOSE,
        provider: ZHIPU_PROVIDER,
      });
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
        provider: ZHIPU_PROVIDER,
      });

    const prompt = buildRecipeCoverPrompt({
      recipeName: input.recipeName,
      lifeStageLabels: input.lifeStageLabels,
      foodNames: input.foodNames,
    });

    /**
     * 1728x960 是智谱官方推荐的横图档位（1.8:1，最接近 16:9），
     * 不赌「自定义精确 16:9」：最终反正会压到 750×422。
     */
    const layout: RecipeCoverLayout = input.layout ?? 'SQUARE';
    const size = layout === 'COVER_16_9' ? '1728x960' : '1280x1280';

    this.logger.log(`[cover] 开始生成：${input.recipeName}`);

    // ① 生图（拿临时链接）
    const { url: temporaryUrl } = await callZhipuImage({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
      prompt,
      size,
      quality: 'hd',
      // 官方要求 6-128 字符；拿不到顾客 id 就不传（不传比传个假的强）
      userId: input.customerId && input.customerId.length >= 6
        ? input.customerId.slice(0, 128)
        : undefined,
    });

    // ② 下载（临时链接 30 天后失效，必须现在就取下来）
    const buffer = await this.downloadTemporaryImage(temporaryUrl);

    // ③ 转存到我们自己的 COS
    //    16:9 封面走和手动上传完全同一套压缩（750×422、≤160KB），
    //    顾客侧加载速度和现有封面一致；方图保持原样，旧入口零变化。
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

  /**
   * 下载临时图。
   *
   * 单独兜一层错：智谱给的链接**可能已经过期**（比如生成后隔了很久才下载），
   * 这时要报"链接失效，请重新生成"，而不是抛一个看不懂的网络错误。
   */
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
