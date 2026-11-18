import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentProviderConfigService } from '../nutrition-governance/agent-provider-config.service';

/**
 * 标签图识别：把管理员传上来的标签照片读成文字。
 *
 * 为什么不用腾讯云 OCR：2026-11-19 实测账号里那个服务没开通
 * （调用直接回「服务未开通」），补剂包装识别这条老链路因此也是哑的。
 * 而智谱的 Key 我们本来就有（生图在用），它的视觉模型读标签字很准：
 * 同一张 Thorne 标签，glm-4v-flash 6 秒抄回来，连 25 mg / 139% 都对。
 *
 * 这里只做"把图上的字抄下来"，不做结构化、不认识营养素——
 * 抄出来的文本交给 Agent，由它按档案字段去判断，和知识库那条路保持同一个分工。
 */

/** 读标签用视觉模型；生图那条配置里的 model 是 glm-image，不能拿来用。 */
const VISION_MODEL = 'glm-4v-flash';
const VISION_PATH = '/api/paas/v4/chat/completions';
const TIMEOUT_MS = 60_000;
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

    const runtime = await this.providerConfig.getAnyEnabledProviderRuntimeConfig('ZHIPU');
    const base = runtime.baseUrl.replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}${VISION_PATH}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${runtime.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          temperature: 0,
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
        choices?: { message?: { content?: unknown } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        throw new BadRequestException('这张图没读出文字，换一张更清晰、正对镜头的标签图');
      }
      return { text: text.slice(0, MAX_TEXT_CHARS), imageUrl: url, model: VISION_MODEL };
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
