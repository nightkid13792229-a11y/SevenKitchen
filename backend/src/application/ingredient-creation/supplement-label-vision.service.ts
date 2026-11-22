import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
/** 抄字：标签行多时要留够，否则最后几行会被截掉。 */
const OCR_MAX_TOKENS = 2500;
/** 起草：模型要回一大段 JSON（逐字段带理由，营养数值还要写换算算式）。 */
const DRAFT_MAX_TOKENS = 3000;
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
  private readonly logger = new Logger(SupplementLabelVisionService.name);

  constructor(private readonly providerConfig: AgentProviderConfigService) {}

  /** 标签图：沿用同一套提示词。 */
  async read(imageUrl: string): Promise<SupplementLabelVisionResult> {
    return this.readWithPrompt(imageUrl, PROMPT);
  }

  /**
   * 换提示词读另一张图（例如商品正面：只认品牌/规格/剂型）。
   * 提示词统一从调用方给，免得这里长出一套"按图类型判断"的分支。
   */
  async readWithPrompt(imageUrl: string, prompt: string): Promise<SupplementLabelVisionResult> {
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
          max_tokens: OCR_MAX_TOKENS,
          thinking: { type: 'disabled' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url } },
                { type: 'text', text: prompt }
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
      if (text && choice?.finish_reason === 'length') {
        // 截断不会报错，只会在标签末尾少几行——必须留一条日志，否则永远查不出来
        this.logger.warn(
          `[vision] 标签抄写被截断（max_tokens=${OCR_MAX_TOKENS}），末尾可能缺行：${url}`,
        );
      }
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

  /**
   * 文本判断：把两张图抄出来的字交给模型，让它按档案规则下结论（只回 JSON）。
   *
   * 与 read() 用同一条模型配置；失败不抛给整条链路——识别还在，判断可以退化成人工。
   */
  async analyze(
    prompt: string,
  ): Promise<{ text: string; model: string; truncated?: boolean } | null> {
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
          max_tokens: DRAFT_MAX_TOKENS,
          thinking: { type: 'disabled' },
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.warn(
          `[vision] 判断请求失败：HTTP ${response.status} ${body.slice(0, 200)}`,
        );
        return null;
      }
      const payload = (await response.json()) as {
        choices?: {
          finish_reason?: string;
          message?: { content?: unknown };
        }[];
      };
      const choice = payload.choices?.[0];
      const finish = choice?.finish_reason;
      const content = choice?.message?.content;
      const text = typeof content === 'string' ? content.trim() : '';
      if (!text) {
        this.logger.warn(
          `[vision] 判断结果为空（finish_reason=${finish ?? 'null'}）`,
        );
        return null;
      }
      if (finish === 'length') {
        this.logger.warn(
          `[vision] 判断输出被截断（max_tokens=${DRAFT_MAX_TOKENS}，finish_reason=length）`,
        );
      }
      return { text, model: runtime.model, truncated: finish === 'length' };
    } catch (error) {
      this.logger.warn(
        `[vision] 判断请求异常：${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
