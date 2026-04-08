<template>
  <view class="print-page">
    <!-- 顶部操作栏 -->
    <view class="action-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <button class="action-btn back" @tap="goBack">
        <text>← 返回</text>
      </button>
      <view class="action-title">制作单打印预览</view>
    </view>

    <!-- 打印内容区域 -->
    <scroll-view scroll-y class="print-container" enable-flex :style="{ paddingTop: navBarHeight + 20 + 'px', paddingBottom: '120rpx' }">
      <view class="print-content">
        <!-- 标题区域 -->
        <view class="header-section">
          <view class="recipe-title">{{ printData.recipeName }} v{{ printData.recipeVersion }}</view>
          <view class="pot-info">第 {{ printData.currentPotNumber }}/{{ printData.totalPots }} 锅</view>
          <view class="meta-info">
            <text class="meta-item">状态: {{ statusText }}</text>
            <text class="meta-item">创建时间: {{ formatDateTime(printData.createdAt) }}</text>
          </view>
        </view>

        <!-- 分装订单 -->
        <view class="section">
          <view class="section-title">分装订单（{{ printData.orderItems?.length || 0 }}个）</view>
          <view class="order-cards">
            <view
              v-for="(order, index) in printData.orderItems"
              :key="index"
              class="order-card"
            >
              <view class="order-header">
                <text class="order-label">订单 {{ index + 1 }}</text>
              </view>
              <view class="order-body">
                <view class="order-row">
                  <text class="label">总净重:</text>
                  <text class="value">{{ formatDecimal(order.packageSpecG * order.packageCount) }}g</text>
                </view>
                <view class="order-row">
                  <text class="label">规格:</text>
                  <text class="value">{{ order.packageSpecG }}g/袋</text>
                </view>
                <view class="order-row">
                  <text class="label">袋数:</text>
                  <text class="value">{{ order.packageCount }}袋</text>
                </view>
                <view class="order-row">
                  <text class="label">狗狗:</text>
                  <text class="value">{{ order.dogName }}</text>
                </view>
                <view v-if="order.recipientName" class="order-row">
                  <text class="label">收货人:</text>
                  <text class="value">{{ order.recipientName }}（{{ order.recipientCity }}）</text>
                </view>
                <view v-if="order.adminRemark" class="order-row order-remark-row">
                  <text class="label">备注:</text>
                  <text class="value">{{ order.adminRemark }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 原料清单 -->
        <view class="section">
          <view class="section-title">原料清单（{{ parsedIngredients.length }}项）</view>
          <view class="ingredients-table">
            <view class="table-header">
              <view class="table-cell type">类型</view>
              <view class="table-cell name">名称</view>
              <view class="table-cell amount">用量</view>
              <view class="table-cell method">制备方法</view>
            </view>
            <view
              v-for="(ingredient, index) in parsedIngredients"
              :key="index"
              class="table-row"
              :class="{ 'total-weight': ingredient.isTotalWeight }"
            >
              <view class="table-cell type">
                <text v-if="ingredient.typeLabel" :class="['type-tag', ingredient.typeClass]">
                  {{ ingredient.typeLabel }}
                </text>
                <text v-else>-</text>
              </view>
              <view class="table-cell name">{{ ingredient.name }}</view>
              <view class="table-cell amount">{{ ingredient.amount }}{{ ingredient.unit }}</view>
              <view class="table-cell method">{{ ingredient.method || '-' }}</view>
            </view>
          </view>
          <view class="ingredients-note">
            <text>注：用量已包含生产损耗</text>
          </view>
        </view>

        <!-- 页脚 -->
        <view class="footer">
          <text>SevenKitchen 专业鲜食套餐定制</text>
          <text>制作人: {{ printData.createdBy || '厨房管理员' }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 打印提示 -->
    <view class="screenshot-hint">
      <text>💡 提示：PDF打开后，点击页面右上角"..."或"分享"图标，选择"打印"功能</text>
    </view>

    <!-- 底部打印按钮 -->
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

// 打印数据
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

// 状态栏高度
const statusBarHeight = ref(0);
// 自定义导航栏高度（状态栏 + 标题栏）
const navBarHeight = ref(44);

// 解析原料列表
const parsedIngredients = computed(() => {
  if (!printData.value.recipeSnapshot?.items) return [];

  const recipeSnapshot = printData.value.recipeSnapshot;
  const totalProductionG = printData.value.totalProductionG;
  const productionLossRate = recipeSnapshot.production_loss_rate || 1.1;
  const theoreticalWeight = totalProductionG * productionLossRate;

  let ingredients = recipeSnapshot.items.map((item: any) => {
    let amount = 0;
    let unit = 'g';

    const typeMap: Record<string, { label: string; class: string }> = {
      'FOOD': { label: '食材', class: 'type-food' },
      'SUPPLEMENT': { label: '补剂', class: 'type-supplement' },
      'PACKAGING': { label: '包装', class: 'type-packaging' },
    };
    const typeInfo = item.ingredient_type ? typeMap[item.ingredient_type] : null;

    const preparationMethods = item.preparation_methods && item.preparation_methods.length > 0
      ? item.preparation_methods.join('、')
      : '';

    if (item.ingredient_type === 'SUPPLEMENT') {
      const finishedProductKG = totalProductionG / 1000;
      const totalNutrientNeeded = finishedProductKG * item.nutrient_target_value;
      const nutrientKey = item.nutrient_target_key;
      const activeNutrientValue = item.properties?.active_nutrients?.[nutrientKey]?.value;

      if (activeNutrientValue) {
        const baseUnits = totalNutrientNeeded / activeNutrientValue;
        const supplementLossRate = item.properties?.production_loss_rate || 1.05;
        const finalUnits = baseUnits * supplementLossRate;
        amount = finalUnits;
        unit = item.unit_display_label || 'g';
      } else {
        amount = 0;
        unit = 'g';
      }
    } else {
      amount = theoreticalWeight * (item.ratio / 100);
      unit = 'g';
    }

    return {
      name: item.name,
      amount: formatDecimal(amount),
      unit,
      typeLabel: typeInfo?.label || '',
      typeClass: typeInfo?.class || '',
      method: preparationMethods,
      isTotalWeight: false,
    };
  });

  // 计算食材总重
  const totalFoodWeight = ingredients
    .filter(ing => ing.typeLabel === '食材')
    .reduce((sum, ing) => sum + parseFloat(ing.amount), 0);

  // 添加总重行（在最后一个食材后面）
  const lastFoodIndex = ingredients.map((ing, i) => ing.typeLabel === '食材' ? i : -1).filter(i => i !== -1).pop();
  if (lastFoodIndex !== undefined) {
    const totalWeightRow = {
      name: '食材类原料总重',
      amount: formatDecimal(totalFoodWeight),
      unit: 'g',
      typeLabel: '',
      typeClass: '',
      method: '',
      isTotalWeight: true,
    };
    ingredients.splice(lastFoodIndex + 1, 0, totalWeightRow);
  }

  return ingredients;
});

// 状态文本
const statusText = computed(() => {
  const statusMap: Record<string, string> = {
    'PENDING': '待制作',
    'IN_PROGRESS': '制作中',
    'COMPLETED': '已完成',
  };
  return statusMap[printData.value.status] || printData.value.status;
});

// 格式化数字
function formatDecimal(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

// 格式化日期时间
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

// 页面加载
onLoad((options: any) => {
  // 获取系统信息，计算状态栏高度
  const systemInfo = uni.getSystemInfoSync();
  statusBarHeight.value = systemInfo.statusBarHeight || 0;

  // 计算导航栏总高度 = 状态栏高度 + 导航栏内容高度
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

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 打印/生成PDF
const handlePrint = async () => {
  console.log('[PrintTask] ========== Print Debug Start ==========');
  uni.showLoading({ title: '生成PDF中...' });

  try {
    const token = uni.getStorageSync('token');
    const baseUrl = getBaseUrl();

    console.log('[PrintTask] Token present:', !!token);
    console.log('[PrintTask] BaseURL from getBaseUrl():', baseUrl);
    console.log('[PrintTask] Full URL will be:', `${baseUrl}/staff/production/print-task`);
    console.log('[PrintTask] Original recipeVersion:', printData.value.recipeVersion, 'Type:', typeof printData.value.recipeVersion);

    // 准备发送的数据，包括parsedIngredients
    const requestData = {
      recipeName: printData.value.recipeName,
      recipeVersion: String(printData.value.recipeVersion), // 确保是字符串
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

    console.log('[PrintTask] Request data:', JSON.stringify(requestData, null, 2));

    // 调用后端API生成PDF
    const res = await uni.request({
      url: `${baseUrl}/staff/production/print-task`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: requestData,
    });

    uni.hideLoading();

    console.log('[PrintTask] Response statusCode:', res.statusCode, 'Type:', typeof res.statusCode);
    console.log('[PrintTask] Response code:', res.data.code, 'Type:', typeof res.data.code);

    // 接受 200 和 201 状态码（201 = Created，RESTful API创建资源的标准响应）
    const isSuccess = (res.statusCode === 200 || res.statusCode === 201) && (res.data.code == 0);
    console.log('[PrintTask] Success check:', isSuccess, 'statusCode check:', res.statusCode === 200 || res.statusCode === 201, 'code check:', res.data.code == 0);

    if (isSuccess) {
      const pdfUrl = res.data.data.pdfUrl;

      // 下载PDF文件
      uni.showLoading({ title: '下载中...' });

      const downloadRes = await uni.downloadFile({
        url: pdfUrl,
      });

      uni.hideLoading();

      if (downloadRes.statusCode === 200) {
        // 打开PDF文档预览
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
      console.error('[PrintTask] API Error:', errorMsg);
      console.error('[PrintTask] Response data:', res.data);
      throw new Error(errorMsg);
    }
  } catch (error: any) {
    uni.hideLoading();
    console.error('[PrintTask] Print failed:', error);
    console.error('[PrintTask] Error stack:', error.stack);
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
  background-color: #f5f5f5;
  overflow: hidden;
}

.action-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-left: 24rpx;
  padding-right: 24rpx;
  padding-bottom: 20rpx;
  background: linear-gradient(135deg, #56ab91 0%, #4a9680 100%);
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
    background-color: rgba(255, 255, 255, 0.2);
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
  padding: 0 32rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  box-sizing: border-box;
}

.print-content {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.header-section {
  text-align: center;
  padding-bottom: 32rpx;
  border-bottom: 2rpx solid #56ab91;
  margin-bottom: 32rpx;
}

.recipe-title {
  font-size: 40rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 12rpx;
}

.pot-info {
  font-size: 28rpx;
  color: #56ab91;
  font-weight: bold;
  margin-bottom: 20rpx;
}

.meta-info {
  display: flex;
  justify-content: center;
  gap: 24rpx;
  font-size: 22rpx;
  color: #666;
  flex-wrap: wrap;
}

.section {
  margin-bottom: 36rpx;
}

.section-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 20rpx;
  padding-left: 12rpx;
  border-left: 6rpx solid #56ab91;
}

.order-cards {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.order-card {
  background-color: #f9f9f9;
  border-radius: 12rpx;
  overflow: hidden;
  border: 1rpx solid #e0e0e0;
}

.order-header {
  background-color: #56ab91;
  color: #fff;
  padding: 12rpx 20rpx;
  font-size: 24rpx;
  font-weight: bold;
}

.order-body {
  padding: 20rpx;
}

.order-row {
  display: flex;
  margin-bottom: 12rpx;
  font-size: 24rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    color: #666;
    min-width: 150rpx;
  }

  .value {
    color: #333;
    flex: 1;
    font-weight: 500;
    word-break: break-all;
  }
}

.order-remark-row {
  align-items: flex-start;
}

.ingredients-table {
  border: 1rpx solid #333;
  border-radius: 8rpx;
  overflow: hidden;
  font-size: 20rpx;
}

.table-header,
.table-row {
  display: flex;
  border-bottom: 1rpx solid #ddd;
}

.table-header {
  background-color: #f5f5f5;
  font-weight: bold;
}

.table-row {
  &:nth-child(even) {
    background-color: #fafafa;
  }

  &.total-weight {
    background-color: #e8f5e9 !important;
    font-weight: bold;
    border-top: 2rpx solid #56ab91;
  }
}

.table-cell {
  padding: 10rpx 12rpx;
  text-align: center;
  flex-shrink: 0;

  &.type {
    width: 70rpx;
  }

  &.name {
    flex: 0 0 140rpx;
    text-align: left;
    word-break: break-all;
  }

  &.method {
    flex: 1;
    text-align: left;
    word-break: break-all;
    min-width: 120rpx;
  }

  &.amount {
    flex: 0 0 130rpx;
    text-align: left;
    word-break: keep-all;
  }
}

.type-tag {
  display: inline-block;
  padding: 2rpx 10rpx;
  border-radius: 4rpx;
  font-size: 18rpx;
  font-weight: bold;

  &.type-food {
    background-color: #e8f5e9;
    color: #56ab91;
  }

  &.type-supplement {
    background-color: #fff3e0;
    color: #ff9800;
  }

  &.type-packaging {
    background-color: #e3f2fd;
    color: #2196f3;
  }
}

.ingredients-note {
  margin-top: 12rpx;
  font-size: 20rpx;
  color: #999;
  text-align: center;
}

.footer {
  margin-top: 36rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #e0e0e0;
  text-align: center;
  font-size: 20rpx;
  color: #999;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.screenshot-hint {
  position: fixed;
  bottom: 120rpx;
  left: 0;
  right: 0;
  background-color: rgba(255, 243, 224, 0.95);
  padding: 20rpx 24rpx;
  font-size: 20rpx;
  color: #ff9800;
  text-align: center;
  border-top: 1rpx solid #ffe0b2;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.05);
  z-index: 99;
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
  border-radius: 12rpx;
  font-size: 32rpx;
  font-weight: bold;
  text-align: center;

  &:active {
    background-color: #4a9680;
  }
}
</style>
