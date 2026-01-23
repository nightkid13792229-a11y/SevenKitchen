<template>
  <view class="production-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">生产管理</text>
      <text class="subtitle">自动排单、查看任务、完成制作</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value">{{ statistics.todayOrders }}</text>
        <text class="stat-label">今日制作单</text>
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

    <!-- 自动排单按钮（仅今天未排单时显示） -->
    <view v-if="!hasTodayBatch" class="schedule-section">
      <button class="schedule-btn" @tap="autoScheduleToday">
        <text>📋 开始自动排单</text>
      </button>
      <text class="schedule-hint">将为今天到期的订单创建生产批次</text>
      <text class="schedule-warning">⚠️ 点击前会检查今天的采购清单是否已完成</text>
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
        <view v-for="task in filteredTasks" :key="task.id" class="task-card" @tap="viewDetails(task)">
          <view class="task-header">
            <text class="recipe-name">{{ task.recipeName }} v{{ task.recipeVersion }}</text>
            <text class="pot-info">({{ task.currentPotNumber }}/{{ task.totalPots }})</text>
          </view>

          <view class="task-body">
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
import {
  getTodayStatistics,
  autoSchedule,
  getPackagingUnits,
  completeProductionTask,
} from '../../api/production';
import { formatDecimal } from '../../utils/format';

// 统计数据
const statistics = ref({
  todayOrders: 0,
  inProgress: 0,
  completed: 0,
});

// 是否已有今天的批次
const hasTodayBatch = ref(false);

// 任务列表
const allTasks = ref<any[]>([]);

// 历史记录
const historyBatches = ref<any[]>([]);
const expandedHistoryId = ref<string | null>(null);

// Tab筛选
const tabs = [
  { label: '待制作', value: 'PENDING' },
  { label: '制作中', value: 'IN_PROGRESS' },
  { label: '已完成', value: 'COMPLETED' },
];
const activeTab = ref('PENDING');

// 计算属性：当前标签的文本
const currentTabLabel = computed(() => {
  const tab = tabs.find(t => t.value === activeTab.value);
  return tab ? tab.label : '';
});

// 计算属性：筛选后的任务列表
const filteredTasks = computed(() => {
  return allTasks.value.filter(task => task.status === activeTab.value);
});

// 页面加载
onMounted(() => {
  loadTodayStatistics();
  loadPackagingUnits();
});

// 加载今日统计
const loadTodayStatistics = async () => {
  try {
    const res = await getTodayStatistics();
    statistics.value = res.data;
  } catch (error: any) {
    console.error('Failed to load statistics:', error);
    uni.showToast({
      title: error.message || '加载统计失败',
      icon: 'none',
    });
  }
};

// 自动排单
const autoScheduleToday = async () => {
  uni.showModal({
    title: '确认排单',
    content: '系统将检查今天的采购清单是否已完成，确认后开始自动排单',
    success: async (res) => {
      if (!res.confirm) return;

      uni.showLoading({ title: '排单中...' });

      try {
        // 获取本地日期（避免UTC时区问题）
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const today = `${year}-${month}-${day}`;

        const result = await autoSchedule({ startDate: today });

        uni.hideLoading();
        uni.showToast({
          title: `排单成功，创建${result.data.packagingUnitsCount}锅`,
          icon: 'success',
        });

        hasTodayBatch.value = true;
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
    });

    const units = res.data.list;

    // 检查是否有今天的批次（使用本地日期）
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const hasToday = units.some(unit => unit.createdAt.substring(0, 10) === today);
    hasTodayBatch.value = hasToday;

    // 按状态分组：未完成的任务在列表中，已完成的任务在历史记录中
    allTasks.value = units.filter(unit => unit.status !== 'COMPLETED');

    // 按日期分组历史记录（只包含已完成的任务）
    const historyMap = new Map<string, any[]>();
    units
      .filter(unit => unit.status === 'COMPLETED')
      .forEach(unit => {
        const date = unit.createdAt.split(' ')[0];
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

  &.active {
    background-color: #56ab91;
    color: #fff;
    font-weight: bold;
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

    .recipe-name {
      font-size: 30rpx;
      font-weight: bold;
      color: #333;
    }

    .pot-info {
      font-size: 24rpx;
      color: #56ab91;
      font-weight: bold;
      padding: 4rpx 12rpx;
      background-color: #e8f5e9;
      border-radius: 8rpx;
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
        flex: 1;
      }
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
