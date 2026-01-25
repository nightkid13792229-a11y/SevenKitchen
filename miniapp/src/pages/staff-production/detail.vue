<template>
  <view class="detail-page">
    <!-- 返回按钮 -->
    <view class="nav-bar">
      <view class="back-btn" @tap="goBack">
        <text>←</text>
      </view>
      <text class="nav-title">任务详情</text>
    </view>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <text>加载中...</text>
    </view>

    <!-- 详情内容 -->
    <view v-else-if="taskDetail" class="detail-content">
      <!-- 任务标题 -->
      <view class="task-title-section">
        <text class="recipe-name">{{ taskDetail.recipeName }} v{{ taskDetail.recipeVersion }}</text>
        <text class="pot-info">({{ taskDetail.currentPotNumber }}/{{ taskDetail.totalPots }})</text>
        <view class="status-badge" :class="taskDetail.status.toLowerCase()">
          <text>{{ statusText }}</text>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="section">
        <view class="section-title">基本信息</view>
        <view class="info-row">
          <text class="label">食谱：</text>
          <text class="value">{{ taskDetail.recipeName }} v{{ taskDetail.recipeVersion }}</text>
        </view>
        <view class="info-row">
          <text class="label">订单编号：</text>
          <text class="value">{{ taskDetail.orderItems?.[0]?.orderId || '-' }}</text>
        </view>
        <view class="info-row">
          <text class="label">状态：</text>
          <text class="value">{{ statusText }}</text>
        </view>
        <view class="info-row">
          <text class="label">创建时间：</text>
          <text class="value">{{ taskDetail.createdAt }}</text>
        </view>
        <view v-if="taskDetail.completedAt" class="info-row">
          <text class="label">完成时间：</text>
          <text class="value">{{ taskDetail.completedAt }}</text>
        </view>
      </view>

      <!-- 分装信息（按订单展示） -->
      <view class="section">
        <view class="section-title">分装信息</view>
        <view v-for="order in taskDetail.orderItems" :key="order.orderItemId" class="order-item">
          <view class="order-info">
            <view class="info-row">
              <text class="label">总净重：</text>
              <text class="value">{{ formatDecimal(taskDetail.totalProductionG) }}g</text>
            </view>
            <view class="info-row">
              <text class="label">规格：</text>
              <text class="value">{{ order.packageSpecG }}g/袋</text>
            </view>
            <view class="info-row">
              <text class="label">袋数：</text>
              <text class="value">{{ order.packageCount }}袋</text>
            </view>
            <view class="info-row">
              <text class="label">狗狗：</text>
              <text class="value">{{ order.dogName }}</text>
            </view>
            <view v-if="order.recipientName" class="info-row">
              <text class="label">收货人：</text>
              <text class="value">{{ order.recipientName }}（{{ order.recipientCity }}）</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 原料清单 -->
      <view v-if="taskDetail.recipeSnapshot?.items && taskDetail.recipeSnapshot.items.length > 0" class="section">
        <view class="section-title">原料清单（{{ totalIngredientCount }}）</view>
        <view class="ingredients-list">
          <view
            v-for="ingredient in parsedIngredients"
            :key="ingredient.id"
            class="ingredient-item"
          >
            <text v-if="ingredient.type" class="ingredient-type" :class="getTypeClass(ingredient.type)">[{{ ingredient.type }}]</text>
            <text class="ingredient-name">{{ ingredient.name }} {{ ingredient.amount }}{{ ingredient.unit }}</text>
            <text v-if="ingredient.method" class="ingredient-method">（{{ ingredient.method }}）</text>
          </view>
        </view>
        <view class="ingredients-note">
          <text>注：用量已包含生产损耗</text>
        </view>
        <view class="ingredients-summary">
          <text>食材类原料总重：{{ totalFoodIngredientWeight }}g</text>
        </view>
      </view>

      <!-- 备料照片上传（2-3张） -->
      <view v-if="taskDetail.status === 'IN_PROGRESS'" class="section">
        <view class="section-title">
          备料照片（必填，2-3张）
          <text class="photo-count">当前：{{ uploadedPhotos.length }}/3</text>
        </view>

        <!-- 照片预览区 -->
        <view class="photos-preview">
          <!-- 已上传的照片 -->
          <view v-for="(photo, index) in uploadedPhotos" :key="index" class="photo-item">
            <image :src="photo" mode="aspectFill" class="photo-image" @tap="previewPhoto(photo)" />
            <view class="photo-delete" @tap="deletePhoto(index)">
              <text>×</text>
            </view>
          </view>

          <!-- 上传按钮（未满3张时显示） -->
          <view v-if="uploadedPhotos.length < 3" class="photo-upload" @tap="choosePhoto">
            <text class="upload-icon">+</text>
            <text class="upload-text">上传照片</text>
          </view>
        </view>

        <view class="photos-hint">
          <text>支持从相册选择或拍照，自动压缩到200KB以内</text>
        </view>
      </view>

      <!-- 底部按钮区域 -->
      <view v-if="taskDetail.status === 'IN_PROGRESS'" class="bottom-actions">
        <!-- 制作中状态：显示上传和完成按钮（固定悬浮） -->
        <button
          class="action-btn upload"
          :disabled="uploadedPhotos.length < 2"
          @tap="uploadPhotos"
        >
          确认上传（{{ uploadedPhotos.length }}/3）
        </button>
        <button
          class="action-btn complete"
          @tap="completeTask"
        >
          完成制作
        </button>
      </view>

      <!-- 打印按钮（非悬浮，在页面底部） -->
      <view class="print-section">
        <button class="print-btn primary" @tap="printLabel">
          🏷️ 打印标签
        </button>
        <button class="print-btn secondary" @tap="printTask">
          🖨️ 打印制作单
        </button>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">加载失败，请返回重试</text>
      <button class="retry-btn" @tap="goBack">返回</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  getPackagingUnits,
  uploadProductionPhotos,
  completeProductionTask,
} from '../../api/production';

// 格式化函数
function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

// 任务ID
const taskId = ref('');

// 加载状态
const loading = ref(true);

// 任务详情
const taskDetail = ref<any>(null);

// 已上传的照片
const uploadedPhotos = ref<string[]>([]);

// 待上传的照片文件
const pendingPhotoFiles = ref<any[]>([]);

// 计算属性：状态文本
const statusText = computed(() => {
  if (!taskDetail.value) return '';
  const statusMap: Record<string, string> = {
    'PENDING': '待制作',
    'IN_PROGRESS': '制作中',
    'COMPLETED': '已完成',
  };
  return statusMap[taskDetail.value.status] || taskDetail.value.status;
});

// 计算属性：解析原料列表
const parsedIngredients = computed(() => {
  if (!taskDetail.value?.recipeSnapshot?.items) return [];

  const recipeSnapshot = taskDetail.value.recipeSnapshot;
  const totalProductionG = taskDetail.value.totalProductionG;
  const productionLossRate = recipeSnapshot.production_loss_rate || 1.1; // 默认110%（10%损耗）

  // 计算理论原料总重（含损耗）= 成品重量 × 损耗率
  // 例如：260.63g × 1.07 = 278.87g（需要准备278.87g原料才能得到260.63g成品）
  const theoreticalWeight = totalProductionG * productionLossRate;

  return recipeSnapshot.items.map((item: any) => {
    let amount = 0;
    let unit = 'g';

    // 映射原料类型（食材/补剂/包装）
    const typeMap: Record<string, string> = {
      'FOOD': '食材',
      'SUPPLEMENT': '补剂',
      'PACKAGING': '包装',
    };
    const type = item.ingredient_type ? typeMap[item.ingredient_type] : '';

    // 获取制备方法（多个方法用顿号分隔）
    const preparationMethods = item.preparation_methods && item.preparation_methods.length > 0
      ? item.preparation_methods.join('、')
      : '';

    // 根据原料类型计算用量
    if (item.ingredient_type === 'SUPPLEMENT') {
      // 补剂计算：基于成品净重
      const finishedProductKG = totalProductionG / 1000; // 转换为公斤

      // 步骤1: 计算该锅次需要的营养素总量
      const totalNutrientNeeded = finishedProductKG * item.nutrient_target_value;

      // 步骤2: 获取补剂每单位含量
      const nutrientKey = item.nutrient_target_key;
      const activeNutrientValue = item.properties?.active_nutrients?.[nutrientKey]?.value;
      const activeNutrientUnit = item.properties?.active_nutrients?.[nutrientKey]?.unit;

      if (activeNutrientValue && activeNutrientUnit) {
        // 步骤3: 计算基础单位数
        const baseUnits = totalNutrientNeeded / activeNutrientValue;

        // 步骤4: 考虑补剂生产损耗
        const supplementLossRate = item.properties?.production_loss_rate || 1.05;
        const finalUnits = baseUnits * supplementLossRate;

        amount = finalUnits;

        // 获取单位显示标签
        unit = item.unit_display_label || 'g';

        // 🔍 调试日志
        console.log(`[补剂] ${item.name}:`, {
          finishedProductKG: finishedProductKG.toFixed(4),
          nutrientTargetValue: item.nutrient_target_value,
          totalNutrientNeeded: totalNutrientNeeded.toFixed(2),
          activeNutrientValue: activeNutrientValue,
          activeNutrientUnit: activeNutrientUnit,
          baseUnits: baseUnits.toFixed(2),
          supplementLossRate: supplementLossRate,
          finalUnits: finalUnits.toFixed(2),
          unit: unit
        });
      } else {
        console.warn(`[补剂] ${item.name}: 缺少active_nutrients数据`);
        amount = 0;
        unit = 'g';
      }
    } else {
      // 食材和包材：按配比计算
      amount = theoreticalWeight * (item.ratio / 100);
      unit = 'g';

      // 🔍 调试日志
      console.log(`[食材/包材] ${item.name}:`, {
        productionLossRate: productionLossRate,
        totalProductionG: totalProductionG,
        theoreticalWeight: theoreticalWeight,
        ratio: item.ratio,
        calculatedAmount: amount
      });
    }

    return {
      id: item.ingredient_id,
      name: item.name,
      amount: formatDecimal(amount),
      unit, // 单位
      type, // 原料类型
      method: preparationMethods, // 制备方法
    };
  });
});

// 计算属性：原料总数（整数）
const totalIngredientCount = computed(() => {
  if (!parsedIngredients.value.length) return '0';
  return parsedIngredients.value.length.toString();
});

// 计算属性：食材类原料总重
const totalFoodIngredientWeight = computed(() => {
  if (!parsedIngredients.value.length) return '0.00';

  // 只计算 FOOD 类型的原料（使用 type 字段）
  const total = parsedIngredients.value
    .filter(ing => ing.type === '食材')
    .reduce((sum, ing) => {
      const amount = parseFloat(ing.amount);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

  return formatDecimal(total);
});

// 获取类型对应的CSS类名
const getTypeClass = (type: string) => {
  const typeMap: Record<string, string> = {
    '食材': 'type-food',
    '补剂': 'type-supplement',
    '包装': 'type-packaging',
  };
  return typeMap[type] || '';
};

// 页面加载
onMounted(() => {
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const options = currentPage.options as any;
  taskId.value = options.id;

  if (taskId.value) {
    loadTaskDetail();
  } else {
    loading.value = false;
    uni.showToast({
      title: '缺少任务ID',
      icon: 'none',
    });
  }
});

// 加载任务详情
const loadTaskDetail = async () => {
  try {
    loading.value = true;
    const res = await getPackagingUnits({
      status: undefined,
      page: 1,
      pageSize: 100,
    });

    const task = res.data.list.find((t: any) => t.id === taskId.value);
    if (task) {
      taskDetail.value = task;
      uploadedPhotos.value = task.photosRaw || [];

      // 🔍 调试日志：验证分装信息数据
      console.log('=== Task Detail Debug ===');
      console.log('Task ID:', task.id);
      console.log('Total Production (g):', task.totalProductionG);
      console.log('Order Items:', task.orderItems);
      console.log('Recipe Snapshot:', task.recipeSnapshot);
      console.log('Recipe Items:', task.recipeSnapshot?.items);

      // 验证分装信息字段
      task.orderItems.forEach((order: any, idx: number) => {
        console.log(`Order ${idx + 1}:`, {
          orderId: order.orderId,
          dogName: order.dogName,
          recipientName: order.recipientName,
          recipientCity: order.recipientCity,
        });
      });
    } else {
      uni.showToast({
        title: '任务不存在',
        icon: 'none',
      });
    }
  } catch (error: any) {
    console.error('Failed to load task detail:', error);
    uni.showToast({
      title: error.message || '加载失败',
      icon: 'none',
    });
  } finally {
    loading.value = false;
  }
};

// 返回
const goBack = () => {
  uni.navigateBack();
};

// 选择照片
const choosePhoto = () => {
  const maxCount = 3 - uploadedPhotos.value.length;
  uni.chooseImage({
    count: maxCount,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const tempFiles = res.tempFilePaths.map((filePath, index) => ({
        filePath,
        name: `photo_${Date.now()}_${index}.jpg`,
      }));
      pendingPhotoFiles.value.push(...tempFiles);

      // 预览
      uploadedPhotos.value.push(...res.tempFilePaths);
    },
  });
};

// 预览照片
const previewPhoto = (url: string) => {
  uni.previewImage({
    urls: [url],
  });
};

// 删除照片
const deletePhoto = (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确认删除这张照片？',
    success: (res) => {
      if (res.confirm) {
        uploadedPhotos.value.splice(index, 1);
        pendingPhotoFiles.value.splice(index, 1);
      }
    },
  });
};

// 上传照片
const uploadPhotos = async () => {
  if (pendingPhotoFiles.value.length < 2) {
    uni.showToast({
      title: '至少上传2张照片',
      icon: 'none',
    });
    return;
  }

  uni.showLoading({ title: '上传中...' });

  try {
    await uploadProductionPhotos(taskId.value, pendingPhotoFiles.value);
    uni.hideLoading();

    uni.showToast({
      title: '上传成功',
      icon: 'success',
    });

    // 清空待上传文件
    pendingPhotoFiles.value = [];
  } catch (error: any) {
    uni.hideLoading();
    console.error('Upload photos failed:', error);
    uni.showToast({
      title: error.message || '上传失败',
      icon: 'none',
    });
  }
};

// 完成制作
const completeTask = async () => {
  uni.showModal({
    title: '确认完成',
    content: '确认完成制作任务？',
    success: async (res) => {
      if (!res.confirm) return;

      uni.showLoading({ title: '提交中...' });

      try {
        await completeProductionTask(taskId.value);
        uni.hideLoading();

        uni.showToast({
          title: '已完成制作',
          icon: 'success',
        });

        // 延迟返回
        setTimeout(() => {
          goBack();
        }, 1500);
      } catch (error: any) {
        uni.hideLoading();
        console.error('Complete task failed:', error);
        uni.showToast({
          title: error.message || '操作失败',
          icon: 'none',
        });
      }
    },
  });
};

// 打印任务
const printTask = () => {
  if (!taskDetail.value) {
    uni.showToast({
      title: '数据加载中',
      icon: 'none',
    });
    return;
  }

  // 准备打印数据
  const printData = {
    recipeName: taskDetail.value.recipeName,
    recipeVersion: taskDetail.value.recipeVersion,
    currentPotNumber: taskDetail.value.currentPotNumber,
    totalPots: taskDetail.value.totalPots,
    status: taskDetail.value.status,
    totalProductionG: taskDetail.value.totalProductionG,
    createdAt: taskDetail.value.createdAt,
    completedAt: taskDetail.value.completedAt,
    orderItems: taskDetail.value.orderItems || [],
    recipeSnapshot: taskDetail.value.recipeSnapshot,
    createdBy: taskDetail.value.createdBy || '厨房管理员', // 添加创建人字段
  };

  // 获取后端地址
  const baseUrl = 'http://1.14.3.2:3001'; // TODO: 从配置文件读取

  // 构建打印页面URL
  const printUrl = `${baseUrl}/task-print.html?data=${encodeURIComponent(JSON.stringify(printData))}`;

  // 跳转到H5打印页面
  uni.navigateTo({
    url: `/pages/common/webview?url=${encodeURIComponent(printUrl)}`,
  });
};

// 打印标签
const printLabel = () => {
  if (!taskDetail.value) {
    uni.showToast({
      title: '数据加载中',
      icon: 'none',
    });
    return;
  }

  // 准备打印数据
  const printData = {
    recipeName: taskDetail.value.recipeName,
    totalProductionG: taskDetail.value.totalProductionG,
    createdAt: taskDetail.value.createdAt,
    orderItems: taskDetail.value.orderItems || [],
    recipeSnapshot: taskDetail.value.recipeSnapshot,
  };

  // 将数据编码后传递到标签打印页面
  const encodedData = encodeURIComponent(JSON.stringify(printData));

  uni.navigateTo({
    url: `/pages/staff-production/print-label?taskData=${encodedData}`,
  });
};
</script>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 140rpx;
}

.nav-bar {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-bottom: 1rpx solid #f0f0f0;

  .back-btn {
    font-size: 40rpx;
    color: #333;
    margin-right: 24rpx;
  }

  .nav-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }
}

.detail-content {
  padding-bottom: 120rpx;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 200rpx 0;
  font-size: 28rpx;
  color: #999;

  .error-icon {
    font-size: 100rpx;
    margin-bottom: 24rpx;
  }

  .retry-btn {
    margin-top: 40rpx;
    padding: 20rpx 48rpx;
    background-color: #56ab91;
    color: #fff;
    border: none;
    border-radius: 8rpx;
  }
}

.task-title-section {
  background-color: #fff;
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;

  .recipe-name {
    font-size: 36rpx;
    font-weight: bold;
    color: #333;
  }

  .pot-info {
    font-size: 28rpx;
    color: #56ab91;
    font-weight: bold;
  }

  .status-badge {
    display: inline-block;
    padding: 8rpx 24rpx;
    border-radius: 8rpx;
    font-size: 24rpx;
    font-weight: bold;

    &.pending {
      background-color: #fff3e0;
      color: #ff9800;
    }

    &.in_progress {
      background-color: #e3f2fd;
      color: #2196f3;
    }

    &.completed {
      background-color: #e8f5e9;
      color: #4caf50;
    }
  }
}

.section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;

  .photo-count {
    font-size: 24rpx;
    color: #56ab91;
    font-weight: normal;
  }
}

.info-row {
  display: flex;
  margin-bottom: 16rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .label {
    font-size: 26rpx;
    color: #666;
    min-width: 180rpx;
  }

  .value {
    font-size: 26rpx;
    color: #333;
    flex: 1;
  }
}

.order-item {
  padding: 16rpx;
  background-color: #f9f9f9;
  border-radius: 8rpx;
  margin-bottom: 12rpx;

  &:last-child {
    margin-bottom: 0;
  }

  .order-header {
    margin-bottom: 12rpx;
    padding-bottom: 8rpx;
    border-bottom: 1rpx solid #e0e0e0;

    .order-id {
      font-size: 24rpx;
      color: #999;
    }
  }

  .order-info {
    .info-row {
      margin-bottom: 8rpx;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }
}

.total-weight {
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed #e0e0e0;
  font-size: 26rpx;
  color: #56ab91;
  font-weight: bold;
  text-align: right;
}

.ingredients-list {
  margin-bottom: 16rpx;
}

.ingredient-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    border-bottom: none;
  }

  .ingredient-type {
    font-size: 22rpx;
    color: #56ab91;
    font-weight: bold;
    flex-shrink: 0;

    &.type-food {
      color: #56ab91;  // 绿色
    }

    &.type-supplement {
      color: #ff9800;  // 橙色
    }

    &.type-packaging {
      color: #2196f3;  // 蓝色
    }
  }

  .ingredient-name {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
    flex: 1;
  }

  .ingredient-method {
    font-size: 22rpx;
    color: #999;
    flex-shrink: 0;
    margin-left: auto;
  }
}

.ingredients-note {
  font-size: 22rpx;
  color: #999;
  margin-bottom: 12rpx;
}

.ingredients-summary {
  padding-top: 12rpx;
  border-top: 1rpx solid #e0e0e0;
  font-size: 24rpx;
  color: #56ab91;
  font-weight: bold;
}

.photos-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.photo-item {
  position: relative;
  width: 200rpx;
  height: 200rpx;
}

.photo-image {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}

.photo-delete {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 48rpx;
  height: 48rpx;
  background-color: #f44336;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 32rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.2);
}

.photo-upload {
  width: 200rpx;
  height: 200rpx;
  border: 2rpx dashed #ddd;
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: #fafafa;

  .upload-icon {
    font-size: 60rpx;
    color: #999;
    margin-bottom: 8rpx;
  }

  .upload-text {
    font-size: 22rpx;
    color: #999;
  }
}

.photos-hint {
  font-size: 22rpx;
  color: #999;
  text-align: center;
  margin-top: 8rpx;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 16rpx;
  padding: 24rpx 32rpx;
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1rpx solid #f0f0f0;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.04);

  .action-btn {
    flex: 1;
    padding: 24rpx;
    border-radius: 8rpx;
    font-size: 28rpx;
    font-weight: bold;
    border: none;

    &.upload {
      background-color: #56ab91;
      color: #fff;

      &[disabled] {
        background-color: #ccc;
        color: #999;
      }
    }

    &.complete {
      background-color: #4caf50;
      color: #fff;
    }
  }
}

.print-section {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 16rpx;
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-top: 1rpx solid #eee;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.05);
  z-index: 999;
}

.print-btn {
  flex: 1;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  font-weight: 500;
  border: none;

  &.primary {
    background-color: #56ab91;
    color: #fff;

    &:active {
      background-color: #4a9680;
    }
  }

  &.secondary {
    background-color: #fff;
    color: #1890ff;
    border: 2rpx solid #1890ff;

    &:active {
      background-color: #f0f9ff;
    }
  }
}
</style>
