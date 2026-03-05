<template>
  <view
    class="print-label-page"
    :style="{ '--status-bar-height': statusBarHeight + 'px' }"
  >
    <!-- 状态栏占位 -->
    <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- 顶部导航 -->
    <view class="nav-bar" :style="{ top: statusBarHeight + 'px' }">
      <view class="back-btn" @tap="goBack">返回</view>
      <text class="title">打印产品标签</text>
      <view class="placeholder"></view>
    </view>

    <!-- 打印设置 -->
    <view class="print-settings">
      <view class="section-title">打印设置</view>

      <view class="setting-row">
        <text class="label">打印机：</text>
        <text class="value">{{ printerName || '未连接' }}</text>
        <button class="search-btn" @tap="connectPrinter">搜索</button>
      </view>

      <!-- 打印机列表（直接在打印机字段下方显示） -->
      <view v-if="showPrinterList" class="printer-list-inline">
        <view class="printer-list-header">
          <text class="close-btn" @tap="closePrinterList">×</text>
        </view>
        <scroll-view scroll-y class="printer-list" :style="{ maxHeight: '300px' }">
          <view
            v-for="(printer, index) in availablePrinters"
            :key="index"
            class="printer-item"
            @tap="selectPrinter(printer)"
          >
            <view class="printer-info">
              <text class="printer-name">{{ printer.name || '未命名设备' }}</text>
              <text class="printer-device-id">设备ID: {{ printer.deviceId || '未知' }}</text>
            </view>
            <text class="select-icon">→</text>
          </view>
        </scroll-view>
      </view>
    </view>

    <!-- 订单列表 -->
    <view class="orders-list">
      <view class="section-title">
        订单列表（{{ orders.length }}个）
        <text v-if="isBatchMode" class="batch-badge">批量模式：包含{{ batchCount }}个批次</text>
      </view>

      <!-- 批次分组显示 -->
      <view v-if="isBatchMode" class="batch-groups">
        <view v-for="(batch, batchIndex) in batchGroups" :key="batch.batchId" class="batch-group">
          <view class="batch-header">
            <text class="batch-title">{{ batch.batchCode || `批次${batchIndex + 1}` }}</text>
            <text v-if="batch.isCurrentBatch" class="current-badge">当前批次</text>
          </view>

          <view v-for="(order, orderIndex) in batch.orderItems" :key="order.orderItemId" class="order-card">
            <view class="order-header">
              <text class="order-index">订单 {{ orderIndex + 1 }}</text>
              <view class="header-buttons">
                <button class="preview-btn" @tap="previewLabel(order)">预览</button>
                <button class="print-btn" @tap="printSingleOrder(order)">打印</button>
              </view>
            </view>

            <view class="order-content">
              <view class="order-info">
                <view class="info-row">
                  <text class="label">狗狗：</text>
                  <text class="value">{{ order.dogName }}</text>
                </view>
                <view class="info-row">
                  <text class="label">食谱：</text>
                  <text class="value">{{ order.recipeName }}</text>
                </view>

                <!-- 可编辑：重量规格 -->
                <view class="info-row editable-row">
                  <text class="label">规格：</text>
                  <input
                    v-model.number="order.packageSpecG"
                    type="number"
                    class="edit-input"
                    @blur="onFieldChange(order)"
                  />
                  <text class="unit">g/袋 ×</text>
                  <input
                    v-model.number="order.packageCount"
                    type="number"
                    class="edit-input"
                    @blur="onFieldChange(order)"
                  />
                  <text class="unit">袋</text>
                </view>

                <!-- 可编辑：制作日期 -->
                <view class="info-row editable-row">
                  <text class="label">制作日期：</text>
                  <picker
                    mode="date"
                    :value="order.productionDate"
                    @change="onDateChange($event, order)"
                    class="date-picker"
                  >
                    <view class="picker-value">
                      {{ order.productionDate || '选择日期' }}
                    </view>
                  </picker>
                </view>
              </view>
            </view>

            <view class="print-count-config">
              <text class="label">打印份数：</text>
              <view class="counter">
                <button class="counter-btn" @tap="decreaseCount(getGlobalIndex(batchIndex, orderIndex))">-</button>
                <input v-model="order.printCount" type="number" class="counter-input" />
                <button class="counter-btn" @tap="increaseCount(getGlobalIndex(batchIndex, orderIndex))">+</button>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 原有的单批次显示（非批量模式） -->
      <view v-else>
        <view v-for="(order, index) in orders" :key="order.orderItemId" class="order-card">
          <view class="order-header">
            <text class="order-index">订单 {{ index + 1 }}</text>
            <view class="header-buttons">
              <button class="preview-btn" @tap="previewLabel(order)">预览</button>
              <button class="print-btn" @tap="printSingleOrder(order)">打印</button>
            </view>
          </view>

          <view class="order-content">
            <view class="order-info">
              <view class="info-row">
                <text class="label">狗狗：</text>
                <text class="value">{{ order.dogName }}</text>
              </view>
              <view class="info-row">
                <text class="label">食谱：</text>
                <text class="value">{{ order.recipeName }}</text>
              </view>

              <!-- 可编辑：重量规格 -->
              <view class="info-row editable-row">
                <text class="label">规格：</text>
                <input
                  v-model.number="order.packageSpecG"
                  type="number"
                  class="edit-input"
                  @blur="onFieldChange(order)"
                />
                <text class="unit">g/袋 ×</text>
                <input
                  v-model.number="order.packageCount"
                  type="number"
                  class="edit-input"
                  @blur="onFieldChange(order)"
                />
                <text class="unit">袋</text>
              </view>

              <!-- 可编辑：制作日期 -->
              <view class="info-row editable-row">
                <text class="label">制作日期：</text>
                <picker
                  mode="date"
                  :value="order.productionDate"
                  @change="onDateChange($event, order)"
                  class="date-picker"
                >
                  <view class="picker-value">
                    {{ order.productionDate || '选择日期' }}
                  </view>
                </picker>
              </view>
            </view>
          </view>

          <view class="print-count-config">
            <text class="label">打印份数：</text>
            <view class="counter">
              <button class="counter-btn" @tap="decreaseCount(index)">-</button>
              <input v-model="order.printCount" type="number" class="counter-input" />
              <button class="counter-btn" @tap="increaseCount(index)">+</button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 隐藏的Canvas用于绘制 -->
    <canvas
      canvas-id="labelCanvas"
      :style="{ width: CANVAS_WIDTH + 'px', height: CANVAS_HEIGHT + 'px', position: 'fixed', left: '-9999px' }"
    ></canvas>

    <!-- 预览弹窗 -->
    <uni-popup ref="previewPopup" type="center" class="preview-popup-wrapper">
      <view class="preview-popup">
        <image v-if="previewImage" :src="previewImage" mode="widthFix" class="preview-image" />
      </view>
    </uni-popup>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, getCurrentInstance } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import jcPrinter from '../../utils/jcing-printer';
import {
  drawProductionLabel,
  drawProductionLabelWithJCSDK,
  formatIngredients,
  getShelfLifeText,
  type LabelData
} from '../../utils/label-renderer';
import {
  loadHealthTagMapping,
  getLifeStageLabel,
  getHealthTagLabel
} from '../../utils/label-mapping';
import { getRecipeBatchesWithOrders } from '../../api/production';
import { generateLabelImage, type LabelData as ApiLabelData } from '../../api/label';

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 800;

// 状态栏高度
const statusBarHeight = ref(0);

// 获取当前组件实例(在setup阶段)
const currentInstance = getCurrentInstance();

// 获取状态栏高度
onMounted(() => {
  const systemInfo = uni.getSystemInfoSync();
  statusBarHeight.value = systemInfo.statusBarHeight || 0;
});

// 订单数据
interface OrderPrintConfig {
  orderItemId: string;
  orderId: string;
  dogName: string;
  recipeName: string;
  packageSpecG: number;
  packageCount: number;
  printCount: number;
  recipeSnapshot: any;
  createdAt: string;

  // 可编辑字段
  productionDate?: string;          // 制作日期
}

const orders = ref<OrderPrintConfig[]>([]);

// 批量模式相关
const isBatchMode = ref(false);  // 是否为批量模式
const batchGroups = ref<Array<{
  batchId: string;
  batchCode?: string;
  productionDate: string;
  isCurrentBatch: boolean;
  orderItems: OrderPrintConfig[];
}>>([]);

// 批次数量
const batchCount = computed(() => batchGroups.value.length);

// 打印机状态
const printerName = ref('');

// 预览相关
const previewImage = ref('');
const previewPopup = ref<any>(null);

// 打印机列表相关
const availablePrinters = ref<any[]>([]);
const showPrinterList = ref(false);

// 总打印数量
const totalPrintCount = computed(() => {
  return orders.value.reduce((sum, order) => sum + (order.printCount || 0), 0);
});

// 页面加载
onLoad(async (options: any) => {
  console.log('[PrintLabel] 页面加载，参数:', options);

  // 加载标签映射表
  loadHealthTagMapping();

  if (options.taskData) {
    try {
      const taskData = JSON.parse(decodeURIComponent(options.taskData));

      // 检查是否需要启用批量模式
      const recipeId = taskData.recipeSnapshot?.id;
      const recipeVersion = taskData.recipeSnapshot?.version;

      if (recipeId) {
        // 尝试加载该食谱的所有批次
        await loadAllBatchesForRecipe(recipeId, recipeVersion, taskData);
      } else {
        // 没有recipeId，使用原有逻辑
        initializeOrders(taskData);
      }
    } catch (error) {
      console.error('[PrintLabel] 解析任务数据失败:', error);
      uni.showToast({
        title: '数据加载失败',
        icon: 'none'
      });
    }
  }
});

/**
 * 加载该食谱的所有批次
 */
async function loadAllBatchesForRecipe(
  recipeId: string,
  recipeVersion: number,
  currentTaskData: any
) {
  try {
    uni.showLoading({ title: '加载批次信息...' });

    // 获取今天的日期
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // 调用API获取所有批次
    const response = await getRecipeBatchesWithOrders({
      recipeId,
      recipeVersion,
      targetDate: today
    });

    uni.hideLoading();

    if (response.code === 0 && response.data.batches.length > 0) {
      // 有多个批次，启用批量模式
      isBatchMode.value = true;
      batchGroups.value = response.data.batches;

      // 展平所有订单到orders数组
      const allOrders: OrderPrintConfig[] = [];
      const todayDate = `${year}-${month}-${day}`;

      for (const batch of response.data.batches) {
        const batchOrders = batch.orderItems.map((item: any) => ({
          orderItemId: item.orderItemId,
          orderId: item.orderId,
          dogName: item.dogName || '未知',
          recipeName: item.recipeName || '未知食谱',
          packageSpecG: item.packageSpecG || 500,
          packageCount: item.packageCount || 1,
          printCount: 2,
          recipeSnapshot: item.recipeSnapshot,
          createdAt: item.createdAt,
          productionDate: todayDate
        }));

        allOrders.push(...batchOrders);
      }

      orders.value = allOrders;

      console.log(`[PrintLabel] 批量模式：加载了${response.data.batches.length}个批次，共${allOrders.length}个订单`);
    } else {
      // 只有一个批次或没有其他批次，使用原有逻辑
      isBatchMode.value = false;
      initializeOrders(currentTaskData);
    }
  } catch (error) {
    uni.hideLoading();
    console.error('[PrintLabel] 加载批次信息失败:', error);

    // 失败时使用原有逻辑
    isBatchMode.value = false;
    initializeOrders(currentTaskData);
  }
}

// 初始化订单列表
function initializeOrders(taskData: any) {
  if (!taskData.orderItems || !Array.isArray(taskData.orderItems)) {
    console.error('[PrintLabel] 无效的订单数据');
    return;
  }

  // 获取当前日期作为默认制作日期
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  orders.value = taskData.orderItems.map((item: any) => ({
    orderItemId: item.orderItemId || '',
    orderId: item.orderId || '',
    dogName: item.dogName || '未知',
    recipeName: taskData.recipeName || '未知食谱',
    packageSpecG: item.packageSpecG || 500,
    packageCount: item.packageCount || 1,
    printCount: 2, // 默认打印2份
    recipeSnapshot: taskData.recipeSnapshot,
    createdAt: taskData.createdAt || new Date().toISOString(),

    // 新增字段：默认值
    productionDate: today
  }));

  console.log('[PrintLabel] 订单列表初始化完成，共', orders.value.length, '个订单');
}

/**
 * 获取全局索引（用于批量模式下的打印份数调整）
 */
function getGlobalIndex(batchIndex: number, orderIndex: number): number {
  let globalIndex = 0;
  for (let i = 0; i < batchIndex; i++) {
    globalIndex += batchGroups.value[i].orderItems.length;
  }
  return globalIndex + orderIndex;
}

// 自动连接打印机
async function autoConnectPrinter() {
  const connected = await jcPrinter.autoConnect();
  if (connected) {
    printerName.value = jcPrinter.getConnName();
    console.log('[PrintLabel] 自动连接打印机成功:', printerName.value);
  }
}

// 连接打印机
async function connectPrinter() {
  try {
    console.log('[PrintLabel] 开始连接打印机流程');

    // 直接搜索打印机（SDK会自动处理蓝牙初始化）
    const printers = await jcPrinter.scanPrinter();

    if (printers.length === 0) {
      // 显示配对指导弹窗
      showPairingGuide();
      return;
    }

    // 保存打印机列表
    availablePrinters.value = printers;

    if (printers.length === 1) {
      // 只有一台打印机，直接连接
      const success = await jcPrinter.connect(printers[0].name);
      if (success) {
        printerName.value = printers[0].name;
      }
    } else {
      // 多台打印机，显示选择列表
      showPrinterListFunc();
    }
  } catch (error) {
    console.error('[PrintLabel] ✗ 连接打印机失败:', error);

    // 检查是否是蓝牙权限问题
    const errorMessage = (error as any)?.errMsg || String(error);
    if (errorMessage.includes('bluetooth') || errorMessage.includes('蓝牙') ||
        errorMessage.includes('permission') || errorMessage.includes('auth')) {
      uni.showModal({
        title: '蓝牙权限未开启',
        content: '请确保：\n1. 手机蓝牙已开启\n2. 微信有蓝牙使用权限\n\n设置路径：\n微信 → 我 → 设置 → 通用 → 蓝牙',
        showCancel: false
      });
    } else {
      uni.showToast({
        title: '连接失败',
        icon: 'none'
      });
    }
  }
}

// 显示打印机列表
function showPrinterListFunc() {
  showPrinterList.value = true;
}

// 关闭打印机列表
function closePrinterList() {
  showPrinterList.value = false;
}

// 选择打印机
async function selectPrinter(printer: any) {
  closePrinterList();  // 使用专门的关闭函数

  const success = await jcPrinter.connect(printer.name);
  if (success) {
    printerName.value = printer.name;
    uni.showToast({
      title: '连接成功',
      icon: 'success',
      duration: 2000
    });
  } else {
    uni.showToast({
      title: '连接失败',
      icon: 'none',
      duration: 2000
    });
  }
}

// 显示配对指导
function showPairingGuide() {
  uni.showModal({
    title: '未搜索到打印机',
    content: '请检查以下项目：\n\n1. 打印机电源\n   - 确保打印机已开机（按住左侧电源键）\n   - 绿灯常亮表示已开机\n\n2. 蓝牙连接状态\n   - 关闭打印机蓝牙（长按电源键直到红灯闪烁）\n   - 重新开启打印机蓝牙（再次按一下电源键）\n   - 确认绿灯快速闪烁（配对模式）\n\n3. 手机蓝牙\n   - 确保手机蓝牙已开启\n   - 距离打印机在2米以内\n   - 关闭手机蓝牙后再重新打开\n\n4. 其他设备\n   - 确保打印机未被其他手机/电脑连接\n   - 可在手机蓝牙设置中"忽略此设备"后再试',
    confirmText: '重新搜索',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) {
        connectPrinter();
      }
    }
  });
}

// 增加打印份数
function increaseCount(index: number) {
  if (orders.value[index].printCount < 10) {
    orders.value[index].printCount++;
  }
}

// 减少打印份数
function decreaseCount(index: number) {
  if (orders.value[index].printCount > 1) {
    orders.value[index].printCount--;
  }
}

// 预览标签
async function previewLabel(order: OrderPrintConfig) {
  try {
    uni.showLoading({ title: '生成预览中...' });

    // 准备标签数据
    const labelData = prepareLabelData(order);

    // 调用后端API生成标签图片(确保预览和打印完全一致)
    console.log(`[PrintLabel] 调用后端API生成预览图片`);
    const imageBase64 = await generateLabelImage(labelData as ApiLabelData);

    // 将base64转换为临时文件路径供预览使用
    const fs = uni.getFileSystemManager();
    const tempFilePath = `${wx.env.USER_DATA_PATH}/label_preview_${Date.now()}.png`;

    // 写入临时文件
    fs.writeFileSync(tempFilePath, imageBase64, 'base64');

    uni.hideLoading();
    previewImage.value = tempFilePath;

    console.log('[PrintLabel] 预览图片生成成功,使用后端统一字体');

    // 显示预览弹窗
    if (previewPopup.value) {
      previewPopup.value.open();
    }
  } catch (error) {
    uni.hideLoading();
    console.error('[PrintLabel] 预览失败:', error);
    uni.showToast({
      title: '预览失败',
      icon: 'none'
    });
  }
}

// 关闭预览
function closePreview() {
  if (previewPopup.value) {
    previewPopup.value.close();
  }
}

// 准备标签数据
function prepareLabelData(order: OrderPrintConfig): LabelData {
  // 调试：输出完整的recipeSnapshot结构
  console.log('[PrintLabel] recipeSnapshot完整结构:', JSON.stringify(order.recipeSnapshot, null, 2));
  console.log('[PrintLabel] nutrition_detailed_data是否存在:', !!order.recipeSnapshot?.nutrition_detailed_data);
  console.log('[PrintLabel] nutrition_detailed_data内容:', order.recipeSnapshot?.nutrition_detailed_data);

  // 使用默认原料表
  const formatted = formatIngredients(order.recipeSnapshot);
  const foodIngredients = formatted.foodIngredients;
  const supplementIngredients = formatted.supplementIngredients;

  // 获取生命阶段和健康标签
  const lifeStages = order.recipeSnapshot?.applicable_life_stages || [];
  const healthTags = order.recipeSnapshot?.target_health_tags || [];

  // 提取营养成分分析数据（字段名与数据库保持一致）
  const nutritionAnalysis = order.recipeSnapshot?.nutrition_detailed_data ? {
    proteinPercent: order.recipeSnapshot.nutrition_detailed_data.protein_dm_pct,
    fatPercent: order.recipeSnapshot.nutrition_detailed_data.fat_dm_pct,
    ashPercent: order.recipeSnapshot.nutrition_detailed_data.ash_dm_pct,
    moisturePercent: order.recipeSnapshot.nutrition_detailed_data.moisture_pct,
    crudeFiberPercent: order.recipeSnapshot.nutrition_detailed_data.fiber_dm_pct,
    carbohydratePercent: order.recipeSnapshot.nutrition_detailed_data.carbs_dm_pct,
    // 优先使用recipeSnapshot根级别的energyDensityKcalPerKg（1494），而不是nutrition_detailed_data里的（1500）
    energyDensityKcalPerKg: order.recipeSnapshot.energy_density_kcal_per_kg ?? order.recipeSnapshot.nutrition_detailed_data.energy_density_kcal_per_kg,
    calciumPhosphorusRatio: order.recipeSnapshot.nutrition_detailed_data.ca_p_ratio?.toString()
  } : undefined;

  console.log('[PrintLabel] 提取的nutritionAnalysis:', nutritionAnalysis);

  return {
    brandName: 'seven的厨房',
    recipeName: order.recipeName,
    nutritionStandard: order.recipeSnapshot?.nutrition_standard || 'FEDIAF_2021',
    lifeStages,
    healthTags,
    dogName: order.dogName,
    foodIngredients,
    supplementIngredients,
    weightPerPack: order.packageSpecG,
    packageCount: order.packageCount,
    totalWeight: order.packageSpecG * order.packageCount,
    nutritionAnalysis,
    shelfLife: getShelfLifeText(),
    cookingMethod: '', // 不再使用真空袋规格
    productionTime: order.productionDate || formatDateTime(order.createdAt)
  };
}

// 格式化日期（只显示年月日，不显示时分）
function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// 打印单个订单
async function printSingleOrder(order: OrderPrintConfig) {
  // 检查打印机连接
  if (!jcPrinter.isConnectedPrinter()) {
    uni.showToast({
      title: '请先连接打印机',
      icon: 'none'
    });
    return;
  }

  if (order.printCount <= 0) {
    uni.showToast({
      title: '请至少打印1张标签',
      icon: 'none'
    });
    return;
  }

  // 显示确认弹窗
  uni.showModal({
    title: '确认打印',
    content: `即将打印 ${order.dogName} 的标签，共 ${order.printCount} 张。\n\n请确认打印机已连接并准备好打印纸。`,
    confirmText: '确认打印',
    cancelText: '取消',
    success: async (res) => {
      if (!res.confirm) {
        return;  // 用户取消
      }

      console.log('[PrintLabel] ========================================');
      console.log('[PrintLabel] 开始打印单个订单');
      console.log('[PrintLabel] 订单信息:', {
        dogName: order.dogName,
        recipeName: order.recipeName,
        printCount: order.printCount
      });

      uni.showLoading({
        title: `打印中 0/${order.printCount}`,
        mask: true
      });

      try {
        // 准备标签数据
        const labelData = prepareLabelData(order);

        // 调用后端API生成标签图片
        console.log(`[PrintLabel] 调用后端API生成标签图片`);
        uni.showLoading({
          title: '生成标签中...',
          mask: true
        });

        const imageBase64 = await generateLabelImage(labelData as ApiLabelData);

        console.log(`[PrintLabel] 标签图片生成成功，开始打印 ${order.printCount} 份`);
        uni.showLoading({
          title: `打印中...`,
          mask: true
        });

        // 使用后端生成的图片打印
        await jcPrinter.printLabelFromImage(imageBase64, order.printCount);

        uni.hideLoading();
        uni.showToast({
          title: `已打印 ${order.printCount} 张`,
          icon: 'success'
        });

        console.log('[PrintLabel] ========================================');
        console.log('[PrintLabel] 单个订单打印完成');
      } catch (error) {
        uni.hideLoading();
        console.error('[PrintLabel] 打印失败:', error);

        // 判断错误类型
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes('SDK忙') || errorMessage.includes('startJob回调未触发')) {
          uni.showModal({
            title: '打印机忙碌',
            content: '打印机正在处理任务，请稍等几秒后重试。',
            showCancel: false,
            confirmText: '知道了'
          });
        } else {
          uni.showToast({
            title: '打印失败',
            icon: 'none'
          });
        }
      }
    }
  });
}

// 字段编辑事件处理
function onFieldChange(order: OrderPrintConfig) {
  console.log('[PrintLabel] 字段已更新:', order);
}

// 制作日期变更
function onDateChange(event: any, order: OrderPrintConfig) {
  order.productionDate = event.detail.value;
  console.log('[PrintLabel] 制作日期已更新:', order.productionDate);
}

// 返回上一页
function goBack() {
  uni.navigateBack();
}
</script>

<style scoped lang="scss">
.print-label-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 32rpx;
}

.status-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  background-color: #fff;
  z-index: 999;
}

.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-bottom: 1rpx solid #eee;
  z-index: 999;
}

.nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24rpx 32rpx;
  background-color: #fff;
  border-bottom: 1rpx solid #eee;
  z-index: 999;

  .back-btn {
    font-size: 32rpx;
    color: #333;
  }

  .title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .placeholder {
    width: 100rpx;
  }
}

.orders-list {
  padding: 0 32rpx;
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  margin-bottom: 24rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.batch-badge {
  font-size: 24rpx;
  color: #fff;
  background-color: #56ab91;
  padding: 4rpx 12rpx;
  border-radius: 12rpx;
  font-weight: normal;
}

.batch-groups {
  width: 100%;
}

.batch-group {
  margin-bottom: 32rpx;
}

.batch-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 24rpx;
  background-color: #f0f9f5;
  border-radius: 12rpx;
  margin-bottom: 16rpx;
}

.batch-title {
  font-size: 28rpx;
  font-weight: bold;
  color: #333;
}

.current-badge {
  font-size: 22rpx;
  color: #fff;
  background-color: #ff9800;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}

.order-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  position: relative;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;

  .order-index {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
  }

  .header-buttons {
    display: flex;
    gap: 12rpx;
  }

  .preview-btn {
    padding: 8rpx 16rpx;
    font-size: 24rpx;
    background-color: #56ab91;
    color: #fff;
    border: none;
    border-radius: 8rpx;
    white-space: nowrap;
  }

  .print-btn {
    padding: 8rpx 16rpx;
    font-size: 24rpx;
    background-color: #1890ff;
    color: #fff;
    border: none;
    border-radius: 8rpx;
    white-space: nowrap;
  }
}

.order-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}

.order-info {
  flex: 1;

  .info-row {
    display: flex;
    align-items: center;
    margin-bottom: 12rpx;

    &.editable-row {
      background-color: #f8f9fa;
      padding: 8rpx;
      border-radius: 8rpx;
      border: 1rpx dashed #ddd;
    }

    .label {
      font-size: 26rpx;
      color: #666;
      min-width: 140rpx;
    }

    .value {
      font-size: 26rpx;
      color: #333;
      flex: 1;
    }

    .edit-input {
      width: 100rpx;
      height: 56rpx;
      padding: 0 8rpx;
      border: 1rpx solid #ddd;
      border-radius: 8rpx;
      font-size: 26rpx;
      text-align: center;
      background-color: #fff;
    }

    .unit {
      font-size: 26rpx;
      color: #333;
      margin: 0 8rpx;
    }

    .date-picker {
      flex: 1;

      .picker-value {
        font-size: 26rpx;
        color: #1890ff;
        padding: 8rpx 16rpx;
        background-color: #fff;
        border: 1rpx solid #ddd;
        border-radius: 8rpx;
        text-align: center;
      }
    }
  }
}

.print-count-config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16rpx;

  .label {
    font-size: 26rpx;
    color: #666;
  }

  .counter {
    display: flex;
    align-items: center;
    gap: 16rpx;

    .counter-btn {
      width: 60rpx;
      height: 60rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f5f5f5;
      border: 1rpx solid #ddd;
      border-radius: 8rpx;
      font-size: 32rpx;
    }

    .counter-input {
      width: 100rpx;
      height: 60rpx;
      text-align: center;
      border: 1rpx solid #ddd;
      border-radius: 8rpx;
      font-size: 28rpx;
    }
  }
}

.print-settings {
  padding: 200rpx 32rpx 24rpx;  // 顶部200rpx完全避开导航栏和状态栏

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16rpx;  // 减少行间距

    .label {
      font-size: 28rpx;
      color: #666;
    }

    .value {
      font-size: 28rpx;
      color: #333;
      flex: 1;
      margin-left: 16rpx;
    }

    .search-btn {
      padding: 8rpx 16rpx;
      font-size: 24rpx;
      background-color: #56ab91;
      color: #fff;
      border: none;
      border-radius: 8rpx;
    }
  }

  // 打印机列表（内联样式）
  .printer-list-inline {
    margin-top: 16rpx;
    background-color: #fff;
    border-radius: 12rpx;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
    overflow: hidden;

    .printer-list-header {
      display: flex;
      justify-content: flex-end;
      padding: 16rpx 24rpx;
      background-color: #f8f9fa;
      border-bottom: 1rpx solid #eee;

      .close-btn {
        font-size: 40rpx;
        color: #999;
        line-height: 1;
      }
    }

    .printer-list {
      max-height: 300px;
      padding: 8rpx 0;
    }

    .printer-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24rpx 32rpx;
      border-bottom: 1rpx solid #f5f5f5;

      &:active {
        background-color: #f9f9f9;
      }

      &:last-child {
        border-bottom: none;
      }

      .printer-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8rpx;

        .printer-name {
          font-size: 28rpx;
          font-weight: 500;
          color: #333;
        }

        .printer-device-id {
          font-size: 24rpx;
          color: #999;
        }
      }

      .select-icon {
        font-size: 32rpx;
        color: #56ab91;
      }
    }
  }
}

// 预览弹窗
.preview-popup {
  width: 600rpx;
  max-width: 90vw;
  background-color: #fff;
  border-radius: 16rpx;
  overflow: hidden;
  position: relative;
  left: 50%;
  transform: translateX(-50%);

  .preview-image {
    width: 100%;
    display: block;
  }
}

// uni-popup 居中修复
::v-deep .preview-popup-wrapper {
  .uni-popup__wrapper {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
  }

  .uni-popup__wrapper-box {
    margin: 0 auto !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
  }
}

::v-deep .uni-popup.type-center {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;

  .uni-popup__wrapper {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;

    .uni-popup__wrapper-box {
      margin: 0 auto !important;
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
    }
  }
}
</style>
