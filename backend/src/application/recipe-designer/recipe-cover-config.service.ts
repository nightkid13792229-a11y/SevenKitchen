import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

/** DeepSeek 写 Seedream 提示词的系统提示词默认值（2026-10-31） */
export const DEFAULT_RECIPE_COVER_PROMPT = [
  '你是一名顶尖的商业食物摄影师兼食物造型师，服务于一个高端鲜食狗粮品牌。',
  '',
  '先调用 get_recipe_ingredients 读取当前食谱的食材。',
  '',
  '再用中文写一段用于让文生图模型生成食谱封面的提示词：把这些食材全部拍成一张顶尖杂志级的商业食物照片，所有食材都是新鲜的、一律画成生的（清单里写熟或干也一样），并按清单里的方式预处理。',
  '',
  '画面中不要出现任何文字、标签或 LOGO。',
  '',
  '只需要返回提示词即可。',
].join('\n');

const MAX_PROMPT_LENGTH = 6000;

/**
 * 旧默认提示词里的配方私货（鸭心/鸭肝/南瓜/西兰花）。
 * 线上 singleton 还存着这段时，视为“没被人改过”，自动回退新默认，
 * 避免新工具流程拿到旧提示词后把 JSON 当封面提示词发给生图模型。
 */
const LEGACY_PROMPT_MARKERS = [
  'Put duck heart, duck gizzard and duck liver',
  'Broccoli is a tree-like green head',
];

@Injectable()
export class RecipeCoverConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getPromptTemplate(): Promise<string> {
    const row = await this.prisma.recipeCoverConfig.findUnique({
      where: { id: 'singleton' },
    });
    const stored = String(row?.promptTemplate ?? '').trim();
    if (!stored) return DEFAULT_RECIPE_COVER_PROMPT;
    if (LEGACY_PROMPT_MARKERS.some((marker) => stored.includes(marker))) {
      return DEFAULT_RECIPE_COVER_PROMPT;
    }
    return stored;
  }

  async updatePromptTemplate(
    input: { promptTemplate: string },
    userId?: string,
  ): Promise<{ promptTemplate: string }> {
    const promptTemplate = String(input?.promptTemplate ?? '').trim();
    if (!promptTemplate) {
      throw new BadRequestException('提示词不能为空');
    }
    if (promptTemplate.length > MAX_PROMPT_LENGTH) {
      throw new BadRequestException(
        `提示词不能超过${MAX_PROMPT_LENGTH}个字符`,
      );
    }

    const saved = await this.prisma.recipeCoverConfig.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        promptTemplate,
        updatedBy: userId ?? null,
      },
      update: {
        promptTemplate,
        updatedBy: userId ?? null,
      },
    });

    return { promptTemplate: saved.promptTemplate };
  }
}
