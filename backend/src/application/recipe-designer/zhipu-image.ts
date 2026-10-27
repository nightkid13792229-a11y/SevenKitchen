import { BadRequestException } from '@nestjs/common';
import {
  buildZhipuApiUrl,
  extractZhipuErrorDetail,
} from '../../infrastructure/services/zhipu-api';

/**
 * 智谱 glm-image 生图客户端（2026-10-18）
 *
 * ## 为什么单独一个文件
 *
 * 跟 DeepSeek 的 chat 接口**形状完全不同**：
 * · 路径不同：`/paas/v4/images/generations`（不是 `/chat/completions`）
 * · 请求体不同：`{ model, prompt, size, quality }`（没有 messages）
 * · 响应不同：`{ data: [{ url }] }`（没有 choices）
 *
 * 硬塞进 `deepseek-chat.ts` 只会让那个文件变成"两种协议拼在一起"。
 *
 * ## ⚠️ 返回的 URL 是**临时链接，30 天过期**
 *
 * 官方文档写明："Image link. The temporary link expires after 30 days,
 * please store it promptly."
 *
 * 所以调用方**必须**把它转存到自己的存储（本项目是 COS），
 * 不能直接把 `url` 存进数据库 —— 否则 30 天后封面图全变空白。
 */
const ZHIPU_IMAGE_PATH = '/paas/v4/images/generations';

export interface ZhipuImageOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  prompt: string;
  /** 官方推荐枚举：1280x1280 / 1568x1056 / 1056x1568 等；不传用 1280x1280 */
  size?: string;
  /** hd（默认，约 20 秒）｜ standard（约 5-10 秒） */
  quality?: 'hd' | 'standard';
  /** 终端用户标识，帮助平台做内容安全干预；6-128 字符 */
  userId?: string;
}

interface ZhipuImageResponse {
  created?: number;
  data?: Array<{ url?: string }>;
  content_filter?: Array<{ role?: string; level?: number }>;
  code?: number;
  message?: string;
}

/**
 * 调一次生图，返回**临时图片地址**。
 *
 * 只负责"拿到地址"，不负责转存 —— 转存是调用方的事（它才知道存到哪）。
 */
export async function callZhipuImage(
  options: ZhipuImageOptions,
): Promise<{ url: string }> {
  const url = buildZhipuApiUrl(options.baseUrl, ZHIPU_IMAGE_PATH);

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.requestTimeoutMs,
  );

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        size: options.size || '1280x1280',
        quality: options.quality || 'hd',
        ...(options.userId ? { user_id: options.userId } : {}),
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: ZhipuImageResponse | null = null;
    try {
      parsed = JSON.parse(raw) as ZhipuImageResponse;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      /**
       * 智谱的错误体是 `{ code, message }`。
       * 拿不到结构化错误时退回状态码 + 响应片段 —— **别只说"失败了"**，
       * 管理员看到"401 / 无效的 API Key"才知道该改哪儿。
       */
      const detail = extractZhipuErrorDetail(raw, response.status);
      throw new BadRequestException(`生图失败：${detail}`);
    }

    const imageUrl = String(parsed?.data?.[0]?.url || '').trim();
    if (!imageUrl) {
      throw new BadRequestException('生图失败：接口没有返回图片地址');
    }

    return { url: imageUrl };
  } catch (error: any) {
    // 超时（AbortError）与网络错误分开说 —— 前者可以用"重试"解决，后者要看网络
    if (error?.name === 'AbortError') {
      throw new BadRequestException(
        `生图超时（${Math.round(options.requestTimeoutMs / 1000)} 秒没返回），请重试`,
      );
    }
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`生图请求失败：${error?.message || '未知错误'}`);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 拼封面图的提示词。
 *
 * 目标是"**看起来像这道菜的成品照**"，不是"画一只可爱的狗"：
 * · 顾客在交付页第一眼看到的就是这张图，要能看出"这是给我家狗做的饭"
 * · 所以强调**鲜食、碗装、俯拍、干净背景**，避免出现文字与品牌
 */
export interface RecipeCoverIngredient {
  name: string;
  /** 「部位/状态/预处理」整串，原样传给模型，不拆分 */
  preparationMethod?: string | null;
  /** 用量占比（整份配方的百分比；调用方已归一化） */
  ratioPercent?: number | null;
}

export interface BuildRecipeCoverPromptInput {
  /** 仅用于日志/兼容旧入口；不再写进提示词，避免模型画标题 */
  recipeName?: string;
  /** 旧入口：没有部位/占比时只传名字 */
  foodNames?: string[];
  /** 新入口：系列封面的完整食材数据 */
  ingredients?: RecipeCoverIngredient[];
  /** 旧入口传过；现在不再写进提示词 */
  lifeStageLabels?: string[];
}

const MAX_PROMPT_LENGTH = 1000;

/**
 * 拼封面图的提示词（2026-10-27 老板口径）
 *
 * · 食材的「部位/状态/预处理」原样带上，不拆分；
 * · 状态是熟/干，也按「生 + 预处理」画（提示词里明确覆盖）；
 * · 只统一调色/光线，不规定角度、碗、背景，让模型自由发挥；
 * · 不出现任何文字；视觉分量大致按占比。
 */
export function buildRecipeCoverPrompt(
  input: BuildRecipeCoverPromptInput,
): string {
  const ingredients = (input.ingredients || []).filter(
    (item) => String(item?.name ?? '').trim(),
  );
  const foodNames = (input.foodNames || []).filter(Boolean);
  const hasEgg = (ingredients.length ? ingredients.map((i) => i.name) : foodNames)
    .some((name) => /蛋/.test(name));

  const sorted = ingredients
    .map((item) => ({
      name: String(item.name).trim(),
      preparationMethod: String(item.preparationMethod ?? '').trim(),
      ratioPercent: Number(item.ratioPercent),
    }))
    .sort((a, b) => (b.ratioPercent || 0) - (a.ratioPercent || 0));

  const build = (rows: typeof sorted): string => {
    const ingredientList = rows.length
      ? rows
          .map((row) => {
            const prep = row.preparationMethod
              ? `（${row.preparationMethod}）`
              : '';
            const ratio = Number.isFinite(row.ratioPercent)
              ? ` ${Math.round(row.ratioPercent)}%`
              : '';
            return `${row.name}${prep}${ratio}`;
          })
          .join('；')
      : '';

    const legacyList = !rows.length && foodNames.length
      ? foodNames.join(', ')
      : '';

    const sentences = [
      'Commercial food photography for a premium fresh dog food brand.',
      ingredientList
        ? `Show every ingredient below raw and freshly prepped, in its natural, recognizable form and correct cut, with the visual amount roughly matching its percentage: ${ingredientList}.`
        : '',
      legacyList
        ? `Show these ingredients raw and freshly prepped, in their natural, recognizable forms: ${legacyList}.`
        : '',
      ingredientList
        ? 'Even if a description mentions a cooked or dried state, show the ingredient raw and fresh.'
        : '',
      // 只做取景安全，不规定角度/碗/背景：陈列交给模型自由发挥
      'Arrange and style the scene freely for the most appetizing 16:9 composition; keep the ingredients inside the frame with a little breathing room.',
      'Clean, uncluttered setting. Soft natural daylight, warm neutral color grading, true-to-life colors, gentle contrast, consistent premium look.',
      'Ultra-detailed, fresh, appetizing, high-end commercial food photography.',
      'No text, no letters, no numbers, no labels, no logos, no watermarks, no packaging, no human hands.',
      'No cooked/seared/grilled/stewed look. No blood pools, no slime, no supplements or pills.',
      hasEgg ? '' : 'No egg.',
    ];

    return sentences.filter(Boolean).join(' ');
  };

  let prompt = build(sorted);
  // 智谱 prompt 上限 1000 字符；超了先丢占比最小的（列表已按占比降序）
  while (prompt.length > MAX_PROMPT_LENGTH && sorted.length > 0) {
    sorted.pop();
    prompt = build(sorted);
  }
  return prompt;
}
