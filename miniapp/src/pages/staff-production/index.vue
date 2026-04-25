<template>
  <view class="production-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">生产管理</text>
      <text class="subtitle">自动排单、查看任务、完成制作</text>
    </view>

    <view class="date-section">
      <picker
        mode="date"
        :value="selectedProductionDate"
        @change="handleProductionDateChange"
      >
        <view class="date-picker">
          <view>
            <text class="date-label">生产日期</text>
            <text class="date-value">{{ selectedProductionDate }}</text>
          </view>
          <text class="date-arrow">切换</text>
        </view>
      </picker>
      <text class="date-hint">未完成的历史制作单会继续显示，避免跨天漏单</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value">{{ statistics.todayOrders }}</text>
        <text class="stat-label">制作单</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ statistics.pendingScheduleOrders }}</text>
        <text class="stat-label">待排单订单</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ statistics.inProgress }}</text>
        <text class="stat-label">制作中</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ statistics.completed }}</text>
        <text class="stat-label">已完成</text>
      </view>
    </view>

    <!-- 自动排单按钮（所选日期仍有未分配订单时显示） -->
    <view v-if="canAutoSchedule" class="schedule-section">
      <button class="schedule-btn" @tap="autoScheduleToday">
        <text>📋 开始自动排单</text>
      </button>
      <text class="schedule-hint">将为 {{ selectedProductionDate }} 的 {{ statistics.pendingScheduleOrders }} 笔待排单订单创建生产批次</text>
      <text class="schedule-warning">⚠️ 点击前会检查所选日期的采购清单是否已完成</text>
    </view>

    <!-- Tab切换 -->
    <view class="tabs">
      <view
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-item"
        :class="{ active: activeTab === tab.value }"
        @tap="switchTab(tab.value)"
      >
        <text>{{ tab.label }}</text>
        <text class="tab-count">{{ tab.count }}</text>
      </view>
    </view>

    <!-- 任务列表 -->
    <view class="task-list">
      <!-- 空状态 -->
      <view v-if="filteredTasks.length === 0" class="empty-state">
        <text class="empty-icon">👨‍🍳</text>
        <text class="empty-text">暂无{{ currentTabLabel }}任务</text>
      </view>

      <!-- 任务卡片 -->
      <view v-else>
        <view v-for="task in filteredTasks" :key="task.id" class="task-card">
          <view class="task-header" @tap="viewDetails(task)">
            <view class="recipe-title">
              <text class="recipe-name">{{ task.recipeName }} v{{ task.recipeVersion }}</text>
              <text v-if="isCarryoverTask(task)" class="carryover-badge">逾期</text>
            </view>
            <text class="pot-info">({{ task.currentPotNumber }}/{{ task.totalPots }})</text>
          </view>

          <view class="task-body" @tap="viewDetails(task)">
            <view class="info-row">
              <text class="label">制作数量：</text>
              <text class="value">{{ formatDecimal(task.totalProductionG) }}g</text>
            </view>
            <view class="info-row">
              <text class="label">关联订单：</text>
              <text class="value">{{ task.orderItems.length }}个</text>
            </view>
            <view class="info-row">
              <text class="label">创建时间：</text>
              <text class="value">{{ task.createdAt }}</text>
            </view>
            <view v-if="isCarryoverTask(task)" class="info-row">
              <text class="label">生产日期：</text>
              <text class="value carryover-text">{{ task.productionDate }}</text>
            </view>
          </view>

          <!-- 操作按钮区 -->
          <view class="action-buttons">
            <!-- PENDING状态：显示开始制作按钮 -->
            <button
              v-if="task.status === 'PENDING'"
              class="start-btn"
              @tap.stop="handleStartTask(task)"
            >
              <text class="btn-icon">▶️</text>
              <text class="btn-text">开始制作</text>
            </button>

            <!-- 删除按钮 -->
            <view class="delete-btn" @tap.stop="handleDelete(task)">
              <text class="delete-icon">🗑️</text>
              <text class="delete-text">删除</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 历史记录（可展开查看） -->
    <view v-if="historyBatches.length > 0" class="history-section">
      <view class="section-title">历史记录</view>
      <view
        v-for="batch in historyBatches"
        :key="batch.id"
        class="history-item"
        @tap="toggleHistory(batch.id)"
      >
        <view class="history-header">
          <text class="history-date">{{ batch.date }}</text>
          <text class="history-count">{{ batch.count }}锅</text>
          <text class="history-toggle">{{ expandedHistoryId === batch.id ? '▼' : '▶' }}</text>
        </view>
        <view v-if="expandedHistoryId === batch.id" class="history-details">
          <view v-for="unit in batch.units" :key="unit.id" class="history-unit">
            <text class="history-recipe">{{ unit.recipeName }} ({{ unit.currentPotNumber }}/{{ unit.totalPots }})</text>
            <text class="history-weight">{{ formatDecimal(unit.totalProductionG) }}g</text>
            <text class="history-time">{{ unit.completedAt }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import {
  getTodayStatistics,
  autoSchedule,
  getPackagingUnits,
  completeProductionTask,
  startProductionTask,
  deleteProductionBatch,
} from './api/production';
import { formatDecimal } from './utils/format';

const getTodayDateText = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const selectedProductionDate = ref(getTodayDateText());

// 统计数据
const statistics = ref({
  todayOrders: 0,
  pendingScheduleOrders: 0,
  inProgress: 0,
  completed: 0,
});

// 任务列表
const allTasks = ref<any[]>([]);

// 历史记录
const historyBatches = ref<any[]>([]);
const expandedHistoryId = ref<string | null>(null);

const activeTab = ref('PENDING');

const taskStatusCounts = computed(() => {
  return allTasks.value.reduce(
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

// Tab筛选
const tabs = computed(() => [
  { label: '待制作', value: 'PENDING', count: taskStatusCounts.value.PENDING },
  { label: '制作中', value: 'IN_PROGRESS', count: taskStatusCounts.value.IN_PROGRESS },
  { label: '已完成', value: 'COMPLETED', count: taskStatusCounts.value.COMPLETED },
]);

// 计算属性：当前标签的文本
const currentTabLabel = computed(() => {
  const tab = tabs.value.find(t => t.value === activeTab.value);
  return tab ? tab.label : '';
});

// 计算属性：筛选后的任务列表
const filteredTasks = computed(() => {
  return allTasks.value.filter(task => task.status === activeTab.value);
});

const canAutoSchedule = computed(() => {
  return Number(statistics.value.pendingScheduleOrders || 0) > 0;
});

const isCarryoverTask = (task: any) => {
  return (
    task?.productionDate &&
    task.productionDate !== selectedProductionDate.value &&
    task.status !== 'COMPLETED'
  );
};

// 页面加载
onMounted(() => {
  loadTodayStatistics();
  loadPackagingUnits();
});

// 页面显示时刷新数据（从详情页返回时）
onShow(() => {
  loadTodayStatistics();
  loadPackagingUnits();
});

// 加载今日统计
const loadTodayStatistics = async () => {
  try {
    const res = await getTodayStatistics({
      targetDate: selectedProductionDate.value,
    });
    statistics.value = res.data;
  } catch (error: any) {
    console.error('Failed to load statistics:', error);
    uni.showToast({
      title: error.message || '加载统计失败',
      icon: 'none',
    });
  }
};

const handleProductionDateChange = async (event: any) => {
  const nextDate = event?.detail?.value;
  if (!nextDate || nextDate === selectedProductionDate.value) {
    return;
  }

  selectedProductionDate.value = nextDate;
  await loadTodayStatistics();
  await loadPackagingUnits();
};

// 自动排单
const autoScheduleToday = async () => {
  uni.showModal({
    title: '确认排单',
    content: `系统将检查 ${selectedProductionDate.value} 的采购清单是否已完成，确认后开始自动排单`,
    success: async (res) => {
      if (!res.confirm) return;

      uni.showLoading({ title: '排单中...' });

      try {
        const result = await autoSchedule({ startDate: selectedProductionDate.value });

        uni.hideLoading();
        uni.showToast({
          title: `排单成功，创建${result.data.packagingUnitsCount}锅`,
          icon: 'success',
        });

        await loadPackagingUnits();
        await loadTodayStatistics();
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

// 加载分装单元
const loadPackagingUnits = async () => {
  try {
    const res = await getPackagingUnits({
      status: undefined, // 获取所有状态
      page: 1,
      pageSize: 100,
      targetDate: selectedProductionDate.value,
      includeUnfinishedCarryover: true,
    });

    const units = res.data.list;

    // 按状态分组：所有任务都在列表中（包括已完成）
    allTasks.value = units;

    // 按日期分组历史记录（只包含已完成的任务）
    const historyMap = new Map<string, any[]>();
    units
      .filter(unit => unit.status === 'COMPLETED')
      .forEach(unit => {
        const date = unit.productionDate || unit.createdAt.split(' ')[0];
        if (!historyMap.has(date)) {
          historyMap.set(date, []);
        }
        historyMap.get(date)!.push(unit);
      });

    historyBatches.value = Array.from(historyMap.entries()).map(([date, units]) => ({
      id: `batch-${date}`,
      date,
      count: units.length,
      units,
    }));
  } catch (error: any) {
    console.error('Failed to load packaging units:', error);
    uni.showToast({
      title: error.message || '加载任务失败',
      icon: 'none',
    });
  }
};

// 切换Tab
const switchTab = (tab: string) => {
  activeTab.value = tab;
};

// 查看详情
const viewDetails = (task: any) => {
  uni.navigateTo({
    url: `/pages/staff-production/detail?id=${task.id}`,
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
          uni.navigateTo({
            url: `/pages/staff-production/detail?id=${task.id}`,
          });
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
  // 需要从包装单元获取批次ID
  // 因为删除是按批次ID进行的，而不是按包装单元ID
  const batchId = task.productionBatchId;
  if (!batchId) {
    uni.showToast({
      title: '无法获取批次信息',
      icon: 'none',
    });
    return;
  }

  const result = await uni.showModal({
    title: '确认删除',
    content: '删除后将无法恢复，相关订单将重新进入采购状态。是否继续？',
    confirmText: '确认删除',
    confirmColor: '#ff4d4f',
    cancelText: '取消',
  });

  if (!result.confirm) return;

  try {
    uni.showLoading({ title: '删除中...' });

    await deleteProductionBatch(batchId);

    uni.hideLoading();

    uni.showToast({
      title: '删除成功',
      icon: 'success',
    });

    // 刷新列表和统计
    await loadPackagingUnits();
    await loadTodayStatistics();
  } catch (error: any) {
    uni.hideLoading();

    uni.showModal({
      title: '删除失败',
      content: error.message || '未知错误',
      showCancel: false,
    });
  }
};

// 展开/折叠历史记录
const toggleHistory = (batchId: string) => {
  if (expandedHistoryId.value === batchId) {
    expandedHistoryId.value = null;
  } else {
    expandedHistoryId.value = batchId;
  }
};
</script>

<style scoped lang="scss">
.production-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  padding-bottom: 120rpx;
}

.header {
  background: linear-gradient(135deg, #a8e6cf 0%, #56ab91 100%);
  padding: 40rpx 32rpx;
  margin-bottom: 24rpx;

  .title {
    display: block;
    font-size: 44rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 8rpx;
  }

  .subtitle {
    display: block;
    font-size: 24rpx;
    color: rgba(51, 51, 51, 0.7);
  }
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
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
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
  color: #666;
  margin-bottom: 6rpx;
}

.date-value {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #333;
}

.date-arrow {
  font-size: 24rpx;
  color: #2196f3;
  background-color: #edf6ff;
  border-radius: 8rpx;
  padding: 8rpx 16rpx;
  white-space: nowrap;
}

.date-hint {
  display: block;
  margin-top: 14rpx;
  font-size: 22rpx;
  color: #888;
}

.stat-card {
  flex: 1;
  background-color: #fff;
  padding: 32rpx 24rpx;
  border-radius: 16rpx;
  text-align: center;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);

  .stat-value {
    display: block;
    font-size: 48rpx;
    font-weight: bold;
    color: #56ab91;
    margin-bottom: 8rpx;
  }

  .stat-label {
    font-size: 24rpx;
    color: #666;
  }
}

.schedule-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;

  .schedule-btn {
    background-color: #56ab91;
    color: #fff;
    border: none;
    border-radius: 12rpx;
    padding: 24rpx 48rpx;
    font-size: 32rpx;
    font-weight: bold;
  }

  .schedule-hint {
    font-size: 24rpx;
    color: #666;
    text-align: center;
  }

  .schedule-warning {
    font-size: 22rpx;
    color: #ff9800;
    text-align: center;
  }
}

.batch-print-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 32rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;

  .batch-print-btn {
    background-color: #2196f3;
    color: #fff;
    border: none;
    border-radius: 12rpx;
    padding: 24rpx 48rpx;
    font-size: 32rpx;
    font-weight: bold;
  }

  .batch-print-hint {
    font-size: 24rpx;
    color: #666;
    text-align: center;
  }
}

.section-title {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
  padding: 0 32rpx;
  margin-bottom: 16rpx;
}

.tabs {
  display: flex;
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  border-radius: 16rpx;
  padding: 8rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.tab-item {
  flex: 1;
  text-align: center;
  padding: 16rpx;
  border-radius: 12rpx;
  font-size: 28rpx;
  color: #666;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 44rpx;

  &.active {
    background-color: #56ab91;
    color: #fff;
    font-weight: bold;

    .tab-count {
      background-color: rgba(255, 255, 255, 0.24);
      color: #fff;
    }
  }

  .tab-count {
    min-width: 32rpx;
    height: 32rpx;
    line-height: 32rpx;
    padding: 0 8rpx;
    border-radius: 16rpx;
    background-color: #f0f4f2;
    color: #56ab91;
    font-size: 22rpx;
    font-weight: 600;
  }
}

.task-list {
  padding: 0 32rpx;
}

.empty-state {
  text-align: center;
  padding: 120rpx 0;

  .empty-icon {
    display: block;
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #999;
  }
}

.task-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    background-color: #f5f5f5;
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
      color: #333;
    }

    .carryover-badge {
      font-size: 22rpx;
      color: #d63f3f;
      background-color: #fff0f0;
      border: 1rpx solid #ffc6c6;
      border-radius: 8rpx;
      padding: 4rpx 10rpx;
      line-height: 1.3;
      white-space: nowrap;
    }

    .pot-info {
      font-size: 24rpx;
      color: #56ab91;
      font-weight: bold;
      padding: 4rpx 12rpx;
      background-color: #e8f5e9;
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
        color: #666;
        min-width: 180rpx;
      }

      .value {
        font-size: 26rpx;
        color: #333;
      }

      .carryover-text {
        color: #d63f3f;
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
    padding: 12rpx 24rpx;
    background-color: #56ab91;
    border-radius: 8rpx;
    border: none;
    transition: all 0.2s;

    &:active {
      background-color: #459678;
      transform: scale(0.98);
    }

    .btn-icon {
      font-size: 24rpx;
    }

    .btn-text {
      font-size: 26rpx;
      color: #fff;
      font-weight: 500;
    }
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    margin-top: 16rpx;
    padding: 12rpx 24rpx;
    background-color: rgba(255, 77, 79, 0.1);
    border-radius: 8rpx;
    border: 1rpx solid rgba(255, 77, 79, 0.3);
    transition: all 0.2s;

    &:active {
      background-color: rgba(255, 77, 79, 0.2);
      transform: scale(0.98);
    }

    .delete-icon {
      font-size: 28rpx;
    }

    .delete-text {
      font-size: 26rpx;
      color: #ff4d4f;
      font-weight: 500;
    }
  }
}

.history-section {
  background-color: #fff;
  margin: 0 32rpx 24rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.history-item {
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #f0f0f0;

  &:last-child {
    margin-bottom: 0;
    padding-bottom: 0;
    border-bottom: none;
  }

  .history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .history-date {
      font-size: 26rpx;
      font-weight: bold;
      color: #333;
    }

    .history-count {
      font-size: 24rpx;
      color: #666;
    }

    .history-toggle {
      font-size: 24rpx;
      color: #999;
    }
  }

  .history-details {
    margin-top: 12rpx;
    padding-left: 24rpx;
  }

  .history-unit {
    display: flex;
    justify-content: space-between;
    padding: 8rpx 0;
    font-size: 24rpx;
    color: #666;

    .history-recipe {
      flex: 1;
    }

    .history-weight {
      min-width: 120rpx;
      text-align: right;
    }

    .history-time {
      min-width: 150rpx;
      text-align: right;
      color: #999;
    }
  }
}
</style>
