<template>
  <view class="purchase-detail-page">
    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="purchaseList" class="detail-content">
      <!-- 吸顶进度条：滚动时始终能看到录了多少、花了多少 -->
      <view class="detail-progress">
        <text class="dp-label">已处理 {{ handledItemCount }}/{{ items.length }} 项</text>
        <view class="dp-bar">
          <view class="dp-fill" :style="{ width: handledPercent + '%' }"></view>
        </view>
        <text class="dp-cost">¥{{ recordedCost.toFixed(2) }}</text>
      </view>

      <!-- 日期变更警告横幅 -->
      <view v-if="dateChanges.hasChanges" class="date-change-warning">
        <view class="warning-header">
          <text class="warning-icon">⚠️</text>
          <text class="warning-title">检测到 {{ dateChanges.changedOrders.length }} 个订单的制作日期已变更</text>
        </view>
        <view class="warning-list">
          <view v-for="(order, index) in dateChanges.changedOrders" :key="index" class="warning-item">
            <text class="order-info">{{ order.orderNumber }}: {{ order.originalDate }} → {{ order.currentDate }}</text>
            <text class="order-detail">{{ order.customerName }} · {{ order.dogName }}</text>
          </view>
        </view>
        <view class="warning-actions">
          <button class="warning-btn ignore" @tap="ignoreDateChanges">忽略</button>
        </view>
      </view>

      <!-- 状态卡片 -->
      <view class="section status-card">
        <view class="card-header">
          <view class="header-left">
            <view class="target-line">
              <text class="target-date">{{ formatDate(purchaseList.targetDate) }}</text>
              <text class="time-badge">制作日期</text>
            </view>
            <text class="create-time">
              创建于 {{ formatFullDateTime(purchaseList.createdAt) }}<text v-if="purchaseList.createdBy?.nickname"> · {{ purchaseList.createdBy.nickname }}</text>
            </text>
          </view>
          <StaffStatusBadge
            :label="getStatusText(purchaseList.status)"
            :tone="getStatusTone(purchaseList.status)"
            size="lg"
          />
        </view>

        <!-- 完成时间：只有「已完成」才显示。撤回完成后即使库里还残留时间也不展示 -->
        <view v-if="purchaseList.status === 'COMPLETED' && purchaseList.completedAt" class="complete-time">
          <text class="label">完成时间:</text>
          <text class="value">{{ formatFullDateTime(purchaseList.completedAt) }}</text>
        </view>

      </view>

      <view v-if="purchaseList.kind === 'ORDER_DEMAND' && purchaseList.status === 'PENDING' && (pendingAppendLoading || pendingAppendOrders.length > 0)" class="section pending-append-card">
        <view class="section-header">
          <text class="section-title pending-title">新增订单待合并</text>
          <text v-if="pendingAppendOrders.length > 0" class="pending-count"> {{ pendingAppendOrders.length }} 单 </text>
        </view>

        <text v-if="pendingAppendLoading" class="pending-hint">正在检查同日新增订单...</text>

        <template v-else>
          <text class="pending-hint"> 该日期已有采购清单，但又来了同一天的已付款订单。合并后会自动补齐原料需求，并把这些订单一起纳入当前清单。 </text>

          <view class="pending-summary">
            <text>新增订单 {{ pendingAppendOrders.length }} 个</text>
            <text v-if="pendingAppendEstimatedCost > 0"> 新增预估 ¥{{ pendingAppendEstimatedCost.toFixed(2) }} </text>
          </view>

          <view class="pending-order-list">
            <view v-for="order in pendingAppendOrders" :key="order.orderId" class="pending-order-item">
              <text class="pending-order-id">{{ formatOrderId(order.orderId) }}</text>
              <text class="pending-order-date">{{ formatDate(order.targetProductionDate) }}</text>
            </view>
          </view>

          <view v-if="pendingAppendItems.length > 0" class="pending-append-item-list">
            <text class="pending-append-subtitle">新增采购需求</text>
            <view v-for="item in pendingAppendItems" :key="`${item.ingredientId}-${item.procurementSkuId || 'default'}`" class="pending-append-item">
              <view class="pending-append-main">
                <text class="pending-append-name">{{ getPurchaseItemTitle(item) }}</text>
                <text v-if="item.resolvedPurchaseChannel || item.resolvedProductModel" class="pending-append-spec">
                  {{ [item.resolvedPurchaseChannel, item.resolvedProductModel].filter(Boolean).join(' · ') }}
                </text>
                <text class="pending-append-audit">
                  订单需求
                  {{ formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item) }}
                  · 库存抵扣
                  {{ formatResolvedQuantity(item.resolvedStockDeductedQuantity, item) }}
                </text>
              </view>
              <view class="pending-append-quantity">
                <text class="pending-append-quantity-label">仍需采购</text>
                <text class="pending-append-quantity-value"> {{ formatQuantity(item) }}{{ getDisplayUnit(item) }} </text>
              </view>
            </view>
          </view>

          <button class="merge-orders-btn" :loading="appendingOrders" @tap="appendPendingOrders">
            {{ appendingOrders ? '合并中...' : `一键合并新增订单（${pendingAppendOrders.length}）` }}
          </button>
        </template>
      </view>

      <!-- 订单截图识别：点按钮直接选图，原地等结果（2026-11-05 起不再单独占一页） -->
      <view v-if="canImportOrderScreenshot || orderImportTotal > 0" class="section import-card">
        <button v-if="canImportOrderScreenshot" class="import-btn" @tap="goOrderImport">AI记录</button>
        <text
          v-if="canImportOrderScreenshot && orderImportCount > 0"
          class="import-note import-link"
          @tap="goOrderImportReview"
        >继续核对已导入的 {{ orderImportCount }} 笔 ›</text>
        <!-- 只读回看：已确认的也在里面，清单做完/报销后仍能翻（2026-11-06） -->
        <text
          v-if="orderImportTotal > 0"
          class="import-note import-link"
          @tap="goImportHistory"
        >查看识别记录（{{ orderImportTotal }} 笔）›</text>
      </view>

      <!-- 原料明细 -->
      <view class="section">
        <view class="items-head">
          <text class="section-title">原料明细 ({{ items.length }})</text>
          <text class="items-head-sub">待处理 {{ pendingItemCount }} 项</text>
        </view>
        <view class="filter-row">
          <text
            v-for="opt in filterOptions"
            :key="opt.key"
            class="filter-chip"
            :class="{ active: activeItemFilter === opt.key }"
            @tap="activeItemFilter = opt.key"
          >{{ opt.label }}<text class="filter-count">{{ opt.count }}</text></text>
        </view>

        <!-- 按类型分组显示原料 -->
        <view v-if="groupedItems.length > 0" class="grouped-items">
          <view v-for="group in filteredGroups" :key="group.type" class="ingredient-group">
            <!-- 类型标题 -->
            <view class="group-header">
              <text class="group-title">{{ getTypeLabel(group.type) }} ({{ group.items.length }})</text>
            </view>

            <!-- 该类型的原料列表 -->
            <view class="items-list">
              <view v-for="(item, index) in group.items" :key="index" class="item-card">
                <view class="item-basic">
                  <view class="item-line-1">
                    <view class="item-title-wrap">
                      <text class="item-name">{{ getPurchaseItemTitle(item) }}</text>
                      <text v-if="itemState(item) === 'NO_PURCHASE'" class="status-chip none">无需采购</text>
                      <text v-else-if="itemState(item) === 'RECORDED'" class="status-chip done">已采购</text>
                      <text v-else-if="itemState(item) === 'COVERED'" class="status-chip covered">库存足够</text>
                      <text v-else class="status-chip pending">待采购</text>
                    </view>
                    <StaffQuantityText
                      :covered="isItemCovered(item)"
                      :value="formatQuantity(item)"
                      :unit="getDisplayUnit(item)"
                      label="仍需"
                    />
                  </view>

                  <text v-if="buildItemMetaLine(item)" class="item-meta">{{ buildItemMetaLine(item) }}</text>

                  <view class="item-line-3">
                    <text class="audit-text">
                      订单 {{ formatResolvedQuantity(item.resolvedGrossQuantityNeeded, item) }}
                      · 现有 {{ formatResolvedQuantity(item.resolvedOnHandQuantity, item) }}
                      · 抵扣 {{ formatResolvedQuantity(item.resolvedStockDeductedQuantity, item) }}
                    </text>
                  </view>

                  <view
                    v-if="(item.records || []).length > 0 || canManagePurchaseRecords || (purchaseList.kind === 'STOCK_REPLENISHMENT' && purchaseList.status === 'PENDING' && !purchaseList.startedAt)"
                    class="item-actions"
                  >
                    <view class="item-actions-left">
                      <template v-if="itemState(item) === 'NO_PURCHASE'">
                        <view class="state-inline">
                          <text class="state-hint">无需采购</text>
                          <text
                            v-if="canManagePurchaseRecords"
                            class="inline-action"
                            @tap.stop="clearItemNoPurchase(item)"
                          >取消</text>
                        </view>
                      </template>
                      <template v-else-if="itemState(item) === 'RECORDED'">
                        <text class="record-summary-link" @tap="toggleItemRecords(item)">
                          已录入 {{ (item.records || []).length }} 条 · ¥{{ getItemRecordCost(item).toFixed(2) }} · {{ isItemRecordsExpanded(item) ? '收起' : '查看明细' }}
                        </text>
                        <!-- 老数据可能「已采购」和「无需采购」并存：记录优先显示，
                             但标记还在（后端口径仍拦截手动记录），留一个取消入口。 -->
                        <text
                          v-if="item.noPurchaseNeeded && canManagePurchaseRecords"
                          class="inline-action"
                          @tap.stop="clearItemNoPurchase(item)"
                        >取消无需采购标记</text>
                      </template>
                      <template v-else-if="itemState(item) === 'COVERED'">
                        <view class="state-inline">
                          <text class="state-hint green">库存足够，无需购买</text>
                          <text
                            v-if="canManagePurchaseRecords"
                            class="inline-action"
                            @tap.stop="dismissItemCovered(item)"
                          >取消</text>
                        </view>
                      </template>
                      <template v-else>
                        <text
                          v-if="canManagePurchaseRecords && shouldShowNoPurchaseButton(item)"
                          class="inline-action"
                          :class="{ disabled: noPurchaseMarkingItemId === item.id }"
                          @tap.stop="markItemNoPurchase(item)"
                        >{{ noPurchaseMarkingItemId === item.id ? '标记中…' : '无需采购' }}</text>
                      </template>
                      <text
                        v-if="purchaseList.kind === 'STOCK_REPLENISHMENT' && purchaseList.status === 'PENDING' && !purchaseList.startedAt"
                        class="inline-action danger"
                        @tap.stop="confirmDeleteItem(item)"
                      >删除</text>
                    </view>
                    <button
                      v-if="canManagePurchaseRecords"
                      class="record-btn"
                      :class="{ disabled: !canManualRecord(item) }"
                      :disabled="!canManualRecord(item)"
                      @tap.stop="handleContinueAdd(item)"
                    >手动记录</button>
                  </view>

                  <!-- 采购记录明细：默认折叠，避免每个原料下面挂一大块 -->
                  <view
                    v-if="purchaseList.startedAt && (item.records || []).length > 0 && isItemRecordsExpanded(item)"
                    class="item-expanded"
                  >
                    <view class="records-list">
                      <view
                        v-for="record in (item.records || [])"
                        :key="record.id"
                        class="record-card-v2"
                        :class="{ 'just-saved': highlightedRecordId === record.id }"
                      >
                        <view class="record-card-head">
                          <view class="record-card-title">
                            <text class="record-card-name">{{ recordNameParts(record).main }}</text>
                            <text v-if="recordNameParts(record).sub" class="record-card-sub">{{ recordNameParts(record).sub }}</text>
                          </view>
                          <text
                            class="record-card-more"
                            @tap.stop="openRecordMenu(record)"
                          >···</text>
                        </view>
                        <view class="record-card-mid">
                          <text class="record-card-qty">{{ formatRecordQuantity(record, item) }}</text>
                          <text class="record-card-cost">¥{{ record.actualCost.toFixed(2) }}</text>
                        </view>
                        <view class="record-card-foot">
                          <text class="record-card-channel">{{ record.resolvedPurchaseChannel || getRecordSkuLabel(record, item) }}</text>
                          <text class="record-card-state" :class="getItemOutcome(item).tone">{{ getItemOutcome(item).text }}</text>
                          <text
                            v-if="canManagePurchaseRecords"
                            class="record-card-edit"
                            @tap.stop="editRecord(record)"
                          >编辑</text>
                        </view>
                      </view>
                    </view>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-else class="empty-items">
          <text class="empty-text">该采购清单暂无原料</text>
        </view>

      </view>

      <!-- 关联订单 -->
      <view v-if="sourceOrders.length > 0" class="section">
        <text class="section-title">关联订单 ({{ sourceOrders.length }})</text>
        <view class="order-table">
          <view class="order-row order-head">
            <text class="order-no">订单号</text>
            <text class="order-dog">狗狗</text>
            <text class="order-recipe">食谱</text>
          </view>
          <view v-for="order in sourceOrders" :key="order.id" class="order-row">
            <text class="order-no">{{ order.orderNo || formatOrderId(order.id) }}</text>
            <text class="order-dog">{{ order.dogName || '-' }}</text>
            <text class="order-recipe">{{ (order.recipeNames || []).join('、') || '-' }}</text>
          </view>
        </view>
      </view>

      <!-- 底部操作栏 -->
      <StaffBottomBar v-if="purchaseList.status === 'PENDING'" gap="sm">
        <!-- 未开始采购：显示开始采购按钮 -->
        <button v-if="!purchaseList.startedAt" class="action-btn start" @tap="startPurchase">开始采购</button>

        <!-- 已开始采购：显示确认完成按钮 -->
        <template v-else>
          <button class="action-btn complete" @tap="completePurchase" :loading="completing">
            <text v-if="!completing">确认采购完成</text>
            <text v-else>提交中...</text>
          </button>
        </template>
      </StaffBottomBar>

      <!-- 已完成底栏：左边说清「完成了什么」，右边把「撤回完成」收成次要操作 -->
      <StaffBottomBar
        v-if="purchaseList.status === 'COMPLETED'"
        class="completed-bar"
        :class="{ 'is-solo': !canReopenCompletedPurchase }"
      >
        <view class="done-state">
          <view class="done-check">✓</view>
          <view class="done-copy">
            <text class="done-title">采购已完成</text>
            <text class="done-sub">{{ items.length }} 项 · ¥{{ recordedCost.toFixed(2) }}</text>
          </view>
        </view>
        <button
          v-if="canReopenCompletedPurchase"
          class="reopen-btn"
          :class="{ 'is-busy': reopening }"
          :disabled="reopening"
          @tap="reopenCompletedPurchase"
        >
          <text class="reopen-icon">↺</text>
          <text>{{ reopening ? '撤回中…' : '撤回完成' }}</text>
        </button>
      </StaffBottomBar>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败</text>
      <button class="retry-btn" @tap="loadDetail">重试</button>
    </view>

    <!-- 采购表单弹窗 -->
    <view v-if="showRecordForm" class="record-form-modal" @tap="closeRecordForm()">
      <view class="record-sheet" @tap.stop>
        <view class="sheet-grabber"></view>
        <view class="record-sheet-head">
          <text class="record-sheet-title">{{ modalTitle }}</text>
          <text class="record-sheet-pill">{{ selectedIngredient.ingredientName }}</text>
          <text class="record-sheet-close" @tap="closeRecordForm()">×</text>
        </view>

        <view class="record-sheet-body">
          <view class="record-progress">
            <view class="record-progress-main">
              <text class="record-progress-label">还需</text>
              <text class="record-progress-value">{{ formatRecordBaseWithUnit(remainingBase) }}</text>
            </view>
            <view class="record-progress-side">
              <text>已买 {{ formatRecordBaseWithUnit(existingBoughtBase) }}</text>
              <text>共需 {{ formatRecordBaseWithUnit(totalNeedBase) }}</text>
            </view>
          </view>
          <view class="record-progress-track">
            <view
              class="record-progress-fill"
              :class="{ over: progressOver }"
              :style="{ width: recordProgressPercent + '%' }"
            ></view>
          </view>

          <view class="record-section-head">
            <text class="record-section-label">商品</text>
            <text
              v-if="recordProcurementSkuOptions.length > 0"
              class="record-section-link"
              @tap="openSkuPicker"
            >更换</text>
          </view>

          <view
            v-if="selectedRecordProcurementSku"
            class="record-product"
            @tap="recordProcurementSkuOptions.length > 0 && openSkuPicker()"
          >
            <view class="record-product-main">
              <text class="record-product-name">{{ selectedSkuNameParts.main }}</text>
              <text v-if="selectedSkuNameParts.sub" class="record-product-sub">{{ selectedSkuNameParts.sub }}</text>
              <view class="record-product-meta">
                <text v-if="selectedRecordProcurementSku.purchaseChannel">{{ selectedRecordProcurementSku.purchaseChannel }}</text>
                <text v-if="isSameAsLatestRecord" class="record-product-tag">上次买过</text>
                <text v-if="formatProcurementSkuReferencePrice(selectedRecordProcurementSku)">上次 {{ formatProcurementSkuReferencePrice(selectedRecordProcurementSku) }}</text>
              </view>
              <text
                v-if="!selectedRecordProcurementSku.purchaseChannel"
                class="record-product-warning"
              >这个商品缺渠道，保存前请让管理员在后台补全</text>
            </view>
            <text v-if="recordProcurementSkuOptions.length > 0" class="record-product-change">更换 ›</text>
          </view>

          <view
            v-else-if="recordProductUnavailable"
            class="record-product record-product-unavailable"
            @tap="openSkuPicker"
          >
            <view class="record-product-main">
              <text class="record-product-name">原商品已停用或已删除</text>
              <text class="record-product-sub">请重新选择一个采购商品，再保存这条记录。</text>
            </view>
            <text class="record-product-change">重新选择 ›</text>
          </view>

          <view v-else class="record-empty">
            <view class="record-empty-icon">＋</view>
            <text class="record-empty-title">这道原料下还没有采购商品</text>
            <text v-if="canAddNewProcurementSku" class="record-empty-desc">把这次买的商品加进去，以后大家都能选。</text>
            <text v-else class="record-empty-desc">请联系管理员在后台新增。</text>
            <view
              v-if="canAddNewProcurementSku"
              class="record-empty-cta"
              @tap="openCreateProcurementSku"
            >＋ 新增采购商品</view>
          </view>

          <template v-if="selectedRecordProcurementSku || recordProductUnavailable">
            <view class="record-inputs">
              <view class="record-field" :class="{ focus: recordQuantityFocus }">
                <text class="record-field-label">买了</text>
                <view class="record-field-line">
                  <input
                    v-model="recordForm.actualPackageCount"
                    type="digit"
                    class="record-field-input"
                    placeholder="如 2"
                    placeholder-class="record-placeholder"
                    :focus="recordQuantityFocus"
                    @focus="recordQuantityFocus = true"
                    @blur="recordQuantityFocus = false"
                    @input="recordFormError = ''"
                  />
                  <text class="record-field-unit">{{ recordPurchaseUnitLabel }}</text>
                </view>
              </view>
              <view class="record-field">
                <text class="record-field-label">花了</text>
                <view class="record-field-line">
                  <input
                    v-model="recordForm.actualCost"
                    type="digit"
                    class="record-field-input"
                    placeholder="0.00"
                    placeholder-class="record-placeholder"
                    @focus="recordQuantityFocus = false"
                    @input="recordFormError = ''"
                  />
                  <text class="record-field-unit">元</text>
                </view>
              </view>
            </view>

            <text v-if="recordFormError" class="record-error">{{ recordFormError }}</text>

            <view v-if="recordResultText" class="record-result">
              <text class="record-result-main">{{ recordResultText }}</text>
              <text v-if="recordOutcome" class="record-outcome" :class="recordOutcome.tone">{{ recordOutcome.text }}</text>
            </view>
            <view v-else class="record-result">
              <text class="record-result-main">填数量和金额后，这里会算买完差多少</text>
            </view>

            <view class="record-note">
              <text v-if="!noteOpen" class="record-note-trigger" @tap="noteOpen = true">＋ 备注（选填）</text>
              <textarea
                v-else
                v-model="recordForm.notes"
                class="record-note-input"
                maxlength="200"
                placeholder="备注（选填）"
                placeholder-class="record-placeholder"
                @blur="noteOpen = !!recordForm.notes"
              />
            </view>
          </template>
          <text v-else class="record-empty-hint">选好商品后，再填数量和金额</text>
        </view>

        <view class="record-sheet-footer">
          <button
            class="record-submit"
            :class="{ disabled: !selectedRecordProcurementSku }"
            :disabled="!selectedRecordProcurementSku || submitting"
            :loading="submitting"
            @tap="submitRecord"
          >{{ modalSubmitText }}</button>
          <text v-if="!selectedRecordProcurementSku" class="record-submit-hint">先新增或选择一个商品</text>
        </view>
      </view>
    </view>

    <!-- 更换商品：只在需要时展开 -->
    <view v-if="showSkuPicker" class="sku-picker-mask" @tap="closeSkuPicker">
      <view class="sku-picker-sheet" @tap.stop>
        <view class="sheet-grabber"></view>
        <view class="sku-picker-head">
          <text class="sku-picker-title">更换采购商品</text>
          <text class="record-sheet-close" @tap="closeSkuPicker">×</text>
        </view>
        <text class="sku-picker-sub">默认只看「{{ pickerChannel || '未填渠道' }}」；换渠道再选别家的货</text>
        <view class="sku-picker-search">
          <text class="sku-picker-search-icon">⌕</text>
          <input
            v-model="skuPickerSearch"
            class="sku-picker-search-input"
            placeholder="搜商品名或规格"
            placeholder-class="record-placeholder"
          />
          <text v-if="skuPickerSearch" class="sku-picker-search-clear" @tap="skuPickerSearch = ''">清空</text>
        </view>
        <scroll-view scroll-x class="sku-picker-channels">
          <view
            v-for="channel in pickerChannelOptions"
            :key="channel.name"
            class="sku-picker-channel"
            :class="{ active: pickerChannel === channel.name }"
            @tap="pickerChannel = channel.name"
          >{{ channel.name }} {{ channel.count }}</view>
        </scroll-view>
        <scroll-view scroll-y class="sku-picker-list">
          <view
            v-for="sku in filteredRecordSkuOptions"
            :key="sku.id || sku.name"
            class="sku-picker-row"
            :class="{ selected: recordForm.procurementSkuId === sku.id }"
            @tap="chooseSkuFromPicker(sku)"
          >
            <view class="sku-picker-row-main">
              <text class="sku-picker-row-name">{{ splitSkuName(sku.name).main }}</text>
              <text v-if="splitSkuName(sku.name).sub" class="sku-picker-row-sub">{{ splitSkuName(sku.name).sub }}</text>
              <text class="sku-picker-row-meta">{{ formatPickerSkuMeta(sku) }}</text>
            </view>
            <text v-if="recordForm.procurementSkuId === sku.id" class="sku-picker-check">✓</text>
          </view>
          <view v-if="filteredRecordSkuOptions.length === 0" class="sku-picker-empty">没搜到这个商品</view>
        </scroll-view>
        <view
          v-if="canAddNewProcurementSku"
          class="sku-picker-add"
          @tap="openCreateProcurementSku"
        >＋ 新增采购商品</view>
        <text class="sku-picker-foot">选中后回到记录页，数量和金额要重填</text>
      </view>
    </view>

    <!-- 记录卡「···」：时间 / 来源 / 删除 -->
    <view v-if="showRecordMenu" class="record-menu-mask" @tap="closeRecordMenu">
      <view class="record-menu-sheet" @tap.stop>
        <text class="record-menu-title">记录详情</text>
        <text class="record-menu-name">{{ recordMenuTitle }}</text>
        <text class="record-menu-meta">{{ recordMenuMeta }}</text>
        <text class="record-menu-source">{{ recordMenuSource }}</text>
        <view
          v-if="canManagePurchaseRecords"
          class="record-menu-item danger"
          @tap="deleteRecordFromMenu"
        >删除记录</view>
        <view class="record-menu-cancel" @tap="closeRecordMenu">取消</view>
      </view>
    </view>

    <!-- 选完图就地等：上传 → 识别，完成后自动进核对页 -->
    <view v-if="importBusy" class="import-mask">
      <view class="import-mask-card">
        <view class="import-spinner"></view>
        <text class="import-mask-stage">{{ importStage }}</text>
        <text class="import-mask-note">识别完自动进结果页</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import StaffStatusBadge from '../../components/staff/StaffStatusBadge.vue';
import StaffQuantityText from '../../components/staff/StaffQuantityText.vue';
import StaffBottomBar from '../../components/staff/StaffBottomBar.vue';
import { formatStaffQuantity } from '../../utils/staff-quantity';
import { canAddProcurementSku } from './procurement-sku-entry';
import { buildSkuCreateQuery, isSkuCreatedFor } from './procurement-sku-event';
import { groupPurchaseItemsForDisplay } from './food-category-order';
import { resolvePurchaseItemTitle } from './purchase-item-title';
import {
  computeItemOutcome,
  computeRecordOutcome,
  computeRecordProgress,
} from './record-math';
import {
  chooseOrderShots,
  importOrderShots,
} from './order-import/import-flow';
import { getPurchaseListDetail, completePurchase as completePurchaseApi, reopenPurchaseList as reopenPurchaseListApi, startPurchase as startPurchaseApi, getPurchaseRecords, getOrderImports, deletePurchaseRecord as deletePurchaseRecordApi, addPurchaseRecord, updatePurchaseRecord as updatePurchaseRecordApi, markPurchaseItemNoPurchase as markPurchaseItemNoPurchaseApi, clearPurchaseItemNoPurchase as clearPurchaseItemNoPurchaseApi, removeItemFromList, checkOrderDateChanges, previewPurchaseList, addOrdersToList, resolveProcurementSkuProfile, resolvePurchaseItemDisplay, resolvePurchaseRecordDisplay } from './api/purchasing';

// 状态管理
const purchaseListId = ref('');
const purchaseList = ref<any>(null);
const items = ref<any[]>([]);
const loading = ref(true);
const completing = ref(false);
const reopening = ref(false);
const noPurchaseMarkingItemId = ref('');
const pendingAppendLoading = ref(false);
const appendingOrders = ref(false);
const pendingAppendEstimatedCost = ref(0);
const pendingAppendOrders = ref<
  Array<{
    orderId: string;
    targetProductionDate: string;
  }>
>([]);
const pendingAppendItems = ref<any[]>([]);

const sourceOrders = computed(() => {
  const list = purchaseList.value;
  if (!list) return [];
  if (Array.isArray(list.sourceOrders) && list.sourceOrders.length > 0) {
    return list.sourceOrders;
  }
  return (list.sourceOrderIds || []).map((id: string) => ({
    id,
    orderNo: formatOrderId(id),
    dogName: null,
    recipeNames: [],
  }));
});

const detailTitle = computed(() => {
  return purchaseList.value?.kind === 'STOCK_REPLENISHMENT' ? '补货清单详情' : '日采清单详情';
});

// 按类型分组的原料（计算属性）
// 「库存足够」是系统按库存自动判定的，采购员确认要买时可以先取消（本页内有效），
// 取消后卡片回到「待采购」，才能点「手动记录」。
const coveredDismissedItemIds = ref<Record<string, boolean>>({});
const isCoveredDismissed = (item: any) =>
  coveredDismissedItemIds.value[item.id] === true;
const isItemCovered = (item: any) => {
  if (isCoveredDismissed(item)) {
    return false;
  }
  const required = getItemRequiredQuantity(item);
  return (
    Number.isFinite(required) &&
    required <= 0 &&
    !item.noPurchaseNeeded &&
    (item.records || []).length === 0
  );
};

type ItemState = 'PENDING' | 'RECORDED' | 'COVERED' | 'NO_PURCHASE';
const itemState = (item: any): ItemState => {
  // 真买过就按「已采购」算，哪怕之前标过「无需采购」（先标记、后补记录的旧数据）。
  // 记录是实打实的钱，不能被一条过期标记藏起来（2026-11-07 老板反馈）。
  if ((item.records || []).length > 0) return 'RECORDED';
  if (item.noPurchaseNeeded) return 'NO_PURCHASE';
  if (isItemCovered(item)) return 'COVERED';
  return 'PENDING';
};

// 「手动记录」只对真正需要买/已买过的原料开放：
// 无需采购、库存足够两种状态必须先点「取消」，避免误录。
const canManualRecord = (item: any) => {
  const state = itemState(item);
  return state === 'PENDING' || state === 'RECORDED';
};

// 采购记录默认折叠成一行（已录入 N 条 · 金额），点开才看明细
const expandedRecordItems = ref<Record<string, boolean>>({});
const isItemRecordsExpanded = (item: any) =>
  expandedRecordItems.value[item.id] === true;
const toggleItemRecords = (item: any) => {
  expandedRecordItems.value = {
    ...expandedRecordItems.value,
    [item.id]: !isItemRecordsExpanded(item),
  };
};
const getItemRecordCost = (item: any) =>
  (item.records || []).reduce(
    (sum: number, record: any) => sum + Number(record.actualCost || 0),
    0,
  );

const handledItemCount = computed(
  () => items.value.filter((item) => itemState(item) !== 'PENDING').length,
);
const pendingItemCount = computed(
  () => items.value.filter((item) => itemState(item) === 'PENDING').length,
);
const handledPercent = computed(() =>
  items.value.length > 0
    ? Math.round((handledItemCount.value / items.value.length) * 100)
    : 0,
);
const recordedCost = computed(() =>
  items.value.reduce(
    (sum, item) =>
      sum +
      (item.records || []).reduce(
        (recordSum: number, record: any) => recordSum + Number(record.actualCost || 0),
        0,
      ),
    0,
  ),
);

const buildItemMetaLine = (item: any) => {
  // 食材只看名称和数量，品牌/渠道/规格/参考价不再占一行（补剂、包材仍保留）
  if ((item.type || 'FOOD') === 'FOOD') {
    return '';
  }

  const parts = [
    formatBrandLabel(item.resolvedBrand),
    item.resolvedPurchaseChannel,
    item.resolvedProductModel,
    formatSkuReferencePrice(item),
  ].filter(Boolean);

  if (
    item.resolvedSuggestedProductName &&
    item.resolvedSuggestedProductName !== getPurchaseItemTitle(item)
  ) {
    parts.unshift(`推荐 ${item.resolvedSuggestedProductName}`);
  }

  return parts.join(' · ');
};

// 原料分组：食材 → 补剂 → 包装材料；食材组内部按 CFCT 标准分类排（2026-11-05 定）。
// 识别结果页的「匹配原料」抽屉用同一个函数，保证两处顺序一致。
const groupedItems = computed(() => groupPurchaseItemsForDisplay(items.value));

// 原料状态筛选（全部 / 待采购 / 已录入 / 无需采购 / 库存足够）
type ItemFilter = 'ALL' | ItemState;
const activeItemFilter = ref<ItemFilter>('ALL');
const itemStateCounts = computed(() => {
  const counts: Record<ItemState, number> = {
    PENDING: 0,
    RECORDED: 0,
    COVERED: 0,
    NO_PURCHASE: 0,
  };
  for (const item of items.value) {
    counts[itemState(item)] += 1;
  }
  return counts;
});
const filterOptions = computed(() => {
  const options = [
    { key: 'ALL' as ItemFilter, label: '全部', count: items.value.length },
    { key: 'PENDING' as ItemFilter, label: '待采购', count: itemStateCounts.value.PENDING },
    { key: 'RECORDED' as ItemFilter, label: '已录入', count: itemStateCounts.value.RECORDED },
    { key: 'NO_PURCHASE' as ItemFilter, label: '无需采购', count: itemStateCounts.value.NO_PURCHASE },
    { key: 'COVERED' as ItemFilter, label: '库存足够', count: itemStateCounts.value.COVERED },
  ];
  // 一屏一行展示：数量为 0 的筛选项先不占位置（当前选中项始终保留）
  return options.filter(
    (option) =>
      option.key === 'ALL' ||
      option.key === activeItemFilter.value ||
      option.count > 0,
  );
});
const filteredGroups = computed(() =>
  groupedItems.value
    .map((group) => ({
      ...group,
      items:
        activeItemFilter.value === 'ALL'
          ? group.items
          : group.items.filter(
              (item) => itemState(item) === activeItemFilter.value,
            ),
    }))
    .filter((group) => group.items.length > 0),
);

// 获取类型标签（列表里不再放 emoji 图标，左侧保持干净）
const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    FOOD: '食材',
    SUPPLEMENT: '补剂',
    PACKAGING: '包装材料',
  };
  return labels[type] || type;
};

// 采购表单相关
const showRecordForm = ref(false);
const selectedIngredient = ref<any>(null);
const submitting = ref(false);
const editingRecord = ref<any>(null);
const showSkuPicker = ref(false);
const skuPickerSearch = ref('');
const pickerChannel = ref('');
const noteOpen = ref(false);
const recordFormError = ref('');
const recordQuantityFocus = ref(false);
const recordFormSnapshot = ref('');
const highlightedRecordId = ref('');
let highlightTimer: ReturnType<typeof setTimeout> | null = null;
const showRecordMenu = ref(false);
const recordMenuRecord = ref<any>(null);

const recordForm = ref({
  procurementSkuId: '',
  procurementSkuName: '',
  purchaseChannel: '',
  purchaseUnit: '',
  actualPackageCount: '',
  actualPackageSize: '',
  actualPackageUnit: '',
  actualCost: '',
  productModel: '',
  notes: '',
});

const canManagePurchaseRecords = computed(() => {
  return Boolean(purchaseList.value?.startedAt) && purchaseList.value?.status === 'PENDING' && !purchaseList.value?.reimbursementId;
});

const canReopenCompletedPurchase = computed(() => {
  return purchaseList.value?.status === 'COMPLETED' && !purchaseList.value?.reimbursementId;
});

const getItemRequiredQuantity = (item: any) => {
  return Number(item?.resolvedPurchaseShortageQuantity ?? item?.purchaseShortageQuantity ?? item?.quantityNeeded ?? 0);
};

const requiresItemHandling = (item: any) => {
  const requiredQuantity = getItemRequiredQuantity(item);
  return Number.isFinite(requiredQuantity) && requiredQuantity > 0;
};

const isItemHandled = (item: any) => {
  return !requiresItemHandling(item) || item.noPurchaseNeeded === true || (item.records || []).length > 0;
};

const shouldShowNoPurchaseButton = (item: any) => {
  return requiresItemHandling(item) && !item.noPurchaseNeeded && (item.records || []).length === 0;
};

const getUnhandledPurchaseItems = () => {
  return items.value.filter((item) => !isItemHandled(item));
};

const modalTitle = computed(() => {
  return editingRecord.value ? '修改采购记录' : '记录采购';
});

const modalSubmitText = computed(() => {
  if (submitting.value) {
    return '保存中...';
  }
  return editingRecord.value ? '保存修改' : '保存记录';
});

const normalizeChannelLabel = (channel?: string | null) => {
  return (channel || '').trim();
};

const formatCompactLabel = (parts: Array<string | null | undefined>) => {
  return parts
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(' · ');
};

/** 商品名拆成主名 + 括号里的品牌/系列，第二行用小字，避免长名字被按钮挤掉。 */
const splitSkuName = (name?: string | null) => {
  const text = `${name || ''}`.trim();
  if (!text) {
    return { main: '', sub: '' };
  }
  const match = text.match(/^(.*?)[（(]([^（）()]*)[）)]\s*$/);
  if (match && match[1].trim() && match[2].trim()) {
    return { main: match[1].trim(), sub: `（${match[2].trim()}）` };
  }
  return { main: text, sub: '' };
};

const formatMeasurementUnit = (unit?: string | null) => {
  if (!unit) {
    return '';
  }

  const normalized = `${unit}`.trim().toUpperCase();
  const labelMap: Record<string, string> = {
    G: 'g',
    KG: 'kg',
    JIN: '斤',
    ML: 'ml',
    L: 'L',
    PCS: '个',
  };

  return labelMap[normalized] || `${unit}`.trim();
};

const getIngredientBaseUnit = (item: any): string => {
  return item?.ingredient?.baseUnit || item?.quantityUnit || 'PCS';
};

const getSuggestedPackageSize = (item: any): string => {
  const rawRatio = Number(item?.ingredient?.purchaseToBaseRatio || 0);
  if (Number.isFinite(rawRatio) && rawRatio > 0) {
    return formatDecimal(rawRatio, 3);
  }
  return '';
};

const getSuggestedPackageUnit = (item: any): string => {
  return formatMeasurementUnit(getIngredientBaseUnit(item)) || '个';
};

const parsePurchaseUnitFromProductModel = (productModel?: string | null) => {
  const normalized = (productModel || '').trim();
  if (!normalized.includes('/')) {
    return '';
  }

  return formatMeasurementUnit(normalized.split('/').pop()?.trim()) || '';
};

const getSkuPurchaseUnit = (sku: any, item: any): string => {
  return formatMeasurementUnit(sku?.purchaseUnit) || parsePurchaseUnitFromProductModel(sku?.productModel) || formatMeasurementUnit(sku?.displayUnit) || formatMeasurementUnit(item?.ingredient?.purchaseUnit) || '件';
};

const recordPurchaseUnitLabel = computed(() => {
  return formatMeasurementUnit(recordForm.value.purchaseUnit) || '件';
});

const getLatestPurchaseRecord = (item: any) => {
  const records = Array.isArray(item?.records) ? item.records : [];
  if (records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  })[0];
};

const latestRecord = computed(() => getLatestPurchaseRecord(selectedIngredient.value));

const procurementSkuProfile = computed(() => resolveProcurementSkuProfile(selectedIngredient.value));
const recordProcurementSkuOptions = computed(() =>
  procurementSkuProfile.value.procurementSkuChoices.map((sku) => ({
    ...sku,
    label: formatCompactLabel([sku.name, sku.productModel, sku.purchaseChannel]),
  })),
);

const selectedRecordProcurementSku = computed(() => {
  return recordProcurementSkuOptions.value.find((sku) => sku.id === recordForm.value.procurementSkuId) || null;
});

const selectedSkuNameParts = computed(() => splitSkuName(selectedRecordProcurementSku.value?.name));

const recordProductUnavailable = computed(() => {
  if (!recordForm.value.procurementSkuId || selectedRecordProcurementSku.value) {
    return false;
  }
  return recordProcurementSkuOptions.value.length > 0;
});

const isSameAsLatestRecord = computed(() => {
  const latest = latestRecord.value;
  const sku = selectedRecordProcurementSku.value;
  if (!latest || !sku) {
    return false;
  }
  return (
    (latest.procurementSkuId && sku.id && latest.procurementSkuId === sku.id) ||
    (latest.procurementSkuName && sku.name && latest.procurementSkuName === sku.name)
  );
});

/**
 * 只有食材能新增采购商品（2026-11-01 老板定：补剂、包材不开放）。
 * 判据与后端一致，避免员工点进去才发现 400。
 */
const canAddNewProcurementSku = computed(() =>
  canAddProcurementSku(selectedIngredient.value?.type),
);

const openCreateProcurementSku = () => {
  const item = selectedIngredient.value;
  if (!item) return;

  const ingredientId = item.ingredientId || item.id;
  if (!ingredientId) return;

  const query = [
    `ingredientId=${encodeURIComponent(ingredientId)}`,
    `ingredientName=${encodeURIComponent(item.ingredientName || '')}`,
    `baseUnit=${encodeURIComponent(item.ingredientBaseUnit || item.baseUnit || '')}`,
    buildSkuCreateQuery('detail'),
  ].join('&');

  uni.navigateTo({
    url: `/pages/staff-purchasing/procurement-sku-create?${query}`,
  });
};

/**
 * 新增完采购商品回来：重新拉清单，并把它选中。
 *
 * 只处理「从本页点新增」的那条广播：识别结果页新建商品也会广播，
 * 全局广播会送到压在栈里的本页，照旧执行就会在确认后弹出没人点过的抽屉。
 */
const handleProcurementSkuCreated = async (payload: any) => {
  if (!isSkuCreatedFor(payload, 'detail')) return;

  const ingredientId = payload?.ingredientId;
  if (!ingredientId) return;

  await loadDetail();

  const item = items.value.find((row) => (row.ingredientId || row.id) === ingredientId);
  if (!item) return;

  // 从「编辑一条旧记录」里新建商品：仍然是编辑，不能变成新增一条（会重复记账）
  if (editingRecord.value?.id) {
    selectedIngredient.value = item;
    const sku = recordProcurementSkuOptions.value.find((option) => option.id === payload?.skuId);
    if (sku) {
      applyRecordSkuDefaults(sku);
    }
    showSkuPicker.value = false;
    recordFormError.value = '';
    takeRecordFormSnapshot();
    showRecordForm.value = true;
    return;
  }

  handleContinueAdd(item);

  if (payload?.skuId) {
    const sku = recordProcurementSkuOptions.value.find((option) => option.id === payload.skuId);
    if (sku) {
      selectRecordSku(sku);
    }
  }

  showSkuPicker.value = false;
  takeRecordFormSnapshot();
  showRecordForm.value = true;
};

const getReferencePriceParts = (sku: any) => {
  const price = Number(sku?.currentPurchasePrice || sku?.referencePricePerPurchaseUnit || 0);
  const ratio = Number(sku?.purchaseToBaseRatio || 0);
  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  if (Number.isFinite(ratio) && ratio > 0) {
    if (baseUnit === 'G') {
      return {
        price: (price / ratio) * 500,
        unit: '500g',
      };
    }

    if (baseUnit === 'ML') {
      return {
        price: (price / ratio) * 500,
        unit: '500ml',
      };
    }

    if (baseUnit === 'PCS') {
      return {
        price: price / ratio,
        unit: formatMeasurementUnit(selectedIngredient.value?.ingredient?.unitDisplayLabel) || '个',
      };
    }
  }

  return {
    price,
    unit: sku?.purchaseUnit || sku?.displayUnit || '件',
  };
};

const formatProcurementSkuReferencePrice = (sku: any) => {
  const parts = getReferencePriceParts(sku);
  if (!parts) {
    return '';
  }

  return `¥${formatDecimal(parts.price, 2)}/${parts.unit}`;
};

const getSkuPackageFacts = (sku: any, item: any) => {
  const ratio = Number(sku?.purchaseToBaseRatio || 0);
  const baseUnit = getIngredientBaseUnit(item);
  const purchaseUnit = getSkuPurchaseUnit(sku, item);

  if (Number.isFinite(ratio) && ratio > 0) {
    if (baseUnit === 'G') {
      if (ratio >= 1000) {
        return {
          size: formatDecimal(ratio / 1000, 3),
          unit: 'kg',
          purchaseUnit,
        };
      }
      return { size: formatDecimal(ratio, 3), unit: 'g', purchaseUnit };
    }

    if (baseUnit === 'ML') {
      if (ratio >= 1000) {
        return {
          size: formatDecimal(ratio / 1000, 3),
          unit: 'L',
          purchaseUnit,
        };
      }
      return { size: formatDecimal(ratio, 3), unit: 'ml', purchaseUnit };
    }

    return {
      size: formatDecimal(ratio, 3),
      unit: item?.ingredient?.unitDisplayLabel || item?.quantityUnit || '个',
      purchaseUnit,
    };
  }

  return {
    size: getSuggestedPackageSize(item),
    unit: getSuggestedPackageUnit(item),
    purchaseUnit,
  };
};

const applyRecordSkuDefaults = (sku: any) => {
  if (!selectedIngredient.value || !sku) {
    return;
  }

  const facts = getSkuPackageFacts(sku, selectedIngredient.value);
  recordForm.value.procurementSkuId = sku.id || '';
  recordForm.value.procurementSkuName = sku.name || '';
  recordForm.value.purchaseChannel = sku.purchaseChannel || '';
  recordForm.value.productModel = sku.productModel || '';
  recordForm.value.purchaseUnit = facts.purchaseUnit || '件';
  recordForm.value.actualPackageSize = facts.size || '';
  recordForm.value.actualPackageUnit = facts.unit || '';
};

const selectRecordSku = (sku: any) => {
  applyRecordSkuDefaults(sku);
  // 换商品一律重填：不同包装/渠道的价格和规格都不一样，留着旧数字最容易记错。
  recordForm.value.actualPackageCount = '';
  recordForm.value.actualCost = '';
  recordFormError.value = '';
  recordQuantityFocus.value = true;
};

const buildRecordProductModel = () => {
  return recordForm.value.productModel;
};

const getRecordBaseQuantity = () => {
  const packageCount = Number(recordForm.value.actualPackageCount);
  const packageSize = Number(recordForm.value.actualPackageSize);
  const packageUnit = recordForm.value.actualPackageUnit;

  if (!Number.isFinite(packageCount) || packageCount <= 0 || !Number.isFinite(packageSize) || packageSize <= 0 || !packageUnit) {
    return 0;
  }

  return convertToBaseQuantity(packageCount * packageSize, packageUnit, selectedIngredient.value);
};

const convertToBaseQuantity = (amount: number, unit: string, item: any) => {
  const baseUnit = getIngredientBaseUnit(item);
  const normalized = `${unit}`.trim().toUpperCase();
  const density = Number(item?.ingredient?.properties?.density_g_per_ml || 0);

  if (baseUnit === 'G') {
    if (normalized === 'KG') return amount * 1000;
    if (normalized === 'JIN') return amount * 500;
    if (normalized === 'G') return amount;
    if (normalized === 'ML' && density > 0) return amount * density;
    if (normalized === 'L' && density > 0) return amount * 1000 * density;
  }

  if (baseUnit === 'ML') {
    if (normalized === 'L') return amount * 1000;
    if (normalized === 'ML') return amount;
    if (normalized === 'G' && density > 0) return amount / density;
    if (normalized === 'KG' && density > 0) return (amount * 1000) / density;
  }

  return amount;
};

const getBaseUnitLabel = (item: any) => {
  const baseUnit = getIngredientBaseUnit(item);
  if (baseUnit === 'G') return 'g';
  if (baseUnit === 'ML') return 'ml';
  return item?.ingredient?.unitDisplayLabel || item?.quantityUnit || '个';
};

const recordTotalQuantityText = computed(() => {
  const baseQuantity = getRecordBaseQuantity();
  if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    return '';
  }

  return `${formatDecimal(baseQuantity, 3)}${getBaseUnitLabel(selectedIngredient.value)}`;
});

const recordActualUnitPriceValue = computed(() => {
  const cost = Number(recordForm.value.actualCost);
  const baseQuantity = getRecordBaseQuantity();
  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);

  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(baseQuantity) || baseQuantity <= 0) {
    return null;
  }

  if (baseUnit === 'G' || baseUnit === 'ML') {
    return (cost / baseQuantity) * 500;
  }

  return cost / baseQuantity;
});

const recordActualUnitPriceText = computed(() => {
  const value = recordActualUnitPriceValue.value;
  if (value === null) {
    return '';
  }

  const baseUnit = getIngredientBaseUnit(selectedIngredient.value);
  if (baseUnit === 'G') {
    return `¥${formatDecimal(value, 2)}/500g`;
  }
  if (baseUnit === 'ML') {
    return `¥${formatDecimal(value, 2)}/500ml`;
  }
  return `¥${formatDecimal(value, 2)}/${getBaseUnitLabel(selectedIngredient.value)}`;
});

// 获取系统内部标准采购单位（用于展示归一化结果）
const getPurchaseRecordUnit = (item: any): string => {
  if (item?.ingredient?.purchaseUnit) {
    return item.ingredient.purchaseUnit;
  }

  if (item?.quantityUnit) {
    return item.quantityUnit;
  }

  return '个';
};

const formatDecimal = (value: number, maxDecimalPlaces = 3) => {
  const fixed = value.toFixed(maxDecimalPlaces);
  return fixed.replace(/\.?0+$/, '');
};

// ---------- 2026-11-07 采购记录弹窗 / 记录卡改版 ----------

const recordNameParts = (record: any) => {
  const parts = splitSkuName(record?.resolvedProcurementSkuName || record?.procurementSkuName || '');
  return { main: parts.main || '采购记录', sub: parts.sub };
};

const getRecordBaseQuantityOf = (record: any, item: any) => {
  const base = Number(record?.actualBaseQuantity);
  if (Number.isFinite(base) && base > 0) {
    return base;
  }
  const count = Number(record?.actualPackageCount || 0);
  const size = Number(record?.actualPackageSize || 0);
  const unit = record?.actualPackageUnit;
  if (count > 0 && size > 0 && unit) {
    return convertToBaseQuantity(count * size, unit, item);
  }
  return 0;
};

const editingRecordBase = computed(() => {
  return editingRecord.value ? getRecordBaseQuantityOf(editingRecord.value, selectedIngredient.value) : 0;
});

const existingBoughtBase = computed(() => {
  return (selectedIngredient.value?.records || []).reduce(
    (sum: number, record: any) => sum + getRecordBaseQuantityOf(record, selectedIngredient.value),
    0,
  );
});

const getItemTargetShortageBase = (item: any) => {
  if (!item) {
    return 0;
  }
  return convertToBaseQuantity(
    getItemRequiredQuantity(item),
    item.quantityUnit || getDisplayUnit(item),
    item,
  );
};

const getItemGrossNeedBase = (item: any) => {
  if (!item) {
    return 0;
  }
  return convertToBaseQuantity(
    Number(item.resolvedGrossQuantityNeeded || 0),
    item.quantityUnit || getDisplayUnit(item),
    item,
  );
};

const getItemBoughtBase = (item: any) => {
  return (item?.records || []).reduce(
    (sum: number, record: any) => sum + getRecordBaseQuantityOf(record, item),
    0,
  );
};

const targetShortageBase = computed(() => getItemTargetShortageBase(selectedIngredient.value));

/**
 * 后端生成清单后不会再回写「还要买多少」，所以进度要自己算：
 * 还需 = max(0, 目标缺口 - 已有记录)；编辑时这条记录要覆盖「还需 + 旧记录」。
 */
const recordProgress = computed(() =>
  computeRecordProgress({
    targetShortage: targetShortageBase.value,
    existingBought: existingBoughtBase.value,
    editingBought: editingRecordBase.value,
  }),
);

const remainingBase = computed(() => recordProgress.value.remaining);
const totalNeedBase = computed(() => recordProgress.value.total);
const recordNeedBase = computed(() => recordProgress.value.needForThisRecord);
const recordProgressPercent = computed(() => recordProgress.value.progressPercent);
const progressOver = computed(() => recordProgress.value.progressOver);

const formatRecordBaseWithUnit = (value: number) => {
  return `${formatBaseQuantity(value)}${getBaseUnitLabel(selectedIngredient.value)}`;
};

const formatBaseWithUnitForItem = (value: number, item: any) => {
  return `${formatBaseQuantity(value)}${getBaseUnitLabel(item)}`;
};

const recordResultText = computed(() => {
  if (!recordTotalQuantityText.value) {
    return '';
  }
  return recordActualUnitPriceText.value
    ? `共 ${recordTotalQuantityText.value} · 单价 ${recordActualUnitPriceText.value}`
    : `共 ${recordTotalQuantityText.value}`;
});

const recordOutcome = computed(() => {
  const inputBase = getRecordBaseQuantity();
  if (!inputBase || inputBase <= 0) {
    return null;
  }
  const outcome = computeRecordOutcome(inputBase, recordNeedBase.value);
  if (outcome.kind === 'ok') {
    return { text: '刚好买齐', tone: 'ok' };
  }
  return {
    text: `${outcome.kind === 'over' ? '多' : '还差'} ${formatRecordBaseWithUnit(outcome.value)}`,
    tone: outcome.kind,
  };
});

const getItemOutcome = (item: any) => {
  const records = item?.records || [];
  if (records.length === 0) {
    return { text: '待采购', tone: 'pending' };
  }
  const outcome = computeItemOutcome({
    targetShortage: getItemTargetShortageBase(item),
    bought: getItemBoughtBase(item),
    grossNeed: getItemGrossNeedBase(item),
  });
  if (outcome.kind === 'ok') {
    return { text: '买齐', tone: 'ok' };
  }
  return {
    text: `${outcome.kind === 'over' ? '多' : '还差'} ${formatBaseWithUnitForItem(outcome.value, item)}`,
    tone: outcome.kind,
  };
};

const formatPickerSkuMeta = (sku: any) => {
  return [
    sku?.productModel,
    sku?.purchaseChannel,
    formatProcurementSkuReferencePrice(sku)
      ? `上次 ${formatProcurementSkuReferencePrice(sku)}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
};

const pickerChannelOptions = computed(() => {
  const counts = new Map<string, number>();
  recordProcurementSkuOptions.value.forEach((sku: any) => {
    const name = (sku.purchaseChannel || '').trim() || '未填渠道';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
});

const filteredRecordSkuOptions = computed(() => {
  const keyword = skuPickerSearch.value.trim().toLowerCase();
  return recordProcurementSkuOptions.value.filter((sku: any) => {
    const channel = (sku.purchaseChannel || '').trim() || '未填渠道';
    if (pickerChannel.value && channel !== pickerChannel.value) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    return [sku.name, sku.productModel, channel].some((value) =>
      `${value || ''}`.toLowerCase().includes(keyword),
    );
  });
});

const openSkuPicker = () => {
  const options = recordProcurementSkuOptions.value;
  if (!options.length || !selectedIngredient.value) {
    return;
  }
  const preferred =
    (selectedRecordProcurementSku.value?.purchaseChannel ||
      getItemPurchaseChannel(selectedIngredient.value) ||
      options[0]?.purchaseChannel ||
      ''
    ).trim() || '未填渠道';
  const channels = pickerChannelOptions.value;
  pickerChannel.value = channels.some((channel) => channel.name === preferred)
    ? preferred
    : channels[0]?.name || '';
  skuPickerSearch.value = '';
  showSkuPicker.value = true;
};

const closeSkuPicker = () => {
  showSkuPicker.value = false;
  skuPickerSearch.value = '';
};

const chooseSkuFromPicker = (sku: any) => {
  if (sku?.id && sku.id === recordForm.value.procurementSkuId) {
    closeSkuPicker();
    return;
  }
  selectRecordSku(sku);
  closeSkuPicker();
};

const takeRecordFormSnapshot = () => {
  recordFormSnapshot.value = JSON.stringify(recordForm.value);
};

const isRecordFormDirty = computed(() => {
  if (!showRecordForm.value || !recordFormSnapshot.value) {
    return false;
  }
  return JSON.stringify(recordForm.value) !== recordFormSnapshot.value;
});

const openRecordMenu = (record: any) => {
  recordMenuRecord.value = record;
  showRecordMenu.value = true;
};

const closeRecordMenu = () => {
  showRecordMenu.value = false;
};

const recordMenuTitle = computed(
  () => recordMenuRecord.value?.resolvedProcurementSkuName || '采购记录',
);
const recordMenuMeta = computed(
  () =>
    `${formatFullDateTime(recordMenuRecord.value?.createdAt)} · ${
      recordMenuRecord.value?.resolvedPurchaseChannel || '未填渠道'
    }`,
);
const recordMenuSource = computed(() =>
  recordMenuRecord.value?.sourceImportId ? '来源：截图识别' : '来源：手动添加',
);

const deleteRecordFromMenu = () => {
  const record = recordMenuRecord.value;
  closeRecordMenu();
  if (record?.id) {
    deleteRecord(record.id);
  }
};

const hasMaxDecimalPlaces = (value: string | number, maxDecimalPlaces: number) => {
  const normalized = `${value}`;
  const decimalPart = normalized.split('.')[1];
  return !decimalPart || decimalPart.length <= maxDecimalPlaces;
};

const formatRecordRawSummary = (record: any, item: any) => {
  const packageCount = Number(record.actualPackageCount || 0);
  const packageSize = Number(record.actualPackageSize || 0);
  const packageUnit = record.actualPackageUnit;
  const countUnit = parsePurchaseUnitFromProductModel(record.productModel) || getRecordSkuPurchaseUnit(record, item) || '件';

  if (Number.isFinite(packageCount) && packageCount > 0 && Number.isFinite(packageSize) && packageSize > 0 && packageUnit) {
    return `${formatDecimal(packageCount)} ${countUnit} × ${formatDecimal(packageSize)}${formatMeasurementUnit(packageUnit) || packageUnit}`;
  }

  return '';
};

const formatRecordQuantity = (record: any, item: any) => {
  const rawSummary = formatRecordRawSummary(record, item);
  if (rawSummary) {
    const base = Number(record.actualBaseQuantity || 0);
    const baseUnit = formatMeasurementUnit(record.actualBaseUnit);
    return base > 0 && baseUnit
      ? `${rawSummary} = ${formatDecimal(base, 3)}${baseUnit}`
      : rawSummary;
  }

  const quantity = Number(record.actualQuantity || 0);
  return `${formatDecimal(quantity)}${getPurchaseRecordUnit(item)}`;
};

const findItemForRecord = (record: any) => {
  return items.value.find((item) => item.id === record.purchaseItemId) || items.value.find((item) => item.ingredientId === record.ingredientId) || null;
};

const getItemPurchaseChannel = (item: any) => {
  const profile = resolveProcurementSkuProfile(item);
  return profile.purchaseChannel || item?.purchaseChannel || item?.ingredient?.purchaseChannel || '';
};

const getRecordSkuLabel = (record: any, item: any) => {
  const profile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  return record.procurementSkuName || profile.procurementSkuName || formatCompactLabel([profile.purchaseChannel, profile.productModel]) || record.purchaseChannel || '-';
};

const getRecordSkuPurchaseUnit = (record: any, item: any) => {
  const profile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  const sku = profile.procurementSkuChoices.find((choice: any) => {
    return record.procurementSkuId ? choice.id === record.procurementSkuId : record.procurementSkuName && choice.name === record.procurementSkuName;
  });

  return getSkuPurchaseUnit(sku || profile, item);
};

// 日期变更检测
const dateChanges = ref<any>({
  hasChanges: false,
  changedOrders: [],
});

const orderImportCount = ref(0);
const orderImportTotal = ref(0);
const importBusy = ref(false);
const importStage = ref('');

const canImportOrderScreenshot = computed(() => {
  return (
    purchaseList.value?.status === 'PENDING' && !purchaseList.value?.reimbursementId
  );
});

// 页面加载
onLoad((options: any) => {
  purchaseListId.value = options.id;
  uni.$on('procurement-sku:created', handleProcurementSkuCreated);
  loadDetail();
});

onShow(() => {
  // 从识别结果页返回时刷新，确保刚生成的采购记录/入口状态是最新的
  if (purchaseList.value && !loading.value) {
    void loadDetail({ silent: true });
  }
});

onUnload(() => {
  uni.$off('procurement-sku:created', handleProcurementSkuCreated);
  if (highlightTimer) {
    clearTimeout(highlightTimer);
    highlightTimer = null;
  }
});

const goOrderImportReview = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/order-import/review?id=${purchaseListId.value}`,
  });
};

/** 只读回看：草稿和已确认的都在这一页，不会改动采购单。 */
const goImportHistory = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/order-import/history?id=${purchaseListId.value}`,
  });
};

// 识别订单截图：入口常驻，没开始采购先确认（生成记录不能绕开状态机）
const goOrderImport = () => {
  if (!purchaseList.value || importBusy.value) return;
  if (purchaseList.value.startedAt) {
    void pickAndRecognize();
    return;
  }
  uni.showModal({
    title: '还没开始采购',
    content: '识别订单会生成采购记录，要先开始采购。现在开始吗？',
    confirmText: '开始采购',
    success: async (res) => {
      if (!res.confirm) return;
      try {
        await startPurchaseApi(purchaseListId.value);
        await loadDetail();
        await pickAndRecognize();
      } catch (error: any) {
        uni.showToast({ title: error?.message || '开始采购失败', icon: 'none' });
      }
    },
  });
};

// 选图 → 上传 → 识别；成功后直接进核对页，中间不再单独占一页
const pickAndRecognize = async () => {
  const paths = await chooseOrderShots();
  if (paths.length === 0) return;
  importBusy.value = true;
  try {
    const result = await importOrderShots(purchaseListId.value, paths, (stage) => {
      importStage.value = stage;
    });
    if (result.ok) {
      uni.navigateTo({
        url: `/pages/staff-purchasing/order-import/review?id=${purchaseListId.value}&focus=last`,
      });
      return;
    }
    if (result.kind === 'duplicate') {
      await handleDuplicateImport();
      return;
    }
    uni.showModal({ title: '没识别成功', content: result.message, showCancel: false });
  } catch (error: any) {
    uni.showModal({
      title: '没识别成功',
      content: error?.message || '请稍后重试',
      showCancel: false,
    });
  } finally {
    importBusy.value = false;
  }
};

// 重复上传：草稿还在就直接送进核对页，别让人再传一遍
const handleDuplicateImport = async () => {
  let drafts = 0;
  try {
    const res: any = await getOrderImports(purchaseListId.value);
    drafts =
      res.code === 0
        ? (res.data || []).filter((item: any) => item.status === 'DRAFT').length
        : 0;
  } catch {
    drafts = 0;
  }
  const goReview = drafts > 0;
  uni.showModal({
    title: '这张截图传过了',
    content: goReview ? '草稿还在，直接去核对。' : '已经生成过采购记录，不用再传。',
    confirmText: goReview ? '去核对' : '知道了',
    showCancel: false,
    success: (res) => {
      if (res.confirm && goReview) goOrderImportReview();
    },
  });
};

// 加载详情；silent=true 用于从子页面返回时静默刷新，不闪屏、不收起已展开的原料
const loadDetail = async (options: { silent?: boolean } = {}) => {
  const silent = options.silent === true;
  if (!silent) loading.value = true;

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);

    if (res.code === 0) {
      purchaseList.value = res.data;
      uni.setNavigationBarTitle({ title: detailTitle.value });
      const expandedIds = silent
        ? new Set(
            items.value
              .filter(
                (item: any) =>
                  item.expanded || expandedRecordItems.value[item.id] === true,
              )
              .map((item: any) => item.id),
          )
        : new Set<string>();
      items.value = (res.data.items || []).map((item: any) => ({
        ...resolvePurchaseItemDisplay(item),
        records: [],
        expanded: expandedIds.has(item.id),
      }));

      // 如果已开始采购，加载采购记录
      if (res.data.startedAt) {
        await loadPurchaseRecords();
      }

      // 订单截图识别记录：草稿给「继续核对」，全部（含已确认）给「查看识别记录」。
      // 已确认的也要拉：清单完成/报销后仍然能回看当时 AI 认了什么（2026-11-06）。
      try {
        const importRes: any = await getOrderImports(purchaseListId.value);
        const importRows = importRes.code === 0 ? importRes.data || [] : [];
        orderImportCount.value = importRows.filter(
          (item: any) => item.status === 'DRAFT',
        ).length;
        orderImportTotal.value = importRows.length;
      } catch {
        orderImportCount.value = 0;
        orderImportTotal.value = 0;
      }

      // 检测日期变更（静默刷新时跳过：子页面不会改订单日期）
      if (!silent) {
        if (res.data.kind === 'ORDER_DEMAND') {
          await checkDateChanges();
        } else {
          dateChanges.value = {
            hasChanges: false,
            changedOrders: [],
          };
        }
        await loadPendingAppendOrders();
      }
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('加载采购清单详情失败', error);
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
};

const toDateOnlyString = (value?: string) => {
  if (!value) {
    return '';
  }
  return new Date(value).toISOString().split('T')[0];
};

const loadPendingAppendOrders = async () => {
  if (!purchaseList.value || purchaseList.value.kind !== 'ORDER_DEMAND' || purchaseList.value.status !== 'PENDING') {
    pendingAppendOrders.value = [];
    pendingAppendItems.value = [];
    pendingAppendEstimatedCost.value = 0;
    return;
  }

  const targetDate = toDateOnlyString(purchaseList.value.targetDate);
  if (!targetDate) {
    pendingAppendOrders.value = [];
    pendingAppendItems.value = [];
    pendingAppendEstimatedCost.value = 0;
    return;
  }

  pendingAppendLoading.value = true;

  try {
    const res: any = await previewPurchaseList({ startDate: targetDate });
    if (res.code !== 0) {
      pendingAppendOrders.value = [];
      pendingAppendItems.value = [];
      pendingAppendEstimatedCost.value = 0;
      return;
    }

    const existingOrderIds = new Set<string>(purchaseList.value.sourceOrderIds || []);
    const orders = Array.isArray(res.data?.affectedOrders) ? res.data.affectedOrders.filter((order: any) => order?.orderId && !existingOrderIds.has(order.orderId)) : [];

    pendingAppendOrders.value = orders;
    pendingAppendItems.value = orders.length > 0 && Array.isArray(res.data?.items) ? res.data.items.map((item: any) => resolvePurchaseItemDisplay(item)) : [];
    pendingAppendEstimatedCost.value = Number(res.data?.totalEstimatedCost || 0);
  } catch (error) {
    console.error('加载待合并订单失败', error);
    pendingAppendOrders.value = [];
    pendingAppendItems.value = [];
    pendingAppendEstimatedCost.value = 0;
  } finally {
    pendingAppendLoading.value = false;
  }
};

const appendPendingOrders = async () => {
  if (pendingAppendOrders.value.length === 0) {
    uni.showToast({ title: '当前没有待合并订单', icon: 'none' });
    return;
  }

  uni.showModal({
    title: '合并新增订单',
    content: `将把 ${pendingAppendOrders.value.length} 个同日新增订单并入当前采购清单，并同步补齐原料需求，确认继续？`,
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      appendingOrders.value = true;

      try {
        const response: any = await addOrdersToList(purchaseListId.value, {
          orderIds: pendingAppendOrders.value.map((order) => order.orderId),
        });

        if (response.code === 0) {
          const newItemCount = Number(response.data?.newItems?.length || 0);
          const updatedItemCount = Number(response.data?.updatedItems?.length || 0);
          const summaryText = newItemCount + updatedItemCount > 0 ? `新增${newItemCount}种，更新${updatedItemCount}种` : '合并成功';
          uni.showToast({ title: summaryText, icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({
            title: response.message || '合并失败',
            icon: 'none',
          });
        }
      } catch (error: any) {
        console.error('合并新增订单失败', error);
        uni.showToast({ title: error.message || '合并失败', icon: 'none' });
      } finally {
        appendingOrders.value = false;
      }
    },
  });
};

// 检测日期变更
const checkDateChanges = async () => {
  try {
    const res: any = await checkOrderDateChanges(purchaseListId.value);
    if (res.code === 0) {
      dateChanges.value = res.data;
    }
  } catch (error: any) {
    console.error('检测日期变更失败', error);
  }
};

// 加载采购记录并按原料分组
const loadPurchaseRecords = async () => {
  try {
    const res: any = await getPurchaseRecords(purchaseListId.value);
    if (res.code === 0) {
      const allRecords = (res.data || []).map((record: any) => resolvePurchaseRecordDisplay(record));

      // 按原料ID分组
      const grouped = new Map<string, any[]>();
      allRecords.forEach((record: any) => {
        const key = record.purchaseItemId || record.ingredientId;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(record);
      });

      // 将采购记录关联到对应的原料卡片
      items.value.forEach((item) => {
        item.records = grouped.get(item.id) || grouped.get(item.ingredientId) || [];
      });
    }
  } catch (error: any) {
    console.error('加载采购记录失败', error);
  }
};

// 点击"手动记录"按钮
const handleContinueAdd = (item: any) => {
  if (!canManualRecord(item)) {
    uni.showToast({
      title:
        itemState(item) === 'NO_PURCHASE'
          ? '已标记无需采购，请先点「取消」'
          : '库存足够，请先点「取消」再记录',
      icon: 'none',
    });
    return;
  }
  selectedIngredient.value = item;
  editingRecord.value = null;
  resetRecordForm();

  const latest = getLatestPurchaseRecord(item);
  const latestProfile = resolveProcurementSkuProfile(item, latest?.procurementSkuId);
  const selectedSku =
    recordProcurementSkuOptions.value.find((sku) => {
      return latest?.procurementSkuId ? sku.id === latest.procurementSkuId : sku.id === latestProfile.procurementSkuId || sku.name === latestProfile.procurementSkuName;
    }) || recordProcurementSkuOptions.value[0];

  if (selectedSku) {
    applyRecordSkuDefaults(selectedSku);
  }

  recordForm.value.actualPackageCount = '';

  // 规格/单位/渠道/型号以商品档案为准；不要用上一条记录覆盖，
  // 否则商品档案缺渠道时会被上一次的渠道「借」过去，界面提示和实际保存对不上。
  noteOpen.value = false;
  recordFormError.value = '';
  recordQuantityFocus.value = false;
  takeRecordFormSnapshot();

  showRecordForm.value = true;
};

const editRecord = (record: any) => {
  const item = findItemForRecord(record);

  if (!item) {
    uni.showToast({ title: '未找到对应原料', icon: 'none' });
    return;
  }

  selectedIngredient.value = item;
  editingRecord.value = record;
  resetRecordForm();

  const recordProfile = resolveProcurementSkuProfile(item, record.procurementSkuId);
  const selectedSku = record.procurementSkuId ? recordProcurementSkuOptions.value.find((sku) => sku.id === record.procurementSkuId) : null;

  if (selectedSku) {
    applyRecordSkuDefaults(selectedSku);
  } else if (record.procurementSkuId) {
    // 商品被停用/删除：保留原 id 让界面进入「原商品已停用」分支，数量和金额继续显示
    recordForm.value.procurementSkuId = record.procurementSkuId;
    recordForm.value.procurementSkuName = record.procurementSkuName || '';
  }
  recordForm.value.purchaseChannel = normalizeChannelLabel(record.purchaseChannel);
  recordForm.value.actualPackageCount = record.actualPackageCount ? formatDecimal(Number(record.actualPackageCount || 0)) : formatDecimal(Number(record.actualQuantity || 0));
  recordForm.value.actualPackageSize = record.actualPackageSize ? formatDecimal(Number(record.actualPackageSize || 0)) : getSuggestedPackageSize(item);
  recordForm.value.actualPackageUnit = record.actualPackageUnit || getSuggestedPackageUnit(item);
  recordForm.value.actualCost = Number(record.actualCost || 0)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
  recordForm.value.productModel = record.productModel || recordProfile.productModel || '';
  recordForm.value.purchaseUnit = parsePurchaseUnitFromProductModel(record.productModel) || parsePurchaseUnitFromProductModel(recordProfile.productModel) || recordForm.value.purchaseUnit || '件';
  recordForm.value.notes = record.notes || '';
  noteOpen.value = !!recordForm.value.notes;
  recordFormError.value = '';
  recordQuantityFocus.value = false;

  takeRecordFormSnapshot();

  showRecordForm.value = true;
};

// 关闭采购表单：填过东西先确认，别让员工白填
const closeRecordForm = (force = false) => {
  // 保存中不允许关闭：否则慢网下先关掉再打开另一条，上一笔的回调会把新表单关掉
  if (submitting.value && !force) {
    return;
  }
  if (!force && isRecordFormDirty.value) {
    uni.showModal({
      title: '放弃这次填写？',
      content: '已填的数量、金额和备注不会保存。',
      confirmText: '放弃',
      cancelText: '继续填',
      success: (res) => {
        if (res.confirm) {
          closeRecordForm(true);
        }
      },
    });
    return;
  }

  showRecordForm.value = false;
  showSkuPicker.value = false;
  showRecordMenu.value = false;
  selectedIngredient.value = null;
  editingRecord.value = null;
  noteOpen.value = false;
  recordFormError.value = '';
  recordQuantityFocus.value = false;
  recordFormSnapshot.value = '';
};

// 重置表单
const resetRecordForm = () => {
  recordForm.value = {
    procurementSkuId: '',
    procurementSkuName: '',
    purchaseChannel: '',
    purchaseUnit: '',
    actualPackageCount: '',
    actualPackageSize: '',
    actualPackageUnit: '',
    actualCost: '',
    productModel: '',
    notes: '',
  };
};

// 提交采购记录
const submitRecord = async () => {
  if (submitting.value) {
    return;
  }
  const wasEditing = Boolean(editingRecord.value);
  recordFormError.value = '';
  // 表单验证
  if (!recordForm.value.procurementSkuId || recordForm.value.procurementSkuId.trim().length === 0) {
    uni.showToast({ title: '请选择采购商品', icon: 'none' });
    return;
  }

  if (!recordForm.value.purchaseChannel || recordForm.value.purchaseChannel.trim().length === 0) {
    recordFormError.value = '这个商品缺采购渠道，请让管理员在后台补全';
    return;
  }

  if (!recordForm.value.purchaseUnit || recordForm.value.purchaseUnit.trim().length === 0) {
    recordFormError.value = '这个商品缺采购单位，请让管理员在后台补全';
    return;
  }

  if (!recordForm.value.actualPackageCount || recordForm.value.actualPackageCount.toString().trim().length === 0) {
    recordFormError.value = '请填买了多少';
    return;
  }

  const packageCount = Number(recordForm.value.actualPackageCount);
  if (isNaN(packageCount) || packageCount <= 0) {
    recordFormError.value = '购买数量必须大于 0';
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageCount, 3)) {
    recordFormError.value = '购买数量最多三位小数';
    return;
  }

  if (!recordForm.value.actualPackageSize || recordForm.value.actualPackageSize.toString().trim().length === 0) {
    recordFormError.value = '这个商品缺换算规格，请让管理员在后台补全';
    return;
  }

  const packageSize = Number(recordForm.value.actualPackageSize);
  if (isNaN(packageSize) || packageSize <= 0) {
    recordFormError.value = '商品换算规格必须大于 0';
    return;
  }

  if (!hasMaxDecimalPlaces(recordForm.value.actualPackageSize, 3)) {
    recordFormError.value = '商品换算规格最多三位小数';
    return;
  }

  if (!recordForm.value.actualPackageUnit) {
    recordFormError.value = '这个商品缺换算单位，请让管理员在后台补全';
    return;
  }

  if (!recordForm.value.actualCost || recordForm.value.actualCost.toString().trim().length === 0) {
    recordFormError.value = '请填付款金额';
    return;
  }

  const cost = Number(recordForm.value.actualCost);
  if (isNaN(cost) || cost <= 0) {
    recordFormError.value = '金额必须大于 0';
    return;
  }

  const costStr = recordForm.value.actualCost.toString();
  const decimalIndex = costStr.indexOf('.');
  if (decimalIndex !== -1 && costStr.length - decimalIndex - 1 > 2) {
    recordFormError.value = '金额最多两位小数';
    return;
  }

  submitting.value = true;

  try {
    const productModel = buildRecordProductModel();
    const data: any = {
      procurementSkuId: recordForm.value.procurementSkuId || undefined,
      purchaseChannel: recordForm.value.purchaseChannel.trim(),
      actualPackageCount: Number(packageCount.toFixed(3)),
      actualPackageSize: Number(packageSize.toFixed(3)),
      actualPackageUnit: recordForm.value.actualPackageUnit,
      actualCost: Number(cost.toFixed(2)),
      productModel: productModel?.trim() || undefined,
      notes: recordForm.value.notes?.trim() || undefined,
    };

    const response: any = editingRecord.value
      ? await updatePurchaseRecordApi(purchaseListId.value, editingRecord.value.id, data)
      : await addPurchaseRecord(purchaseListId.value, {
          ...data,
          purchaseItemId: selectedIngredient.value.id,
        });

    if (response.code === 0) {
      const savedItemId = selectedIngredient.value?.id;

      uni.showToast({
        title: wasEditing ? '修改成功' : '保存成功',
        icon: 'success',
      });

      // 刷新采购记录
      await loadPurchaseRecords();
      // 刚存完的原料会从「待采购」变成「已录入」，回到全部再展开，别让它从当前筛选里消失
      activeItemFilter.value = 'ALL';

      // 保存后回到清单：自动展开这张原料，并短暂高亮刚存的那条
      const savedItem = items.value.find(
        (row) => savedItemId && row.id === savedItemId,
      );
      if (savedItem) {
        expandedRecordItems.value = {
          ...expandedRecordItems.value,
          [savedItem.id]: true,
        };
        const savedRecordId = response.data?.id || response.data?.record?.id || '';
        if (savedRecordId) {
          if (highlightTimer) {
            clearTimeout(highlightTimer);
          }
          highlightedRecordId.value = savedRecordId;
          highlightTimer = setTimeout(() => {
            if (highlightedRecordId.value === savedRecordId) {
              highlightedRecordId.value = '';
            }
            highlightTimer = null;
          }, 2200);
        }
      }

      closeRecordForm(true);
    } else {
      uni.showToast({ title: response.message || '保存失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('保存采购记录失败', error);
    uni.showToast({ title: error.message || '保存失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
};

// 删除采购记录
const deleteRecord = (recordId: string) => {
  uni.showModal({
    title: '删除采购记录',
    content: '确认删除该采购记录？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await deletePurchaseRecordApi(purchaseListId.value, recordId);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });
            // 刷新采购记录
            await loadPurchaseRecords();
          } else {
            uni.showToast({
              title: response.message || '删除失败',
              icon: 'none',
            });
          }
        } catch (error: any) {
          console.error('删除采购记录失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};

const markItemNoPurchase = async (item: any) => {
  if (noPurchaseMarkingItemId.value) {
    return;
  }

  noPurchaseMarkingItemId.value = item.id;

  try {
    const response: any = await markPurchaseItemNoPurchaseApi(purchaseListId.value, item.id, { reason: '现场确认无需采购' });

    if (response.code === 0) {
      uni.showToast({ title: '已标记，可点取消撤销', icon: 'none' });
      await loadDetail();
    } else {
      uni.showToast({ title: response.message || '标记失败', icon: 'none' });
    }
  } catch (error: any) {
    console.error('标记无需采购失败', error);
    uni.showToast({ title: error.message || '标记失败', icon: 'none' });
  } finally {
    noPurchaseMarkingItemId.value = '';
  }
};

const clearItemNoPurchase = (item: any) => {
  uni.showModal({
    title: '取消无需采购',
    content: `确认取消"${getPurchaseItemTitle(item)}"的无需采购标记？`,
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      try {
        const response: any = await clearPurchaseItemNoPurchaseApi(purchaseListId.value, item.id);

        if (response.code === 0) {
          // 取消后如果库存仍自动判定为足够，也一并解除，避免再点一次取消
          coveredDismissedItemIds.value = {
            ...coveredDismissedItemIds.value,
            [item.id]: true,
          };
          uni.showToast({ title: '已取消，可手动记录', icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({
            title: response.message || '取消失败',
            icon: 'none',
          });
        }
      } catch (error: any) {
        console.error('取消无需采购标记失败', error);
        uni.showToast({ title: error.message || '取消失败', icon: 'none' });
      }
    },
  });
};

// 取消「库存足够」：只是让这张卡回到「待采购」，可以手动记录采购；
// 系统判定的库存数据不变，重新进页面仍按库存自动判定。
const dismissItemCovered = (item: any) => {
  uni.showModal({
    title: '取消库存足够',
    content: `确认取消"${getPurchaseItemTitle(item)}"的库存足够状态？取消后可手动记录采购。`,
    success: (res) => {
      if (!res.confirm) {
        return;
      }
      coveredDismissedItemIds.value = {
        ...coveredDismissedItemIds.value,
        [item.id]: true,
      };
      uni.showToast({ title: '已取消，可手动记录', icon: 'none' });
    },
  });
};

const goToReimbursementAfterCompletion = () => {
  uni.navigateTo({
    url: `/pages/staff-purchasing/reimbursement/submit?purchaseListId=${purchaseListId.value}`,
  });
};

// 确认采购完成
const completePurchase = () => {
  const unhandledItems = getUnhandledPurchaseItems();
  if (unhandledItems.length > 0) {
    uni.showToast({
      title: `还有 ${unhandledItems.length} 个原料未处理`,
      icon: 'none',
    });
    return;
  }

  uni.showModal({
    title: '确认采购完成',
    content: '确认该采购清单的所有原料都已处理？',
    success: async (res) => {
      if (res.confirm) {
        completing.value = true;

        try {
          const response: any = await completePurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
            uni.showModal({
              title: '采购已完成',
              content: '是否现在提交这张采购清单的报销？',
              confirmText: '去报销',
              cancelText: '稍后',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  goToReimbursementAfterCompletion();
                }
              },
            });
          } else {
            uni.showToast({
              title: response.message || '操作失败',
              icon: 'none',
            });
          }
        } catch (error: any) {
          console.error('确认采购完成失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        } finally {
          completing.value = false;
        }
      }
    },
  });
};

const reopenCompletedPurchase = () => {
  uni.showModal({
    title: '撤回完成',
    content: '撤回后可继续修改采购记录，已入库的采购记录会先回滚。确认继续？',
    success: async (res) => {
      if (!res.confirm) {
        return;
      }

      reopening.value = true;

      try {
        const response: any = await reopenPurchaseListApi(purchaseListId.value);

        if (response.code === 0) {
          uni.showToast({ title: '已撤回', icon: 'success' });
          await loadDetail();
        } else {
          uni.showToast({
            title: response.message || '撤回失败',
            icon: 'none',
          });
        }
      } catch (error: any) {
        console.error('撤回采购完成失败', error);
        uni.showToast({ title: error.message || '撤回失败', icon: 'none' });
      } finally {
        reopening.value = false;
      }
    },
  });
};

// 开始采购
const startPurchase = () => {
  uni.showModal({
    title: '开始采购',
    content: '开始采购后可以录入采购记录，确认继续？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await startPurchaseApi(purchaseListId.value);

          if (response.code === 0) {
            uni.showToast({ title: '操作成功', icon: 'success' });
            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({
              title: response.message || '操作失败',
              icon: 'none',
            });
          }
        } catch (error: any) {
          console.error('开始采购失败', error);
          uni.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    },
  });
};

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    DRAFT: '草稿',
    PENDING: '待采购',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  };
  return statusMap[status] || status;
};

// 获取状态样式类
const getStatusTone = (status: string): 'pending' | 'done' | 'danger' | 'neutral' => {
  if (status === 'PENDING') return 'pending';
  if (status === 'COMPLETED') return 'done';
  return 'neutral';
};

// 食材卡片显示原料名称，补剂/包材仍显示采购商品名（2026-11-07 老板定）
const getPurchaseItemTitle = (item: any) => resolvePurchaseItemTitle(item);

const formatBrandLabel = (brand?: string | null) => {
  const normalized = (brand || '').trim();
  if (!normalized || normalized === '-' || normalized === '无') {
    return '';
  }
  return normalized;
};

const formatSkuReferencePrice = (item: any) => {
  const price = Number(item?.resolvedCurrentPurchasePrice || 0);
  const ratio = Number(item?.resolvedPurchaseToBaseRatio || 0);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
    return '';
  }

  const baseUnit = String(item?.resolvedBaseUnit || item?.ingredient?.baseUnit || '').toUpperCase();
  const unitPrice = price / ratio;
  if (baseUnit === 'G' || baseUnit === 'ML') {
    const unitLabel = baseUnit === 'ML' ? 'ml' : 'g';
    return `参考单价 ¥${(unitPrice * 500).toFixed(2)}/500${unitLabel}`;
  }

  const unitLabel = item?.resolvedUnitDisplayLabel || item?.quantityUnit || item?.resolvedDisplayUnit || '个';
  return `参考单价 ¥${unitPrice.toFixed(2)}/${unitLabel}`;
};

// 格式化订单ID（简化显示）
const formatOrderId = (orderId: string) => {
  if (orderId.length > 12) {
    return orderId.substring(0, 8) + '...';
  }
  return orderId;
};

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}年${month}月${day}日`;
};

// 格式化完整日期时间
const formatFullDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const formatBaseQuantity = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }
  const rounded = Number(numeric.toFixed(1));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
};

// 格式化原料用量（根据原料类型处理）
const formatDisplayValue = (value: number, unit: string) => {
  if (unit === 'g') {
    return Math.round(value);
  }

  if (unit === 'ml') {
    const rounded = Number(value.toFixed(1));
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  }

  return value.toFixed(2);
};

const resolveFoodDisplayMeta = (item: any, quantityOverride?: number) => {
  const quantity = Number(quantityOverride ?? item.quantityNeeded ?? 0);
  const quantityUnit = String(item.quantityUnit || '').toLowerCase();
  const ingredientBaseUnit = String(item?.ingredient?.baseUnit || '').toUpperCase();
  const density = Number(item?.ingredient?.properties?.density_g_per_ml || 0);

  if (ingredientBaseUnit === 'ML') {
    if (quantityUnit === 'kg' && density > 0) {
      return { value: (quantity * 1000) / density, unit: 'ml' };
    }

    if (quantityUnit === 'g' && density > 0) {
      return { value: quantity / density, unit: 'ml' };
    }

    if (quantityUnit === 'ml') {
      return { value: quantity, unit: 'ml' };
    }
  }

  if (quantityUnit === 'kg') {
    return { value: quantity * 1000, unit: 'g' };
  }

  if (quantityUnit === 'g') {
    return { value: quantity, unit: 'g' };
  }

  return { value: quantity, unit: item.displayUnit || item.quantityUnit || '' };
};

const formatSupplementDisplayValue = (value: number) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) {
    return '0';
  }

  const rounded = Number(numeric.toFixed(2));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2);
};

const formatQuantity = (item: any) => {
  if (item.type === 'FOOD') {
    const meta = resolveFoodDisplayMeta(item);
    return formatDisplayValue(meta.value, meta.unit);
  }

  // 补剂类型和其他：保留两位小数
  return formatSupplementDisplayValue(Number(item.quantityNeeded || 0));
};

const formatResolvedQuantity = (value: number, item: any) => {
  if (item.type === 'FOOD') {
    const meta = resolveFoodDisplayMeta(item, value);
    return formatStaffQuantity(meta.value, meta.unit);
  }

  return formatStaffQuantity(Number(value || 0), getDisplayUnit(item), {
    maxDecimals: 2,
  });
};

// 获取显示单位
const getDisplayUnit = (item: any) => {
  if (item.type === 'FOOD') {
    return resolveFoodDisplayMeta(item).unit;
  }

  // 补剂的需求量应使用配方计算单位；SKU的瓶、罐只作为规格信息展示。
  if (item.type === 'SUPPLEMENT') {
    return item.quantityUnit || item.displayUnit || 'g';
  }

  if (item.resolvedDisplayUnit) {
    return item.resolvedDisplayUnit;
  }

  // 其他类型：使用quantityUnit
  return item.quantityUnit || '';
};

// ==========================================
// 新增功能：日期变更处理
// ==========================================

// 忽略日期变更
const ignoreDateChanges = () => {
  dateChanges.value = {
    hasChanges: false,
    changedOrders: [],
  };
  uni.showToast({ title: '已忽略日期变更', icon: 'success' });
};

// ==========================================
// 新增功能：删除原料
// ==========================================

// 确认删除原料
const confirmDeleteItem = (item: any) => {
  uni.showModal({
    title: '删除原料',
    content: `确认删除"${getPurchaseItemTitle(item)}"？`,
    success: async (res) => {
      if (res.confirm) {
        try {
          const response: any = await removeItemFromList(purchaseListId.value, item.id);

          if (response.code === 0) {
            uni.showToast({ title: '删除成功', icon: 'success' });

            // 刷新详情
            await loadDetail();
          } else {
            uni.showToast({
              title: response.message || '删除失败',
              icon: 'none',
            });
          }
        } catch (error: any) {
          console.error('删除原料失败', error);
          uni.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    },
  });
};
</script>

<style scoped lang="scss">
.purchase-detail-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
  padding-top: 24rpx;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 32rpx;

  text {
    font-size: 28rpx;
    color: #6b6653;
  }

  .error-icon {
    font-size: 120rpx;
    margin-bottom: 16rpx;
  }

  .error-text {
    font-size: 28rpx;
    color: #26261f;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    padding: 16rpx 48rpx;
    background-color: #1e3a2f;
    color: #f3eddd;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;
  }
}

.detail-content {
  padding: 0 32rpx;
}

.detail-progress {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 16rpx;
  padding: 12rpx 20rpx;
  background: rgba(251, 252, 247, 0.97);
  border: 1rpx solid #eef1e2;
  border-radius: 12rpx;
  box-shadow: 0 4rpx 12rpx rgba(30, 46, 36, 0.06);

  .dp-label {
    flex-shrink: 0;
    font-size: 22rpx;
    color: #6b6653;
    font-variant-numeric: tabular-nums;
  }

  .dp-bar {
    flex: 1;
    height: 8rpx;
    background: #eef0e6;
    border-radius: 4rpx;
    overflow: hidden;
  }

  .dp-fill {
    height: 100%;
    background: #b08d4f;
    border-radius: 4rpx;
  }

  .dp-cost {
    flex-shrink: 0;
    font-size: 24rpx;
    font-weight: 800;
    color: #26261f;
    font-variant-numeric: tabular-nums;
  }
}

.section {
  background-color: #fbfcf7;
  margin-bottom: 24rpx;
  border-radius: 16rpx;
  padding: 32rpx;

  .section-title {
    display: block;
    font-size: 30rpx;
    font-weight: bold;
    color: #26261f;
    margin-bottom: 24rpx;
  }

  .section-header {
    margin-bottom: 16rpx;
  }

  .divider {
    height: 1rpx;
    background-color: #f0f3e9;
    margin: 24rpx 0;
  }
}

.items-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 12rpx;

  .section-title {
    margin-bottom: 0;
  }
}

.items-head-sub {
  font-size: 21rpx;
  color: #8a8574;
  white-space: nowrap;
}

.filter-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 8rpx;
  margin-bottom: 16rpx;
  overflow: hidden;
}

.filter-chip {
  flex-shrink: 0;
  padding: 6rpx 12rpx;
  border-radius: 999rpx;
  border: 1rpx solid #e7eadf;
  background: #ffffff;
  font-size: 20rpx;
  line-height: 1.3;
  color: #6b6653;
  white-space: nowrap;

  &.active {
    background: #1e3a2f;
    border-color: #1e3a2f;
    color: #f3eddd;
  }
}

.filter-count {
  margin-left: 4rpx;
  font-weight: 700;
}

.filter-chip.active .filter-count {
  color: #f3eddd;
}

.status-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 16rpx;

    .header-left {
      display: flex;
      flex-direction: column;
      gap: 8rpx;

      .target-line {
        display: flex;
        align-items: center;
        gap: 12rpx;
        flex-wrap: wrap;
      }

      .target-date {
        font-size: 32rpx;
        font-weight: bold;
        color: #26261f;
      }

      .time-badge {
        padding: 6rpx 14rpx;
        border-radius: 999rpx;
        font-size: 22rpx;
        font-weight: 600;
        background: rgba(176, 141, 79, 0.18);
        color: #7a5c28;
      }

      .create-time {
        font-size: 22rpx;
        color: #6b6653;
      }
    }

    .status-badge {
      padding: 12rpx 24rpx;
      border-radius: 8rpx;
      font-size: 24rpx;
      font-weight: bold;

      &.draft {
        background-color: #f0f3e9;
        color: #26261f;
      }

      &.pending {
        background-color: #f6efe0;
        color: #7a5c28;
      }

      &.completed {
        background-color: #eef2e4;
        color: #1e3a2f;
      }

      &.cancelled {
        background-color: #f8e8e2;
        color: #b4453a;
      }
    }
  }

  .complete-time {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12rpx;
    padding: 16rpx 0;
    border-top: 1rpx solid #eef1e2;

    &:last-child {
      margin-bottom: 0;
      border-bottom: none;
    }

    .label {
      font-size: 26rpx;
      color: #26261f;
    }

    .value {
      font-size: 26rpx;
      color: #26261f;
      font-weight: 500;
    }
  }
}

.pending-append-card {
  border: 2rpx solid #b08d4f;
  background: linear-gradient(180deg, #f6efe0 0%, #ecdfc6 100%);

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;
  }

  .pending-title {
    margin-bottom: 0;
    color: #7a5c28;
  }

  .pending-count {
    font-size: 24rpx;
    color: #7a5c28;
    background-color: rgba(176, 141, 79, 0.12);
    padding: 8rpx 16rpx;
    border-radius: 999rpx;
  }

  .pending-hint {
    display: block;
    font-size: 24rpx;
    color: #7a5c28;
    line-height: 1.6;
  }

  .pending-summary {
    margin-top: 20rpx;
    display: flex;
    justify-content: space-between;
    gap: 16rpx;
    font-size: 24rpx;
    color: #7a5c28;
    flex-wrap: wrap;
  }

  .pending-order-list {
    margin-top: 20rpx;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .pending-order-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    padding: 18rpx 20rpx;
    border-radius: 12rpx;
    background-color: rgba(251, 252, 247, 0.6);
  }

  .pending-order-id {
    font-size: 26rpx;
    color: #26261f;
    font-weight: 500;
  }

  .pending-order-date {
    font-size: 24rpx;
    color: #6b6653;
  }

  .pending-append-item-list {
    margin-top: 20rpx;
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }

  .pending-append-subtitle {
    font-size: 24rpx;
    font-weight: 700;
    color: #7a5c28;
  }

  .pending-append-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18rpx;
    padding: 18rpx 20rpx;
    border-radius: 12rpx;
    background-color: #fbfcf7;
    border: 1rpx solid rgba(176, 141, 79, 0.18);
  }

  .pending-append-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }

  .pending-append-name {
    font-size: 26rpx;
    font-weight: 700;
    color: #26261f;
    line-height: 1.35;
  }

  .pending-append-spec,
  .pending-append-audit {
    font-size: 22rpx;
    color: #7a5c28;
    line-height: 1.45;
  }

  .pending-append-quantity {
    flex-shrink: 0;
    min-width: 150rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4rpx;
  }

  .pending-append-quantity-label {
    font-size: 20rpx;
    color: #7a5c28;
  }

  .pending-append-quantity-value {
    font-size: 28rpx;
    color: #7a5c28;
    font-weight: 800;
  }

  .merge-orders-btn {
    margin-top: 24rpx;
    width: 100%;
    height: 80rpx;
    line-height: 80rpx;
    border-radius: 40rpx;
    border: none;
    background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
    color: #f3eddd;
    font-size: 28rpx;
    font-weight: 600;
  }
}

// 原料分组容器
.grouped-items {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

.ingredient-group {
  background-color: #fbfcf7;
  border-radius: 12rpx;
  overflow: hidden;

  .group-header {
    background: linear-gradient(135deg, #f0f3e9 0%, #f2f4ea 100%);
    padding: 16rpx 24rpx;
    border-bottom: 1rpx solid #e5e8d4;

    .group-title {
      font-size: 26rpx;
      font-weight: bold;
      color: #26261f;
    }
  }

  .items-list {
    padding: 16rpx;
    background-color: transparent;
  }
}

// 原料卡片
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.item-card {
  background-color: #ffffff;
  border: 1rpx solid #e7eadf;
  border-radius: 20rpx;
  overflow: hidden;
  box-shadow: 0 2rpx 10rpx rgba(30, 58, 47, 0.04);

  .item-basic {
    padding: 24rpx;
  }

  .item-title-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10rpx;
  }

  .status-chip {
    flex-shrink: 0;
    padding: 2rpx 12rpx;
    border-radius: 999rpx;
    font-size: 20rpx;
    font-weight: 600;

    &.pending {
      background: #f6efe0;
      color: #8a6420;
    }

    &.covered {
      background: #e8f0e6;
      color: #2f6b4f;
    }

    &.none {
      background: #efeee8;
      color: #6b6653;
    }

    &.done {
      background: #1e3a2f;
      color: #f3eddd;
    }
  }

  .item-line-1 {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16rpx;
  }

  .item-name {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    font-size: 28rpx;
    font-weight: 600;
    color: #26261f;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-quantity {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
    flex-shrink: 0;

    .quantity-label {
      font-size: 22rpx;
      color: #6b6653;
    }

    .quantity-value {
      font-size: 34rpx;
      font-weight: 800;
      color: #7a5c28;
      line-height: 1.1;
    }

    .quantity-unit {
      font-size: 22rpx;
      color: #6b6653;
    }

    .quantity-zero {
      font-size: 22rpx;
      color: #8a8a7e;
    }
  }

  .item-meta {
    display: block;
    margin-top: 8rpx;
    font-size: 22rpx;
    color: #6b6653;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-btn {
    flex-shrink: 0;
    margin: 0;
    padding: 12rpx 28rpx;
    height: auto;
    line-height: 1.3;
    border-radius: 999rpx;
    background: #1e3a2f;
    color: #f3eddd;
    font-size: 22rpx;
    font-weight: 600;
    border: none;

    // 无需采购 / 库存足够时置灰，先点「取消」才可记录
    &.disabled {
      background: #ecece7 !important;
      color: #a3a094 !important;
      opacity: 1;
    }

    &:active {
      opacity: 0.8;
    }
  }

  .item-line-3 {
    margin-top: 10rpx;
  }

  .audit-text {
    display: block;
    font-size: 22rpx;
    color: #8a8a7e;
    line-height: 1.5;
  }

  .item-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24rpx;
    margin-top: 14rpx;
  }

  .item-actions-left {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16rpx;
  }

  .state-inline {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8rpx;
    min-width: 0;
  }

  .state-hint {
    flex: 0 1 auto;
    min-width: 0;
    font-size: 21rpx;
    color: #6b6653;
    line-height: 1.4;

    &.green {
      color: #2f6b4f;
      font-weight: 600;
    }
  }

  .record-summary-link {
    flex: 1;
    min-width: 0;
    font-size: 21rpx;
    font-weight: 600;
    color: #7a5c28;
    line-height: 1.4;
  }

  .inline-action {
    font-size: 22rpx;
    color: #7a5c28;
    padding: 10rpx 0;

    &.danger {
      color: #b4453a;
    }

    &.disabled {
      color: #8a8a7e;
    }
  }

  .item-expanded {
    background-color: transparent;

    .records-list {
      padding: 12rpx 0 0;
      display: flex;
      flex-direction: column;
      gap: 16rpx;
    }

  }
}

.empty-items {
  display: flex;
  justify-content: center;
  padding: 60rpx 32rpx;

  .empty-text {
    font-size: 26rpx;
    color: #6b6653;
  }
}

.order-table {
  display: flex;
  flex-direction: column;
}

.order-row {
  display: grid;
  grid-template-columns: 210rpx 110rpx 1fr;
  align-items: center;
  gap: 12rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #eef1e2;
  font-size: 22rpx;

  &:last-child {
    border-bottom: 0;
  }
}

.order-head {
  padding-top: 0;
  font-size: 20rpx;
  color: #8a8574;
}

.order-no {
  font-weight: 600;
  color: #26261f;
  font-variant-numeric: tabular-nums;
}

.order-dog {
  color: #7a5c28;
  font-weight: 600;
}

.order-recipe {
  color: #6b6653;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// 底部操作栏（待开始 / 进行中）
.action-btn {
  flex: 1;
  height: 88rpx;
  border-radius: 16rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;

  &.start,
  &.complete {
    background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
    color: #f3eddd;
    box-shadow: 0 8rpx 16rpx rgba(30, 46, 36, 0.3);
  }

  &:active {
    opacity: 0.8;
  }
}

// 已完成底栏：左边状态、右边「撤回完成」
// 撤回是次要操作，做成安静的描边胶囊；状态用印章式的对勾徽标，一眼能看出已收尾
.completed-bar {
  justify-content: space-between;

  // 已经报销过就没有「撤回完成」了，这时状态居中，别空着一半
  &.is-solo {
    justify-content: center;
  }
}

.done-state {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex: 1;
  min-width: 0;
}

.done-check {
  flex: none;
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  font-size: 28rpx;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 14rpx rgba(30, 46, 36, 0.22);
}

.done-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.done-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #1e3a2f;
  line-height: 1.2;
}

.done-sub {
  font-size: 22rpx;
  color: #8a8a7e;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.reopen-btn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  height: 72rpx;
  padding: 0 28rpx;
  margin: 0;
  border-radius: 999rpx;
  border: 1rpx solid rgba(176, 141, 79, 0.4);
  background: #ffffff;
  color: #7a5c28;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 4rpx 10rpx rgba(30, 46, 36, 0.06);

  &::after {
    display: none;
  }

  .reopen-icon {
    font-size: 30rpx;
    line-height: 1;
  }

  &:active {
    background: #f6efe0;
    border-color: rgba(176, 141, 79, 0.6);
  }

  &.is-busy {
    opacity: 0.6;
  }
}

// ==========================================
// 新增样式：日期变更警告横幅
// ==========================================
.date-change-warning {
  background: #f6efe0;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 24rpx;
  border-left: 6rpx solid #b4553f;

  .warning-header {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-bottom: 16rpx;

    .warning-icon {
      font-size: 32rpx;
    }

    .warning-title {
      font-size: 28rpx;
      font-weight: bold;
      color: #7a5c28;
    }
  }

  .warning-list {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-bottom: 16rpx;
    padding: 16rpx;
    background-color: rgba(251, 252, 247, 0.6);
    border-radius: 8rpx;

    .warning-item {
      display: flex;
      flex-direction: column;
      gap: 4rpx;

      .order-info {
        font-size: 26rpx;
        color: #7a5c28;
        font-weight: 500;
      }

      .order-detail {
        font-size: 22rpx;
        color: #7a5c28;
      }
    }
  }

  .warning-actions {
    display: flex;
    gap: 12rpx;

    .warning-btn {
      flex: 1;
      height: 72rpx;
      border-radius: 12rpx;
      font-size: 26rpx;
      font-weight: 500;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;

      &.ignore {
        background-color: rgba(176, 141, 79, 0.1);
        color: #7a5c28;
      }

      &:active {
        opacity: 0.8;
      }
    }
  }
}

.import-card {
  border-color: #d9cba6;
  background: #fdf9ec;
}






.import-btn {
  margin-top: 0;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 20rpx;
  background: #7a5c28;
  color: #fdf8ea;
  font-size: 26rpx;
  font-weight: 600;
}

.import-note {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #8a7a55;
}

.import-link {
  color: #7a5c28;
  font-weight: 600;
}

.import-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(23, 48, 38, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.import-mask-card {
  width: 440rpx;
  padding: 40rpx 32rpx;
  border-radius: 24rpx;
  background: #fbfcf7;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
}

.import-spinner {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  border: 6rpx solid #e2dcc9;
  border-top-color: #7a5c28;
  animation: import-spin 0.8s linear infinite;
}

@keyframes import-spin {
  to {
    transform: rotate(360deg);
  }
}

.import-mask-stage {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.import-mask-note {
  font-size: 21rpx;
  color: #6b6653;
}

// ==========================================
// 2026-11-07 采购记录弹窗 / 记录卡改版
// ==========================================

.record-form-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
}

.record-sheet {
  width: 100%;
  max-height: 88vh;
  background: #fbf8ec;
  border-radius: 40rpx 40rpx 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -20rpx 60rpx rgba(0, 0, 0, 0.18);
}

.sheet-grabber {
  width: 72rpx;
  height: 8rpx;
  border-radius: 4rpx;
  background: #d8d1bc;
  margin: 18rpx auto 0;
  flex-shrink: 0;
}

.record-sheet-head {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 32rpx 0;
  flex-shrink: 0;
}

.record-sheet-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #26261f;
  letter-spacing: -0.5rpx;
}

.record-sheet-pill {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #edf3e7;
  color: #2f6b4f;
  font-size: 21rpx;
  font-weight: 600;
}

.record-sheet-close {
  margin-left: auto;
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background: #f0ead7;
  color: #6f6a58;
  font-size: 42rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-sheet-body {
  padding: 0 32rpx 12rpx;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.record-progress {
  margin-top: 28rpx;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16rpx;
}

.record-progress-main {
  min-width: 0;
}

.record-progress-label {
  display: block;
  font-size: 22rpx;
  color: #6b6653;
  margin-bottom: 4rpx;
}

.record-progress-value {
  display: block;
  font-size: 54rpx;
  line-height: 1;
  font-weight: 800;
  color: #26261f;
  letter-spacing: -2rpx;
}

.record-progress-side {
  flex-shrink: 0;
  text-align: right;
  font-size: 21rpx;
  line-height: 1.55;
  color: #8f8b7d;
  padding-bottom: 4rpx;
}

.record-progress-track {
  height: 12rpx;
  border-radius: 999rpx;
  background: #e9e3d0;
  margin-top: 18rpx;
  overflow: hidden;
}

.record-progress-fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #cdae74, #b08d4f);
  transition: width 0.2s ease;
}

.record-progress-fill.over {
  background: linear-gradient(90deg, #d7a15a, #b4762f);
}

.record-section-head {
  margin: 30rpx 0 16rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.record-section-label {
  font-size: 23rpx;
  font-weight: 600;
  color: #6b6653;
}

.record-section-link {
  font-size: 21rpx;
  color: #2f6b4f;
  font-weight: 600;
}

.record-product {
  background: #fffdf6;
  border: 1rpx solid #e7dfc9;
  border-radius: 24rpx;
  padding: 24rpx 26rpx;
  display: flex;
  gap: 20rpx;
  align-items: center;
}

.record-product-main {
  flex: 1;
  min-width: 0;
}

.record-product-name {
  display: block;
  font-size: 30rpx;
  font-weight: 650;
  line-height: 1.36;
  color: #26261f;
}

.record-product-sub {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 1.35;
  color: #8a8574;
}

.record-product-meta {
  margin-top: 10rpx;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
  font-size: 21rpx;
  color: #6b6653;
}

.record-product-tag {
  padding: 4rpx 12rpx;
  border-radius: 10rpx;
  background: #eef2e4;
  color: #2f6b4f;
  font-size: 19rpx;
  font-weight: 600;
}

.record-product-change {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #2f6b4f;
  white-space: nowrap;
}

.record-product-warning {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.4;
  color: #b4453a;
}

.record-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  margin-top: 26rpx;
}

.record-field {
  min-width: 0;
  background: #fffdf6;
  border: 2rpx solid #e7dfc9;
  border-radius: 24rpx;
  padding: 20rpx 26rpx 18rpx;
}

.record-field.focus {
  border-color: #2f6b4f;
  box-shadow: 0 0 0 6rpx rgba(47, 107, 79, 0.08);
}

.record-field-label {
  display: block;
  font-size: 21rpx;
  color: #6b6653;
}

.record-field-line {
  display: flex;
  align-items: baseline;
  gap: 10rpx;
  margin-top: 4rpx;
}

.record-field-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  font-size: 52rpx;
  font-weight: 800;
  line-height: 72rpx;
  color: #26261f;
}

.record-field-unit {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #6b6653;
}

.record-placeholder {
  font-size: 26rpx;
  font-weight: 500;
  color: #b3ad9c;
}

.record-error {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #b4453a;
}

.record-result {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  min-height: 40rpx;
}

.record-result-main {
  min-width: 0;
  font-size: 22rpx;
  line-height: 1.5;
  color: #6b6653;
}

.record-outcome {
  flex-shrink: 0;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 700;
}

.record-outcome.over {
  background: #f6efe0;
  color: #8a6420;
}

.record-outcome.short {
  background: #fbeeec;
  color: #b4453a;
}

.record-outcome.ok {
  background: #e8f0e6;
  color: #2f6b4f;
}

.record-note {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed #e7dfc9;
}

.record-note-trigger {
  font-size: 23rpx;
  color: #6b6653;
}

.record-note-input {
  width: 100%;
  min-height: 96rpx;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  background: #fffdf6;
  border: 1rpx solid #e7dfc9;
  font-size: 25rpx;
  line-height: 1.5;
  box-sizing: border-box;
}

.record-empty {
  padding: 34rpx 28rpx 28rpx;
  border-radius: 26rpx;
  border: 2rpx dashed #cdbb92;
  background: rgba(255, 253, 246, 0.62);
  text-align: center;
}

.record-empty-icon {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  margin: 0 auto 18rpx;
  background: #eef2e4;
  color: #2f6b4f;
  font-size: 46rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.record-empty-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.record-empty-desc {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.55;
  color: #6b6653;
}

.record-empty-cta {
  margin: 26rpx auto 0;
  max-width: 480rpx;
  height: 88rpx;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  font-size: 28rpx;
  font-weight: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12rpx 26rpx rgba(30, 58, 47, 0.16);
}

.record-empty-hint {
  display: block;
  margin-top: 24rpx;
  text-align: center;
  font-size: 22rpx;
  color: #9a9482;
}

.record-sheet-footer {
  padding: 16rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  flex-shrink: 0;
}

.record-submit {
  width: 100%;
  height: 104rpx;
  border-radius: 26rpx;
  background: linear-gradient(135deg, #1e3a2f 0%, #173026 100%);
  color: #f3eddd;
  font-size: 34rpx;
  font-weight: 600;
  line-height: 104rpx;
  border: none;
  box-shadow: 0 16rpx 32rpx rgba(30, 58, 47, 0.16);
}

.record-submit::after {
  border: none;
}

.record-submit.disabled {
  background: #e9e4d5;
  color: #5f5a4b;
  box-shadow: none;
}

.record-submit-hint {
  display: block;
  margin-top: 14rpx;
  text-align: center;
  font-size: 21rpx;
  color: #9a9482;
}

/* ---------- 更换商品 ---------- */

.sku-picker-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 16, 12, 0.45);
  z-index: 1100;
  display: flex;
  align-items: flex-end;
}

.sku-picker-sheet {
  width: 100%;
  max-height: 84vh;
  background: #fbf8ec;
  border-radius: 36rpx 36rpx 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -20rpx 60rpx rgba(0, 0, 0, 0.18);
}

.sku-picker-head {
  display: flex;
  align-items: center;
  padding: 18rpx 32rpx 0;
  flex-shrink: 0;
}

.sku-picker-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #26261f;
}

.sku-picker-sub {
  display: block;
  padding: 8rpx 32rpx 0;
  font-size: 21rpx;
  line-height: 1.5;
  color: #8f8b7d;
}

.sku-picker-search {
  margin: 20rpx 32rpx 0;
  height: 76rpx;
  border-radius: 20rpx;
  background: #f2ecd8;
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 0 24rpx;
  flex-shrink: 0;
}

.sku-picker-search-icon {
  font-size: 30rpx;
  color: #9a9482;
}

.sku-picker-search-input {
  flex: 1;
  min-width: 0;
  font-size: 25rpx;
  color: #26261f;
}

.sku-picker-search-clear {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #2f6b4f;
}

.sku-picker-channels {
  width: 100%;
  padding: 20rpx 32rpx 0;
  white-space: nowrap;
  flex-shrink: 0;
  box-sizing: border-box;
}

.sku-picker-channel {
  display: inline-flex;
  align-items: center;
  padding: 10rpx 20rpx;
  margin-right: 14rpx;
  border-radius: 999rpx;
  border: 1rpx solid #ded7c2;
  background: rgba(255, 253, 246, 0.7);
  font-size: 22rpx;
  color: #6b6653;
}

.sku-picker-channel.active {
  background: #1e3a2f;
  border-color: #1e3a2f;
  color: #f3eddd;
  font-weight: 650;
}

.sku-picker-list {
  height: 36vh;
  margin: 18rpx 24rpx 0;
  border-radius: 24rpx;
  border: 1rpx solid #e7dfc9;
  background: #fffdf6;
  box-sizing: border-box;
}

.sku-picker-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx;
  border-bottom: 1rpx solid #f1ebda;
}

.sku-picker-row.selected {
  background: #f2f6ec;
}

.sku-picker-row-main {
  flex: 1;
  min-width: 0;
}

.sku-picker-row-name {
  display: block;
  font-size: 28rpx;
  font-weight: 650;
  line-height: 1.38;
  color: #26261f;
}

.sku-picker-row-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.35;
  color: #8a8574;
}

.sku-picker-row-meta {
  display: block;
  margin-top: 8rpx;
  font-size: 21rpx;
  line-height: 1.4;
  color: #6b6653;
}

.sku-picker-check {
  flex-shrink: 0;
  width: 42rpx;
  height: 42rpx;
  border-radius: 50%;
  background: #1e3a2f;
  color: #f3eddd;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sku-picker-empty {
  padding: 50rpx 0;
  text-align: center;
  font-size: 24rpx;
  color: #8f8b7d;
}

.sku-picker-add {
  margin: 18rpx 32rpx 0;
  height: 84rpx;
  border-radius: 20rpx;
  border: 2rpx dashed #cdbb92;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #8a6b33;
  background: rgba(255, 253, 246, 0.55);
  flex-shrink: 0;
}

.sku-picker-foot {
  display: block;
  padding: 16rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  text-align: center;
  font-size: 21rpx;
  color: #9a9482;
}

/* ---------- 记录卡：名字 / 数量金额 / 渠道状态 ---------- */

.record-card-v2 {
  margin-top: 16rpx;
  padding: 24rpx 26rpx 22rpx;
  background: #fffdf6;
  border: 1rpx solid #e7dfc9;
  border-radius: 24rpx;
}

.record-card-v2.just-saved {
  border-color: #c9a86a;
  animation: recordSavedPulse 1.8s ease-out 1;
}

@keyframes recordSavedPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(201, 168, 106, 0.45);
  }
  70% {
    box-shadow: 0 0 0 14rpx rgba(201, 168, 106, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(201, 168, 106, 0);
  }
}

.record-card-head {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.record-card-title {
  flex: 1;
  min-width: 0;
}

.record-card-name {
  display: block;
  font-size: 28rpx;
  font-weight: 650;
  line-height: 1.38;
  color: #26261f;
}

.record-card-sub {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.35;
  color: #8a8574;
}

.record-card-more {
  flex-shrink: 0;
  font-size: 30rpx;
  line-height: 1;
  letter-spacing: 2rpx;
  color: #8f8b7d;
  padding: 29rpx 30rpx;
  margin: -29rpx -30rpx 0 0;
}

.record-card-mid {
  margin-top: 16rpx;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.record-card-qty {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
  letter-spacing: -0.2rpx;
}

.record-card-cost {
  flex-shrink: 0;
  font-size: 36rpx;
  font-weight: 800;
  color: #b4453a;
  letter-spacing: -0.5rpx;
}

.record-card-foot {
  margin-top: 14rpx;
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.record-card-channel {
  font-size: 21rpx;
  color: #8a8574;
}

.record-card-state {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 700;
}

.record-card-state.ok {
  background: #e8f0e6;
  color: #2f6b4f;
}

.record-card-state.over {
  background: #f6efe0;
  color: #8a6420;
}

.record-card-state.short {
  background: #fbeeec;
  color: #b4453a;
}

.record-card-state.pending {
  background: #efeee8;
  color: #5a5648;
}

.record-card-edit {
  margin-left: auto;
  font-size: 22rpx;
  font-weight: 650;
  color: #2f6b4f;
}

/* ---------- 记录卡「···」菜单 ---------- */

.record-menu-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 16, 12, 0.45);
  z-index: 1200;
  display: flex;
  align-items: flex-end;
}

.record-menu-sheet {
  width: 100%;
  background: #fbf8ec;
  border-radius: 36rpx 36rpx 0 0;
  padding: 32rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.record-menu-title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.record-menu-name {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  line-height: 1.4;
  color: #26261f;
}

.record-menu-meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6b6653;
}

.record-menu-source {
  display: block;
  margin-top: 4rpx;
  font-size: 21rpx;
  color: #8f8b7d;
}

.record-menu-item {
  margin-top: 24rpx;
  padding: 28rpx 0;
  border-top: 1rpx solid #efe9d8;
  font-size: 28rpx;
  color: #26261f;
}

.record-menu-item.danger {
  color: #b4453a;
}

.record-menu-cancel {
  margin-top: 8rpx;
  padding: 24rpx 0 4rpx;
  text-align: center;
  font-size: 24rpx;
  color: #6b6653;
}


</style>
