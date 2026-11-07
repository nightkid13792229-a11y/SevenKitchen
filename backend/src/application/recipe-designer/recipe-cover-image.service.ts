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
import {
  buildCoverPrompt,
  getCoverPreset,
  getCoverSkeleton,
  MAX_COVER_VARIANTS,
  pickCoverVariants,
  variantKey,
  type CoverPresetId,
  type CoverSkeletonId,
  type CoverVariant,
} from './cover-style';
import { callSeedreamImage } from './seedream-image';

/** 生图用途的 provider 配置标识（后台「AI 食谱封面」那条） */
export { RECIPE_COVER_IMAGE_PURPOSE, ARK_PROVIDER };

/** 封面生图至少等 200 秒；Seedream 实测 30–60 秒，留足余量 */
const COVER_IMAGE_REQUEST_TIMEOUT_MS = 200_000;

/** 一次最多出几张候选：3 张已经够挑，再多就是烧钱（规则在 cover-style） */
const MAX_VARIANTS = MAX_COVER_VARIANTS;

/** 同一份食谱记住最近几次用过的组合，避免连着出一样的 */
const RECENT_VARIANTS_KEEP = 6;
const RECENT_DEDUPE_KEYS = 200;

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
  /** 出几张候选（1–3），默认 1；后台生成封面默认传 3 */
  variants?: number;
  /** 去重用的稳定标识（草稿 ID / 系列 ID） */
  dedupeKey?: string;
}

/** 一张候选：URL + 用了哪套预设/骨架（前台给运营看的标签） */
export interface RecipeCoverCandidate {
  url: string;
  preset: CoverPresetId;
  presetLabel: string;
  skeleton: CoverSkeletonId;
  skeletonLabel: string;
}

export interface GenerateRecipeCoverResult {
  url: string;
  provider: string;
  model: string;
  /** 本次出的候选；单张时长度也是 1 */
  candidates: RecipeCoverCandidate[];
}

/**
 * AI 生成食谱封面（DeepSeek 写形态 + 模板拼提示词 + Seedream 5.0 Pro）
 *
 * ```
 * ① DeepSeek 给每样食材写一句形态说明（结构化）
 * ② cover-style.ts 按「品牌层 + 预设 + 骨架」拼成 N 份提示词
 * ③ Seedream 并发出 N 张（2048×1152）
 * ④ 每张立刻下载 → 750×422 压缩 → 转存 COS
 * ```
 *
 * 并发是有意的：3 张串行要 2–3 分钟，并发约 40–70 秒。
 * 部分失败不整体报错，只要有一张成功就返回，并记日志。
 */
@Injectable()
export class RecipeCoverImageService {
  private readonly logger = new Logger(RecipeCoverImageService.name);

  /** dedupeKey → 最近用过的「预设:骨架」 */
  private readonly recentVariants = new Map<string, string[]>();

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

  async generate(
    input: GenerateRecipeCoverInput,
  ): Promise<GenerateRecipeCoverResult> {
    const config =
      await this.agentProviderConfigService.getEnabledProviderRuntimeConfig({
        purpose: RECIPE_COVER_IMAGE_PURPOSE,
        provider: ARK_PROVIDER,
      });

    // 系列 / 定制：DeepSeek 通过工具取食材再写形态；旧入口才走 foodNames
    const inlineIngredients = input.ingredients ?? [];
    const loadIngredients =
      input.loadIngredients ??
      (inlineIngredients.length ? async () => inlineIngredients : undefined);

    const layout: RecipeCoverLayout = input.layout ?? 'SQUARE';
    const variantCount = Math.max(
      1,
      Math.min(MAX_VARIANTS, Math.round(Number(input.variants) || 1)),
    );

    const jobs = loadIngredients
      ? await this.buildVariantJobs(input, loadIngredients, variantCount)
      : [
          {
            variant: null as CoverVariant | null,
            prompt: buildRecipeCoverPrompt({
              recipeName: input.recipeName,
              lifeStageLabels: input.lifeStageLabels,
              foodNames: input.foodNames,
              ingredients: input.ingredients,
            }),
          },
        ];

    this.logger.log(
      `[cover] 开始生成：${input.recipeName}（${jobs.length} 张：${jobs
        .map((job) =>
          job.variant ? variantKey(job.variant) : 'legacy',
        )
        .join(' / ')}）`,
    );

    // ① 并发出图；部分失败不影响整体
    const settled = await Promise.allSettled(
      jobs.map(async (job) => ({
        job,
        url: await this.renderOne(config, job.prompt, layout),
      })),
    );

    const successes: Array<{
      job: (typeof jobs)[number];
      url: string;
    }> = [];
    const failures: unknown[] = [];
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        successes.push(item.value);
      } else {
        failures.push(item.reason);
      }
    }

    if (successes.length === 0) {
      const first = failures[0];
      throw first instanceof Error
        ? first
        : new BadRequestException('封面生成失败，请重试');
    }
    if (failures.length > 0) {
      this.logger.warn(
        `[cover] ${failures.length}/${jobs.length} 张失败，已返回其余 ${
          successes.length
        } 张：${String((failures[0] as any)?.message ?? failures[0])}`,
      );
    }

    if (jobs.length > 1) {
      this.rememberVariants(input, jobs);
    }

    const candidates: RecipeCoverCandidate[] = successes.map(({ job, url }) => {
      const preset = job.variant
        ? getCoverPreset(job.variant.preset)
        : null;
      const skeleton = job.variant
        ? getCoverSkeleton(job.variant.skeleton)
        : getCoverSkeleton('RING');
      return {
        url,
        preset: job.variant?.preset ?? 'CREAM_STONE',
        presetLabel: preset?.label ?? '默认',
        skeleton: job.variant?.skeleton ?? 'RING',
        skeletonLabel: skeleton.label,
      };
    });

    this.logger.log(`[cover] 生成完成：${candidates.map((c) => c.url).join(' , ')}`);

    return {
      url: candidates[0].url,
      provider: config.provider,
      model: config.model,
      candidates,
    };
  }

  /**
   * 每张候选需要什么提示词：一份食材形态 + N 个「预设 × 骨架」。
   * 文本模型只调用一次，三张共用同一份形态说明，省时也保证三张是同一道菜。
   */
  private async buildVariantJobs(
    input: GenerateRecipeCoverInput,
    loadIngredients: () => Promise<RecipeCoverIngredient[]>,
    variantCount: number,
  ): Promise<Array<{ variant: CoverVariant | null; prompt: string }>> {
    const raw = await loadIngredients();
    const ingredients = [...raw]
      .filter((item) => String(item?.name ?? '').trim())
      .sort(
        (a, b) => Number(b.ratioPercent ?? 0) - Number(a.ratioPercent ?? 0),
      );

    if (ingredients.length === 0) {
      throw new BadRequestException('这个食谱没有可用于生成封面的食材');
    }

    const forms = await this.visualBriefService.buildForms(
      async () => ingredients,
    );
    const variants = pickCoverVariants(
      variantCount,
      this.recentVariants.get(this.dedupeKeyOf(input)) ?? [],
    );

    return variants.map((variant) => ({
      variant,
      prompt: buildCoverPrompt({
        ingredients,
        forms,
        preset: getCoverPreset(variant.preset),
        skeleton: getCoverSkeleton(variant.skeleton),
      }),
    }));
  }

  private dedupeKeyOf(input: GenerateRecipeCoverInput): string {
    return String(input.dedupeKey || input.recipeName || 'cover');
  }

  private rememberVariants(
    input: GenerateRecipeCoverInput,
    jobs: Array<{ variant: CoverVariant | null }>,
  ): void {
    const key = this.dedupeKeyOf(input);
    const used = jobs
      .map((job) => (job.variant ? variantKey(job.variant) : ''))
      .filter(Boolean);
    const merged = [...used, ...(this.recentVariants.get(key) ?? [])].slice(
      0,
      RECENT_VARIANTS_KEEP,
    );
    this.recentVariants.delete(key);
    this.recentVariants.set(key, merged);
    while (this.recentVariants.size > RECENT_DEDUPE_KEYS) {
      const oldest = this.recentVariants.keys().next().value;
      if (!oldest) break;
      this.recentVariants.delete(oldest);
    }
  }

  /** 一张：生图 → 下载 → 压缩（16:9）→ 转存 COS */
  private async renderOne(
    config: { baseUrl: string; model: string; apiKey: string; requestTimeoutMs: number },
    prompt: string,
    layout: RecipeCoverLayout,
  ): Promise<string> {
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

    const buffer = await this.downloadTemporaryImage(temporaryUrl);

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
    return uploaded.url;
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
