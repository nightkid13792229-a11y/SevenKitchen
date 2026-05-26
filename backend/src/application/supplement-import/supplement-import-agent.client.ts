import { BadRequestException, Injectable } from '@nestjs/common';
import type { ExtractedSupplementImportPayload } from './supplement-import.types';

export interface SupplementImportAgentUseConfig {
  baseUrl: string;
  apiKey: string;
  visionModel: string;
  temperature: number;
  timeoutMs?: number;
  maxRetries?: number;
}

@Injectable()
export class SupplementImportAgentClient {
  async recognize(
    config: SupplementImportAgentUseConfig,
    imageUrls: string[],
  ): Promise<ExtractedSupplementImportPayload> {
    const response = await this.postWithRetry(config, imageUrls);
    const content = response?.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
      throw new BadRequestException('补剂识别 Agent 返回内容为空');
    }

    return this.parseJsonContent(content);
  }

  private async postWithRetry(
    config: SupplementImportAgentUseConfig,
    imageUrls: string[],
  ): Promise<any> {
    const maxRetries = Math.max(0, config.maxRetries ?? 0);
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        return await this.post(config, imageUrls);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError;
  }

  private async post(
    config: SupplementImportAgentUseConfig,
    imageUrls: string[],
  ): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      config.timeoutMs ?? 30000,
    );

    try {
      const response = await fetch(
        `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.visionModel,
            temperature: config.temperature,
            messages: [
              {
                role: 'system',
                content:
                  '你是宠物鲜食补剂标签识别助手。只输出合法 JSON，不要输出解释、Markdown 或额外文本。',
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: buildPrompt() },
                  ...imageUrls.map((url) => ({
                    type: 'image_url',
                    image_url: { url },
                  })),
                ],
              },
            ],
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new BadRequestException(
          `补剂识别 Agent 请求失败：${response.status}`,
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJsonContent(content: string): ExtractedSupplementImportPayload {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const jsonText = fenced ? fenced[1].trim() : trimmed;

    try {
      return JSON.parse(jsonText) as ExtractedSupplementImportPayload;
    } catch {
      throw new BadRequestException('补剂识别 Agent 返回 JSON 无法解析');
    }
  }
}

function buildPrompt(): string {
  return `请从补剂瓶身、外盒或营养标签图片中识别信息，并只返回如下 JSON 结构：
{
  "ingredient": {
    "name": "string",
    "brand": "string",
    "productSpec": "string",
    "baseUnit": "G|ML|PCS",
    "unitDisplayLabel": "string",
    "weightG": 0,
    "addTiming": "BEFORE_MIXING|BEFORE_MEAL",
    "productionLossRate": 1.05,
    "categoryType": "MINERAL|VITAMIN|AMINO_ACID|FATTY_ACID|PROBIOTIC|FUNCTIONAL|OTHER",
    "notes": "string"
  },
  "nutrition": {
    "rawBasisType": "PER_100_G|PER_100_ML|PER_1_G|PER_1_ML|PER_SERVING",
    "servingWeightG": 0,
    "sampleState": "POWDER|OIL|CONCENTRATE|RAW",
    "items": [
      { "name": "string", "value": 0, "unit": "g|mg|μg|IU|kcal|kJ|%", "confidence": 0.95 }
    ]
  },
  "rawOcrText": "string",
  "risks": [
    { "level": "INFO|WARNING|BLOCKING", "code": "string", "message": "string" }
  ]
}
无法识别的字段请返回 null 或空数组，数值字段不要编造。`;
}
