<template>
  <view class="production-page">
    <!-- 鲜食 / 补剂都属于生产环节，共用一个入口，在这里再分 -->
    <view class="mode-switch">
      <view
        v-for="mode in productionModes"
        :key="mode.value"
        class="mode-item"
        :class="{ active: activeMode === mode.value }"
        @tap="switchMode(mode.value)"
      >
        <text class="mode-label">{{ mode.label }}</text>
        <text v-if="mode.count > 0" class="mode-count">{{ mode.count }}</text>
      </view>
    </view>

    <!-- 生产日期 / 补剂发货日共用一个日期控件，标签随模式变 -->
    <view class="date-section">
      <picker mode="date" :value="datePickerValue" @change="handleDateChange">
        <view class="date-picker">
          <view>
            <text class="date-label">{{ dateLabel }}</text>
            <text class="date-value">{{ datePickerValue }}</text>
          </view>
          <text class="date-arrow">切换</text>
        </view>
      </picker>
      <text class="date-hint">{{ dateHint }}</text>
    </view>

    <view v-show="activeMode === 'FRESH'" class="mode-panel">
      <!-- 统计卡片：与下方列表同源，跨天未完成的锅也计入，首屏不再出现「0 但有两张卡」 -->
      <view class="stats-section">
        <view class="stat-card">
          <text class="stat-value">{{ (loading || loadError) && allTasks.length === 0 ? '—' : totalTaskCount }}</text>
          <text class="stat-label">今日制作单</text>
        </view>
        <view class="stat-card">
          <text class="stat-value">{{ (loading || loadError) && allTasks.length === 0 ? '—' : statistics.pendingScheduleOrders }}</text>
          <text class="stat-label">待排单订单</text>
        </view>
        <view class="stat-card">
          <text class="stat-value">{{ (loading || loadError) && allTasks.length === 0 ? '—' : taskStatusCounts.IN_PROGRESS }}</text>
          <text class="stat-label">制作中</text>
        </view>
        <view class="stat-card">
          <text class="stat-value">{{ (loading || loadError) && allTasks.length === 0 ? '—' : taskStatusCounts.COMPLETED }}</text>
          <text class="stat-label">已完成</text>
        </view>
      </view>
      <text v-if="carryoverTaskCount > 0" class="stats-note">
        含跨天 {{ carryoverTaskCount }} 锅 · {{ carryoverDateText }}
      </text>

      <!-- 十锅以上给搜索：现场找某一锅不用一直滚 -->
      <view v-if="totalTaskCount > 8 || keyword" class="search-bar">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索食谱 / 订单号"
          confirm-type="search"
          @focus="markModePicked"
        />
        <text v-if="keyword" class="search-clear" @tap="keyword = ''">清除</text>
      </view>

      <!-- 自动排单按钮（所选日期仍有未分配订单时显示） -->
      <view v-if="canAutoSchedule" class="schedule-section">
        <button class="schedule-btn" @tap="autoScheduleToday">
          <text>{{ scheduleButtonText }}</text>
        </button>
        <text class="schedule-hint">{{ scheduleHintText }}</text>
      </view>

      <!-- Tab切换 -->
      <view class="tabs">
        <view v-for="tab in tabs" :key="tab.value" class="tab-item" :class="{ active: activeTab === tab.value }" @tap="switchTab(tab.value)">
          <text>{{ tab.label }}</text>
          <text class="tab-count">{{ tab.count }}</text>
        </view>
      </view>

      <!-- 任务列表 -->
      <view class="task-list">
        <!-- 有旧数据但这次刷新失败：不遮住旧数据，给一条重试 -->
        <view v-if="loadError && allTasks.length > 0" class="inline-error">
          <text>数据可能不是最新的</text>
          <text class="retry-link" @tap="refreshAll">重试</text>
        </view>

        <!-- 首次加载：不能把「还没取到」显示成「今天没活」 -->
        <view v-if="loading && allTasks.length === 0" class="loading-state">
          <text>加载中…</text>
        </view>

        <!-- 首次加载失败：明确说失败，并给重试 -->
        <view v-else-if="loadError && allTasks.length === 0" class="error-state">
          <text class="error-text">数据没加载出来</text>
          <text class="error-hint">{{ loadError }}</text>
          <button class="retry-btn" @tap="refreshAll">重试</button>
        </view>

        <!-- 空状态 -->
        <view v-else-if="filteredTasks.length === 0" class="empty-state">
          <image class="empty-icon" src="/static/ui-icons/production.png" mode="aspectFit" />
          <text class="empty-text">{{ emptyText }}</text>
        </view>

        <!-- 任务卡片：按生产日期分组，最老的排前面 -->
        <view v-else>
          <view v-for="(task, index) in filteredTasks" :key="task.id">
            <view
              v-if="index === 0 || task.productionDate !== filteredTasks[index - 1].productionDate"
              class="date-group-title"
            >
              <text>{{ task.productionDate }}</text>
              <text class="date-group-tag">
                {{ task.productionDate === selectedProductionDate ? '当天' : '跨天' }}
              </text>
            </view>

            <view class="task-card">
              <view class="task-header" @tap="viewDetails(task)">
                <view class="recipe-title">
                  <text class="recipe-name">{{ task.recipeName }} v{{ task.recipeVersion }}</text>
                  <text
                    v-if="isCarryoverTask(task) || isOverdueTask(task)"
                    class="carryover-badge"
                    :class="{ 'is-overdue': isOverdueTask(task) }"
                  >
                    {{ isOverdueTask(task) ? '逾期' : '跨天' }}
                  </text>
                  <text v-if="hasAllergyNote(task)" class="note-badge allergy-badge">过敏</text>
                  <text v-else-if="hasAnyNote(task)" class="note-badge">有备注</text>
                </view>
                <text class="pot-info">第 {{ task.currentPotNumber }} 锅 / 共 {{ task.totalPots }} 锅</text>
              </view>

            <view class="task-body" @tap="viewDetails(task)">
              <view class="info-row">
                <text class="label">制作数量：</text>
                <text class="value">{{ formatWeightG(task.totalProductionG) }}</text>
              </view>
              <view class="info-row">
                <text class="label">关联订单：</text>
                <text class="value">{{ orderSummary(task) }}</text>
              </view>
              <view class="info-row">
                <text class="label">创建时间：</text>
                <text class="value">{{ task.createdAt }}</text>
              </view>
              <view v-if="isCarryoverTask(task)" class="info-row">
                <text class="label">生产日期：</text>
                <text
                  class="value"
                  :class="isOverdueTask(task) ? 'carryover-text' : 'cross-day-text'"
                >
                  {{ task.productionDate }}
                </text>
              </view>
            </view>

            <!-- 操作按钮区：每种状态都给一个明确的主动作 -->
            <view class="action-buttons">
              <!-- PENDING：开始制作 -->
              <button v-if="task.status === 'PENDING'" class="start-btn" @tap.stop="handleStartTask(task)">
                <text class="btn-text">开始制作</text>
              </button>

              <!-- IN_PROGRESS：继续制作，进详情 -->
              <button
                v-else-if="task.status === 'IN_PROGRESS'"
                class="start-btn"
                @tap.stop="viewDetails(task)"
              >
                <text class="btn-text">继续制作</text>
              </button>

              <!-- COMPLETED：直接进标签打印；卡片正文仍可看详情 -->
              <button
                v-else-if="task.status === 'COMPLETED'"
                class="start-btn"
                @tap.stop="viewDetails(task, 'print')"
              >
                <text class="btn-text">打印标签</text>
              </button>

              <!-- 删除按生产批次执行；已完成和含完成锅的批次不显示 -->
              <view v-if="canDeleteTask(task)" class="delete-btn" @tap.stop="handleDelete(task)">
                <text class="delete-text">删除整批</text>
              </view>
            </view>
          </view>
        </view>
      </view>
      </view>

    </view>

    <!-- 补剂分装：原来工作台上的「分装备料」整块搬到这里 -->
    <view v-show="activeMode === 'SUPPLEMENT'" class="mode-panel">
      <SupplementPacking
        ref="supplementRef"
        :date="selectedPackingDate"
        @count="onSupplementCount"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { getTodayStatistics, autoSchedule, getPackagingUnits, completeProductionTask, startProductionTask, deleteProductionBatch } from './api/production';
import { formatWeightG } from './utils/format';
import { hasAllergyText } from './utils/note';
import SupplementPacking from './components/SupplementPacking.vue';

const getTodayDateText = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const selectedProductionDate = ref(getTodayDateText());
const selectedPackingDate = ref(getTodayDateText());

// 鲜食 / 补剂同属生产环节，共用一个入口，进来再分。
type ProductionMode = 'FRESH' | 'SUPPLEMENT';
const activeMode = ref<ProductionMode>('FRESH');
const supplementRef = ref<any>(null);
const supplementCount = ref(0);
const freshLoaded = ref(false);
const supplementLoaded = ref(false);
const modeInitialized = ref(false);
const userPickedMode = ref(false);

// 两个模式共用一个日期控件，只是标签和值跟着切。
const datePickerValue = computed(() =>
  activeMode.value === 'FRESH' ? selectedProductionDate.value : selectedPackingDate.value,
);
const dateLabel = computed(() =>
  activeMode.value === 'FRESH' ? '生产日期' : '补剂发货日',
);
const dateHint = computed(() =>
  activeMode.value === 'FRESH'
    ? '未完成的历史制作单会继续显示，避免跨天漏单'
    : '按发货日看订单 / 备料 / 包材 / 缺料',
);

const switchMode = (mode: ProductionMode) => {
  if (activeMode.value === mode) return;
  userPickedMode.value = true;
  activeMode.value = mode;
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
  if (mode === 'SUPPLEMENT' && !supplementLoaded.value) {
    supplementRef.value?.refresh?.();
  }
};

const onSupplementCount = (value: number) => {
  supplementCount.value = Number(value || 0);
  supplementLoaded.value = true;
  maybePickInitialMode();
};

// 首屏默认落到有活的模式：鲜食 0 锅、补剂有单时，不用再手动切。
function maybePickInitialMode() {
  if (modeInitialized.value || userPickedMode.value) return;
  if (!freshLoaded.value || !supplementLoaded.value) return;

  if (totalTaskCount.value > 0) {
    modeInitialized.value = true;
    return;
  }
  if (supplementCount.value > 0) {
    activeMode.value = 'SUPPLEMENT';
  }
  modeInitialized.value = true;
}

// 统计数据：只保留「待排单订单」这一项来自后台；
// 其余三个数字都从下方列表同源计算，避免首屏和列表各说各话。
const statistics = ref({
  pendingScheduleOrders: 0,
});

// 任务列表
const allTasks = ref<any[]>([]);

// 今天、加载态、失败态：三者要分开，不能把「没取到」显示成「今天没活」。
const loading = ref(false);
const loadError = ref('');

// 未来日期的未完成锅不属于当前生产日，不进入列表、统计和批次操作。
const isFutureTask = (task: any) => {
  return Boolean(
    task?.productionDate &&
      task.status !== 'COMPLETED' &&
      task.productionDate > selectedProductionDate.value,
  );
};

const visibleTasks = computed(() =>
  allTasks.value
    .filter((task) => !isFutureTask(task))
    .sort((a, b) => {
      // 跨天旧单排在前面；同一天按锅次，再按创建时间。
      const dateCompare = String(a.productionDate || '').localeCompare(
        String(b.productionDate || ''),
      );
      if (dateCompare !== 0) return dateCompare;

      const potCompare =
        Number(a.currentPotNumber || 0) - Number(b.currentPotNumber || 0);
      if (potCompare !== 0) return potCompare;

      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }),
);

// 跨天：不属于所选日期、但还没做完的锅。
const isCarryoverTask = (task: any) => {
  return Boolean(
    task?.productionDate &&
      task.productionDate !== selectedProductionDate.value &&
      task.status !== 'COMPLETED',
  );
};

// 顾客备注里可能写过敏；有就挂个标，别让人非得点进详情才知道。
const hasAnyNote = (task: any) =>
  (task?.orderItems || []).some((item: any) => Boolean(item?.customerNote));
const hasAllergyNote = (task: any) =>
  (task?.orderItems || []).some((item: any) => hasAllergyText(item?.customerNote));

const orderSummary = (task: any) => {
  const items = task?.orderItems || [];
  const orderNos = Array.from(
    new Set(items.map((item: any) => item.orderNo).filter(Boolean)),
  );
  if (orderNos.length === 0) return `${items.length}个`;
  return `${items.length}个 · ${orderNos.slice(0, 2).join('、')}${orderNos.length > 2 ? '…' : ''}`;
};

// 逾期只认「生产日期早于今天」；选未来日期时，今天的单是「跨天」不是「逾期」。
const isOverdueTask = (task: any) => {
  return Boolean(
    task?.productionDate &&
      task.status !== 'COMPLETED' &&
      task.productionDate < getTodayDateText(),
  );
};

const activeTab = ref('PENDING');
const keyword = ref('');

const taskStatusCounts = computed(() => {
  return visibleTasks.value.reduce(
    (counts, task) => {
      if (task.status === 'PENDING') counts.PENDING += 1;
      if (task.status === 'IN_PROGRESS') counts.IN_PROGRESS += 1;
      if (task.status === 'COMPLETED') counts.COMPLETED += 1;
      return counts;
    },
    {
      PENDING: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    },
  );
});

const freshTodoCount = computed(() => {
  return taskStatusCounts.value.PENDING + taskStatusCounts.value.IN_PROGRESS;
});

// 首屏「今日制作单」以当前列表为准：所选日期的全部锅 + 跨天未完成的锅。
const totalTaskCount = computed(() => visibleTasks.value.length);

const productionModes = computed(() => [
  { value: 'FRESH' as ProductionMode, label: '鲜食生产', count: freshTodoCount.value },
  { value: 'SUPPLEMENT' as ProductionMode, label: '补剂分装', count: supplementCount.value },
]);

// Tab筛选
const tabs = computed(() => [
  { label: '待制作', value: 'PENDING', count: taskStatusCounts.value.PENDING },
  {
    label: '制作中',
    value: 'IN_PROGRESS',
    count: taskStatusCounts.value.IN_PROGRESS,
  },
  {
    label: '已完成',
    value: 'COMPLETED',
    count: taskStatusCounts.value.COMPLETED,
  },
]);

// 计算属性：当前标签的文本
const currentTabLabel = computed(() => {
  const tab = tabs.value.find((t) => t.value === activeTab.value);
  return tab ? tab.label : '';
});

// 计算属性：筛选后的任务列表（状态 + 食谱 / 订单号搜索）
const filteredTasks = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return visibleTasks.value.filter((task) => {
    if (task.status !== activeTab.value) return false;
    if (!query) return true;
    const recipe = `${task.recipeName || ''} v${task.recipeVersion || ''}`.toLowerCase();
    const orderText = (task.orderItems || [])
      .map((item: any) => item.orderNo || item.orderId || '')
      .join(' ')
      .toLowerCase();
    return recipe.includes(query) || orderText.includes(query);
  });
});

const emptyText = computed(() => {
  const query = keyword.value.trim();
  return query ? `没有匹配「${query}」的任务` : `暂无${currentTabLabel.value}任务`;
});

const canAutoSchedule = computed(() => {
  return Number(statistics.value.pendingScheduleOrders || 0) > 0;
});

const hasExistingProductionTasks = computed(() => {
  return totalTaskCount.value > 0;
});

const scheduleButtonText = computed(() => {
  return hasExistingProductionTasks.value ? '创建新增制作单' : '开始自动排单';
});

const scheduleHintText = computed(() => {
  const pendingCount = Number(statistics.value.pendingScheduleOrders || 0);
  const actionText = hasExistingProductionTasks.value ? '创建新增生产批次' : '创建生产批次';
  return `将为 ${selectedProductionDate.value} 的 ${pendingCount} 笔待排单订单${actionText}；采购清单未完成会自动拦下`;
});

// 首屏统计的「含跨天」说明：让 2 锅里有几锅是昨天/更早的一眼可见。
const carryoverTasks = computed(() => visibleTasks.value.filter((task) => isCarryoverTask(task)));
const carryoverTaskCount = computed(() => carryoverTasks.value.length);
const carryoverDateText = computed(() => {
  const dates = Array.from(
    new Set(carryoverTasks.value.map((task) => task.productionDate).filter(Boolean)),
  );
  return dates.join('、');
});

// 删除按「生产批次」执行，不是按这一张锅卡。
const getBatchUnits = (task: any) => {
  if (!task?.productionBatchId) return [];
  return visibleTasks.value.filter((unit) => unit.productionBatchId === task.productionBatchId);
};

// 只允许删未完成的批次；只要这批里已经有一锅完成，就不给删除入口。
const canDeleteTask = (task: any) => {
  if (!task?.productionBatchId) return false;
  if (task.status === 'COMPLETED') return false;
  return getBatchUnits(task).every((unit) => unit.status !== 'COMPLETED');
};

// 页面加载：onShow 在首次进入和从详情返回时都会触发，统一走 refreshAll。
onShow(() => {
  refreshAll();
  if (activeMode.value === 'SUPPLEMENT') {
    supplementRef.value?.refresh?.();
  }
});

let refreshSeq = 0;

// 加载今日统计
async function loadTodayStatistics(seq = refreshSeq): Promise<boolean> {
  try {
    const res = await getTodayStatistics({
      targetDate: selectedProductionDate.value,
    });
    if (seq === refreshSeq) statistics.value = res.data;
    return true;
  } catch (error: any) {
    console.error('Failed to load statistics:', error);
    return false;
  }
}

// 加载分装单元
async function loadPackagingUnits(seq = refreshSeq): Promise<boolean> {
  try {
    const res = await getPackagingUnits({
      status: undefined, // 获取所有状态
      page: 1,
      pageSize: 100,
      targetDate: selectedProductionDate.value,
      includeUnfinishedCarryover: true,
    });

    if (seq === refreshSeq) allTasks.value = res.data.list;
    return true;
  } catch (error: any) {
    console.error('Failed to load packaging units:', error);
    return false;
  }
}

// 统计和列表一起刷新：任一项失败都明确告诉用户，不拿 0 / 空态冒充成功。
async function refreshAll() {
  const seq = ++refreshSeq;
  loading.value = true;
  loadError.value = '';
  const [statsOk, listOk] = await Promise.all([
    loadTodayStatistics(seq),
    loadPackagingUnits(seq),
  ]);
  if (seq !== refreshSeq) return;
  if (!statsOk || !listOk) {
    loadError.value = '请检查网络后重试';
  } else {
    freshLoaded.value = true;
    maybePickInitialMode();
  }
  loading.value = false;
}

onPullDownRefresh(async () => {
  try {
    await refreshAll();
    if (activeMode.value === 'SUPPLEMENT') {
      await supplementRef.value?.refresh?.();
    }
  } finally {
    uni.stopPullDownRefresh();
  }
});

const handleDateChange = async (event: any) => {
  const nextDate = event?.detail?.value;
  if (!nextDate) return;

  // 用户已经自己选日期了，就别再自动切模式。
  userPickedMode.value = true;

  if (activeMode.value === 'FRESH') {
    if (nextDate === selectedProductionDate.value) return;
    selectedProductionDate.value = nextDate;
    // 先清空旧日期数据，避免切换瞬间把旧单按新日期标成「逾期」。
    allTasks.value = [];
    await refreshAll();
    return;
  }

  if (nextDate === selectedPackingDate.value) return;
  selectedPackingDate.value = nextDate;
};

// 自动排单
const autoScheduleToday = async () => {
  uni.showModal({
    title: '确认排单',
    content: `系统将检查 ${selectedProductionDate.value} 的采购清单是否已完成，确认后${scheduleButtonText.value}`,
    success: async (res) => {
      if (!res.confirm) return;

      uni.showLoading({ title: '排单中...' });

      try {
        const result = await autoSchedule({
          startDate: selectedProductionDate.value,
        });

        uni.hideLoading();
        uni.showToast({
          title: `排单成功，创建${result.data.packagingUnitsCount}锅`,
          icon: 'success',
        });

        await refreshAll();
      } catch (error: any) {
        uni.hideLoading();
        console.error('Auto schedule failed:', error);
        uni.showToast({
          title: error.message || '排单失败',
          icon: 'none',
        });
      }
    },
  });
};

// 切换Tab
const switchTab = (tab: string) => {
  userPickedMode.value = true;
  activeTab.value = tab;
};

const markModePicked = () => {
  userPickedMode.value = true;
};

// 查看详情：带上生产日期，详情页只查这一天，不再全库找最近 100 条。
const viewDetails = (task: any, action?: 'print') => {
  const date = task.productionDate ? `&date=${encodeURIComponent(task.productionDate)}` : '';
  const extra = action ? `&action=${action}` : '';
  uni.navigateTo({
    url: `/pages/staff-production/detail?id=${task.id}${date}${extra}`,
  });
};

// 开始制作
const handleStartTask = async (task: any) => {
  try {
    uni.showModal({
      title: '开始制作',
      content: `确认开始制作 ${task.recipeName}？`,
      success: async (res) => {
        if (!res.confirm) return;

        uni.showLoading({ title: '开始中...' });

        const result = await startProductionTask(task.id);

        uni.hideLoading();

        if (result.code === 0) {
          uni.showToast({
            title: '已开始制作',
            icon: 'success',
          });

          await loadPackagingUnits();
          await loadTodayStatistics();
          viewDetails(task);
        } else {
          uni.showToast({
            title: result.message || '操作失败',
            icon: 'none',
          });
        }
      },
    });
  } catch (error: any) {
    uni.hideLoading();
    console.error('Start task failed:', error);
    uni.showToast({
      title: error.message || '开始制作失败',
      icon: 'none',
    });
  }
};

// 完成制作
const completeTask = async (unitId: string) => {
  try {
    uni.showModal({
      title: '确认完成',
      content: '确认完成制作任务？',
      success: async (res) => {
        if (!res.confirm) return;

        uni.showLoading({ title: '提交中...' });
        await completeProductionTask(unitId);
        uni.hideLoading();

        uni.showToast({ title: '已完成制作', icon: 'success' });
        loadPackagingUnits();
        loadTodayStatistics();
      },
    });
  } catch (error: any) {
    uni.hideLoading();
    console.error('Complete task failed:', error);
    uni.showToast({
      title: error.message || '操作失败',
      icon: 'none',
    });
  }
};

// 删除生产批次
const handleDelete = async (task: any) => {
  // 删除是按生产批次ID进行的，不是按这一张锅卡。
  const batchId = task.productionBatchId;
  if (!batchId) {
    uni.showToast({
      title: '无法获取批次信息',
      icon: 'none',
    });
    return;
  }

  if (!canDeleteTask(task)) {
    uni.showToast({
      title: '这批不能删除',
      icon: 'none',
    });
    return;
  }

  const batchUnits = getBatchUnits(task);
  const orderCount = new Set(
    batchUnits.flatMap((unit) =>
      (unit.orderItems || []).map((item: any) => item.orderId).filter(Boolean),
    ),
  ).size;
  const hasInProgress = batchUnits.some((unit) => unit.status === 'IN_PROGRESS');

  const result = await uni.showModal({
    title: '确认删除整批',
    content:
      `本批共 ${batchUnits.length} 锅${orderCount > 0 ? `、${orderCount} 个订单` : ''}。` +
      `删除后这 ${batchUnits.length} 锅都会消失${orderCount > 0 ? '，相关订单退回采购' : ''}。` +
      `${hasInProgress ? '其中已开始制作的锅，备料照片会一起删除。' : ''}是否继续？`,
    confirmText: '删除整批',
    confirmColor: '#ff4d4f',
    cancelText: '取消',
  });

  if (!result.confirm) return;

  try {
    uni.showLoading({ title: '删除中...' });

    await deleteProductionBatch(batchId);

    uni.hideLoading();

    uni.showToast({
      title: '已删除整批',
      icon: 'success',
    });

    // 刷新列表和统计
    await loadPackagingUnits();
    await loadTodayStatistics();
  } catch (error: any) {
    uni.hideLoading();

    const rawMessage = String(error?.message || '');
    // 跨天的批次里可能有已完成的锅没显示在当前列表里；后端的英文拦截
    // 在这里翻译成现场能看懂的话，别让员工对着 Cannot delete batch 发呆。
    const friendlyMessage = rawMessage.toLowerCase().includes('completed')
      ? '这批里已经有完成的锅，不能整批删除。请先处理已完成的锅，或联系管理员。'
      : rawMessage || '删除失败，请稍后重试';

    uni.showModal({
      title: '删除失败',
      content: friendlyMessage,
      showCancel: false,
    });
  }
};

</script>

<style scoped lang="scss">
.production-page {
  min-height: 100vh;
  background-color: #fbfcf7;
  padding-top: 24rpx;
  padding-bottom: 120rpx;
}

.mode-switch {
  display: flex;
  gap: 12rpx;
  margin: 0 32rpx 24rpx;
  padding: 8rpx;
  background: #eef2e4;
  border-radius: 20rpx;
}

.mode-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  min-height: 88rpx;
  padding: 20rpx 0;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #4a5245;

  &.active {
    background: #1e3a2f;
    color: #f3eddd;
    font-weight: 600;
    box-shadow: 0 4rpx 12rpx rgba(30, 58, 47, 0.2);

    .mode-count {
      background: rgba(243, 237, 221, 0.22);
    }
  }
}

.mode-count {
  min-width: 36rpx;
  padding: 0 10rpx;
  font-size: 24rpx;
  line-height: 32rpx;
  text-align: center;
  color: inherit;
  background: rgba(30, 58, 47, 0.1);
  border-radius: 999rpx;
}

.stats-section {
  display: flex;
  gap: 16rpx;
  padding: 0 32rpx 24rpx;
}

.date-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
}

.date-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.date-label {
  display: block;
  font-size: 24rpx;
  color: #26261f;
  margin-bottom: 6rpx;
}

.date-value {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #26261f;
}

.date-arrow {
  font-size: 24rpx;
  color: #7a5c28;
  background-color: #eef2e4;
  border-radius: 8rpx;
  padding: 8rpx 16rpx;
  white-space: nowrap;
}

.date-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.stat-card {
  flex: 1;
  background-color: #fff;
  padding: 32rpx 24rpx;
  border-radius: 20rpx;
  text-align: center;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);

  .stat-value {
    display: block;
    font-size: 48rpx;
    font-weight: bold;
    color: #1e3a2f;
    margin-bottom: 8rpx;
  }

  .stat-label {
    font-size: 24rpx;
    color: #26261f;
  }
}

.stats-note {
  display: block;
  margin: -8rpx 32rpx 24rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.schedule-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 20rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;

  .schedule-btn {
    background-color: #1e3a2f;
    color: #f3eddd;
    border: none;
    border-radius: 12rpx;
    min-height: 88rpx;
    padding: 24rpx 48rpx;
    font-size: 32rpx;
    font-weight: bold;
  }

  .schedule-hint {
    font-size: 24rpx;
    color: #26261f;
    text-align: center;
  }

}

.batch-print-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 20rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;

  .batch-print-btn {
    background-color: #1e3a2f;
    color: #f3eddd;
    border: none;
    border-radius: 12rpx;
    min-height: 88rpx;
    padding: 24rpx 48rpx;
    font-size: 32rpx;
    font-weight: bold;
  }

  .batch-print-hint {
    font-size: 24rpx;
    color: #26261f;
    text-align: center;
  }
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #26261f;
  padding: 0 32rpx;
  margin-bottom: 16rpx;
}

.tabs {
  display: flex;
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 20rpx;
  padding: 8rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
}

.tab-item {
  flex: 1;
  text-align: center;
  min-height: 88rpx;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #26261f;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 44rpx;

  &.active {
    background-color: #1e3a2f;
    color: #f3eddd;
    font-weight: bold;

    .tab-count {
      background-color: rgba(251, 252, 247, 0.24);
      color: #f3eddd;
    }
  }

  .tab-count {
    min-width: 32rpx;
    height: 32rpx;
    line-height: 32rpx;
    padding: 0 8rpx;
    border-radius: 20rpx;
    background-color: #f0f3e9;
    color: #1e3a2f;
    font-size: 24rpx;
    font-weight: 600;
  }
}

.task-list {
  padding: 0 32rpx;
}

.note-badge {
  padding: 4rpx 12rpx;
  font-size: 24rpx;
  color: #7a5c28;
  background-color: #f6efe0;
  border-radius: 6rpx;
  white-space: nowrap;
}

.allergy-badge {
  color: #b4453a;
  background-color: #fdecea;
  font-weight: 600;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin: 0 32rpx 24rpx;
  padding: 0 24rpx;
  height: 88rpx;
  background-color: #fff;
  border-radius: 12rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  color: #26261f;
}

.search-clear {
  padding: 8rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.date-group-title {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin: 8rpx 0 12rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #6b6653;
}

.date-group-tag {
  padding: 2rpx 10rpx;
  font-size: 24rpx;
  font-weight: 400;
  color: #7a5c28;
  background-color: #f6efe0;
  border-radius: 6rpx;
}

.inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
  padding: 16rpx 20rpx;
  background-color: #fdf6ec;
  border-radius: 10rpx;
  font-size: 24rpx;
  color: #8a5a00;

  .retry-link {
    color: #7a5c28;
    font-weight: 600;
    padding: 8rpx 12rpx;
  }
}

.loading-state {
  text-align: center;
  padding: 120rpx 0;
  font-size: 28rpx;
  color: #6b6653;
}

.error-state {
  text-align: center;
  padding: 80rpx 32rpx;

  .error-icon {
    display: block;
    font-size: 80rpx;
    margin-bottom: 16rpx;
  }

  .error-text {
    display: block;
    font-size: 30rpx;
    font-weight: 600;
    color: #26261f;
  }

  .error-hint {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: #6b6653;
  }

  .retry-btn {
    margin-top: 28rpx;
    min-height: 88rpx;
    padding: 16rpx 48rpx;
    background-color: #1e3a2f;
    color: #f3eddd;
    border: none;
    border-radius: 12rpx;
    font-size: 28rpx;
  }
}

.empty-state {
  text-align: center;
  padding: 120rpx 0;

  .empty-icon {
    display: block;
    width: 120rpx;
    height: 120rpx;
    margin: 0 auto 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #6b6653;
  }
}

.task-card {
  background-color: #fff;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 6rpx 18rpx rgba(30, 46, 36, 0.05);
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    background-color: #f7f8f2;
    transform: scale(0.98);
  }

  .task-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16rpx;
    gap: 16rpx;

    .recipe-title {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10rpx;
    }

    .recipe-name {
      font-size: 30rpx;
      font-weight: bold;
      color: #26261f;
    }

    .carryover-badge {
      font-size: 24rpx;
      color: #7a5c28;
      background-color: #f6efe0;
      border: 1rpx solid #e5e8d4;
      border-radius: 8rpx;
      padding: 4rpx 10rpx;
      line-height: 1.3;
      white-space: nowrap;

      &.is-overdue {
        color: #b4453a;
        background-color: #f8e8e2;
      }
    }

    .pot-info {
      font-size: 24rpx;
      color: #1e3a2f;
      font-weight: bold;
      padding: 4rpx 12rpx;
      background-color: #eef2e4;
      border-radius: 8rpx;
      white-space: nowrap;
    }
  }

  .task-body {
    .info-row {
      display: flex;
      margin-bottom: 8rpx;

      .label {
        font-size: 26rpx;
        color: #26261f;
        min-width: 180rpx;
      }

      .value {
        font-size: 26rpx;
        color: #26261f;
      }

      .carryover-text {
        color: #b4453a;
        font-weight: 600;
      }

      .cross-day-text {
        color: #7a5c28;
        font-weight: 600;
      }
    }
  }

  .action-buttons {
    display: flex;
    gap: 12rpx;
    margin-top: 16rpx;
  }

  .start-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    min-height: 88rpx;
    padding: 12rpx 24rpx;
    background-color: #1e3a2f;
    border-radius: 8rpx;
    border: none;
    transition: all 0.2s;

    &:active {
      background-color: #1e3a2f;
      transform: scale(0.98);
    }

    .btn-icon {
      font-size: 24rpx;
    }

    .btn-text {
      font-size: 26rpx;
      color: #f3eddd;
      font-weight: 500;
    }
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    min-height: 88rpx;
    padding: 12rpx 24rpx;
    background-color: rgba(180, 85, 63, 0.1);
    border-radius: 8rpx;
    border: 1rpx solid rgba(221, 227, 205, 0.3);
    transition: all 0.2s;

    &:active {
      background-color: rgba(180, 85, 63, 0.2);
      transform: scale(0.98);
    }

    .delete-icon {
      font-size: 28rpx;
    }

    .delete-text {
      font-size: 26rpx;
      color: #b4453a;
      font-weight: 500;
    }
  }
}

</style>
