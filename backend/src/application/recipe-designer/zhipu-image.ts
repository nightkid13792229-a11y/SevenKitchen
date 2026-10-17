import { BadRequestException } from '@nestjs/common';

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
  const url = `${options.baseUrl.replace(/\/+$/, '')}${ZHIPU_IMAGE_PATH}`;

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
      const detail =
        parsed?.message ||
        (raw ? raw.slice(0, 200) : `HTTP ${response.status}`);
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
export function buildRecipeCoverPrompt(input: {
  recipeName: string;
  lifeStageLabels?: string[];
  foodNames?: string[];
}): string {
  const foods = (input.foodNames || []).filter(Boolean).slice(0, 5);
  const stages = (input.lifeStageLabels || []).filter(Boolean).slice(0, 2);

  return [
    'A top-down photograph of a freshly prepared homemade pet meal in a clean ceramic bowl.',
    foods.length ? `Main ingredients: ${foods.join(', ')}.` : '',
    stages.length ? `For ${stages.join(' / ')} dogs.` : '',
    input.recipeName ? `Dish concept: ${input.recipeName}.` : '',
    // 刻意排除文字/水印：模型画出来的字基本是乱的，反而显得不专业
    'Natural daylight, soft shadows, warm and appetizing, minimal styling, plain background.',
    'No text, no watermark, no logo, no human hands, no packaging.',
    'Photorealistic, high detail.',
  ]
    .filter(Boolean)
    .join(' ');
}
