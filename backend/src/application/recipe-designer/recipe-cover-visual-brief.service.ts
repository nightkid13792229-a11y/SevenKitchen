import { BadRequestException, Injectable } from '@nestjs/common';

import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { callDeepSeekJson } from './deepseek-chat';
import type { RecipeCoverIngredient } from './zhipu-image';

/** 单条画面描述的上限，防止文本模型写成长段落 */
const MAX_DESCRIPTOR_LENGTH = 120;

/**
 * 把「食材名 + 部位/状态/预处理」翻成英文画面描述（2026-10-28）
 *
 * 为什么需要它：生图模型会把提示词里的中文名、百分比当成要渲染的文字，
 * 画成带标签的信息图。这个服务先把食谱数据翻成「颜色/形状/切法/部位」的
 * 画面语言，再把这段画面语言交给固定模板；生图模型看不到原始食谱文字。
 *
 * 缓存按「食材名 + 预处理」做，同一个食材第二次生成不再调用文本模型。
 */
@Injectable()
export class RecipeCoverVisualBriefService {
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

    const hasMissing = rows.some(
      (row) => !this.cache.has(this.cacheKey(row)),
    );
    if (hasMissing) {
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
          temperature: 0.2,
          maxTokens: 1200,
          // 结构化短任务，不需要思维链；开着只会更慢
          extraBody: { thinking: { type: 'disabled' } },
          userPayload: {
            ingredients: rows.map((row, index) => ({
              index,
              name: row.name,
              preparation: row.preparationMethod,
            })),
          },
        });
      } catch (error: any) {
        throw new BadRequestException(
          `封面画面描述生成失败：${error?.message || '文本模型调用失败'}`,
        );
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const byIndex = new Map<number, string>();
      for (const item of items) {
        const record = item as { index?: unknown; visual?: unknown };
        const index = Number(record.index);
        const visual = sanitizeVisualBrief(record.visual);
        if (
          Number.isInteger(index) &&
          index >= 0 &&
          index < rows.length &&
          visual
        ) {
          byIndex.set(index, visual);
        }
      }

      for (let index = 0; index < rows.length; index += 1) {
        const visual = byIndex.get(index);
        if (!visual) {
          throw new BadRequestException(
            '封面画面描述生成失败：文本模型返回格式不正确',
          );
        }
        this.cache.set(this.cacheKey(rows[index]), visual);
      }
    }

    // 按占比排序，用「hero / moderate / small」表达分量，不写百分比
    const sorted = [...rows].sort(
      (a, b) => b.ratioPercent - a.ratioPercent,
    );
    return sorted
      .map(
        (row, index) =>
          `${quantityPrefix(index)}${this.cache.get(this.cacheKey(row))}`,
      )
      .join('; ');
  }

  private cacheKey(row: {
    name: string;
    preparationMethod: string;
  }): string {
    return `${row.name}|${row.preparationMethod}`;
  }
}

export function buildRecipeCoverVisualSystemPrompt(): string {
  return [
    'You are a food stylist writing a visual brief for a food photographer.',
    'For each ingredient, describe only its raw, fresh appearance: color, texture, shape, cut and part.',
    'The final photograph always shows every ingredient raw and freshly prepped, even if the preparation text says cooked or dried; describe the raw appearance and keep the cut/part.',
    'Describe only appearance; do not mention quantities, percentages, nutrition, brands, cooking steps or health claims.',
    'Do not use Chinese characters, digits, quotes, labels or captions.',
    'Keep each description under 18 words.',
    'Return JSON only: {"items":[{"index":0,"visual":"..."}]} in the same order as the input.',
  ].join(' ');
}

function quantityPrefix(index: number): string {
  if (index === 0) return 'a generous hero portion of ';
  if (index <= 2) return 'a moderate amount of ';
  return 'a small amount of ';
}

function sanitizeVisualBrief(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .replace(/\d+(?:\.\d+)?/g, ' ')
    .replace(/%/g, ' ')
    .replace(/["'“”‘’`]/g, ' ')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTOR_LENGTH)
    .trim();
}
