import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

/**
 * DeepSeek 的系统提示词默认值（2026-11-18 编辑摄影版）
 *
 * 只让模型写「每样食材的封面形态」，不写摆位/台面/光线——
 * 那些由 `cover-style.ts` 的模板固定，保证每次出的封面是同一套语言。
 *
 * 2026-11-18 老板定：一律整块/大块、自然原始形态，不读食谱的预处理字段。
 */
export const DEFAULT_RECIPE_COVER_PROMPT = [
  '你是高端鲜食狗粮品牌的商业食物造型师。',
  '',
  '先调用 get_recipe_ingredients 读取这份食谱的食材名称。',
  '',
  '不要看食谱里的预处理字段；封面只按食材名称写它的自然、原始、完整形态：',
  '· 肉：整块/大块，表面朝上；',
  '· 鱼：整条鱼，鱼头鱼尾完整；',
  '· 贝类/虾蟹：带壳整只；',
  '· 蛋：带壳整颗，旁边一颗打散；',
  '· 谷物：整粒堆成边缘干净的小山；',
  '· 蔬菜：整颗/整朵/整根/大块厚片；',
  '· 粉末/盐：一小碟/一小勺；油：小玻璃瓶/小碟；',
  '· 20 字以内，具体、可视。',
  '',
  '不要写：去皮、去骨、去油、去壳、去瓤、去蒂、打碎、切碎、切丁、绞肉、打粉、搅拌、煮熟、蒸熟、煎、烤。',
  '不要写：摆放位置、台面、道具、光线、机位、色调、百分比，也不要写任何负面词或「不要出现」。',
  '',
  '输出格式：每行一条，用「｜」分隔，例如：',
  '牛霖｜整块平放，表面朝上',
  '糙米｜整粒堆成边缘干净的小山',
  '鸡蛋｜带壳整颗，旁边一颗打散',
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
  // 2026-11-07 的默认版：只写「形态说明」，已被 2026-11-18 整块/大块版取代
  '你是高端鲜食狗粮品牌的商业食物摄影师兼食物造型师。',
  '然后为每一种食材写一句「形态说明」',
  // 2026-11-18 中午的过渡版：还写着「清理照做」，已被「不看预处理」版取代
  '清理照做：去皮、去骨、去油、去壳、去瓤、去蒂可以写',
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
