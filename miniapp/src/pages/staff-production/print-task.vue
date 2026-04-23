<template>
  <view class="print-page">
    <view class="action-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <button class="action-btn back" @tap="goBack">
        <text>← 返回</text>
      </button>
      <view class="action-title">制作单打印预览</view>
    </view>

    <scroll-view
      scroll-y
      class="print-container"
      enable-flex
      :style="{ paddingTop: navBarHeight + 20 + 'px', paddingBottom: '132rpx' }"
    >
      <view class="a4-paper">
        <view class="print-paper-inner">
          <view class="header-section">
            <view class="compact-task-title-line">
              {{ printData.recipeName }} v{{ printData.recipeVersion }} · 第 {{ printData.currentPotNumber }}/{{ printData.totalPots }} 锅
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
                <view class="order-card-title">订单 {{ index + 1 }}</view>
                <view class="order-grid">
                  <view class="order-field">
                    <text class="field-label">总净重</text>
                    <text class="field-value">{{ formatDecimal(getOrderTotalNetWeight(order)) }}g</text>
                  </view>
                  <view class="order-field">
                    <text class="field-label">狗狗</text>
                    <text class="field-value">{{ order.dogName }}</text>
                  </view>
                  <view v-if="order.recipientName" class="order-field">
                    <text class="field-label">收货人</text>
                    <text class="field-value">{{ order.recipientName }}（{{ order.recipientCity }}）</text>
                  </view>
                  <view class="order-field package-field">
                    <text class="field-label">分装</text>
                    <text class="field-value package-value">{{ formatPackagePlan(order) }}</text>
                  </view>
                </view>
                <view v-if="order.adminRemark" class="order-remark">
                  <text class="field-label">备注</text>
                  <text class="remark-text">{{ order.adminRemark }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="section ingredients-section">
            <view class="section-title">原料清单（{{ realIngredientCount }}项）</view>
            <view class="compact-print-table">
              <view class="compact-table-row compact-table-header">
                <view class="table-cell type">类型</view>
                <view class="table-cell name">标准原料 / SKU</view>
                <view class="table-cell amount">用量</view>
                <view class="table-cell purchase">品牌 / 渠道 / 规格</view>
                <view class="table-cell method">制备</view>
              </view>
              <view
                v-for="(ingredient, index) in parsedIngredients"
                :key="index"
                class="compact-table-row"
                :class="{ 'total-weight': ingredient.isTotalWeight }"
              >
                <view class="table-cell type">
                  <text v-if="ingredient.typeLabel" :class="['type-tag', ingredient.typeClass]">
                    {{ ingredient.typeLabel }}
                  </text>
                  <text v-else>-</text>
                </view>
                <view class="table-cell name">
                  <view class="ingredient-name-line">{{ formatIngredientNameLine(ingredient) }}</view>
                </view>
                <view class="table-cell amount">{{ ingredient.amount }}{{ ingredient.unit }}</view>
                <view class="table-cell purchase">
                  <view class="purchase-summary purchase-summary-full">{{ formatPurchaseSummary(ingredient) }}</view>
                </view>
                <view class="table-cell method">
                  <view class="method-text">{{ ingredient.method || '-' }}</view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
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
    packageSpecG: number;
    packageCount: number;
    packagePlan?: Array<{ packageSpecG: number; packageCount: number }>;
    ingredientSourcePlan?: string | null;
    dogName: string;
    recipientName?: string;
    recipientCity?: string;
    adminRemark?: string;
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

  const ingredients = recipeSnapshot.items.map((item: any) => {
    let amount = 0;
    let unit = 'g';

    const typeMap: Record<string, { label: string; class: string }> = {
      FOOD: { label: '食材', class: 'type-food' },
      SUPPLEMENT: { label: '补剂', class: 'type-supplement' },
      PACKAGING: { label: '包装', class: 'type-packaging' },
    };
    const typeInfo = item.ingredient_type ? typeMap[item.ingredient_type] : null;

    const preparationMethods = Array.isArray(item.preparation_methods) && item.preparation_methods.length > 0
      ? item.preparation_methods.join('、')
      : '';

    if (item.ingredient_type === 'SUPPLEMENT') {
      const supplementAmount = calculateSupplementAmountForProduction(item, totalProductionG);
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
      name: '食材类原料总重',
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

function formatIngredientNameLine(ingredient: {
  name?: string
  standardIngredientName?: string
  procurementSkuName?: string
  isTotalWeight?: boolean
}): string {
  if (ingredient.isTotalWeight) {
    return ingredient.name || '-';
  }

  const standardName = ingredient.standardIngredientName || '';
  const skuName = ingredient.procurementSkuName || ingredient.name || '';

  if (standardName && skuName && standardName !== skuName) {
    return `${standardName} / ${skuName}`;
  }

  return skuName || standardName || '-';
}

function formatPurchaseSummary(ingredient: {
  procurementSkuBrand?: string
  procurementSkuPurchaseChannel?: string
  procurementSkuProductModel?: string
  isTotalWeight?: boolean
}): string {
  if (ingredient.isTotalWeight) {
    return '-';
  }

  const parts = getPrintablePurchaseSummaryParts(
    ingredient.procurementSkuBrand,
    ingredient.procurementSkuPurchaseChannel,
    ingredient.procurementSkuProductModel,
  );

  return parts.length > 0 ? parts.join(' / ') : '-';
}

function getPrintablePurchaseSummaryParts(...values: unknown[]): string[] {
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => !shouldSkipPurchaseSummaryPart(value));
}

function shouldSkipPurchaseSummaryPart(value: string): boolean {
  return ['无', '暂无', '-', 'null', 'undefined'].includes(value);
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
.print-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f2f3f2;
  overflow: hidden;
}

.action-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-left: 24rpx;
  padding-right: 24rpx;
  padding-bottom: 20rpx;
  background: #56ab91;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.1);
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
    background-color: rgba(255, 255, 255, 0.22);
    color: #fff;
  }
}

.action-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #fff;
  flex: 1;
  text-align: center;
}

.print-container {
  flex: 1;
  padding: 0 20rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.a4-paper {
  width: 710rpx;
  min-height: 1004rpx;
  aspect-ratio: 210 / 297;
  margin: 0 auto 28rpx;
  background-color: #fff;
  box-shadow: 0 6rpx 24rpx rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
}

.print-paper-inner {
  min-height: 1004rpx;
  padding: 32rpx 34rpx 28rpx;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.header-section {
  text-align: center;
  padding-bottom: 14rpx;
  border-bottom: 2rpx solid #56ab91;
  margin-bottom: 14rpx;
}

.compact-task-title-line {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.18;
}

.meta-info {
  margin-top: 8rpx;
  display: flex;
  justify-content: center;
  gap: 22rpx;
  font-size: 18rpx;
  color: #666;
}

.section {
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 24rpx;
  font-weight: bold;
  color: #333;
  line-height: 1.2;
  margin-bottom: 12rpx;
  padding-left: 10rpx;
  border-left: 5rpx solid #56ab91;
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
  border: 1rpx solid #d9e9e3;
  background-color: #fbfdfc;
  overflow: hidden;
}

.order-card-title {
  padding: 7rpx 10rpx;
  background-color: #56ab91;
  color: #fff;
  font-size: 20rpx;
  font-weight: bold;
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

.field-label {
  color: #777;
  flex: 0 0 auto;
}

.field-value {
  min-width: 0;
  flex: 1;
  color: #333;
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

.remark-text {
  flex: 1;
  min-width: 0;
  color: #555;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ingredients-section {
  flex: 1;
}

.compact-print-table {
  border: 1rpx solid #333;
  overflow: hidden;
  font-size: 16rpx;
}

.compact-table-row {
  display: flex;
  min-height: 38rpx;
  border-bottom: 1rpx solid #e1e1e1;

  &:last-child {
    border-bottom: none;
  }

  &.total-weight {
    background-color: #eef8f2;
    color: #2f8f76;
    font-weight: bold;
    border-top: 2rpx solid #56ab91;
  }
}

.compact-table-header {
  min-height: 34rpx;
  background-color: #f6f6f6;
  color: #333;
  font-size: 15rpx;
  font-weight: bold;
}

.table-cell {
  min-width: 0;
  padding: 6rpx 5rpx;
  box-sizing: border-box;
  border-right: 1rpx solid #e5e5e5;
  line-height: 1.22;

  &:last-child {
    border-right: none;
  }

  &.type {
    flex: 0 0 58rpx;
    text-align: center;
  }

  &.name {
    flex: 0 0 178rpx;
  }

  &.amount {
    flex: 0 0 82rpx;
    white-space: nowrap;
  }

  &.purchase {
    flex: 0 0 156rpx;
  }

  &.method {
    flex: 1;
  }
}

.ingredient-name-line,
.method-text {
  display: block;
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.ingredient-name-line {
  color: #222;
  font-weight: 600;
}

.purchase-summary {
  color: #555;
}

.purchase-summary-full {
  display: block;
  overflow: visible;
  white-space: normal;
  text-overflow: clip;
  word-break: break-all;
  overflow-wrap: anywhere;
}

.method-text {
  color: #333;
}

.type-tag {
  display: inline-block;
  padding: 2rpx 6rpx;
  border-radius: 4rpx;
  font-size: 14rpx;
  font-weight: bold;

  &.type-food {
    background-color: #e7f4ef;
    color: #389078;
  }

  &.type-supplement {
    background-color: #fff3dc;
    color: #d28a17;
  }

  &.type-packaging {
    background-color: #e8f1fb;
    color: #2e7acb;
  }
}

.bottom-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  padding: 20rpx 32rpx;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.bottom-print-btn {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background-color: #56ab91;
  color: #fff;
  border: none;
  border-radius: 8rpx;
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;

  &:active {
    background-color: #4a9680;
  }
}
</style>
