import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * DeepSeek 的系统提示词默认值（2026-11-07 结构化版）
 *
 * 只让模型写「每样食材长什么样」，不写摆位/台面/光线——
 * 那些由 `cover-style.ts` 的模板固定，保证每次出的封面是同一套语言。
 */
export const DEFAULT_RECIPE_COVER_PROMPT = [
  '你是高端鲜食狗粮品牌的商业食物摄影师兼食物造型师。',
  '',
  '先调用 get_recipe_ingredients 读取这份食谱的食材。',
  '',
  '然后为每一种食材写一句「形态说明」，只说它在画面里长什么样、怎么处理：',
  '· 整块 / 切片 / 切丁 / 切条 / 整颗 / 五只排成一行 / 一小堆；',
  '· 带皮还是去皮、切面朝上还是朝下；',
  '· 20 字以内，具体、可视。',
  '',
  '不要写：摆放位置、台面、道具、光线、机位、色调、百分比，也不要写任何负面词或「不要出现」。',
  '',
  '输出格式：每行一条，用「｜」分隔，例如：',
  '牛霖｜整块平放，表面朝上',
  '糙米｜堆成边缘干净的圆锥',
  '虾仁｜六只等距排成一行，灰白色半透明',
  '',
  '只输出这些行，不要标题、不要解释、不要空行。',
].join('\n');

const MAX_PROMPT_LENGTH = 6000;

/**
 * 旧默认提示词（老板 2026-10-31 版，以及更早的英文版）。
 * 线上 singleton 还存着这些时，视为「没被人改过」，自动回退新默认——
 * 否则会继续用「自由发挥」的旧话术，把结构化模板的效果抵消掉。
 */
const LEGACY_PROMPT_MARKERS = [
  'Put duck heart, duck gizzard and duck liver',
  'Broccoli is a tree-like green head',
  '你是一名顶尖的商业食物摄影师兼食物造型师，服务于一个高端鲜食狗粮品牌。',
  '把这些食材全部拍成一张顶尖杂志级的商业食物照片',
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
