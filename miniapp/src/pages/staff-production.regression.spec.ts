import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexSource = readFileSync(
  resolve(__dirname, 'staff-production/index.vue'),
  'utf8',
);
const productionApiSource = readFileSync(
  resolve(__dirname, 'staff-production/api/production.ts'),
  'utf8',
);
const detailSource = readFileSync(
  resolve(__dirname, 'staff-production/detail.vue'),
  'utf8',
);
const printTaskSource = readFileSync(
  resolve(__dirname, 'staff-production/print-task.vue'),
  'utf8',
);
const printLabelSource = readFileSync(
  resolve(__dirname, 'staff-production/print-label.vue'),
  'utf8',
);
const labelConfigSource = readFileSync(
  resolve(__dirname, 'staff-production/utils/label-config.ts'),
  'utf8',
);
const labelRendererSource = readFileSync(
  resolve(__dirname, 'staff-production/utils/label-renderer.ts'),
  'utf8',
);

describe('staff production scheduling guardrails', () => {
  it('shows auto-schedule based on unscheduled purchasing orders instead of existing batches', () => {
    expect(indexSource).toContain('canAutoSchedule');
    expect(indexSource).toContain('statistics.pendingScheduleOrders');
    expect(indexSource).toContain('待排单订单');
    expect(indexSource).toContain('selectedProductionDate');
    expect(indexSource).toContain('targetDate: selectedProductionDate.value');
    expect(indexSource).toContain('includeUnfinishedCarryover: true');
    expect(productionApiSource).toContain('pendingScheduleOrders');

    expect(indexSource).not.toContain('!hasTodayBatch');
    expect(indexSource).not.toContain('const hasTodayBatch');
    expect(indexSource).not.toContain('hasTodayBatch.value = hasToday');
  });

  it('moves staff into the task detail immediately after starting production', () => {
    expect(indexSource).toContain('await startProductionTask(task.id)');
    expect(indexSource).toContain('uni.navigateTo({');
    expect(indexSource).toContain('url: `/pages/staff-production/detail?id=${task.id}`');
  });

  it('keeps the task detail focused on production state instead of duplicate navigation chrome', () => {
    expect(detailSource).not.toContain('class="nav-bar"');
    expect(detailSource).toContain("taskDetail.status === 'COMPLETED' && taskDetail.completedAt");
  });

  it('shows status counts in production tabs', () => {
    expect(indexSource).toContain('taskStatusCounts');
    expect(indexSource).toContain('tab.count');
    expect(indexSource).toContain('class="tab-count"');
  });

  it('separates current pot production quantity from order packaging totals', () => {
    expect(detailSource).toContain('本锅制作量');
    expect(detailSource).toContain('formatShortOrderId');
    expect(detailSource).toContain('formatAssociatedOrderIds');
    expect(detailSource).toContain('订单总净重');
    expect(detailSource).toContain('订单分装');
  });

  it('shows recorded production result after a task is completed', () => {
    expect(detailSource).toContain('生产结果');
    expect(detailSource).toContain('resultStatusText');
    expect(detailSource).toContain('resultDeltaText');
    expect(detailSource).toContain('actualOutputG');
    expect(detailSource).toContain('resultPhotos');
    expect(productionApiSource).toContain('resultStatus?: ProductionResultStatus');
    expect(productionApiSource).toContain('actualOutputG?: number');
    expect(productionApiSource).toContain('resultPhotoUrls?: string[]');
  });

  it('keeps ingredient source plan as API data without showing it as production staff copy', () => {
    expect(indexSource).not.toContain('source-plan-badge');
    expect(indexSource).not.toContain('task.ingredientSourcePlanLabel');
    expect(detailSource).not.toContain('采购策略');
    expect(detailSource).not.toContain('taskDetail.ingredientSourcePlanLabel');
    expect(productionApiSource).toContain('ingredientSourcePlanLabel?: string');
  });

  it('prints production ingredients by procurement sku without counting subtotal rows', () => {
    expect(printTaskSource).toContain('realIngredientCount');
    expect(printTaskSource).toContain('!ingredient.isTotalWeight');
    expect(printTaskSource).toContain('formatIngredientNameLine');
    expect(printTaskSource).toContain('formatPurchaseSummary');
    expect(printTaskSource).toContain('standardIngredientName');
    expect(printTaskSource).toContain('procurementSkuName');
    expect(printTaskSource).toContain('procurementSkuBrand');
    expect(printTaskSource).toContain('procurementSkuPurchaseChannel');
    expect(printTaskSource).toContain('procurementSkuProductModel');
    expect(printTaskSource).toContain('原料清单（{{ realIngredientCount }}项）');
  });

  it('uses the approved one-page A4 compact print preview layout', () => {
    expect(printTaskSource).toContain('a4-paper');
    expect(printTaskSource).toContain('print-paper-inner');
    expect(printTaskSource).toContain('compact-print-table');
    expect(printTaskSource).toContain('orderCardsClass');
    expect(printTaskSource).toContain("'single-order'");
    expect(printTaskSource).toContain('ingredient-name-line');
    expect(printTaskSource).toContain('purchase-summary');
    expect(printTaskSource).toContain('品牌 / 渠道 / 规格');
    expect(printTaskSource).toContain('remark-text');
    expect(printTaskSource).toContain('-webkit-line-clamp: 2');
    expect(printTaskSource).not.toContain('标准：{{ ingredient.standardIngredientName }}');
  });

  it('filters placeholder text from print purchase summaries', () => {
    expect(printTaskSource).toContain('getPrintablePurchaseSummaryParts');
    expect(printTaskSource).toContain('shouldSkipPurchaseSummaryPart');
    expect(printTaskSource).toContain("'无'");
    expect(printTaskSource).toContain("'暂无'");
  });

  it('makes production date filtering explicit and keeps carryover tasks visible', () => {
    expect(indexSource).toContain('mode="date"');
    expect(indexSource).toContain('handleProductionDateChange');
    expect(indexSource).toContain('autoSchedule({ startDate: selectedProductionDate.value })');
    expect(indexSource).toContain('isCarryoverTask(task)');
    expect(indexSource).toContain('逾期');
    expect(productionApiSource).toContain('includeUnfinishedCarryover?: boolean');
    expect(productionApiSource).toContain('productionDate: string');
    expect(productionApiSource).toContain('targetDate?: string');
  });

  it('prints product labels as customer-facing 70x100mm food labels', () => {
    expect(printLabelSource).not.toContain('原料方案：');
    expect(printLabelSource).not.toContain('order.ingredientSourcePlan');
    expect(printLabelSource).toContain('printCount: 2');
    expect(printLabelSource).toContain('<text class="value">70mm × 100mm</text>');
    expect(printLabelSource).not.toContain('<text class="value">标签纸 70mm × 100mm</text>');
    expect(printLabelSource).toContain('class="info-row date-row"');
    expect(labelConfigSource).toContain('width: 70');
    expect(labelConfigSource).toContain('height: 100');
    expect(labelRendererSource).toContain('70mm × 100mm');
    expect(labelRendererSource).toContain('buildCompleteNutritionItems');
  });

  it('shows a clear blocking message when full label content exceeds the paper size', () => {
    expect(printLabelSource).toContain('isLabelContentOverflowError');
    expect(printLabelSource).toContain('showLabelContentOverflowModal');
    expect(printLabelSource).toContain('标签内容过多');
    expect(printLabelSource).toContain('无法完整放入 70mm × 100mm 标签纸');
  });

  it('splits custom package plans into separate product label items', () => {
    expect(printLabelSource).toContain('expandOrderPrintLabels');
    expect(printLabelSource).toContain('packageLabelTitle');
    expect(printLabelSource).toContain('packageTotalWeightG');
    expect(printLabelSource).toContain('标签项');
    expect(printLabelSource).not.toContain('分装明细：');
  });

  it('keeps full multi-spec package plans visible in production task print preview', () => {
    expect(printTaskSource).toContain('package-field');
    expect(printTaskSource).toContain('package-value');
    expect(printTaskSource).toContain('white-space: normal');
    expect(printTaskSource).not.toContain('<text class="field-value">{{ formatPackagePlan(order) }}</text>');
  });

  it('lets purchase summary cells wrap in production task print preview', () => {
    expect(printTaskSource).toContain('purchase-summary-full');
    expect(printTaskSource).toContain('word-break: break-all');
    expect(printTaskSource).not.toContain('<view class="purchase-summary">{{ formatPurchaseSummary(ingredient) }}</view>');
  });

  it('lets ingredient name and preparation cells wrap in production task print preview', () => {
    expect(printTaskSource).toContain('ingredient-name-line');
    expect(printTaskSource).toContain('method-text');
    expect(printTaskSource).toContain(`.ingredient-name-line,
.method-text {
  display: block;`);
    expect(printTaskSource).not.toContain(`.ingredient-name-line,
.method-text {
  display: -webkit-box;`);
  });

  it('uses a condensed production task print layout to leave more room for ingredients', () => {
    expect(printTaskSource).toContain('compact-task-title-line');
    expect(printTaskSource).not.toContain('<view class="pot-info">');
    expect(printTaskSource).not.toContain('分装订单（{{ printData.orderItems?.length || 0 }}个）');
    expect(printTaskSource).not.toContain('注：用量已包含生产损耗');
    expect(printTaskSource).not.toContain('SevenKitchen 专业鲜食套餐定制');
    expect(printTaskSource).not.toContain('第 1 / 1 页');
  });
});
