import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const indexSource = readFileSync(resolve(__dirname, 'staff-production/index.vue'), 'utf8');
const productionApiSource = readFileSync(resolve(__dirname, 'staff-production/api/production.ts'), 'utf8');
const detailSource = readFileSync(resolve(__dirname, 'staff-production/detail.vue'), 'utf8');
const printTaskSource = readFileSync(resolve(__dirname, 'staff-production/print-task.vue'), 'utf8');
const printLabelSource = readFileSync(resolve(__dirname, 'staff-production/print-label.vue'), 'utf8');
const labelConfigSource = readFileSync(resolve(__dirname, 'staff-production/utils/label-config.ts'), 'utf8');
const labelRendererSource = readFileSync(resolve(__dirname, 'staff-production/utils/label-renderer.ts'), 'utf8');
const jcingPrinterSource = readFileSync(resolve(__dirname, 'staff-production/utils/jcing-printer.ts'), 'utf8');
const canvasPrinterSource = readFileSync(resolve(__dirname, 'staff-production/utils/canvas-printer.ts'), 'utf8');
const sharedCanvasPrinterSource = readFileSync(resolve(__dirname, '../utils/canvas-printer.ts'), 'utf8');

describe('生产打印 · 预处理列长文案', () => {
  it('生产打印和共享打印都按长度缩字号并最多拆 3 行', () => {
    for (const source of [canvasPrinterSource, sharedCanvasPrinterSource]) {
      expect(source).toContain('drawPreparationMethodText');
      expect(source).toContain("chars.length <= 18 ? 1 : chars.length <= 36 ? 2 : 3");
      expect(source).toContain('部位 / 状态 / 预处理');
    }
  });
});

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

  it('labels follow-up scheduling as creating an added production task when batches already exist', () => {
    expect(indexSource).toContain('scheduleButtonText');
    expect(indexSource).toContain('totalTaskCount.value > 0');
    expect(indexSource).toContain('创建新增制作单');
    expect(indexSource).toContain('开始自动排单');
    expect(indexSource).toContain('{{ scheduleButtonText }}');
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

  it('首屏四格与列表同源：含跨天未完成，并明确标注跨天数量', () => {
    expect(indexSource).toContain('totalTaskCount');
    expect(indexSource).toContain('carryoverTaskCount');
    expect(indexSource).toContain('含跨天');
    expect(indexSource).not.toContain('statistics.todayOrders');
  });

  it('删除按生产批次执行：按钮写「删除整批」，已完成批次不给入口', () => {
    expect(indexSource).toContain('getBatchUnits');
    expect(indexSource).toContain('canDeleteTask(task)');
    expect(indexSource).toContain('删除整批');
    expect(indexSource).toContain('batchUnits.length');
    expect(indexSource).toContain("task.status !== 'COMPLETED'");
    expect(indexSource).toContain("unit.status !== 'COMPLETED'");
  });

  it('完工照片至少 2 张、最多 5 张，且只统计上传成功的照片', () => {
    expect(detailSource).toContain('MAX_PHOTO_COUNT = 5');
    expect(detailSource).toContain('MIN_PHOTO_COUNT = 2');
    expect(detailSource).toContain('uploadedPhotos.value.length >= MIN_PHOTO_COUNT');
    expect(detailSource).toContain('!isUploading.value');
    expect(detailSource).not.toContain('totalPhotoCount');
    expect(detailSource).toContain('请至少上传2张照片');
  });

  it('上传失败的照片只出现一次，不再同时显示「上传中」和「失败」', () => {
    expect(detailSource).toContain(
      "uploadingPhotos.filter((task) => task.status === 'uploading')",
    );
    expect(detailSource).toContain(
      "uploadingPhotos.filter((task) => task.status === 'error')",
    );
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

  it('drops the retired source plan from production API and staff copy', () => {
    expect(indexSource).not.toContain('source-plan-badge');
    expect(indexSource).not.toContain('task.ingredientSourcePlanLabel');
    expect(detailSource).not.toContain('采购策略');
    expect(detailSource).not.toContain('taskDetail.ingredientSourcePlanLabel');
    expect(productionApiSource).not.toContain('ingredientSourcePlan');
  });

  it('prints production ingredients by procurement sku without counting subtotal rows', () => {
    expect(printTaskSource).toContain('realIngredientCount');
    expect(printTaskSource).toContain('!ingredient.isTotalWeight');
    expect(printTaskSource).toContain('formatIngredientSkuSourceLine');
    expect(printTaskSource).toContain('standardIngredientName');
    expect(printTaskSource).toContain('procurementSkuName');
    expect(printTaskSource).toContain('procurementSkuBrand');
    expect(printTaskSource).toContain('procurementSkuPurchaseChannel');
    expect(printTaskSource).toContain('procurementSkuProductModel');
    expect(printTaskSource).toContain('原料清单（{{ realIngredientCount }}项）');
  });

  it('把顾客备注带到生产单与打印版，别只留在客服后台', () => {
    // 过敏提醒、分装标签都是顾客在确认订单页填的，车间必须看得到；
    // 打印版还不能按两行截断，否则正好把关键信息截掉。
    expect(detailSource).toContain('order.customerNote');
    expect(detailSource).toContain('顾客备注');
    expect(printTaskSource).toContain('order.customerNote');
    expect(printTaskSource).toContain('customer-note-text');
    expect(printTaskSource).toContain('-webkit-line-clamp: unset');
  });

  it('uses the approved one-page A4 compact print preview layout', () => {
    expect(printTaskSource).toContain('a4-paper');
    expect(printTaskSource).toContain('print-paper-inner');
    expect(printTaskSource).toContain('compact-print-table');
    expect(printTaskSource).toContain('orderCardsClass');
    expect(printTaskSource).toContain("'single-order'");
    expect(printTaskSource).toContain('ingredient-sku-source-line');
    expect(printTaskSource).toContain('SKU / 品牌 / 渠道 / 规格');
    expect(printTaskSource).not.toContain('<view class="table-cell type">类型</view>');
    expect(printTaskSource).not.toContain('<view class="table-cell type">');
    expect(printTaskSource).not.toContain('原料 / SKU / 来源');
    expect(printTaskSource).not.toContain('来源：');
    expect(printTaskSource).not.toContain('purchase-summary');
    expect(printTaskSource).not.toContain('标准原料 / SKU');
    expect(printTaskSource).not.toContain('<view class="table-cell purchase">品牌 / 渠道 / 规格</view>');
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
    expect(indexSource).toContain('autoSchedule({');
    expect(indexSource).toContain('startDate: selectedProductionDate.value');
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

  it('prints backend-generated product label images at the actual 70x100mm paper size', () => {
    [jcingPrinterSource].forEach((source) => {
      expect(source).toContain('const LABEL_PAPER_WIDTH_MM = 70');
      expect(source).toContain('const LABEL_PAPER_HEIGHT_MM = 100');
      expect(source).toContain('JCAPI.startDrawLabel(canvasId, component, LABEL_PAPER_WIDTH_MM, LABEL_PAPER_HEIGHT_MM, 0, null)');
      expect(source).toContain('JCAPI.drawImage(tempFilePath, 0, 0, LABEL_PAPER_WIDTH_MM, LABEL_PAPER_HEIGHT_MM, 0)');
      expect(source).not.toContain('JCAPI.startDrawLabel(canvasId, component, 75, 100, 0, null)');
      expect(source).not.toContain('JCAPI.drawImage(tempFilePath, 0, 0, 75, 100, 0)');
    });
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

  it('shows SKU, brand, channel and spec inline in the first ingredient column', () => {
    expect(printTaskSource).toContain('formatIngredientSkuSourceLine(ingredient)');
    expect(printTaskSource).toContain('getPrintablePurchaseSummaryParts');
    expect(printTaskSource).toContain('word-break: break-all');
    expect(printTaskSource).not.toContain('formatIngredientNameLine');
    expect(printTaskSource).not.toContain('formatPurchaseSummary');
    expect(printTaskSource).not.toContain('purchase-summary-full');
    expect(printTaskSource).not.toContain('来源：{{ formatPurchaseSummary(ingredient) }}');
    expect(printTaskSource).not.toContain('<view class="purchase-summary">{{ formatPurchaseSummary(ingredient) }}</view>');
    expect(printTaskSource).not.toContain('<view class="table-cell purchase">');
  });

  it('shows the inline SKU source column before preparation in production task print preview', () => {
    const sourceHeaderIndex = printTaskSource.indexOf('<view class="table-cell source">SKU / 品牌 / 渠道 / 规格</view>');
    const methodHeaderIndex = printTaskSource.indexOf('<view class="table-cell method">部位/状态/预处理</view>');
    const sourceCellIndex = printTaskSource.indexOf('<view class="table-cell source">', sourceHeaderIndex + 1);
    const methodCellIndex = printTaskSource.indexOf('<view class="table-cell method">', methodHeaderIndex + 1);

    expect(sourceHeaderIndex).toBeGreaterThan(-1);
    expect(methodHeaderIndex).toBeGreaterThan(-1);
    expect(sourceHeaderIndex).toBeLessThan(methodHeaderIndex);
    expect(sourceCellIndex).toBeGreaterThan(-1);
    expect(methodCellIndex).toBeGreaterThan(-1);
    expect(sourceCellIndex).toBeLessThan(methodCellIndex);
  });

  it('lets ingredient source and preparation cells wrap in production task print preview', () => {
    expect(printTaskSource).toContain('ingredient-sku-source-line');
    expect(printTaskSource).toContain('method-text');
    expect(printTaskSource).toContain(`.ingredient-sku-source-line,
.method-text {
  display: block;`);
    expect(printTaskSource).not.toContain(`.ingredient-sku-source-line,
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
