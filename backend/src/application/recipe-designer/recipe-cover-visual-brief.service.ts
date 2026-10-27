import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { callDeepSeekJson } from './deepseek-chat';
import type { RecipeCoverIngredient } from './zhipu-image';

/** brief 上限；加上固定的无文字护栏后仍要在智谱 1000 字符以内 */
const MAX_BRIEF_LENGTH = 700;

/**
 * 让 DeepSeek 当「摄影指导」，而不是逐食材翻译（2026-10-28）
 *
 * 旧做法：把每个食材单独翻成外观词，生图模型拿到的是一串并列短语，
 * 没有主次、没有构图、没有光线；结果就是素材库感的平铺。
 *
 * 新做法：把完整食材（含占比）和固定场景交给 DeepSeek，让它输出
 * **一整段摄影 brief**：前景主角、中景配角、背景点缀、镜头/光线/道具，
 * 并要求所有食材都出现。生图模型只负责按这段 brief 画。
 */
@Injectable()
export class RecipeCoverVisualBriefService {
  private readonly logger = new Logger(RecipeCoverVisualBriefService.name);
  /** 同一组食材 + 占比复用同一段 brief，避免每次重写导致风格漂移 */
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly agentProviderConfigService: AgentProviderConfigService,
  ) {}

  async build(ingredients: RecipeCoverIngredient[]): Promise<string> {
    const rows = ingredients
      .map((item) => ({
        name: String(item?.name ?? '').trim(),
        preparationMethod: String(item?.preparationMethod ?? '').trim(),
        ratioPercent: Number(item?.ratioPercent) || 0,
      }))
      .filter((item) => Boolean(item.name));

    if (rows.length === 0) {
      throw new BadRequestException('没有可用于生成封面的食材');
    }

    const cacheKey = rows
      .map(
        (row) =>
          `${row.name}|${row.preparationMethod}|${Math.round(row.ratioPercent)}`,
      )
      .join(';');
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let config: Awaited<
      ReturnType<
        AgentProviderConfigService['getEnabledDeepSeekRuntimeConfig']
      >
    >;
    try {
      config =
        await this.agentProviderConfigService.getEnabledDeepSeekRuntimeConfig({
          // 老板可能只启用了某个专用 DeepSeek 用途、没启用全局默认
          fallbackToAnyPurpose: true,
        });
    } catch (error: any) {
      throw new BadRequestException(
        `封面画面描述生成失败：${error?.message || '文本模型未配置'}。请到后台「AI / Agent 配置」启用 DeepSeek（任一用途或全局默认）`,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = await callDeepSeekJson({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        requestTimeoutMs: config.requestTimeoutMs,
        systemPrompt: buildRecipeCoverVisualSystemPrompt(),
        temperature: 0.7,
        maxTokens: 1800,
        extraBody: { thinking: { type: 'disabled' } },
        userPayload: {
          scene: {
            surface: 'light oak kitchen table by a window',
            style:
              'commercial food photography, editorial, warm neutral color grading, shallow depth of field',
            mustShowAll: true,
          },
          ingredients: rows.map((row, index) => ({
            index,
            name: row.name,
            preparation: row.preparationMethod,
            ratio: row.ratioPercent,
          })),
        },
      });
    } catch (error: any) {
      throw new BadRequestException(
        `封面画面描述生成失败：${error?.message || '文本模型调用失败'}`,
      );
    }

    const brief = sanitizeBrief(parsed.brief);
    if (!brief) {
      throw new BadRequestException(
        '封面画面描述生成失败：文本模型没有返回摄影描述',
      );
    }

    const missing = Array.isArray(parsed.missing)
      ? parsed.missing
          .map((index) => Number(index))
          .filter((index) => Number.isInteger(index) && index >= 0)
      : [];
    if (missing.length > 0) {
      throw new BadRequestException(
        '封面画面描述生成失败：有食材没被安排进画面',
      );
    }

    // 结构化清单是「每个食材都要有位置」的核对表；缺一条就不往下走
    const structured = Array.isArray(parsed.ingredients)
      ? parsed.ingredients
      : [];
    const seen = new Set<number>();
    for (const item of structured) {
      const index = Number((item as { index?: unknown })?.index);
      if (Number.isInteger(index) && index >= 0 && index < rows.length) {
        seen.add(index);
      }
    }
    if (seen.size < rows.length) {
      throw new BadRequestException(
        '封面画面描述生成失败：文本模型返回格式不正确',
      );
    }

    this.cache.set(cacheKey, brief);
    this.logger.log(`[cover-brief] ${brief}`);
    return brief;
  }
}

export function buildRecipeCoverVisualSystemPrompt(): string {
  return [
    'You are a commercial food photographer and food stylist.',
    'Design one editorial food photograph for a premium fresh dog food brand.',
    'Show every ingredient in the list, raw and freshly prepped, in its correct cut and part; use the ratios only to decide the visual amounts, never write numbers.',
    'Arrange the ingredients in depth layers — a foreground hero, middle supporting ingredients, and small background accents — so every ingredient can be visible.',
    'Use only non-food props such as linen, an empty ceramic bowl and cutlery.',
    'Scene: a real kitchen, a light oak table by a window, soft natural side light, warm neutral color grading, shallow depth of field, high-end commercial food photography.',
    'Use specific English food names with appearance (duck breast, oat groats, pumpkin, broccoli, duck liver, egg, oil), but write them naturally, not as a list of labels.',
    'The photograph must contain no text, letters, numbers, labels, captions, packaging, logos, watermarks or human hands; it must not look like an infographic.',
    'Keep the brief under 90 words.',
    'Return JSON only: {"brief":"...","ingredients":[{"index":0,"visual":"...","placement":"..."}],"missing":[]}',
  ].join(' ');
}

function sanitizeBrief(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/%/g, ' ')
    .replace(/["'“”‘’`]/g, ' ')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BRIEF_LENGTH)
    .trim();
}
