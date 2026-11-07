<template>
  <view class="print-page">
    <view class="action-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <button class="action-btn back" @tap="goBack">
        <text>← 返回</text>
      </button>
      <view class="action-title">制作单打印预览</view>
      <button class="action-btn ghost" aria-hidden="true">
        <text>← 返回</text>
      </button>
    </view>

    <scroll-view
      scroll-y
      class="print-container"
      enable-flex
      :style="{ paddingTop: navBarHeight + 20 + 'px' }"
    >
      <view class="a4-paper">
        <view class="print-paper-inner">
          <view class="header-section">
            <view class="compact-task-title-line">
              {{ printData.recipeName }} v{{ printData.recipeVersion }} · 第 {{ printData.currentPotNumber }} / {{ printData.totalPots }} 锅
            </view>
            <view class="meta-info">
              <text>状态: {{ statusText }}</text>
              <text>创建时间: {{ formatDateTime(printData.createdAt) }}</text>
            </view>
          </view>

          <view class="section order-section">
            <view :class="orderCardsClass">
              <view
                v-for="(order, index) in printData.orderItems"
                :key="index"
                class="order-card"
              >
                <view class="order-card-title">订单 {{ order.orderNo || index + 1 }}</view>
                <view class="order-grid">
                  <view class="order-field">
                    <text class="field-label">总净重</text>
                    <text class="field-value">{{ formatDecimal(getOrderTotalNetWeight(order)) }}g</text>
                  </view>
                  <view class="order-field">
                    <text class="field-label">狗狗</text>
                    <text class="field-value">{{ order.dogName }}</text>
                  </view>
                  <view v-if="order.recipientName" class="order-field recipient-field">
                    <text class="field-label">收货人</text>
                    <text class="field-value">{{ order.recipientName }}（{{ order.recipientCity }}）</text>
                  </view>
                  <view class="order-field package-field">
                    <text class="field-label">分装</text>
                    <text class="field-value package-value">{{ formatPackagePlan(order) }}</text>
                  </view>
                </view>
                <!-- 生产只看两种备注：管理员写的 + 顾客写的；改价日志由后端过滤，不进纸面 -->
                <view v-if="adminRemarkOf(order)" class="order-remark">
                  <text class="field-label">管理员备注</text>
                  <text class="remark-text">{{ adminRemarkOf(order) }}</text>
                </view>
                <!-- 顾客下单时填的备注：过敏、分装要求都在这里，不能截断 -->
                <view v-if="order.customerNote" class="order-remark customer-note-box">
                  <text class="field-label">顾客备注</text>
                  <text class="remark-text customer-note-text">{{ order.customerNote }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="section ingredients-section">
            <view class="section-title">原料清单（{{ realIngredientCount }}项）</view>
            <view class="compact-print-table">
              <view class="compact-table-row compact-table-header">
                <view class="table-cell source">原料 / 商品（品牌）/ 渠道 / 规格</view>
                <view class="table-cell amount">用量</view>
                <view class="table-cell method">部位/状态/预处理</view>
              </view>
              <template v-for="(row, index) in ingredientRows" :key="index">
                <view v-if="row.groupLabel" class="group-row">{{ row.groupLabel }}</view>
                <view
                  v-else
                  class="compact-table-row"
                  :class="{ 'total-weight': row.ingredient.isTotalWeight }"
                >
                  <view class="table-cell source">
                    <view class="ingredient-sku-source-line">
                      <text class="source-name">{{ ingredientNamePart(row.ingredient) }}</text>
                      <text
                        v-if="ingredientDetailPart(row.ingredient)"
                        class="source-meta"
                      >　{{ ingredientDetailPart(row.ingredient) }}</text>
                    </view>
                  </view>
                  <view class="table-cell amount">{{ row.ingredient.amount }}{{ row.ingredient.unit }}</view>
                  <view class="table-cell method">
                    <view class="method-text">{{ displayMethod(row.ingredient) }}</view>
                  </view>
                </view>
              </template>
            </view>
          </view>
        </view>
      </view>
      <view class="paper-hint">A4 · 黑白打印 · 多页自动编号</view>
    </scroll-view>

    <view class="bottom-action-bar">
      <button class="bottom-print-btn" @tap="handlePrint">
        <text>生成PDF打印</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getBaseUrl } from '../../utils/config';
import { calculateSupplementAmountForProduction } from '../../utils/supplement-nutrients';
import { getPackagePlanTotal } from '../../utils/order-package-plan';

interface PrintData {
  recipeName: string;
  recipeVersion: string;
  currentPotNumber: number;
  totalPots: number;
  status: string;
  totalProductionG: number;
  createdAt: string;
  completedAt?: string;
  orderItems: Array<{
    orderNo?: string;
    packageSpecG: number;
    packageCount: number;
    packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
    dogName: string;
    recipientName?: string;
    recipientCity?: string;
    adminRemark?: string;
    /** 顾客在确认订单页填的备注（只读） */
    customerNote?: string | null;
  }>;
  recipeSnapshot: any;
  createdBy?: string;
}

const printData = ref<PrintData>({
  recipeName: '',
  recipeVersion: '',
  currentPotNumber: 0,
  totalPots: 0,
  status: '',
  totalProductionG: 0,
  createdAt: '',
  orderItems: [],
  recipeSnapshot: null,
  createdBy: '厨房管理员',
});

const statusBarHeight = ref(0);
const navBarHeight = ref(44);

const parsedIngredients = computed(() => {
  if (!printData.value.recipeSnapshot?.items) return [];

  const recipeSnapshot = printData.value.recipeSnapshot;
  const totalProductionG = Number(printData.value.totalProductionG || 0);
  const productionLossRate = Number(recipeSnapshot.production_loss_rate || 1.1);
  const theoreticalWeight = totalProductionG * productionLossRate;

  // 后端已经算好的用量表优先（按克数推导，不受快照里过期配比影响）
  const plannedUsage = (printData.value as any)?.plannedIngredientsUsage as
    | Array<{ ingredientId: string; requiredAmount: number; unit?: string }>
    | undefined;
  const plannedById = new Map(
    (plannedUsage || []).map((entry) => [entry.ingredientId, entry]),
  );

  const ingredients = recipeSnapshot.items.map((item: any) => {
    let amount = 0;
    let unit = 'g';
    const planned = plannedById.get(item.ingredient_id || item.ingredientId);

    const typeMap: Record<string, { label: string; class: string }> = {
      FOOD: { label: '食材', class: 'type-food' },
      SUPPLEMENT: { label: '补剂', class: 'type-supplement' },
      PACKAGING: { label: '包装', class: 'type-packaging' },
    };
    const typeInfo = item.ingredient_type ? typeMap[item.ingredient_type] : null;

    // 设计器里「部位 / 状态 / 预处理」的原话优先；老数据没有原话时退回拆词版本
    const preparationMethods = getFirstString(
      item.preparation_method,
      item.preparationMethod,
    ) || (Array.isArray(item.preparation_methods) && item.preparation_methods.length > 0
      ? item.preparation_methods.join('、')
      : '');

    if (planned && Number.isFinite(planned.requiredAmount)) {
      amount = planned.requiredAmount;
      unit = planned.unit || 'g';
    } else if (item.ingredient_type === 'SUPPLEMENT') {
      const supplementAmount = calculateSupplementAmountForProduction(item, theoreticalWeight);
      amount = supplementAmount.amount;
      unit = supplementAmount.unit;
    } else {
      amount = theoreticalWeight * (Number(item.ratio || 0) / 100);
      unit = 'g';
    }

    const standardIngredientName = getFirstString(
      item.standardIngredientName,
      item.standard_ingredient_name,
      item.name,
    );
    const procurementSkuName = getFirstString(
      item.procurementSkuName,
      item.procurement_sku_name,
      item.properties?.procurement_sku_name,
    );

    return {
      name: procurementSkuName || standardIngredientName || item.name || '',
      standardIngredientName,
      procurementSkuName,
      procurementSkuBrand: getFirstString(
        item.procurementSkuBrand,
        item.procurement_sku_brand,
        item.brand,
        item.properties?.procurement_sku_brand,
      ),
      procurementSkuPurchaseChannel: getFirstString(
        item.procurementSkuPurchaseChannel,
        item.procurement_sku_purchase_channel,
        item.purchaseChannel,
        item.properties?.procurement_sku_purchase_channel,
      ),
      procurementSkuProductModel: getFirstString(
        item.procurementSkuProductModel,
        item.procurement_sku_product_model,
        item.productModel,
        item.properties?.procurement_sku_product_model,
      ),
      amount: formatDecimal(amount),
      unit,
      typeLabel: typeInfo?.label || '',
      typeClass: typeInfo?.class || '',
      method: preparationMethods,
      isTotalWeight: false,
    };
  });

  const totalFoodWeight = ingredients
    .filter((ing) => ing.typeLabel === '食材')
    .reduce((sum, ing) => sum + Number.parseFloat(ing.amount || '0'), 0);

  const lastFoodIndex = ingredients
    .map((ing, index) => (ing.typeLabel === '食材' ? index : -1))
    .filter((index) => index !== -1)
    .pop();

  if (lastFoodIndex !== undefined) {
    ingredients.splice(lastFoodIndex + 1, 0, {
      name: '食材类原料总重（含生产损耗）',
      standardIngredientName: '',
      procurementSkuName: '',
      procurementSkuBrand: '',
      procurementSkuPurchaseChannel: '',
      procurementSkuProductModel: '',
      amount: formatDecimal(totalFoodWeight),
      unit: 'g',
      typeLabel: '',
      typeClass: '',
      method: '',
      isTotalWeight: true,
    });
  }

  return ingredients;
});

const realIngredientCount = computed(() => {
  return parsedIngredients.value.filter(
    (ingredient) => !ingredient.isTotalWeight,
  ).length;
});

/** 系统审计日志标签：后端已迁走，这里再兜一层，避免历史数据把 UUID 印到纸上 */
const SYSTEM_AUDIT_TAGS = ['[客服改价]', '[代客下单]'];

function adminRemarkOf(order: { adminRemark?: string | null }): string {
  const text = String(order.adminRemark || '');
  if (!text) return '';

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !SYSTEM_AUDIT_TAGS.some((tag) => line.startsWith(tag)))
    .join('\n');
}

function displayMethod(ingredient: {
  method?: string;
  isTotalWeight?: boolean;
}): string {
  if (ingredient.isTotalWeight) return '';
  return ingredient.method || '-';
}

const orderCardsClass = computed(() => [
  'order-cards',
  printData.value.orderItems.length === 1 ? 'single-order' : '',
]);

const statusText = computed(() => {
  const statusMap: Record<string, string> = {
    PENDING: '待制作',
    IN_PROGRESS: '制作中',
    COMPLETED: '已完成',
  };
  return statusMap[printData.value.status] || printData.value.status;
});

function getFirstString(...values: unknown[]): string {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value.trim() : '';
}

function formatDecimal(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return value.toFixed(decimals);
}

/** 原料名（黑体加粗），不再带「食材 / 补剂」前缀 */
function ingredientNamePart(ingredient: {
  name?: string;
  standardIngredientName?: string;
  isTotalWeight?: boolean;
}): string {
  if (ingredient.isTotalWeight) {
    return '食材类原料总重（含生产损耗）';
  }

  return (
    ingredient.standardIngredientName ||
    ingredient.name ||
    '-'
  ).trim() || '-';
}

/** 采购信息（灰色小一号）：品牌 + 商品名 / 渠道 / 规格 */
function ingredientDetailPart(ingredient: {
  name?: string;
  standardIngredientName?: string;
  procurementSkuName?: string;
  procurementSkuBrand?: string;
  procurementSkuPurchaseChannel?: string;
  procurementSkuProductModel?: string;
  isTotalWeight?: boolean;
}): string {
  if (ingredient.isTotalWeight) {
    return '';
  }

  const ingredientName = (
    ingredient.standardIngredientName ||
    ingredient.name ||
    ''
  ).trim();
  const skuName = (ingredient.procurementSkuName || '').trim();
  const brand = getPrintablePurchaseSummaryParts(
    ingredient.procurementSkuBrand,
  )[0] || '';
  const skuPart = [brand, skuName].filter(Boolean).join(' ');
  // 原料名已经单独印在前面；商品名就是原料名时只留品牌
  const skuIsIngredientName = Boolean(skuName) && skuName === ingredientName;
  const main = skuIsIngredientName ? brand : skuPart;

  return [
    main,
    ...getPrintablePurchaseSummaryParts(
      ingredient.procurementSkuPurchaseChannel,
      ingredient.procurementSkuProductModel,
    ),
  ]
    .filter(Boolean)
    .join(' / ');
}

/** 食材 / 补剂分成两组，各带小标题；每一行不再重复写「食材」「补剂」 */
const ingredientRows = computed(() => {
  const counts = new Map<string, number>();
  parsedIngredients.value
    .filter((ingredient) => !ingredient.isTotalWeight)
    .forEach((ingredient) => {
      const group = (ingredient.typeLabel || '').trim() || '其他';
      counts.set(group, (counts.get(group) || 0) + 1);
    });

  const rows: Array<{ groupLabel?: string; ingredient?: any }> = [];
  let currentGroup = '';
  parsedIngredients.value.forEach((ingredient) => {
    if (!ingredient.isTotalWeight) {
      const group = (ingredient.typeLabel || '').trim() || '其他';
      if (group !== currentGroup) {
        currentGroup = group;
        rows.push({ groupLabel: `${group}（${counts.get(group) || 0} 项）` });
      }
    }
    rows.push({ ingredient });
  });
  return rows;
});

function getPrintablePurchaseSummaryParts(...values: unknown[]): string[] {
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => !shouldSkipPurchaseSummaryPart(value));
}

function shouldSkipPurchaseSummaryPart(value: string): boolean {
  return ['无', '暂无', '-', '/', '／', 'null', 'undefined'].includes(value);
}

function formatPackagePlan(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  packageSpecG?: number
  packageCount?: number
}): string {
  const packagePlanRows = normalizePackagePlanRows(item.packagePlan);

  if (packagePlanRows.length > 0) {
    return packagePlanRows
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，');
  }

  return `${item.packageSpecG || 0}g×${item.packageCount || 0}袋`;
}

function normalizePackagePlanRows(
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>,
): Array<{ packageSpecG: number; packageCount: number }> {
  return (packagePlan || [])
    .map((row) => {
      const packageSpecG = Math.floor(Number(row?.packageSpecG));
      const packageCount = Math.floor(Number(row?.packageCount));
      if (!Number.isFinite(packageSpecG) || !Number.isFinite(packageCount) || packageSpecG <= 0 || packageCount <= 0) {
        return null;
      }
      return { packageSpecG, packageCount };
    })
    .filter((row): row is { packageSpecG: number; packageCount: number } => row !== null);
}

function getOrderTotalNetWeight(item: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  packageSpecG?: number
  packageCount?: number
}): number {
  const packagePlanRows = normalizePackagePlanRows(item.packagePlan);
  if (packagePlanRows.length > 0) {
    return getPackagePlanTotal(packagePlanRows).totalGrams;
  }

  return Number(item.packageSpecG || 0) * Number(item.packageCount || 0);
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

onLoad((options: any) => {
  const systemInfo = uni.getSystemInfoSync();
  statusBarHeight.value = systemInfo.statusBarHeight || 0;
  navBarHeight.value = statusBarHeight.value + 44;

  if (options.taskData) {
    try {
      printData.value = JSON.parse(decodeURIComponent(options.taskData));
    } catch (error) {
      console.error('解析打印数据失败:', error);
      uni.showToast({
        title: '数据解析失败',
        icon: 'none',
      });
    }
  } else {
    uni.showToast({
      title: '缺少打印数据',
      icon: 'none',
    });
  }
});

const goBack = () => {
  uni.navigateBack();
};

const handlePrint = async () => {
  console.log('[PrintTask] ========== Print Debug Start ==========');
  uni.showLoading({ title: '生成PDF中...' });

  try {
    const token = uni.getStorageSync('token');
    const baseUrl = getBaseUrl();

    const requestData = {
      recipeName: printData.value.recipeName,
      recipeVersion: String(printData.value.recipeVersion),
      currentPotNumber: printData.value.currentPotNumber,
      totalPots: printData.value.totalPots,
      status: printData.value.status,
      totalProductionG: printData.value.totalProductionG,
      createdAt: printData.value.createdAt,
      completedAt: printData.value.completedAt,
      orderItems: printData.value.orderItems || [],
      parsedIngredients: parsedIngredients.value,
      createdBy: printData.value.createdBy || '厨房管理员',
    };

    const res = await uni.request({
      url: `${baseUrl}/staff/production/print-task`,
      method: 'POST',
      header: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: requestData,
    });

    uni.hideLoading();

    const isSuccess = (res.statusCode === 200 || res.statusCode === 201) && (res.data.code == 0);
    if (isSuccess) {
      const pdfUrl = res.data.data.pdfUrl;

      uni.showLoading({ title: '下载中...' });

      const downloadRes = await uni.downloadFile({
        url: pdfUrl,
      });

      uni.hideLoading();

      if (downloadRes.statusCode === 200) {
        uni.openDocument({
          filePath: downloadRes.tempFilePath,
          fileType: 'pdf',
          showMenu: true,
          success: () => {
            console.log('PDF opened successfully');
          },
          fail: (err) => {
            console.error('Failed to open PDF:', err);
            uni.showToast({
              title: '打开PDF失败',
              icon: 'none',
            });
          },
        });
      } else {
        throw new Error('下载PDF失败');
      }
    } else {
      const errorMsg = res.data?.message || '生成PDF失败';
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    uni.hideLoading();
    console.error('[PrintTask] Print failed:', error);
    uni.showToast({
      title: error.message || '生成PDF失败',
      icon: 'none',
    });
  }
};
</script>

<style scoped lang="scss">
/* 纸面只用黑白灰：这是打印预览，屏幕上的颜色在这里不算数 */
.print-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f0f3e9;
  overflow: hidden;
}

.action-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-left: 24rpx;
  padding-right: 24rpx;
  padding-bottom: 20rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  box-shadow: 0 2rpx 8rpx rgba(30, 46, 36, 0.1);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  flex-shrink: 0;
}

.action-btn {
  padding: 12rpx 20rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  border: none;
  line-height: 1.4;

  &.back {
    background-color: rgba(251, 252, 247, 0.22);
    color: #f3eddd;
  }

  /* 右侧占位：让标题真正居中，不点也不显示 */
  &.ghost {
    visibility: hidden;
    background: transparent;
  }
}

.action-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #f3eddd;
  flex: 1;
  text-align: center;
}

.print-container {
  flex: 1;
  padding: 0 20rpx;
  /* 给固定底栏留位置，含 iPhone 的 Home 指示条 */
  padding-bottom: calc(180rpx + env(safe-area-inset-bottom));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

/* A4 纸：只锁下限，内容多就往下长 —— 不再把最后几行漏到纸外 */
.a4-paper {
  width: 710rpx;
  min-height: 1004rpx;
  margin: 0 auto 12rpx;
  background-color: #ffffff;
  box-shadow: 0 6rpx 24rpx rgba(0, 0, 0, 0.1);
  box-sizing: border-box;
}

.print-paper-inner {
  min-height: 1004rpx;
  padding: 32rpx 34rpx 28rpx;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.paper-hint {
  padding: 10rpx 0 4rpx;
  text-align: center;
  font-size: 20rpx;
  color: #8a8a80;
}

.header-section {
  text-align: center;
  padding-bottom: 14rpx;
  border-bottom: 2rpx solid #000000;
  margin-bottom: 14rpx;
}

.compact-task-title-line {
  font-size: 32rpx;
  font-weight: bold;
  color: #000000;
  line-height: 1.18;
}

.meta-info {
  margin-top: 8rpx;
  display: flex;
  justify-content: center;
  gap: 22rpx;
  font-size: 18rpx;
  color: #555555;
}

.section {
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 24rpx;
  font-weight: bold;
  color: #000000;
  line-height: 1.2;
  margin-bottom: 12rpx;
  padding-left: 10rpx;
  border-left: 5rpx solid #000000;
}

.order-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10rpx;

  &.single-order {
    grid-template-columns: 1fr;
  }
}

.order-card {
  border: 1rpx solid #b5b5ad;
  background-color: #ffffff;
  overflow: hidden;
}

.order-card-title {
  padding: 7rpx 10rpx;
  background-color: #ffffff;
  color: #000000;
  font-size: 20rpx;
  font-weight: bold;
  border-bottom: 2rpx solid #000000;
}

.order-grid {
  padding: 10rpx 10rpx 4rpx;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5rpx 10rpx;
}

.order-field,
.order-remark {
  min-width: 0;
  font-size: 17rpx;
  line-height: 1.25;
}

.order-field {
  display: flex;
  gap: 6rpx;
}

/* 收货人整行，别在右半格留个空洞 */
.recipient-field {
  grid-column: 1 / -1;
}

.field-label {
  color: #555555;
  flex: 0 0 auto;
}

.field-value {
  min-width: 0;
  flex: 1;
  color: #000000;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.package-field {
  grid-column: 1 / -1;
}

.package-value {
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
}

.order-remark {
  display: flex;
  gap: 6rpx;
  padding: 0 10rpx 10rpx;
}

/* 顾客备注：粗黑框 + 完整显示，过敏信息一个字都不能丢 */
.customer-note-box {
  margin: 0 10rpx 10rpx;
  padding: 8rpx 10rpx;
  border: 2rpx solid #000000;
}

.remark-text {
  flex: 1;
  min-width: 0;
  color: #000000;
  white-space: normal;
  word-break: break-word;
}

.customer-note-text {
  display: block;
  white-space: normal;
  word-break: break-word;
}

.ingredients-section {
  flex: 1;
}

.group-row {
  padding: 7rpx 8rpx 5rpx;
  border-top: 1rpx solid #000000;
  font-size: 16rpx;
  font-weight: bold;
  color: #000000;
}

.compact-print-table {
  border: 1rpx solid #000000;
  overflow: hidden;
  font-size: 17rpx;
}

.compact-table-row {
  display: flex;
  min-height: 42rpx;
  border-bottom: 1rpx solid #d4d4cc;

  &:last-child {
    border-bottom: none;
  }

  /* 合计行：加粗 + 上下粗线，不靠底色 */
  &.total-weight {
    background-color: #ffffff;
    color: #000000;
    font-weight: bold;
    border-top: 3rpx solid #000000;
    border-bottom: 3rpx solid #000000;
  }
}

.compact-table-header {
  min-height: 36rpx;
  background-color: #ffffff;
  color: #000000;
  font-size: 16rpx;
  font-weight: bold;
  border-bottom: 2rpx solid #000000;
}

.table-cell {
  min-width: 0;
  padding: 6rpx 5rpx;
  box-sizing: border-box;
  border-right: 1rpx solid #d4d4cc;
  line-height: 1.22;

  &:last-child {
    border-right: none;
  }

  &.source {
    flex: 1 1 0;
  }

  /* 用量右对齐 + 等宽数字，方便上下比对 */
  &.amount {
    flex: 0 0 84rpx;
    white-space: nowrap;
    text-align: right;
  }

  &.method {
    flex: 0 0 150rpx;
  }
}

.ingredient-sku-source-line,
.method-text {
  display: block;
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.ingredient-sku-source-line {
  color: #000000;
}

.source-name {
  font-weight: 600;
  color: #000000;
}

.source-meta {
  font-weight: 400;
  color: #666666;
  font-size: 15rpx;
}


.method-text {
  color: #000000;
}

/* 底部操作栏：避开 iPhone 的 Home 指示条 */
.bottom-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fbfcf7;
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -2rpx 8rpx rgba(30, 46, 36, 0.1);
  z-index: 100;
}

.bottom-print-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #1e3a2f;
  color: #f3eddd;
  border: none;
  border-radius: 8rpx;
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;

  &:active {
    background-color: #1e3a2f;
  }
}
</style>
