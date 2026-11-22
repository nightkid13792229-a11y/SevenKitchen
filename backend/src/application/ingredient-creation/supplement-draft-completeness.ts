/**
 * 草稿完成度：列表页和编辑页顶部显示「已填必填项 / 总必填项」。
 *
 * 只回答「还差哪些必填项」，不做取舍也不拦写入：
 * 真正的阻断/提醒由 `validateSupplementDraftBasics`（基础）和
 * `evaluateSupplementIssues`（目录/功能）负责。
 */

import type {
  SupplementBaseUnit,
  SupplementDraftPayload,
  SupplementPhysicalForm,
} from './supplement-draft.types';

export interface DraftCompleteness {
  /** 当前条件下必填项总数（联动开关会变） */
  totalRequired: number;
  /** 已填的必填项数量 */
  filledRequired: number;
  /** 还缺的必填项；键名与前端区块一一对应 */
  missing: string[];
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function isPositiveNumber(value: number | null): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function hasPositiveNutrient(nutrients: Record<string, number>): boolean {
  return Object.values(nutrients).some(
    (value) => Number.isFinite(value) && value > 0,
  );
}

/**
 * 计算完成度。
 *
 * 基准单位默认是 PCS，所以「已填」不能只看字符串非空：
 * 必须和物理形态对得上（粉=G、液体=ML、片/胶囊=PCS）才算填了，
 * 否则空草稿一创建就会显示 1/15 已填，且基准单位永远提示不出来。
 */
export function computeDraftCompleteness(
  payload: SupplementDraftPayload,
): DraftCompleteness {
  const { basic, nutrition, label, retail, diy, equivalence } = payload;

  // 基准单位不再和物理形态硬绑定：粉剂可按平勺（PCS）、液体可按滴（PCS）。
  // 形态没选时仍算 baseUnit 未填，避免空草稿白送一项。
  const baseUnitFilled = basic.physicalForm !== null;

  const checks: Array<{ key: string; filled: boolean }> = [
    // ① 商品与基本信息
    { key: 'name', filled: hasText(basic.name) },
    { key: 'baseUnit', filled: baseUnitFilled },
    { key: 'unitDisplayLabel', filled: hasText(basic.unitDisplayLabel) },
    { key: 'physicalForm', filled: basic.physicalForm !== null },
    {
      key: 'servingUnitsPerDose',
      filled: isPositiveNumber(basic.servingUnitsPerDose),
    },
    { key: 'purchaseUnit', filled: hasText(basic.purchaseUnit) },
    {
      key: 'purchaseToBaseRatio',
      filled: isPositiveNumber(basic.purchaseToBaseRatio),
    },
    {
      key: 'currentPricePerPurchaseUnit',
      filled: isPositiveNumber(basic.currentPricePerPurchaseUnit),
    },
    { key: 'addTiming', filled: hasText(basic.addTiming) },

    // ② 营养：至少一个营养素 > 0，且至少一个默认目标
    {
      key: 'nutrition',
      filled:
        hasPositiveNutrient(nutrition.servingNutrients) &&
        nutrition.defaultTargetFields.length > 0,
    },

    // ③ 标签：分类 + 标签名称 + 分类标签
    { key: 'labelCategory', filled: label.labelCategory !== null },
    { key: 'labelNames', filled: label.labelNames.length > 0 },

    // ④ 上架：开 → 保质期；关 → 不上架原因选填，不进入必填统计
    ...(retail.enabled
      ? [
          {
            key: 'shelfLifeMonths',
            filled: isPositiveNumber(retail.shelfLifeMonths),
          },
        ]
      : []),

    // ⑤ DIY：开 → 平台（商品链接是选填，不阻塞建档）
    ...(diy.enabled
      ? [{ key: 'platform', filled: hasText(diy.platform) }]
      : []),

    // ⑥ 采购没有额外必填（单位/倍数/价格已算在 basic 里）

    // ⑦ 等价组：选组或明确「暂不归组」，null 表示还没选
    { key: 'groupId', filled: equivalence.groupId !== null },
  ];

  const missing = checks
    .filter((check) => !check.filled)
    .map((check) => check.key);

  return {
    totalRequired: checks.length,
    filledRequired: checks.length - missing.length,
    missing,
  };
}
