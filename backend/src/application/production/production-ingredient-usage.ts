/**
 * 生产锅次的「原料用量」计算
 *
 * 这是**唯一一处**负责回答"这一锅用掉多少原料"的地方。
 *
 * 为什么必须只留一处：原先三处各算各的，口径互不相同 ——
 *   1. 车间界面（小程序）算得对，但只用来显示
 *   2. 后端后台路径用 `ratio` 算，**漏了损耗率**；补剂按营养素目标定量时
 *      `ratio` 本来就是 0，直接抛错
 *   3. 定价/成本那条路又是另一套（还要除出成率）
 *
 * 结果是"员工看到的数字"和"系统要扣的数字"可能不是同一个数。
 * 这里按**车间界面一致的口径**实现，供扣减原料库存使用：
 *
 *   投料毛重 = 锅净产出 × 损耗率
 *   食材/包材：投料毛重 × 配比%
 *   补剂：按营养素目标定量（与成本核算同一个函数），没有目标时才回退到配比
 *
 * 补剂损耗率取「该补剂自己的损耗率」，没设时才用全局配置值 ——
 * 与成本核算保持一致（实测 33 种补剂里 30 种已显式设过）。
 */

import type { SupplementTarget } from '../../domain/ingredient/types';
import { calculateSupplementDose } from '../../domain/ingredient/supplement-targets';

export interface ProductionUsageItem {
  ingredientId: string;
  name: string;
  type: 'FOOD' | 'SUPPLEMENT' | 'PACKAGING';
  /** 应投量（数值；单位见 unit） */
  requiredAmount: number;
  /** 展示单位：食材是 g，补剂可能是 粒/片/ml */
  unit: string;
  /** 可读的算式，便于车间与后台核对 */
  calculation: string;
}

export interface ProductionUsageResult {
  /** 投料毛重（含损耗） */
  foodInputWeightG: number;
  lossRate: number;
  items: ProductionUsageItem[];
  /** 算不出用量的原料（值为 0），调用方需要提示而不是静默丢掉 */
  skipped: Array<{ ingredientId: string; name: string; reason: string }>;
}

export interface CalculateProductionUsageParams {
  recipeSnapshot: any;
  /** 这一锅的净产出（g） */
  totalProductionG: number;
  /** 全局补剂损耗率（后台可调），补剂自己没设时才用 */
  supplementLossRate: number;
}

export function calculateProductionUsage(
  params: CalculateProductionUsageParams,
): ProductionUsageResult {
  const { recipeSnapshot, totalProductionG } = params;
  const lossRate = positive(recipeSnapshot?.production_loss_rate) ?? 1.07;
  const foodInputWeightG = totalProductionG * lossRate;
  const items: ProductionUsageItem[] = [];
  const skipped: ProductionUsageResult['skipped'] = [];

  const recipeItems: any[] = Array.isArray(recipeSnapshot?.items)
    ? recipeSnapshot.items
    : [];

  for (const item of recipeItems) {
    const ingredientId = item?.ingredient_id || item?.ingredientId;
    if (!ingredientId) continue;

    const name = item?.name || '未知原料';
    const rawType = String(item?.ingredient_type || item?.ingredientType || 'FOOD')
      .toUpperCase();
    const type: ProductionUsageItem['type'] =
      rawType === 'SUPPLEMENT'
        ? 'SUPPLEMENT'
        : rawType === 'PACKAGING'
          ? 'PACKAGING'
          : 'FOOD';

    if (type === 'SUPPLEMENT') {
      const resolved = resolveSupplementUsage({
        item,
        name,
        ingredientId,
        totalProductionG,
        defaultLossRate: params.supplementLossRate,
      });
      if (resolved) {
        items.push(resolved);
      } else {
        // 补剂既没有营养素目标、也没有配比 —— 算不出用量，交回调用方提示
        const ratio = positive(item?.ratio);
        skipped.push({
          ingredientId,
          name,
          reason: ratio
            ? '配比或营养素目标缺失'
            : '既没有营养素目标也没有配比，无法推算应投量',
        });
      }
      continue;
    }

    const ratio = positive(item?.ratio);
    if (!ratio) {
      skipped.push({
        ingredientId,
        name,
        reason: '配方快照里没有配比',
      });
      continue;
    }

    const requiredAmount = round4(foodInputWeightG * (ratio / 100));
    if (requiredAmount <= 0) {
      skipped.push({ ingredientId, name, reason: '按配比算出的用量为 0' });
      continue;
    }

    items.push({
      ingredientId,
      name,
      type,
      requiredAmount,
      unit: 'g',
      calculation: `投料毛重 ${round2(foodInputWeightG)}g（净产出 ${round2(
        totalProductionG,
      )}g × 损耗率 ${lossRate}）× 配比 ${ratio}% = ${requiredAmount}g`,
    });
  }

  return { foodInputWeightG, lossRate, items, skipped };
}

function resolveSupplementUsage(params: {
  item: any;
  name: string;
  ingredientId: string;
  totalProductionG: number;
  defaultLossRate: number;
}): ProductionUsageItem | null {
  const { item, name, ingredientId, totalProductionG } = params;

  const targets = normalizeTargets(item?.supplement_targets);
  const lossRate =
    positive(item?.properties?.production_loss_rate) ??
    positive(params.defaultLossRate) ??
    1;

  if (targets.length > 0 && item?.nutrition_profile_snapshot) {
    try {
      const dose = calculateSupplementDose({
        nutritionProfile: item.nutrition_profile_snapshot,
        targets,
        // 与成本核算同一口径：基准是净产出，损耗单独乘
        basisWeightG: totalProductionG,
        lossRate,
      });
      const requiredAmount = round4(dose.amount);
      if (requiredAmount > 0) {
        const unit = resolveSupplementUnit(item);
        return {
          ingredientId,
          name,
          type: 'SUPPLEMENT',
          requiredAmount,
          unit,
          calculation: `按营养素目标：净产出 ${round2(
            totalProductionG,
          )}g ÷ 1000 × 每 kg 目标量 ÷ 浓度 × 损耗率 ${lossRate} = ${requiredAmount}${unit}`,
        };
      }
    } catch {
      // 浓度缺失等异常：不阻断整锅，回退到配比
    }
  }

  // 回退：按配比（补剂里也有按比例加的，例如某些粉剂）
  const ratio = positive(item?.ratio);
  if (!ratio) return null;
  const lossRateForRatio = positive(item?.properties?.production_loss_rate) ?? 1;
  const requiredAmount = round4(
    totalProductionG * lossRateForRatio * (ratio / 100),
  );
  if (requiredAmount <= 0) return null;

  return {
    ingredientId,
    name,
    type: 'SUPPLEMENT',
    requiredAmount,
    unit: resolveSupplementUnit(item),
    calculation: `按配比：净产出 ${round2(
      totalProductionG,
    )}g × 损耗率 ${lossRateForRatio} × 配比 ${ratio}% = ${requiredAmount}`,
  };
}

function normalizeTargets(value: unknown): SupplementTarget[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (target: any) => target?.fieldPath && Number(target?.targetValuePerKg) > 0,
  ) as SupplementTarget[];
}

function resolveSupplementUnit(item: any): string {
  return (
    item?.unit_display_label ||
    item?.unitDisplayLabel ||
    item?.unit ||
    'g'
  );
}

function positive(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
