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

describe('order import edit sheet（2026-11-05 改版）', () => {
  /** 抽屉模板：从「修改一行」到「改运费」之前 */
  const sheetBlock = source.slice(
    source.indexOf('<!-- 修改一行'),
    source.indexOf('<!-- 改运费 / 包装费 -->'),
  );

  it('截图里的商品名可以直接改（不再是只读标题）', () => {
    expect(sheetBlock).toContain('v-model="editing.rawName"');
    expect(sheetBlock).not.toContain('修改「{{ editing.rawName }}」');
  });

  it('小计不再是输入框，只留下「和截图对不对」的一行核对', () => {
    expect(sheetBlock).not.toContain('editing.totalText');
    expect(sheetBlock).toContain('{{ checkText }}');
    expect(source).toContain('与截图小计一致');
    expect(source).toContain('按截图反算');
  });

  it('个人采购是标题栏上的开关，不再单独占一行', () => {
    expect(sheetBlock).toContain('<switch');
    expect(sheetBlock).not.toContain('算个人采购');
    expect(source).toContain('function onPersonalChange');
    // 开关只切换标记，不再把已选商品清空
    const handler = source.slice(
      source.indexOf('function onPersonalChange'),
      source.indexOf('function stepQty'),
    );
    expect(handler).not.toContain('editing.value.procurementSkuId = null');
  });

  it('数量单价并排，规格跟着商品名走（不再单独一行）', () => {
    expect(sheetBlock).toContain('class="amount-grid"');
    expect(sheetBlock).toContain('stepQty(-1)');
    expect(sheetBlock).not.toContain('净含量/规格');
    expect(sheetBlock).toContain('匹配商品');
  });

  it('认不准的行在清单上标「待确认」，不再一律写「已匹配」', () => {
    expect(source).toContain('function lineTrusted');
    expect(source).toContain("return lineTrusted(line) ? '已匹配' : '待确认'");
    expect(source).toContain('matched-review');
  });
});
