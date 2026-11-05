import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'review.vue'), 'utf8');

/** 顶部绿色合计区：从 summary 开始到 meta-row 之前 */
const summaryBlock = source.slice(
  source.indexOf('<view v-if="activeImport" class="summary">'),
  source.indexOf('<view v-if="activeImport" class="meta-row">'),
);

describe('order import review summary', () => {
  it('uses the reconciled amount in the top banner instead of the booked purchase amount', () => {
    expect(summaryBlock).not.toBe('');
    expect(summaryBlock).toContain('核对金额');
    expect(summaryBlock).not.toContain('采购金额');
    expect(summaryBlock).toContain('money(reconcileAmount)');
    expect(summaryBlock).not.toContain('activeSummary.matchedAmount');
  });

  it('computes the reconciled amount as goods + shipping + packaging', () => {
    expect(source).toContain(
      'const reconcileAmount = computed(() => feeSummary.value?.expected ?? 0)',
    );
  });

  it('shows 未读到 when the voucher amount was not read, instead of using the subtotal', () => {
    expect(summaryBlock).toContain('未读到');
    expect(summaryBlock).not.toContain('activeImport.paid ?? activeImport.subtotal');
  });

  it('lists 匹配原料 in the same CFCT order as the purchase detail page', () => {
    // 抽屉里是「本次清单里的原料」，顺序跟详情页一致（2026-11-05 老板定）
    expect(source).toContain("from '../food-category-order'");
    expect(source).toContain(
      'const items = sortPurchaseItemsForDisplay(list.value?.items || []);',
    );
  });
});
