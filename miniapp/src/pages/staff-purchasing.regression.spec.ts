import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readPage = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

const indexSource = readPage('staff-purchasing/index.vue');
const detailSource = readPage('staff-purchasing/detail.vue');
const previewSource = readPage('staff-purchasing/preview.vue');
const recordFormSource = readPage('staff-purchasing/record-form.vue');
const stockCreateSource = readPage('staff-purchasing/stock-create.vue');
const reimbursementListSource = readPage('staff-purchasing/reimbursement/list.vue');
const reimbursementDetailSource = readPage('staff-purchasing/reimbursement/detail.vue');
const reimbursementSubmitSource = readPage('staff-purchasing/reimbursement/submit.vue');
const reimbursementConstantsSource = readPage('staff-purchasing/constants/reimbursement.ts');
const purchasingApiSource = readPage('staff-purchasing/api/purchasing.ts');

describe('staff purchasing wording', () => {
  it('uses daily purchase wording for order-demand actions', () => {
    expect(indexSource).toContain('section-title">日采</text>');
    expect(indexSource).toContain('生成日采清单');
    expect(indexSource).toContain('预览日采需求');
    expect(indexSource).toContain('可生成日采清单');
    expect(indexSource).not.toContain('待日采日期');
    expect(indexSource).not.toContain('生成采购清单');
    expect(indexSource).not.toContain('预览该日期需求');
  });

  it('labels list kinds as daily purchase and replenishment', () => {
    expect(indexSource).toContain("ORDER_DEMAND: '日采'");
    expect(indexSource).toContain("STOCK_REPLENISHMENT: '补货'");
    expect(detailSource).toContain("ORDER_DEMAND: '日采'");
    expect(detailSource).toContain("STOCK_REPLENISHMENT: '补货'");
    expect(indexSource).not.toContain("ORDER_DEMAND: '订单采购'");
    expect(indexSource).not.toContain("STOCK_REPLENISHMENT: '库存补货'");
    expect(detailSource).not.toContain("ORDER_DEMAND: '订单采购'");
    expect(detailSource).not.toContain("STOCK_REPLENISHMENT: '库存补货'");
  });

  it('uses concise replenishment entry wording', () => {
    expect(indexSource).toContain('quick-entry-title">补货');
    expect(stockCreateSource).toContain('hero-title">补货');
    expect(indexSource).not.toContain('创建补货采购单');
    expect(stockCreateSource).not.toContain('创建补货采购单');
  });

  it('uses daily purchase wording on the preview page', () => {
    expect(previewSource).toContain('日采需求预览');
    expect(previewSource).toContain("loading ? '预览中...' : '预览日采需求'");
    expect(previewSource).toContain('请选择日期并预览日采需求');
    expect(previewSource).not.toContain('采购需求预览');
    expect(previewSource).not.toContain("'预览需求'");
  });
});

describe('staff reimbursement detail guardrails', () => {
  it('uses reimbursement completion wording instead of approval wording', () => {
    expect(reimbursementListSource).toContain("label: '待报销', value: 'PENDING_REVIEW'");
    expect(reimbursementListSource).toContain("'PENDING_REVIEW': '待报销'");
    expect(reimbursementListSource).toContain('报销处理人');
    expect(reimbursementListSource).not.toContain('待审核');
    expect(reimbursementListSource).not.toContain('审核人');

    expect(reimbursementDetailSource).toContain("'PENDING_REVIEW': '待报销'");
    expect(reimbursementDetailSource).not.toContain('待审核');
    expect(reimbursementDetailSource).not.toContain('按实际采购记录审核');
  });

  it('keeps reimbursement purchase record cards focused on SKU, stock, and comparable prices', () => {
    expect(reimbursementDetailSource).toContain('record.procurementSkuName || record.ingredientName');
    expect(reimbursementDetailSource).toContain('标准原料：{{ record.ingredientName }}');
    expect(reimbursementDetailSource).toContain('当前库存');
    expect(reimbursementDetailSource).toContain('formatSkuStockText(record, purchaseItem)');
    expect(reimbursementDetailSource).toContain('折算单价');
    expect(reimbursementDetailSource).toContain('上次折算单价');
    expect(reimbursementDetailSource).toContain('getRecordPurchaseUnit(record');
    expect(reimbursementDetailSource).toContain('formatComparableUnitPrice(record, purchaseItem)');
    expect(reimbursementDetailSource).toContain('formatComparablePreviousUnitPrice(purchaseItem, priceChange, record)');
    expect(reimbursementDetailSource).toContain("return '500g';");
    expect(reimbursementDetailSource).toContain("return '500ml';");
    expect(reimbursementDetailSource).toContain('stockText: formatSkuStockText(record, purchaseItem)');

    expect(reimbursementDetailSource).not.toContain('record-summary-hint');
    expect(reimbursementDetailSource).not.toContain('按实际采购记录归档');
    expect(reimbursementDetailSource).not.toContain('record.listDateText');
    expect(reimbursementDetailSource).not.toContain('record.purchasedAtText');
    expect(reimbursementDetailSource).not.toContain('采购单价');
    expect(reimbursementDetailSource).not.toContain('上次采购单价');
    expect(reimbursementDetailSource).not.toContain('金额信息');
    expect(reimbursementDetailSource).not.toContain('formula-row');
    expect(reimbursementDetailSource).not.toContain('costFormula');
    expect(reimbursementDetailSource).not.toContain('class="metric-pill full-width"');
  });

  it('treats payment-proof upload as reimbursement completion and price confirmation', () => {
    expect(reimbursementDetailSource).toContain('pendingPriceChangeCount');
    expect(reimbursementDetailSource).toContain('上传报销凭证后将确认本次价格变更并完成报销');
    expect(reimbursementDetailSource).toContain(':disabled="uploading"');
    expect(reimbursementDetailSource).not.toContain('请先审核报销单中的价格变更');
    expect(reimbursementDetailSource).not.toContain(':disabled="uploading || hasPendingPriceChanges"');
    expect(reimbursementDetailSource).not.toContain('存在待人工审核的价格变更，请先审核报销单');
  });
});

describe('staff reimbursement employee flow', () => {
  it('uses two employee-facing reimbursement types without a separate multi-list entry', () => {
    expect(reimbursementSubmitSource).toContain('采购报销');
    expect(reimbursementSubmitSource).toContain('经营费用报销');
    expect(reimbursementSubmitSource).toContain('flowType');
    expect(reimbursementSubmitSource).not.toContain('多张采购清单合并报销');
  });

  it('keeps packaging in purchase reimbursement and out of operating categories', () => {
    expect(reimbursementSubmitSource).toContain('包材');
    expect(reimbursementSubmitSource).toContain('包材清单');
    expect(reimbursementConstantsSource).not.toContain("{ value: 'PACKAGING'");
  });

  it('makes multi-item operating expenses and confirmation explicit', () => {
    expect(reimbursementSubmitSource).toContain('费用 1');
    expect(reimbursementSubmitSource).toContain('添加一项费用');
    expect(reimbursementSubmitSource).toContain('确认提交');
    expect(reimbursementSubmitSource).toContain('提交成功');
  });

  it('locks receipt changes while resubmitting so they use receipt management', () => {
    expect(reimbursementSubmitSource).toContain(
      'v-if="!resubmitId"\n            class="delete-photo"',
    );
    expect(reimbursementSubmitSource).toContain(
      'v-if="!resubmitId" class="upload-tile"',
    );
    expect(reimbursementSubmitSource).toContain('重新提交时凭证不能在此修改');
  });

  it('does not ask employees for finance allocation fields or expose debug URLs', () => {
    expect(reimbursementSubmitSource).not.toContain('debug-url');
    expect(reimbursementSubmitSource).not.toContain('归属月份');
    expect(reimbursementSubmitSource).not.toContain('均摊周期');
    expect(reimbursementSubmitSource).not.toContain('是否均摊');
  });

  it('supports direct reimbursement from a completed purchase list', () => {
    expect(reimbursementSubmitSource).toContain('purchaseListId');
    expect(detailSource).toContain('goToReimbursementAfterCompletion');
  });
});

describe('staff purchasing quantity display', () => {
  it('uses demand units before package display units for supplements', () => {
    [detailSource, previewSource].forEach((source) => {
      const getDisplayUnitBody = source.match(/const getDisplayUnit = \(item: any\) => \{([\s\S]*?)\n\};/)?.[1] || '';

      expect(getDisplayUnitBody).toContain("if (item.type === 'SUPPLEMENT')");
      expect(getDisplayUnitBody).toContain("return item.quantityUnit || item.displayUnit || 'g';");
      expect(getDisplayUnitBody.indexOf("if (item.type === 'SUPPLEMENT')")).toBeLessThan(getDisplayUnitBody.indexOf('if (item.resolvedDisplayUnit)'));
    });
  });

  it('formats stock allocation quantities with the same display unit conversion as item demand', () => {
    expect(detailSource).toContain('formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item)');
    expect(detailSource).toContain('formatResolvedQuantity(item.resolvedStockDeductedQuantity, item)');
    expect(detailSource).toContain('formatQuantity(item)');
    expect(detailSource).not.toContain('formatResolvedQuantity(item.resolvedPurchaseShortageQuantity, item)');
    expect(previewSource).toContain('formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item)');
    expect(previewSource).toContain('formatResolvedQuantity(item.resolvedAvailableQuantity, item)');
    expect(previewSource).toContain('formatResolvedQuantity(item.resolvedStockDeductedQuantity, item)');
    expect(previewSource).toContain('formatResolvedQuantity(item.resolvedPurchaseShortageQuantity, item)');
  });
});

describe('staff purchasing pending append flow', () => {
  it('surfaces item-level demand for same-day orders before merging them', () => {
    expect(detailSource).toContain('pendingAppendItems');
    expect(detailSource).toContain('新增采购需求');
    expect(detailSource).toContain('pending-append-item-list');
    expect(detailSource).toContain('resolvePurchaseItemDisplay(item)');
    expect(detailSource).toContain('pendingAppendItems.value =');
    expect(detailSource).toContain('formatQuantity(item)');
    expect(detailSource).toContain('response.data?.newItems?.length');
    expect(detailSource).toContain('response.data?.updatedItems?.length');
  });
});

describe('staff purchasing detail audit display', () => {
  it('uses purchase-mode detail titles and hides the redundant purchase type row', () => {
    expect(detailSource).toContain("purchaseList.value?.kind === 'STOCK_REPLENISHMENT'");
    expect(detailSource).toContain("'补货清单详情'");
    expect(detailSource).toContain("'日采清单详情'");
    expect(detailSource).toContain('uni.setNavigationBarTitle({ title: detailTitle.value })');
    expect(detailSource).toContain('采购时间');
    expect(detailSource).not.toContain('<text class="title">采购清单详情</text>');
    expect(detailSource).not.toContain('<text class="label">采购类型:</text>');
  });

  it('shows procurement SKU as the primary item name without the purchase SKU prefix', () => {
    expect(detailSource).toContain('getPurchaseItemTitle(item)');
    expect(detailSource).not.toContain('采购SKU：{{ item.resolvedProcurementSkuName }}');
    expect(detailSource).not.toContain('content: `确认删除原料"${item.ingredientName}"？`');
  });

  it('does not show purchase SKU prefixes on daily purchase review surfaces', () => {
    expect(detailSource).not.toContain('采购SKU：{{ record.resolvedProcurementSkuName }}');
    expect(detailSource).not.toContain('采购 SKU：{{ getItemProcurementSkuLabel(selectedIngredient) }}');
    expect(detailSource).not.toContain('采购 SKU（可选）');
    expect(detailSource).not.toContain('请选择生产采购 SKU');
    expect(previewSource).not.toContain('采购SKU：{{ item.resolvedProcurementSkuName }}');
    expect(recordFormSource).not.toContain('采购 SKU：{{ getSelectedItemProcurementLabel(selectedItem) }}');
    expect(recordFormSource).not.toContain('采购 SKU（可选）');
  });

  it('keeps item deletion available only for replenishment lists', () => {
    expect(detailSource).toContain('class="delete-item-btn"');
    expect(detailSource).toContain("purchaseList.kind === 'STOCK_REPLENISHMENT'");
  });

  it('shows stock audit quantities inline while keeping shortage prominent', () => {
    expect(detailSource).toContain('class="item-demand-row"');
    expect(detailSource).toContain('class="stock-audit-inline"');
    expect(detailSource).not.toContain('class="item-stock-offset"');
    expect(detailSource).toContain('订单需求 {{ formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item) }}');
    expect(detailSource).toContain('库存抵扣 {{ formatResolvedQuantity(item.resolvedStockDeductedQuantity, item) }}');
    expect(detailSource).toContain('<text class="quantity-label">仍需采购</text>');
  });

  it('surfaces SKU brand and reference price with a scannable item header', () => {
    expect(detailSource).toContain('class="item-heading"');
    expect(detailSource).toContain('item.resolvedBrand');
    expect(detailSource).toContain('formatSkuReferencePrice(item)');
    expect(detailSource).toContain('sku-price');
    expect(detailSource).toContain('resolvedCurrentPurchasePrice');
    expect(detailSource).toContain('resolvedPurchaseToBaseRatio');
    expect(detailSource).toContain('参考单价 ¥');
    expect(detailSource).not.toContain('约¥');
    expect(detailSource).not.toContain('class="spec brand">品牌');
    expect(detailSource.indexOf('class="sku-price"')).toBeLessThan(detailSource.indexOf('class="item-specs"'));
  });
});

describe('staff purchasing purchase record form', () => {
  it('keeps the record form focused on task demand, selected SKU, count, and amount', () => {
    expect(detailSource).toContain('订单需求');
    expect(detailSource).toContain('formatResolvedQuantity(selectedIngredient.resolvedGrossQuantityNeeded, selectedIngredient)');
    expect(detailSource).toContain('库存抵扣');
    expect(detailSource).toContain('formatResolvedQuantity(selectedIngredient.resolvedStockDeductedQuantity, selectedIngredient)');
    expect(detailSource).toContain('仍需采购');
    expect(detailSource).toContain('formatQuantity(selectedIngredient) }}{{ getDisplayUnit(selectedIngredient)');

    expect(detailSource).toContain('class="record-sku-list"');
    expect(detailSource).toContain('record-sku-option');
    expect(detailSource).toContain('暂无可用采购商品');
    expect(detailSource).toContain('请联系管理员在该标准原料下新增采购 SKU 后再记录采购。');

    expect(detailSource).not.toContain('推荐参考：{{ getItemSuggestedProductLabel(selectedIngredient) }}');
    expect(detailSource).not.toContain('{{ getItemProcurementSkuLabel(selectedIngredient) }}');
    expect(detailSource).not.toContain('采购商品（可选）');
    expect(detailSource).not.toContain('优先选择已配置的生产采购商品，没有配置时可直接留空。');
    expect(detailSource).not.toContain('不选择采购 SKU');
    expect(detailSource).not.toContain('请选择生产采购商品');
    expect(detailSource).not.toContain('临时商品');
    expect(detailSource).not.toContain("recordSkuMode === 'temp'");
  });

  it('does not expose manual purchase product fields in the record form', () => {
    [detailSource, recordFormSource].forEach((source) => {
      expect(source).not.toContain('v-if="recordSkuMode === \'temp\'"');
      expect(source).not.toContain('临时商品名称 *');
      expect(source).not.toContain('采购商品（可选）');
      expect(source).not.toContain('不选择采购 SKU');
      expect(source).not.toContain('采购渠道 *');
      expect(source).not.toContain('采购单位 *');
      expect(source).not.toContain('每单位含量 *');
      expect(source).not.toContain('含量单位 *');
      expect(source).not.toContain('recordPurchaseUnitOptions');
      expect(source).not.toContain('recordContentUnitOptions');
      expect(source).not.toContain('单件规格 *');
      expect(source).not.toContain('规格单位 *');
    });

    expect(detailSource).toContain('class="record-entry-grid"');
    expect(detailSource).toContain('购买数量 *');
    expect(detailSource).toContain('recordPurchaseUnitLabel');
    expect(detailSource).not.toContain('实际购买件数 *');
    expect(detailSource).not.toContain('实际购买数量 *');
    expect(recordFormSource).toContain('购买数量 *');
    expect(recordFormSource).toContain('purchaseUnitLabel');
    expect(recordFormSource).not.toContain('实际购买件数 *');
    expect(recordFormSource).not.toContain('实际购买数量 *');
    expect(detailSource).toContain('付款金额 *');
    expect(detailSource).not.toContain('实际采购金额（元） *');
    expect(recordFormSource).toContain('付款金额 *');
    expect(recordFormSource).not.toContain('实际采购金额（元） *');
    expect(detailSource).toContain("label: '总量'");
    expect(detailSource).toContain("label: '余量'");
    expect(detailSource).toContain("label: '缺口'");
    expect(detailSource).toContain("label: '单价'");
    expect(detailSource).toContain("label: '历史单价'");
    expect(detailSource).toContain('低于历史');
    expect(detailSource).toContain('高于历史');
    expect(detailSource).toContain('price-tone-bad');
    expect(detailSource).toContain('price-tone-good');
    expect(detailSource).not.toContain('实际折算单价');
    expect(detailSource).not.toContain('recordReferencePriceText');
    expect(detailSource).not.toContain('折算入库');
    expect(detailSource).not.toContain('备注（选填）');
    expect(detailSource).not.toContain('备注信息（选填）');
  });

  it('derives the purchase count unit from the selected SKU', () => {
    expect(detailSource).toContain('parsePurchaseUnitFromProductModel');
    expect(detailSource).toContain('getSkuPurchaseUnit');
    expect(detailSource).toContain('recordForm.value.purchaseUnit = facts.purchaseUnit ||');
    expect(detailSource).toContain('const recordPurchaseUnitLabel = computed');
    expect(detailSource).not.toContain('selectPurchaseUnit');
  });

  it('does not show redundant normalized purchase summaries when units are identical', () => {
    expect(detailSource).toContain('const baseSummary');
    expect(detailSource).toContain('const purchaseSummary');
    expect(detailSource).toContain('purchaseSummary === baseSummary');
    expect(detailSource).toContain('return `总量 ${baseSummary}`');
    expect(detailSource).not.toContain("parts.join(' ≈ ')");

    expect(reimbursementDetailSource).toContain('const baseSummary');
    expect(reimbursementDetailSource).toContain('const purchaseSummary');
    expect(reimbursementDetailSource).toContain('purchaseSummary === baseSummary');
    expect(reimbursementDetailSource).not.toContain("parts.join(' ≈ ')");
  });

  it('does not allow purchase record editing after the list is completed', () => {
    expect(detailSource).toContain("purchaseList.value?.status === 'PENDING'");
    expect(detailSource).toContain('const canManagePurchaseRecords = computed');
  });

  it('groups purchase records by purchase item before falling back to ingredient', () => {
    expect(detailSource).toContain('record.purchaseItemId || record.ingredientId');
    expect(detailSource).toContain('grouped.get(item.id) || grouped.get(item.ingredientId) || []');
  });

  it('supports explicitly marking required items as no purchase needed', () => {
    expect(purchasingApiSource).toContain('markPurchaseItemNoPurchase');
    expect(purchasingApiSource).toContain('clearPurchaseItemNoPurchase');
    expect(detailSource).toContain('无需采购');
    expect(detailSource).toContain('markItemNoPurchase');
    expect(detailSource).toContain('clearItemNoPurchase');
    expect(detailSource).toContain('item.noPurchaseNeeded');
    expect(detailSource).toContain('个原料未处理');
  });

  it('marks no-purchase items with one tap and keeps inline undo available', () => {
    expect(detailSource).toContain('noPurchaseMarkingItemId');
    expect(detailSource).toContain('已标记，可点取消标记撤销');
    expect(detailSource).toContain('取消标记');
    expect(detailSource).not.toContain('确认将"${getPurchaseItemTitle(item)}"标记为无需采购？');
  });

  it('allows completed purchase lists to be reopened before reimbursement', () => {
    expect(purchasingApiSource).toContain('reopenPurchaseList');
    expect(detailSource).toContain('撤回完成');
    expect(detailSource).toContain('reopenCompletedPurchase');
    expect(detailSource).toContain("purchaseList.value?.status === 'COMPLETED'");
    expect(detailSource).toContain('!purchaseList.value?.reimbursementId');
  });
});
