import { BadRequestException, Injectable } from '@nestjs/common';

import {
  RecipeCoverImageService,
  type RecipeCoverCandidate,
} from './recipe-cover-image.service';
import type {
  RecipeCoverIngredient,
  RecipeCoverSupplement,
} from './recipe-cover-prompt';
import { RecipeDesignerService } from './recipe-designer.service';

type RecipeDesignerAccessInput = Parameters<
  RecipeDesignerService['getDraft']
>[1];

type DraftItemLike = {
  weightG?: number | null;
  ratioPercent?: number | null;
  preparationMethod?: string | null;
  ingredient?: { name?: string | null; type?: string | null } | null;
  nutritionFood?: { name?: string | null } | null;
};

/**
 * 定制线上线检查的 AI 封面：取当前 DesignRecipe 草稿的食材，只预览。
 * 商品线走 SeriesCoverImageService；这里只服务「当前草稿」。
 */
@Injectable()
export class DesignRecipeCoverImageService {
  constructor(
    private readonly recipeDesignerService: RecipeDesignerService,
    private readonly coverImageService: RecipeCoverImageService,
  ) {}

  async generateForDraft(
    draftId: string,
    access: RecipeDesignerAccessInput,
    options?: { variants?: number },
  ): Promise<{
    url: string;
    provider: string;
    model: string;
    foodNames: string[];
    candidates: RecipeCoverCandidate[];
  }> {
    const draft = await this.recipeDesignerService.getDraft(draftId, access);
    const items = Array.isArray((draft as any)?.items)
      ? ((draft as any).items as DraftItemLike[])
      : [];
    const ingredients = this.extractIngredients(items);

    if (ingredients.length === 0) {
      throw new BadRequestException(
        '这个草稿还没有可用于生成封面的食材（至少需要一个食品类原料）',
      );
    }

    const generated = await this.coverImageService.generate({
      recipeName: String((draft as any)?.name ?? '定制食谱'),
      ingredients,
      supplements: this.extractSupplements(items),
      // 模型调用 get_recipe_ingredients 时才把这份草稿的食材交给它
      loadIngredients: async () => ingredients,
      layout: 'COVER_16_9',
      variants: options?.variants,
      dedupeKey: `draft:${draftId}`,
    });

    return {
      ...generated,
      foodNames: ingredients.map((item) => item.name),
    };
  }

  /**
   * 补剂只用来决定画面边缘小碟里放什么状态（粉/胶囊/片/油），
   * 不出现品牌包装。按克数取最显眼的几只，最多 4 个。
   */
  private extractSupplements(items: DraftItemLike[]): RecipeCoverSupplement[] {
    const merged = new Map<string, { name: string; weight: number }>();

    for (const item of items) {
      const type = String(item?.ingredient?.type ?? '').toUpperCase();
      if (type !== 'SUPPLEMENT') continue;
      const name = String(item?.ingredient?.name ?? '').trim();
      if (!name || name === '水') continue;

      const weight =
        Number(item?.weightG) > 0
          ? Number(item.weightG)
          : Number(item?.ratioPercent) > 0
            ? Number(item.ratioPercent)
            : 0;
      if (!Number.isFinite(weight) || weight <= 0) continue;

      const existing = merged.get(name);
      if (existing) {
        existing.weight += weight;
      } else {
        merged.set(name, { name, weight });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4)
      .map((row) => ({ name: row.name, weightG: row.weight }));
  }

  private extractIngredients(items: DraftItemLike[]): RecipeCoverIngredient[] {
    const merged = new Map<
      string,
      { name: string; preparationMethod: string; amount: number }
    >();

    for (const item of items) {
      const name = String(
        item?.ingredient?.name ?? item?.nutritionFood?.name ?? '',
      ).trim();
      const type = String(item?.ingredient?.type ?? '').toUpperCase();
      if (!name || type !== 'FOOD' || name === '水') continue;

      const amount =
        Number(item?.ratioPercent) > 0
          ? Number(item.ratioPercent)
          : Number(item?.weightG) > 0
            ? Number(item.weightG)
            : 0;
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const preparationMethod = String(item?.preparationMethod ?? '').trim();
      const key = `${name}|${preparationMethod}`;
      const existing = merged.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        merged.set(key, { name, preparationMethod, amount });
      }
    }

    const rows = Array.from(merged.values());
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    if (rows.length === 0 || total <= 0) return [];

    return rows.map((row) => ({
      name: row.name,
      preparationMethod: row.preparationMethod,
      ratioPercent: Math.round((row.amount / total) * 1000) / 10,
    }));
  }
}
