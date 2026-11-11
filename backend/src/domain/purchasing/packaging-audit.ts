/**
 * 包装层级一致性巡检（2026-11-11）。
 *
 * 只做"发现问题"，不改数据（`--apply` 也只补缺失的层级）。
 *
 * 为什么需要它：倍数是从层级派生并**落库**的，一旦有人绕过服务层改库、
 * 或者历史数据被别的脚本动过，倍数与层级就会不一致 —— 而系统只在折算时
 * 用倍数，不会发现层级说的是另一回事。
 */

import {
  deriveRatio,
  formatPackaging,
  readPackaging,
  type PackagingSpec,
} from './packaging';

export type AuditFindingKind =
  | 'PACKAGING_MISSING'
  | 'RATIO_MISMATCH'
  | 'UNIT_OUT_OF_DICT'
  | 'TEXT_CONFLICT';

export interface AuditSkuRow {
  id: string;
  name: string;
  ingredientName?: string | null;
  purchaseUnit: string | null;
  purchaseToBaseRatio: number | null;
  packaging: unknown;
  productModel?: string | null;
  baseUnit?: string | null;
  /** 这道原料允许的单位（来自字典）；为空表示不检查这一项 */
  allowedUnits?: string[];
}

export interface AuditFinding {
  skuId: string;
  name: string;
  ingredientName: string | null;
  kind: AuditFindingKind;
  detail: string;
}

const RATIO_TOLERANCE = 1e-6;

const ratioOf = (spec: PackagingSpec): number => deriveRatio(spec);

/**
 * 规格原文里"24×330ml"这种写法能不能对上倍数。
 *
 * 只认 `数字 × 数字 单位`，且只用来提示"文字和层级说的是两件事"，
 * 不做自动修正 —— 谁的数对，只有人知道。
 */
function expectedRatioFromText(productModel: string | null | undefined): number | null {
  const text = String(productModel ?? '');
  const match = text.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/i);
  if (!match) return null;
  const count = Number(match[1]);
  const amount = Number(match[2]);
  const unit = match[3].toLowerCase();
  if (!Number.isFinite(count) || !Number.isFinite(amount)) return null;
  const factor = unit === 'kg' || unit === 'l' ? 1000 : 1;
  return count * amount * factor;
}

export function auditSkuRows(rows: AuditSkuRow[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const row of rows) {
    const base = {
      skuId: row.id,
      name: row.name,
      ingredientName: row.ingredientName ?? null,
    };
    const spec = readPackaging(row.packaging);
    const ratio = Number(row.purchaseToBaseRatio ?? 0);

    if (!spec) {
      findings.push({
        ...base,
        kind: 'PACKAGING_MISSING',
        detail: `没有包装层级，只有倍数 ${ratio || '空'}，后台没法按层编辑`,
      });
      if (ratio > 0 && row.allowedUnits?.length) {
        // 单位与层级分开判断：缺层级也仍然要检查单位
      }
    } else if (ratio > 0 && Math.abs(ratioOf(spec) - ratio) > RATIO_TOLERANCE) {
      findings.push({
        ...base,
        kind: 'RATIO_MISMATCH',
        detail:
          `层级算出来是 ${ratioOf(spec)}，落库倍数是 ${ratio}；` +
          `层级：${formatPackaging(spec, row.purchaseUnit ?? '件')}`,
      });
    }

    if (row.allowedUnits?.length) {
      const unit = String(row.purchaseUnit ?? '').trim();
      if (!unit || !row.allowedUnits.includes(unit)) {
        findings.push({
          ...base,
          kind: 'UNIT_OUT_OF_DICT',
          detail: `采购单位「${unit || '空'}」不在字典里，后台编辑会被拒绝`,
        });
      }
    }

    const textRatio = expectedRatioFromText(row.productModel);
    const effectiveRatio = spec ? ratioOf(spec) : ratio;
    if (
      textRatio !== null &&
      effectiveRatio > 0 &&
      Math.abs(textRatio - effectiveRatio) / Math.max(textRatio, effectiveRatio) > 0.01
    ) {
      findings.push({
        ...base,
        kind: 'TEXT_CONFLICT',
        detail: `规格原文「${row.productModel}」像是 ${textRatio}，层级/倍数是 ${effectiveRatio}`,
      });
    }
  }

  return findings;
}
