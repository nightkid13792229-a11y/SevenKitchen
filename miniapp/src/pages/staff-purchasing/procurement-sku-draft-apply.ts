/**
 * 把 AI 识别的草稿套进表单（2026-11-01，2026-11-09 改为规格链）。
 *
 * 这里有一条**必须守住**的规矩（老板定「账目准确优先」）：
 * 件数没读出来时，不能留默认的 1 —— 一箱 24×330ml 被存成 1×330，
 * 库存和成本会静默差 24 倍，而且系统不会报错。
 *
 * 规格链的口径：`specChain` 最后一层一定是基准数量（克/毫升/个），
 * 前面的层是「一箱里几件」；套进表单时拆成"计数层"和"基准数量"两半。
 */

import type { ProcurementSkuDraft } from './api/purchasing';

export interface ApplyDraftOptions {
  purchaseUnits: string[];
}

export interface ApplyDraftPatch {
  name?: string;
  purchaseChannel?: string;
  purchaseUnit?: string;
  /** AI 读到、但不在字典里的单位原文：页面据此提示员工自己选（2026-11-11） */
  purchaseUnitHint?: string | null;
  /** 计数层（最后一层基准数量之前的部分），如 [{count:'30',unit:'枚'}] */
  specLinks?: Array<{ count: string; unit: string }>;
  /** 最后一层的数量（基准单位），如 '53'（克） */
  netContentText?: string;
  /** 这个数字是包装上印的，还是用整件总重折算出来的 */
  netContentDerived?: boolean;
  totalNetContentInBase?: number | null;
  /** 最后一层的单位文案（按个记账时可能是「张」） */
  amountUnitText?: string | null;
  /** 包装规格原文，如「30枚 1.59kg」 */
  specText?: string | null;
  /** 链是否折算成功；false 时只把计数层灌进表单，重量留空 */
  specChainResolved?: boolean;
  unitPriceText?: string;
}

export interface ApplyDraftResult {
  patch: ApplyDraftPatch;
  missing: string[];
  confidence: Record<string, 'high' | 'low'>;
}

export function applyDraftToForm(
  draft: ProcurementSkuDraft,
  options: ApplyDraftOptions,
): ApplyDraftResult {
  const patch: ApplyDraftPatch = {};

  if (draft.name) {
    patch.name = draft.name;
  }

  if (draft.purchaseChannel) {
    patch.purchaseChannel = draft.purchaseChannel;
  }

  // 不在白名单里的单位不套用：套了也存不进去，只会让员工在保存时吃一个 400。
  // 但**不能静默丢**（2026-11-11）：原文带到页面上，让员工看到"AI 读到了什么"。
  if (draft.purchaseUnit && options.purchaseUnits.includes(draft.purchaseUnit)) {
    patch.purchaseUnit = draft.purchaseUnit;
  } else if (draft.purchaseUnit) {
    patch.purchaseUnitHint =
      String(draft.purchaseUnitHint || draft.purchaseUnit).slice(0, 8);
  }

  const chain = Array.isArray(draft.specChain) ? draft.specChain : [];
  // 链尾是不是"基准数量"，看 netContentPerPack 有没有值：
  // 重量没读出来时，链上只剩件数层（30 枚），不能把 30 当成克数。
  const hasBaseAmount =
    typeof draft.netContentPerPack === 'number' && draft.netContentPerPack > 0;

  const countLinks = (hasBaseAmount ? chain.slice(0, -1) : chain).map(
    (link) => ({
      count: String(link.count),
      unit: String(link.unit || ''),
    }),
  );

  // 老后端（或模型按老格式作答）没有 specChain：退回"件数 + 单件净含量"
  if (chain.length === 0) {
    if (typeof draft.packCount === 'number' && draft.packCount > 1) {
      countLinks.push({ count: String(draft.packCount), unit: '件' });
    }
  }

  patch.specLinks = countLinks;

  const amount = hasBaseAmount
    ? chain.length > 0
      ? chain[chain.length - 1].count
      : draft.netContentPerPack
    : null;
  patch.netContentText =
    typeof amount === 'number' && amount > 0 ? String(amount) : '';

  patch.netContentDerived = draft.netContentSource === 'derived';
  patch.totalNetContentInBase = draft.totalNetContentInBase ?? null;
  patch.amountUnitText = draft.amountUnitText ?? null;
  patch.specText = draft.specText ?? null;
  patch.specChainResolved = draft.specChainResolved !== false;

  if (typeof draft.unitPrice === 'number' && draft.unitPrice >= 0) {
    patch.unitPriceText = String(draft.unitPrice);
  }

  return {
    patch,
    missing: [...draft.missing],
    confidence: { ...draft.confidence },
  };
}
