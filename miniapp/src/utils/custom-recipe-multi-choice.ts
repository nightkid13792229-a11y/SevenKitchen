/**
 * 确认页的多份选择（2026-10-25）。
 *
 * 份数 / 主蛋白模式 / 已选肉，是确认页自己的选择，不进订单表单；
 * 但顾客回定制页改个备注再回来时不应该被重置成 1 份/营养师配。
 * 按「顾客 + 狗」存一份，下次进确认页恢复。
 */

import type { ProteinChoiceMode } from './custom-recipe-pricing';

export interface CustomRecipeMultiChoice {
  quantity: number;
  proteinMode: ProteinChoiceMode;
  proteinCodes: string[];
}

const STORAGE_KEY = 'custom_recipe_multi_choices';

type ChoiceMap = Record<string, CustomRecipeMultiChoice>;

function buildKey(customerId: string, dogId: string): string {
  return `${customerId}:${dogId}`;
}

function readMap(): ChoiceMap {
  try {
    const value = uni.getStorageSync(STORAGE_KEY);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as ChoiceMap)
      : {};
  } catch (error) {
    console.warn('[CustomRecipeMultiChoice] 读取失败:', error);
    return {};
  }
}

function writeMap(value: ChoiceMap): void {
  try {
    uni.setStorageSync(STORAGE_KEY, value);
  } catch (error) {
    console.warn('[CustomRecipeMultiChoice] 保存失败:', error);
  }
}

function normalizeChoice(
  value: any,
  maxQuantity: number,
): CustomRecipeMultiChoice | null {
  if (!value || typeof value !== 'object') return null;
  const max = Math.max(1, Math.floor(Number(maxQuantity) || 1));
  const quantity = Math.min(
    max,
    Math.max(1, Math.floor(Number(value.quantity) || 1)),
  );
  const proteinMode: ProteinChoiceMode =
    value.proteinMode === 'SELF' ? 'SELF' : 'DIETITIAN';
  const proteinCodes = Array.from(
    new Set(
      (Array.isArray(value.proteinCodes) ? value.proteinCodes : [])
        .map((code: unknown) => String(code || '').trim())
        .filter(Boolean),
    ),
  ).slice(0, quantity);
  return { quantity, proteinMode, proteinCodes };
}

export function loadCustomRecipeMultiChoice(
  customerId: string,
  dogId: string,
  maxQuantity: number,
): CustomRecipeMultiChoice | null {
  if (!customerId || !dogId) return null;
  const map = readMap();
  return normalizeChoice(map[buildKey(customerId, dogId)], maxQuantity);
}

export function saveCustomRecipeMultiChoice(
  customerId: string,
  dogId: string,
  choice: CustomRecipeMultiChoice,
  maxQuantity: number,
): void {
  if (!customerId || !dogId) return;
  const normalized = normalizeChoice(choice, maxQuantity);
  if (!normalized) return;
  const map = readMap();
  map[buildKey(customerId, dogId)] = normalized;
  writeMap(map);
}
