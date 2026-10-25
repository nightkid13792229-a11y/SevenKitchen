import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf-8');

describe('定制订单详情 · S1 审计修复（2026-10-25）', () => {
  const page = read('src/pages/custom-recipe/order-detail.vue');

  it('★ 售后入口按“这一份”判断，不再整单统一查看进展', () => {
    expect(page).toContain('openAftersaleRecipeIds');
    expect(page).toContain('aftersaleHistoryRecipeIds');
    expect(page).toContain('isAftersaleOpenForRecipe');
    expect(page).toContain('hasAftersaleHistoryForRecipe');
    expect(page).toContain('showAftersaleEntry(item.recipeId)');
    expect(page).toContain('aftersaleEntryLabel(item.recipeId)');
    expect(page).toContain('showAftersaleEntry(order.recipeId)');
    expect(page).toContain("aftersaleEntryLabel");
    expect(page).not.toContain("aftersaleCount > 0 ? '查看进展' : '调整食谱'");
  });

  it('★ 从调整/退款/交付页返回会刷新订单详情，首次不重复请求', () => {
    expect(page).toContain('onShow');
    expect(page).toContain('hasShownOrderDetail');
    expect(page).toContain('void loadOrderDetail()');
  });

  it('★ 付款与取消互斥：两个方向都挡住并发', () => {
    expect(page).toContain('if (paying.value || cancelling.value) return;');
    expect(page).toContain('if (cancelling.value || paying.value) return;');
    expect(page).toContain(':disabled="paying || cancelling"');
  });

  it('★ 选项字典失败时不再漏英文枚举', () => {
    expect(page).toContain("'读取中…'");
    expect(page).toContain("'读取失败'");
    expect(page).not.toContain('goalLabel(goal) || goal');
    expect(page).not.toContain('currentFoodLabel(code) || code');
    expect(page).not.toContain('changeReasonLabel(code) || code');
    expect(page).not.toContain('stomachLabel(code) || code');
  });
});
