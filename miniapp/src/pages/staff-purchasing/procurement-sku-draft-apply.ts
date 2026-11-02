/**
 * 把 AI 识别的草稿套进表单（2026-11-01）。
 *
 * 这里有一条**必须守住**的规矩（老板定「账目准确优先」）：
 * 件数没读出来时，件数输入框必须**清空并标红**，绝不能留着默认的 1 ——
 * 一箱 24×330ml 被存成 1×330，库存和成本会静默差 24 倍，而且系统不会报错。
 */

import type { ProcurementSkuDraft } from './api/purchasing';

export interface ApplyDraftOptions {
  purchaseUnits: string[];
}

export interface ApplyDraftPatch {
  name?: string;
  purchaseChannel?: string;
  purchaseUnit?: string;
  packCountText?: string;
  netContentText?: string;
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

  // 不在白名单里的单位不套用：套了也存不进去，只会让员工在保存时吃一个 400
  if (draft.purchaseUnit && options.purchaseUnits.includes(draft.purchaseUnit)) {
    patch.purchaseUnit = draft.purchaseUnit;
  }

  if (typeof draft.packCount === 'number' && draft.packCount > 0) {
    patch.packCountText = String(draft.packCount);
  } else if (draft.missing.includes('packCount')) {
    // 关键：清空，而不是保留默认的 1
    patch.packCountText = '';
  }

  if (typeof draft.netContentPerPack === 'number' && draft.netContentPerPack > 0) {
    patch.netContentText = String(draft.netContentPerPack);
  }

  if (typeof draft.unitPrice === 'number' && draft.unitPrice >= 0) {
    patch.unitPriceText = String(draft.unitPrice);
  }

  return {
    patch,
    missing: [...draft.missing],
    confidence: { ...draft.confidence },
  };
}
