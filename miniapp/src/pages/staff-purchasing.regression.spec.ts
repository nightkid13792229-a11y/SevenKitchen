import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readPage = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

const indexSource = readPage('staff-purchasing/index.vue');
const detailSource = readPage('staff-purchasing/detail.vue');
const recordModalSource = (() => {
  const start = detailSource.indexOf('<!-- 采购表单弹窗 -->');
  const end = detailSource.indexOf('<!-- 更换商品：只在需要时展开 -->');
  return start >= 0 && end > start ? detailSource.slice(start, end) : '';
})();
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
    expect(detailSource).toContain("'日采清单详情'");
    expect(detailSource).toContain("'补货清单详情'");
    expect(indexSource).not.toContain("ORDER_DEMAND: '订单采购'");
    expect(indexSource).not.toContain("STOCK_REPLENISHMENT: '库存补货'");
    expect(detailSource).not.toContain("ORDER_DEMAND: '订单采购'");
    expect(detailSource).not.toContain("STOCK_REPLENISHMENT: '库存补货'");
  });

  it('uses concise replenishment entry wording', () => {
    expect(indexSource).toContain('quick-entry-title">补货');
    expect(stockCreateSource).toContain('section-title">补货建议');
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
  it('uses review wording instead of reimbursement-completion wording', () => {
    expect(reimbursementListSource).toContain("label: '待审核', value: 'PENDING_REVIEW'");
    expect(reimbursementListSource).toContain("'PENDING_REVIEW': '待审核'");
    expect(reimbursementListSource).toContain('报销处理人');
    expect(reimbursementListSource).not.toContain('待报销');

    expect(reimbursementDetailSource).toContain("PENDING_REVIEW: '待审核'");
    expect(reimbursementDetailSource).not.toContain('待报销');
    expect(reimbursementDetailSource).not.toContain('按实际采购记录审核');
  });

  it('keeps purchase records focused on SKU, quantity source, and comparable prices', () => {
    expect(reimbursementDetailSource).toContain('record.procurementSkuName || record.ingredientName');
    expect(reimbursementDetailSource).toContain('标准原料：');
    expect(reimbursementDetailSource).toContain('折算单价');
    expect(reimbursementDetailSource).toContain('上次单价');
    expect(reimbursementDetailSource).toContain('无订单截图');
    expect(reimbursementDetailSource).toContain('formatComparableUnitPrice(record, purchaseItem)');
    expect(reimbursementDetailSource).toContain('formatComparablePreviousUnitPrice(purchaseItem, priceChange, record)');
    expect(reimbursementDetailSource).toContain("return '500g';");
    expect(reimbursementDetailSource).toContain("return '500ml';");

    // 2026-11-07：审核员不需要「需要采购 / 当前库存 / 增减幅度」，这些已从卡片移除
    expect(reimbursementDetailSource).not.toContain('当前库存');
    expect(reimbursementDetailSource).not.toContain('需要采购');
    expect(reimbursementDetailSource).not.toContain('增减幅度');
    expect(reimbursementDetailSource).not.toContain('formatSkuStockText');
    expect(reimbursementDetailSource).not.toContain('record-summary-hint');
    expect(reimbursementDetailSource).not.toContain('按实际采购记录归档');
  });

  it('separates payment-proof upload from approval (2026-11-07)', () => {
    // 上传只挂附件，不再自动完成报销
    expect(purchasingApiSource).toContain("autoComplete: 'false'");
    expect(reimbursementDetailSource).not.toContain('上传报销凭证后将确认本次价格变更并完成报销');

    // 通过 / 驳回 / 撤销 是三个独立动作
    expect(reimbursementDetailSource).toContain('reviewReimbursement(');
    expect(reimbursementDetailSource).toContain("'REQUIRES_RESUBMIT'");
    expect(reimbursementDetailSource).toContain('revertReimbursementReview(');
    expect(reimbursementDetailSource).toContain('审核通过');
    expect(reimbursementDetailSource).toContain('撤销审核');

    // 没凭证时不能点通过
    expect(reimbursementDetailSource).toContain('先上传付款凭证');
  });

  it('shows price changes as a read-only three-column table', () => {
    expect(reimbursementDetailSource).toContain('>原价<');
    expect(reimbursementDetailSource).toContain('>新价<');
    expect(reimbursementDetailSource).toContain('>涨跌<');
    expect(reimbursementDetailSource).toContain('getDeltaTone');
    expect(reimbursementDetailSource).not.toContain('确认应用');
    expect(reimbursementDetailSource).not.toContain('月成本影响');
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
    expect(detailSource).toContain('制作日期');
    expect(detailSource).not.toContain('采购时间');
    expect(detailSource).not.toContain('<text class="title">采购清单详情</text>');
    expect(detailSource).not.toContain('<text class="label">采购类型:</text>');
  });

  it('shows the ingredient name for every item type and keeps the purchase SKU prefix off the card', () => {
    // 2026-11-07 BOSS 反馈：原料明细要显示原料名称，不能拿采购商品名当原料名；
    // 补剂、包材是单层产品，原料名就是商品名，不需要按类型分叉。
    expect(detailSource).toContain('getPurchaseItemTitle(item)');
    expect(detailSource).toContain("from './purchase-item-title'");
    expect(detailSource).toContain('resolvePurchaseItemTitle(item)');
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
    expect(detailSource).toContain('confirmDeleteItem(item)');
    expect(detailSource).toContain("purchaseList.kind === 'STOCK_REPLENISHMENT'");
    expect(detailSource).toContain('!purchaseList.startedAt');
  });

  it('shows stock audit quantities inline while keeping shortage prominent', () => {
    expect(detailSource).toContain('class="item-line-3"');
    expect(detailSource).toContain('class="audit-text"');
    expect(detailSource).not.toContain('class="item-stock-offset"');
    expect(detailSource).toContain('formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item)');
    expect(detailSource).toContain('formatResolvedQuantity(item.resolvedStockDeductedQuantity, item)');
    expect(detailSource).toContain('<StaffQuantityText');
    expect(detailSource).toContain('label="仍需"');
    expect(detailSource).toContain('formatQuantity(item)');
  });

  it('surfaces SKU brand and reference price with a scannable item header', () => {
    expect(detailSource).toContain('class="item-line-1"');
    expect(detailSource).toContain('class="item-name"');
    expect(detailSource).toContain('buildItemMetaLine(item)');
    expect(detailSource).toContain('formatBrandLabel(item.resolvedBrand)');
    expect(detailSource).toContain('item.resolvedPurchaseChannel');
    expect(detailSource).toContain('item.resolvedProductModel');
    expect(detailSource).toContain('formatSkuReferencePrice(item)');
    expect(detailSource).toContain('resolvedCurrentPurchasePrice');
    expect(detailSource).toContain('resolvedPurchaseToBaseRatio');
    expect(detailSource).toContain('参考单价 ¥');
    expect(detailSource).not.toContain('约¥');
    expect(detailSource).not.toContain('class="spec brand">品牌');
    expect(detailSource.indexOf('class="item-name"')).toBeLessThan(
      detailSource.indexOf('buildItemMetaLine(item)'),
    );
  });
});

describe('staff purchasing purchase record form', () => {
  it('keeps the record form focused on progress, product, count, amount and result', () => {
    expect(recordModalSource).toContain('class="record-progress"');
    expect(recordModalSource).toContain('formatRecordBaseWithUnit(remainingBase)');
    expect(recordModalSource).toContain('recordProgressPercent');

    expect(recordModalSource).toContain('class="record-product"');
    expect(recordModalSource).toContain('selectedSkuNameParts.main');
    expect(detailSource).toContain('class="sku-picker-list"');
    expect(detailSource).toContain('这道原料下还没有采购商品');
    expect(detailSource).toContain('＋ 新增采购商品');
    expect(detailSource).toContain('请联系管理员在后台新增。');

    expect(recordModalSource).toContain('class="record-inputs"');
    expect(recordModalSource).toContain('买了');
    expect(recordModalSource).toContain('花了');
    expect(recordModalSource).toContain('recordPurchaseUnitLabel');
    expect(recordModalSource).toContain('class="record-result"');
    expect(recordModalSource).toContain('recordOutcome');
    expect(recordModalSource).toContain('class="record-sheet-footer"');
    expect(recordModalSource).toContain('record-submit');

    // 旧版的三块指标、内嵌商品列表、取消按钮、再记一条全部退场
    expect(recordModalSource).not.toContain('订单需求');
    expect(recordModalSource).not.toContain('库存抵扣');
    expect(recordModalSource).not.toContain('采购任务');
    expect(recordModalSource).not.toContain('record-sku-list');
    expect(recordModalSource).not.toContain('保存并再记一条');

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

    expect(detailSource).toContain('class="record-inputs"');
    expect(detailSource).toContain('买了');
    expect(detailSource).toContain('花了');
    expect(detailSource).toContain('recordPurchaseUnitLabel');
    expect(detailSource).not.toContain('购买数量 *');
    expect(detailSource).not.toContain('付款金额 *');
    expect(detailSource).not.toContain('实际购买件数 *');
    expect(detailSource).not.toContain('实际购买数量 *');
    expect(detailSource).not.toContain('实际采购金额（元） *');

    expect(recordFormSource).toContain('购买数量 *');
    expect(recordFormSource).toContain('purchaseUnitLabel');
    expect(recordFormSource).not.toContain('实际购买件数 *');
    expect(recordFormSource).not.toContain('实际购买数量 *');
    expect(recordFormSource).toContain('付款金额 *');
    expect(recordFormSource).not.toContain('实际采购金额（元） *');

    expect(detailSource).toContain('备注（选填）');
    expect(detailSource).not.toContain('备注信息（选填）');
    expect(detailSource).not.toContain('实际折算单价');
    expect(detailSource).not.toContain('recordReferencePriceText');
    expect(detailSource).not.toContain('折算入库');
  });

  it('derives the purchase count unit from the selected SKU', () => {
    expect(detailSource).toContain('parsePurchaseUnitFromProductModel');
    expect(detailSource).toContain('getSkuPurchaseUnit');
    expect(detailSource).toContain('recordForm.value.purchaseUnit = facts.purchaseUnit ||');
    expect(detailSource).toContain('const recordPurchaseUnitLabel = computed');
    expect(detailSource).not.toContain('selectPurchaseUnit');
  });

  it('does not show redundant normalized purchase summaries in reimbursement detail', () => {
    // 2026-11-07：折算说明整段从审核页移除，只保留「2 × 1000 g（共 2 kg）」这种
    // 一眼能读的数量写法，不再额外折一行「折算 x ≈ y」
    expect(reimbursementDetailSource).not.toContain('formatRecordNormalizedSummary');
    expect(reimbursementDetailSource).not.toContain('折算 ');
    expect(reimbursementDetailSource).not.toContain("parts.join(' ≈ ')");
  });

  it('clears quantity and amount when switching product and confirms dirty close', () => {
    expect(detailSource).toContain("recordForm.value.actualPackageCount = '';");
    expect(detailSource).toContain("recordForm.value.actualCost = '';");
    expect(detailSource).toContain('放弃这次填写？');
    expect(detailSource).toContain('isRecordFormDirty');
  });

  it('returns to the list and expands/highlights the saved record', () => {
    expect(detailSource).toContain('highlightedRecordId.value = savedRecordId');
    expect(detailSource).toContain('expandedRecordItems.value = {');
    expect(detailSource).toContain('closeRecordForm(true)');
  });

  it('offers a create entry and filters the picker by channel', () => {
    expect(detailSource).toContain('＋ 新增采购商品');
    expect(detailSource).toContain('openCreateProcurementSku');
    expect(detailSource).toContain('filteredRecordSkuOptions');
    expect(detailSource).toContain('channel !== pickerChannel.value');
  });

  it('keeps the record card to name, quantity/amount, channel/status and a more menu', () => {
    expect(detailSource).toContain('class="record-card-v2"');
    expect(detailSource).toContain('recordNameParts(record).main');
    expect(detailSource).toContain('record-card-more');
    expect(detailSource).toContain('record-card-state');
    expect(detailSource).toContain('记录详情');
    expect(detailSource).not.toContain('盒马鲜生 · 17:39 · 截图');
  });

  it('keeps the change entry available even when only one product exists', () => {
    expect(recordModalSource).not.toContain('recordProcurementSkuOptions.length > 1');
    expect(recordModalSource).toContain('recordProcurementSkuOptions.length > 0');
  });

  it('shows the converted total on the record card', () => {
    expect(detailSource).toContain('= ${formatDecimal(base, 3)}${baseUnit}');
  });

  it('guards save-in-flight and handles a deactivated SKU while editing', () => {
    expect(detailSource).toContain('if (submitting.value) {');
    expect(detailSource).toContain('if (submitting.value && !force)');
    expect(detailSource).toContain('recordProductUnavailable');
    expect(detailSource).toContain('原商品已停用或已删除');
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
    expect(detailSource).toContain('已标记，可点取消撤销');
    expect(detailSource).toContain('>取消</text>');
    expect(detailSource).not.toContain('取消标记');
    expect(detailSource).not.toContain('确认将"${getPurchaseItemTitle(item)}"标记为无需采购？');
  });

  it('keeps recorded items out of the no-purchase bucket', () => {
    // 2026-11-07 BOSS 反馈：原料先被标「无需采购」、后来 AI 识别又生成了采购记录，
    // 详情页按「无需采购」优先显示，7 条记录被藏起来，已录入只剩 2 项。
    // 记录是实打实的钱，必须优先于「无需采购」标记。
    const stateSource = detailSource.slice(
      detailSource.indexOf('const itemState'),
      detailSource.indexOf('const canManualRecord'),
    );
    const recordedAt = stateSource.indexOf("(item.records || []).length > 0");
    const noPurchaseAt = stateSource.indexOf('item.noPurchaseNeeded');
    expect(recordedAt).toBeGreaterThanOrEqual(0);
    expect(noPurchaseAt).toBeGreaterThanOrEqual(0);
    expect(recordedAt).toBeLessThan(noPurchaseAt);
    // 老数据「已采购 + 无需采购」并存时，卡片上要留一个取消入口，
    // 否则后端口径拦截手动记录，员工在小程序里没地方撤销标记。
    // 断言带标签（全文件唯一），避免被 console.error 里的同名文案蒙过去。
    expect(detailSource).toContain('>取消无需采购标记</text>');
    expect(detailSource).toContain('item.noPurchaseNeeded && canManagePurchaseRecords');
  });

  it('shows 无需采购 + 取消 together and keeps the manual record button gated', () => {
    // 2026-11-06 BOSS 反馈：文案统一「无需采购」，取消紧跟其后；
    // 「手动记录」在无需采购 / 库存足够时置灰，先取消才能点。
    expect(detailSource).toContain('<text class="state-hint">无需采购</text>');
    expect(detailSource).toContain('const canManualRecord');
    expect(detailSource).toContain("state === 'PENDING' || state === 'RECORDED'");
    expect(detailSource).toContain('dismissItemCovered');
    expect(detailSource).toContain('库存足够，无需购买');
    expect(detailSource).toContain('>手动记录</button>');
    expect(detailSource).not.toContain('>采购记录</button>');
  });

  it('labels the AI order screenshot entry as AI记录 and keeps filters on one row', () => {
    expect(detailSource).toContain('>AI记录</button>');
    expect(detailSource).toContain('flex-wrap: nowrap');
    expect(detailSource).not.toContain('🥩 食材');
    expect(detailSource).not.toContain('💊 补剂');
  });

  it('allows completed purchase lists to be reopened before reimbursement', () => {
    expect(purchasingApiSource).toContain('reopenPurchaseList');
    expect(detailSource).toContain('撤回完成');
    expect(detailSource).toContain('reopenCompletedPurchase');
    expect(detailSource).toContain("purchaseList.value?.status === 'COMPLETED'");
    expect(detailSource).toContain('!purchaseList.value?.reimbursementId');
  });

  it('shows the completion time only while the list is completed', () => {
    // 撤回完成后不能还挂着上一次的完成时间（BOSS 2026-11-05 反馈）
    expect(detailSource).toContain(
      "v-if=\"purchaseList.status === 'COMPLETED' && purchaseList.completedAt\"",
    );
  });

  it('orders food items by the CFCT category order agreed on 2026-11-05', () => {
    // 食材组按 CFCT 15 类顺序排；补剂/包材没有这套分类，保持原顺序。
    // 分组逻辑与识别结果页共用同一份实现（2026-11-05 追加）
    expect(detailSource).toContain("from './food-category-order'");
    expect(detailSource).toContain('groupPurchaseItemsForDisplay(items.value)');
  });
});
