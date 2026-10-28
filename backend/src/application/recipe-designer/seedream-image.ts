import { BadRequestException } from '@nestjs/common';

const SEEDREAM_IMAGE_PATH = '/images/generations';

export interface SeedreamImageOptions {
  baseUrl: string;
  model: string;
  apiKey: string;
  requestTimeoutMs: number;
  prompt: string;
  /** 默认 2048x1152（16:9）；API 生成参数，不是提示词约束 */
  size?: string;
  /** 默认 false；Seedream API 的 watermark 参数 */
  watermark?: boolean;
}

interface SeedreamImageResponse {
  data?: Array<{ url?: string }>;
  error?: { message?: string };
  message?: string;
}

/**
 * 调用火山方舟 Seedream 5.0 Pro 文生图（2026-10-28）。
 *
 * 只负责拿图片 URL；下载 / 压缩 / 转存 COS 由调用方做。
 * 请求参数：
 *  - size：实际输出尺寸（默认 2048x1152），提示词里的 16:9 只是引导；
 *  - watermark：默认 false，避免“AI 生成”水印；
 *  - response_format: url，返回临时 URL。
 */
export async function callSeedreamImage(
  options: SeedreamImageOptions,
): Promise<{ url: string }> {
  const url = `${options.baseUrl.replace(/\/+$/, '')}${SEEDREAM_IMAGE_PATH}`;
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
        size: options.size || '2048x1152',
        response_format: 'url',
        output_format: 'jpeg',
        watermark: options.watermark ?? false,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: SeedreamImageResponse | null = null;
    try {
      parsed = JSON.parse(raw) as SeedreamImageResponse;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const detail =
        parsed?.error?.message ||
        parsed?.message ||
        raw.slice(0, 200) ||
        String(response.status);
      throw new BadRequestException(`生图失败：${detail}`);
    }

    const imageUrl = String(parsed?.data?.[0]?.url || '').trim();
    if (!imageUrl) {
      throw new BadRequestException('生图失败：接口没有返回图片地址');
    }

    return { url: imageUrl };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new BadRequestException(
        `生图超时（${Math.round(options.requestTimeoutMs / 1000)} 秒没返回），请重试`,
      );
    }
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      `生图请求失败：${error?.message || '未知错误'}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
