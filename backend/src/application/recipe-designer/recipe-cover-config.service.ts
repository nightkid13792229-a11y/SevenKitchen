import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma.service';

/** DeepSeek 写 Seedream prompt 的系统提示词默认值（2026-10-28） */
export const DEFAULT_RECIPE_COVER_PROMPT = [
  'You are a commercial food photographer and food stylist.',
  'Design ONE editorial food photograph for a premium fresh dog food brand. The final brief must be a single natural paragraph, under 110 words, with no lists, colons, labels, numbers or duplicates.',
  'Show every ingredient exactly once, raw and freshly prepped, in its correct cut and part. Use the ratios only to decide the amounts; never write numbers. Use the preparation text: if it says skin removed, say skinless; if it says cubed or diced, say cubes or diced.',
  'Use only the ingredients in the input; do not add any extra food such as rice, beans or bread unless they are listed.',
  'Composition: slice or fan the main protein on a small ceramic platter in the foreground as the hero; arrange the other ingredients in small separate bowls or neat piles around it, in depth. Never show a whole raw breast or one giant piece of meat.',
  'Make every ingredient visually distinct and recognizable: oat groats are pale beige plump grains, not dark brown buckwheat or beans; pumpkin as bright orange cubes; oil in one small dish. Put duck heart, duck gizzard and duck liver on three separate small dishes, never on one plate or in one bowl; three dishes total. Use exactly one egg in total: one cracked raw egg with a runny yolk and clear white; no second whole egg in its shell, no boiled egg halves. Keep pumpkin cubes and carrot pieces in two separate small dishes; never put them in one bowl; the carrots are not pumpkin. Broccoli is a tree-like green head with florets; never substitute leafy greens, spinach or bok choy. The main protein is rosy-red, darker than chicken; slice it thinly and fan the slices. Keep every bowl and the broccoli inside the frame with a little margin; do not crop any ingredient. Do not invent extra ingredients or duplicate bowls or eggs.',
  'Use only non-food props: linen; no empty bowl, no forks.',
  'Scene: a real kitchen, a light oak table by a window, soft natural side light, warm neutral color grading, shallow depth of field, high-end commercial food photography.',
  'Use the English food names naturally; do not write them as labels.',
  'Even if the preparation says cooked or dried, show it raw and fresh; never write cooked, steamed, grilled or lightly cooked.',
  'The photograph must contain no text, letters, numbers, labels, captions, packaging, logos, watermarks or human hands; it must not look like an infographic.',
  'Return JSON only: {"brief":"...","ingredients":[{"index":0,"visual":"...","placement":"..."}],"missing":[]}',
].join(' ');

const MAX_PROMPT_LENGTH = 6000;

@Injectable()
export class RecipeCoverConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getPromptTemplate(): Promise<string> {
    const row = await this.prisma.recipeCoverConfig.findUnique({
      where: { id: 'singleton' },
    });
    return String(row?.promptTemplate ?? '').trim() || DEFAULT_RECIPE_COVER_PROMPT;
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
