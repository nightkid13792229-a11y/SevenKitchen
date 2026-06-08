<template>
  <view class="detail-page">
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
          <text class="label">本锅制作量：</text>
          <text class="value">{{ formatDecimal(taskDetail.totalProductionG) }}g</text>
        </view>
        <view class="info-row">
          <text class="label">关联订单：</text>
          <text class="value">{{ formatAssociatedOrderIds(taskDetail.orderItems) }}</text>
        </view>
        <view class="info-row">
          <text class="label">状态：</text>
          <text class="value">{{ statusText }}</text>
        </view>
        <view class="info-row">
          <text class="label">创建时间：</text>
          <text class="value">{{ taskDetail.createdAt }}</text>
        </view>
        <view v-if="taskDetail.status === 'COMPLETED' && taskDetail.completedAt" class="info-row">
          <text class="label">完成时间：</text>
          <text class="value">{{ taskDetail.completedAt }}</text>
        </view>
      </view>

      <!-- 订单分装信息（按订单展示） -->
      <view class="section">
        <view class="section-title">订单分装信息</view>
        <view v-for="order in taskDetail.orderItems" :key="order.orderItemId" class="order-item">
          <view class="order-header">
            <text class="order-id">订单 {{ formatShortOrderId(order.orderId) }}</text>
          </view>
          <view class="order-info">
            <view class="info-row">
              <text class="label">订单总净重：</text>
              <text class="value">{{ formatDecimal(getOrderTotalNetWeight(order)) }}g</text>
            </view>
            <view v-if="hasPackagePlan(order)" class="info-row">
              <text class="label">订单分装：</text>
              <text class="value package-plan-text">{{ formatPackagePlan(order) }}</text>
            </view>
            <template v-else>
              <view class="info-row">
                <text class="label">订单规格：</text>
                <text class="value">{{ order.packageSpecG }}g/袋</text>
              </view>
              <view class="info-row">
                <text class="label">订单袋数：</text>
                <text class="value">{{ order.packageCount }}袋</text>
              </view>
            </template>
            <view class="info-row">
              <text class="label">狗狗：</text>
              <text class="value">{{ order.dogName }}</text>
            </view>
            <view v-if="order.recipientName" class="info-row">
              <text class="label">收货人：</text>
              <text class="value">{{ order.recipientName }}（{{ order.recipientCity }}）</text>
            </view>
            <view v-if="order.adminRemark" class="info-row">
              <text class="label">备注：</text>
              <text class="value remark-text">{{ order.adminRemark }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 完成后的生产结果 -->
      <view v-if="taskDetail.status === 'COMPLETED'" class="section">
        <view class="section-title">生产结果</view>
        <view class="result-panel" :class="resultStatusClass">
          <view class="result-header">
            <text class="result-title">{{ resultStatusText }}</text>
            <text v-if="resultDeltaText" class="result-delta">{{ resultDeltaText }}</text>
          </view>
          <view class="info-row">
            <text class="label">计划产出：</text>
            <text class="value">{{ formatDecimal(taskDetail.totalProductionG) }}g</text>
          </view>
          <view class="info-row">
            <text class="label">实际产出：</text>
            <text class="value">{{ formatDecimal(taskDetail.actualOutputG || taskDetail.totalProductionG) }}g</text>
          </view>
        </view>

        <view v-if="resultPhotos.length > 0" class="result-photos">
          <view class="result-photo-title">生产照片</view>
          <view class="photos-preview">
            <view v-for="(photo, index) in resultPhotos" :key="'result-'+index" class="photo-item">
              <image :src="photo" mode="aspectFill" class="photo-image" @tap="previewPhoto(photo)" />
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
            <view class="ingredient-main">
              <text class="ingredient-name">{{ ingredient.name }} {{ ingredient.amount }}{{ ingredient.unit }}</text>
              <text v-if="ingredient.standardIngredientName" class="ingredient-standard-name">标准：{{ ingredient.standardIngredientName }}</text>
            </view>
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
          <text class="photo-count">当前：{{ totalPhotoCount }}/3</text>
        </view>

        <!-- 照片预览区 -->
        <view class="photos-preview">
          <!-- 已上传的照片 -->
          <view v-for="(photo, index) in uploadedPhotos" :key="'uploaded-'+index" class="photo-item">
            <image :src="photo" mode="aspectFill" class="photo-image" @tap="previewPhoto(photo)" />
            <view class="photo-delete" @tap="deletePhoto(index)">
              <text>×</text>
            </view>
          </view>

          <!-- 正在上传的照片 -->
          <view v-for="(task, index) in uploadingPhotos" :key="'uploading-'+task.id" class="photo-item photo-uploading">
            <image :src="task.file" mode="aspectFill" class="photo-image uploading-placeholder" />
            <view class="uploading-overlay">
              <text class="uploading-text">上传中...</text>
            </view>
          </view>

          <!-- 上传失败的照片 -->
          <view v-for="(task, index) in uploadingPhotos.filter(t => t.status === 'error')" :key="'error-'+task.id" class="photo-item">
            <image :src="task.file" mode="aspectFill" class="photo-image error-placeholder" />
            <view class="error-overlay">
              <text class="error-text">{{ task.error || '上传失败' }}</text>
              <view class="retry-btn" @tap="retryUpload(task)">
                <text>重试</text>
              </view>
            </view>
          </view>

          <!-- 上传按钮（未满3张时显示） -->
          <view v-if="canUploadMore" class="photo-upload" @tap="choosePhoto">
            <text class="upload-icon">+</text>
            <text class="upload-text">上传照片</text>
          </view>
        </view>

        <view class="photos-hint">
          <text>支持从相册选择或拍照，自动压缩到200KB以内</text>
        </view>

        <!-- 确认完成区域 -->
        <view class="complete-section">
          <view class="completion-panel">
            <view class="completion-title">生产结果</view>
            <view class="completion-options">
              <view
                class="completion-option"
                :class="{ active: completionResultStatus === 'NORMAL' }"
                @tap="selectCompletionResult('NORMAL')"
              >
                <text>正常完成</text>
              </view>
              <view
                class="completion-option"
                :class="{ active: completionResultStatus === 'SURPLUS' }"
                @tap="selectCompletionResult('SURPLUS')"
              >
                <text>有余量</text>
              </view>
              <view
                class="completion-option"
                :class="{ active: completionResultStatus === 'SHORTAGE' }"
                @tap="selectCompletionResult('SHORTAGE')"
              >
                <text>有缺口</text>
              </view>
            </view>
            <view v-if="completionResultStatus !== 'NORMAL'" class="completion-input-row">
              <text class="completion-input-label">{{ completionInputLabel }}</text>
              <input
                v-model="completionDeltaG"
                class="completion-input"
                type="digit"
                :placeholder="completionInputPlaceholder"
                placeholder-class="completion-placeholder"
              />
              <text class="completion-input-unit">g</text>
            </view>
          </view>
          <button
            class="complete-btn"
            :disabled="!canSubmitCompletion"
            @tap="completeTask"
          >
            {{ completeButtonText }}
          </button>
        </view>
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
  completeProductionTask,
  deleteProductionPhoto,
  type CompleteProductionTaskPayload,
  type ProductionResultStatus,
} from './api/production';
import { getBaseUrl } from '../../utils/config';
import { calculateSupplementAmountForProduction } from '../../utils/supplement-nutrients';

// 格式化函数
function formatDecimal(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

function normalizePackagePlanRows(
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
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

function hasPackagePlan(order: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
}): boolean {
  return normalizePackagePlanRows(order.packagePlan).length > 0;
}

function formatPackagePlan(order: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  packageSpecG?: number
  packageCount?: number
}): string {
  const rows = normalizePackagePlanRows(order.packagePlan);
  if (rows.length > 0) {
    return rows
      .map((row) => `${row.packageSpecG}g×${row.packageCount}袋`)
      .join('，');
  }

  return `${order.packageSpecG || 0}g×${order.packageCount || 0}袋`;
}

function getOrderTotalNetWeight(order: {
  packagePlan?: Array<{ packageSpecG: number; packageCount: number }>
  packageSpecG?: number
  packageCount?: number
}): number {
  const rows = normalizePackagePlanRows(order.packagePlan);
  if (rows.length > 0) {
    return rows.reduce((sum, row) => sum + row.packageSpecG * row.packageCount, 0);
  }

  return Number(order.packageSpecG || 0) * Number(order.packageCount || 0);
}

function formatShortOrderId(orderId?: string): string {
  if (!orderId) return '-';
  if (orderId.length <= 12) return orderId;
  return `${orderId.slice(0, 8)}...${orderId.slice(-4)}`;
}

function formatAssociatedOrderIds(orderItems?: Array<{ orderId?: string }>): string {
  const orderIds = Array.from(
    new Set(
      (orderItems || [])
        .map((order) => order.orderId)
        .filter((orderId): orderId is string => Boolean(orderId)),
    ),
  );

  if (orderIds.length === 0) return '-';
  return orderIds.map(formatShortOrderId).join('、');
}

function formatIngredientDisplayName(item: any): string {
  return (
    item?.procurementSkuName ||
    item?.procurement_sku_name ||
    item?.properties?.procurement_sku_name ||
    item?.name ||
    '-'
  );
}

// 上传任务接口
interface UploadTask {
  id: number;
  file: string;
  status: 'uploading' | 'error';
  progress: number;
  error?: string;
}

// 任务ID
const taskId = ref('');

// 加载状态
const loading = ref(true);

// 任务详情
const taskDetail = ref<any>(null);

// 已上传的照片
const uploadedPhotos = ref<string[]>([]);

// 正在上传的照片任务
const uploadingPhotos = ref<UploadTask[]>([]);

// 完成操作进行中状态
const isCompleting = ref(false);

// 生产完成结果
const completionResultStatus = ref<ProductionResultStatus>('NORMAL');
const completionDeltaG = ref('');

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
      const supplementAmount = calculateSupplementAmountForProduction(item, theoreticalWeight);
      amount = supplementAmount.amount;
      unit = supplementAmount.unit;
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

    const standardIngredientName = item.standardIngredientName || item.name || '';
    const procurementSkuName =
      item.procurementSkuName ||
      item.procurement_sku_name ||
      item.properties?.procurement_sku_name ||
      '';

    return {
      id: item.ingredient_id,
      name: formatIngredientDisplayName(item),
      standardIngredientName:
        procurementSkuName && standardIngredientName && procurementSkuName !== standardIngredientName
          ? standardIngredientName
          : '',
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

// 计算属性：是否有正在上传的照片
const isUploading = computed(() => {
  return uploadingPhotos.value.some(task => task.status === 'uploading');
});

// 计算属性：是否可以上传更多照片
const canUploadMore = computed(() => {
  const totalPhotos = uploadedPhotos.value.length + uploadingPhotos.value.length;
  return totalPhotos < 3;
});

// 计算属性：总照片数（包括正在上传的）
const totalPhotoCount = computed(() => {
  return uploadedPhotos.value.length + uploadingPhotos.value.length;
});

const completionDeltaValue = computed(() => {
  const value = Number(completionDeltaG.value);
  return Number.isFinite(value) ? value : 0;
});

const completionInputLabel = computed(() => {
  return completionResultStatus.value === 'SURPLUS' ? '余量' : '缺口';
});

const completionInputPlaceholder = computed(() => {
  return completionResultStatus.value === 'SURPLUS'
    ? '请输入剩余成品重量'
    : '请输入不足成品重量';
});

const hasValidCompletionResult = computed(() => {
  if (completionResultStatus.value === 'NORMAL') {
    return true;
  }
  return completionDeltaValue.value > 0;
});

const canSubmitCompletion = computed(() => {
  return totalPhotoCount.value >= 2 && hasValidCompletionResult.value && !isCompleting.value;
});

const completeButtonText = computed(() => {
  if (isCompleting.value) return '提交中...';
  if (totalPhotoCount.value < 2) return '请至少上传2张照片';
  if (!hasValidCompletionResult.value) return `请输入${completionInputLabel.value}克数`;
  return '完成制作任务';
});

const resultStatusText = computed(() => {
  if (!taskDetail.value) return '';
  const statusMap: Record<string, string> = {
    NORMAL: '正常完成',
    SURPLUS: '有余量',
    SHORTAGE: '有缺口',
  };
  return statusMap[taskDetail.value.resultStatus || 'NORMAL'] || '正常完成';
});

const resultDeltaText = computed(() => {
  if (!taskDetail.value) return '';
  if (taskDetail.value.resultStatus === 'SURPLUS') {
    return `余量 ${formatDecimal(Number(taskDetail.value.surplusG || 0))}g`;
  }
  if (taskDetail.value.resultStatus === 'SHORTAGE') {
    return `缺口 ${formatDecimal(Number(taskDetail.value.shortageG || 0))}g`;
  }
  return '';
});

const resultStatusClass = computed(() => {
  const status = taskDetail.value?.resultStatus || 'NORMAL';
  return `result-${String(status).toLowerCase()}`;
});

const resultPhotos = computed(() => {
  const explicitPhotos = taskDetail.value?.resultPhotoUrls || [];
  if (explicitPhotos.length > 0) return explicitPhotos;
  return taskDetail.value?.photosRaw || [];
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

// 选择照片（立即上传模式）
const choosePhoto = async () => {
  // 检查是否有正在上传的照片
  if (isUploading.value) {
    uni.showToast({
      title: '照片上传中，请稍候',
      icon: 'none',
    });
    return;
  }

  // 检查是否已达到3张照片上限
  if (totalPhotoCount.value >= 3) {
    uni.showToast({
      title: '最多上传3张照片',
      icon: 'none',
    });
    return;
  }

  try {
    // 计算还可以选择多少张照片
    const maxCount = 3 - totalPhotoCount.value;

    // 选择照片
    const res = await uni.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sizeType: ['compressed'], // 自动压缩
      sourceType: ['album', 'camera'], // 相册和相机
    });

    // 处理用户取消选择的情况
    if (!res.tempFiles || res.tempFiles.length === 0) {
      return;
    }

    // 逐个处理照片：压缩并立即上传
    for (let i = 0; i < res.tempFiles.length; i++) {
      const tempFile = res.tempFiles[i];

      try {
        // 压缩照片
        const compressRes = await uni.compressImage({
          src: tempFile.tempFilePath,
          quality: 80, // 压缩质量
          compressedWidth: 1280, // 最大宽度
        });

        // 创建上传任务对象
        const taskId = Date.now() + i;
        const uploadTask: UploadTask = {
          id: taskId,
          file: compressRes.tempFilePath,
          status: 'uploading',
          progress: 0,
        };

        // 添加到上传中列表
        uploadingPhotos.value.push(uploadTask);

        // 立即开始上传
        await uploadSinglePhoto(uploadTask);
      } catch (error: any) {
        console.error('[ChoosePhoto] Process photo failed:', error);
        uni.showToast({
          title: error.message || '处理照片失败',
          icon: 'none',
        });
      }
    }
  } catch (error: any) {
    // 处理用户取消选择和其他错误
    if (error.errMsg && !error.errMsg.includes('cancel')) {
      console.error('[ChoosePhoto] Choose photo failed:', error);
      uni.showToast({
        title: error.message || '选择照片失败',
        icon: 'none',
      });
    }
  }
};

// 上传单张照片
const uploadSinglePhoto = async (task: UploadTask) => {
  try {
    const token = uni.getStorageSync('token');
    const baseUrl = getBaseUrl();

    const uploadRes = await uni.uploadFile({
      url: `${baseUrl}/staff/production/packaging-units/${taskId.value}/photos`,
      filePath: task.file,
      name: 'files',
      header: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // 解析响应
    if (uploadRes.statusCode === 200 || uploadRes.statusCode === 201) {
      const response = JSON.parse(uploadRes.data);
      if (response.code === 0) {
        // 上传成功，从上传中列表移除
        const taskIndex = uploadingPhotos.value.findIndex(t => t.id === task.id);
        if (taskIndex !== -1) {
          uploadingPhotos.value.splice(taskIndex, 1);
        }

        // 更新已上传列表（使用后端返回的完整照片列表）
        uploadedPhotos.value = response.data.photosRaw || [];

        console.log('[UploadSinglePhoto] Updated photos:', uploadedPhotos.value);

        uni.showToast({
          title: '上传成功',
          icon: 'success',
          duration: 1500,
        });
      } else {
        throw new Error(response.message || '上传失败');
      }
    } else {
      throw new Error(`上传失败: ${uploadRes.statusCode}`);
    }
  } catch (error: any) {
    console.error('[UploadSinglePhoto] Upload failed:', error);

    // 详细错误信息（用于调试）
    const detailedError = {
      message: error.message || '未知错误',
      errMsg: error.errMsg,
      statusCode: error.statusCode,
      data: error.data,
    };
    console.error('[UploadSinglePhoto] Detailed error:', JSON.stringify(detailedError, null, 2));

    // 更新任务状态为错误
    const taskIndex = uploadingPhotos.value.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      uploadingPhotos.value[taskIndex].status = 'error';
      // 显示更详细的错误信息
      const errorMsg = error.message || error.errMsg || '上传失败';
      uploadingPhotos.value[taskIndex].error = errorMsg;
    }

    // 显示详细错误提示（至少显示3秒）
    uni.showToast({
      title: error.message || error.errMsg || '上传失败，请重试',
      icon: 'none',
      duration: 3000,
    });
  }
};

// 预览照片
const previewPhoto = (url: string) => {
  uni.previewImage({
    urls: [url],
  });
};

// 删除照片
const deletePhoto = async (index: number) => {
  uni.showModal({
    title: '确认删除',
    content: '确认删除这张照片？',
    success: async (res) => {
      if (res.confirm) {
        try {
          const photoUrl = uploadedPhotos.value[index];

          // 调用后端API删除照片（同时删除数据库和COS存储桶中的文件）
          await deleteProductionPhoto(taskId.value, photoUrl);

          // 从本地状态中移除
          uploadedPhotos.value.splice(index, 1);

          uni.showToast({
            title: '删除成功',
            icon: 'success',
          });
        } catch (error: any) {
          console.error('[DeletePhoto] Delete failed:', error);
          uni.showToast({
            title: error.message || '删除失败',
            icon: 'none',
          });
        }
      }
    },
  });
};

// 重试上传失败的照片
const retryUpload = async (task: UploadTask) => {
  // 重置任务状态为上传中
  const taskIndex = uploadingPhotos.value.findIndex(t => t.id === task.id);
  if (taskIndex !== -1) {
    uploadingPhotos.value[taskIndex].status = 'uploading';
    uploadingPhotos.value[taskIndex].error = undefined;
  }

  // 重新上传
  await uploadSinglePhoto(task);
};

const selectCompletionResult = (status: ProductionResultStatus) => {
  completionResultStatus.value = status;
  if (status === 'NORMAL') {
    completionDeltaG.value = '';
  }
};

const buildCompletionPayload = (): CompleteProductionTaskPayload => {
  const payload: CompleteProductionTaskPayload = {
    resultStatus: completionResultStatus.value,
    resultPhotoUrls: uploadedPhotos.value,
  };

  if (completionResultStatus.value === 'SURPLUS') {
    payload.surplusG = completionDeltaValue.value;
  }
  if (completionResultStatus.value === 'SHORTAGE') {
    payload.shortageG = completionDeltaValue.value;
  }

  return payload;
};

const completionConfirmText = computed(() => {
  if (completionResultStatus.value === 'NORMAL') {
    return '确认完成制作任务？';
  }
  return `确认记录${completionInputLabel.value}${completionDeltaValue.value}g，并完成制作任务？`;
});

// 完成制作
const completeTask = async () => {
  if (!canSubmitCompletion.value) {
    uni.showToast({
      title: completeButtonText.value,
      icon: 'none',
    });
    return;
  }

  uni.showModal({
    title: '确认完成',
    content: completionConfirmText.value,
    success: async (res) => {
      if (!res.confirm) return;

      isCompleting.value = true;
      uni.showLoading({ title: '提交中...' });

      try {
        await completeProductionTask(taskId.value, buildCompletionPayload());
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
      } finally {
        isCompleting.value = false;
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
    createdBy: taskDetail.value.createdBy || '厨房管理员',
  };

  // 将数据编码后传递到打印页面
  const encodedData = encodeURIComponent(JSON.stringify(printData));

  // 跳转到原生打印页面
  uni.navigateTo({
    url: `/pages/staff-production/print-task?taskData=${encodedData}`,
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
  padding-bottom: 120rpx; // 为打印按钮留出空间
}

.detail-content {
  padding-bottom: 100rpx; // 为打印按钮留出空间
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
    min-width: 0;
    word-break: break-word;
  }

  .remark-text {
    word-break: break-all;
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

.result-panel {
  border: 2rpx solid #e5e5e5;
  border-radius: 8rpx;
  padding: 20rpx;
  background-color: #fafafa;
  margin-bottom: 20rpx;

  &.result-normal {
    border-color: #d9e8e2;
    background-color: #f7fbf9;
  }

  &.result-surplus {
    border-color: #bfe5ce;
    background-color: #f1fbf5;

    .result-delta {
      color: #2e9f59;
    }
  }

  &.result-shortage {
    border-color: #ffd3d3;
    background-color: #fff7f7;

    .result-delta {
      color: #d63f3f;
    }
  }
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.result-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #333;
}

.result-delta {
  font-size: 28rpx;
  font-weight: 700;
  white-space: nowrap;
}

.result-photo-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #666;
  margin-bottom: 12rpx;
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

  .ingredient-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  .ingredient-name {
    font-size: 28rpx;
    color: #333;
    font-weight: 500;
    word-break: break-all;
  }

  .ingredient-standard-name {
    font-size: 22rpx;
    color: #999;
    word-break: break-all;
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

  &.uploading-placeholder {
    opacity: 0.6;
  }

  &.error-placeholder {
    opacity: 0.5;
    filter: grayscale(100%);
  }
}

.photo-uploading {
  .uploading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: 8rpx;
    display: flex;
    align-items: center;
    justify-content: center;

    .uploading-text {
      color: #fff;
      font-size: 24rpx;
    }
  }
}

.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(244, 67, 54, 0.9);
  border-radius: 8rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;

  .error-text {
    color: #fff;
    font-size: 22rpx;
    text-align: center;
    padding: 0 8rpx;
  }

  .retry-btn {
    padding: 8rpx 24rpx;
    background-color: #fff;
    border-radius: 8rpx;

    text {
      color: #f44336;
      font-size: 22rpx;
      font-weight: bold;
    }
  }
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

.complete-section {
  margin-top: 24rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f0f0f0;
}

.completion-panel {
  margin-bottom: 24rpx;
}

.completion-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #333;
  margin-bottom: 16rpx;
}

.completion-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.completion-option {
  height: 72rpx;
  border: 2rpx solid #d9e8e2;
  border-radius: 8rpx;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;

  text {
    font-size: 26rpx;
    color: #45645a;
    white-space: nowrap;
  }

  &.active {
    background-color: #56ab91;
    border-color: #56ab91;

    text {
      color: #fff;
      font-weight: 600;
    }
  }
}

.completion-input-row {
  margin-top: 16rpx;
  height: 80rpx;
  padding: 0 20rpx;
  border: 2rpx solid #e5e5e5;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  background-color: #fafafa;
}

.completion-input-label {
  font-size: 26rpx;
  color: #666;
  margin-right: 16rpx;
  flex-shrink: 0;
}

.completion-input {
  flex: 1;
  min-width: 0;
  height: 72rpx;
  font-size: 28rpx;
  color: #333;
}

.completion-input-unit {
  font-size: 26rpx;
  color: #999;
  margin-left: 12rpx;
  flex-shrink: 0;
}

.completion-placeholder {
  color: #bbb;
  font-size: 26rpx;
}

.complete-btn {
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

  &[disabled] {
    background-color: #ccc;
    color: #999;
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
