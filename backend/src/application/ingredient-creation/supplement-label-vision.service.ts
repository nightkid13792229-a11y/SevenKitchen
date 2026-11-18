import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';
import { INGREDIENT_INTAKE_AGENT_PURPOSE } from './ingredient-creation-intake.service';

/**
 * 标签图识别：把管理员传上来的标签照片读成文字。
 *
 * 用的是**补剂 Agent 自己那条 DeepSeek 配置**（多模态）：一个模型两件事都干，
 * 不再需要单独的 OCR 服务（腾讯云那条老链路本来也没开通）。
 *
 * 两个坑记在这里：
 * 1. 必须 `thinking: disabled`——默认开着思考，1200 个 token 全烧在 reasoning 上，
 *    content 直接是空的（2026-11-19 实测）；
 * 2. 只做"把图上的字抄下来"，不做结构化、不认识营养素：抄出来的文本交给 Agent，
 *    由它按档案字段判断，和知识库那条路保持同一个分工。
 */

const CHAT_PATH = '/chat/completions';
const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 1200;
const MAX_TEXT_CHARS = 8000;

const PROMPT = [
  '把这张营养标签（Supplement Facts / 营养成分表）上的文字**原样抄下来**。',
  '要求：',
  '1. 保留数字、单位、百分比，例如「Iron (as Ferrochel® Ferrous Bisglycinate Chelate) 25 mg 139%」；',
  '2. 保留「Serving Size」「Servings Per Container」这些行；',
  '3. 分条列出，不要总结、不要换算、不要补充图上没有的内容；',
  '4. 看不清的字用「?」标出来，不要猜。'
].join('\n');

export interface SupplementLabelVisionResult {
  text: string;
  imageUrl: string;
  model: string;
}

@Injectable()
export class SupplementLabelVisionService {
  constructor(private readonly providerConfig: AgentProviderConfigService) {}

  async read(imageUrl: string): Promise<SupplementLabelVisionResult> {
    const url = imageUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException('标签图必须是 http/https 的图片地址');
    }

    const runtime = await this.providerConfig.getEnabledDeepSeekRuntimeConfig({
      purpose: INGREDIENT_INTAKE_AGENT_PURPOSE,
      fallbackToDefault: false
    });
    const base = runtime.baseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${CHAT_PATH}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: runtime.model,
          temperature: 0,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'disabled' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url } },
                { type: 'text', text: PROMPT }
              ]
            }
          ]
        })
      });
      if (!response.ok) {
        throw new BadRequestException(`标签图识别失败（${response.status}），可以换一张更清晰的图`);
      }
      const payload = (await response.json()) as {
        choices?: {
          finish_reason?: string;
          message?: { content?: unknown };
        }[];
      };
      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        // content 空基本就是被截断（思考吃掉了预算），如实报，不要返回半截
        throw new BadRequestException(
          choice?.finish_reason === 'length'
            ? '这张图内容太长，没念完；把它裁成「只含标签」的一块再传'
            : '这张图没读出文字，换一张更清晰、正对镜头的标签图'
        );
      }
      return { text: text.slice(0, MAX_TEXT_CHARS), imageUrl: url, model: runtime.model };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('标签图识别失败（可能超时），可以换一张更小的图再试');
    } finally {
      clearTimeout(timer);
    }
  }
}
