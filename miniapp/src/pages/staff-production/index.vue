<template>
  <view class="production-page">
    <!-- 顶部标题 -->
    <view class="header">
      <text class="title">生产管理</text>
      <text class="subtitle">查看生产任务与分锅清单</text>
    </view>

    <!-- 统计卡片 -->
    <view class="stats-section">
      <view class="stat-card">
        <text class="stat-value">{{ todayOrders }}</text>
        <text class="stat-label">今日订单</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ inProgress }}</text>
        <text class="stat-label">制作中</text>
      </view>
      <view class="stat-card">
        <text class="stat-value">{{ completed }}</text>
        <text class="stat-label">已完成</text>
      </view>
    </view>

    <!-- 任务筛选 -->
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

    <!-- 生产任务列表 -->
    <view class="task-list">
      <!-- 空状态 -->
      <view v-if="taskList.length === 0" class="empty-state">
        <text class="empty-icon">👨‍🍳</text>
        <text class="empty-text">暂无生产任务</text>
      </view>

      <!-- 任务项 -->
      <view v-else>
        <view v-for="(task, index) in taskList" :key="index" class="task-card">
          <view class="task-header">
            <text class="order-id">{{ task.orderId }}</text>
            <view class="task-status" :class="task.status">
              <text>{{ task.statusText }}</text>
            </view>
          </view>

          <view class="task-info">
            <view class="info-row">
              <text class="label">食谱：</text>
              <text class="value">{{ task.recipeName }}</text>
            </view>
            <view class="info-row">
              <text class="label">数量：</text>
              <text class="value">{{ task.quantity }}{{ task.unit }}</text>
            </view>
            <view class="info-row">
              <text class="label">预计完成：</text>
              <text class="value highlight">{{ task.estimatedTime }}</text>
            </view>
          </view>

          <view class="task-actions">
            <button class="action-btn outline" @tap="viewDetails(task)">
              查看详情
            </button>
            <button
              v-if="task.status === 'pending'"
              class="action-btn primary"
              @tap="startProduction(task)"
            >
              开始制作
            </button>
            <button
              v-if="task.status === 'in-progress'"
              class="action-btn warning"
              @tap="uploadProductionPhotos(task)"
            >
              上传备料照片
            </button>
            <button
              v-if="task.status === 'in-progress'"
              class="action-btn success"
              @tap="completeProduction(task)"
            >
              完成制作
            </button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getBaseUrl } from '../../utils/config';

// UI 框架数据（待对接后端 API）
const todayOrders = ref(0);
const inProgress = ref(0);
const completed = ref(0);

const tabs = [
  { label: '待制作', value: 'pending' },
  { label: '制作中', value: 'in-progress' },
  { label: '已完成', value: 'completed' }
];

const activeTab = ref('pending');
const taskList = ref<any[]>([]);

onMounted(() => {
  // TODO: 加载生产任务数据
  // loadTasks();
});

const switchTab = (tab: string) => {
  activeTab.value = tab;
  // TODO: 根据筛选条件加载任务
  // loadTasks(tab);
};

const viewDetails = (task: any) => {
  uni.showToast({ title: '查看详情功能开发中', icon: 'none' });
};

const startProduction = (task: any) => {
  uni.showToast({ title: '开始制作功能开发中', icon: 'none' });
};

/**
 * 上传生产备料照片
 * 上传成功后自动将订单标记为急冻状态
 */
const uploadProductionPhotos = async (task: any) => {
  if (!task.orderId) {
    uni.showToast({ title: '订单ID不存在', icon: 'none' });
    return;
  }

  // 选择照片
  uni.chooseImage({
    count: 6,
    sizeType: ['compressed'], // 选择压缩图
    sourceType: ['album', 'camera'],
    success: async (res) => {
      if (res.tempFilePaths.length === 0) {
        return;
      }

      uni.showLoading({ title: '上传中...' });

      try {
        // 上传照片到后端
        const uploadPromises = res.tempFilePaths.map((filePath: string) => {
          return new Promise((resolve, reject) => {
            uni.uploadFile({
              url: `${getBaseUrl()}/staff/production/photos/${task.orderId}`,
              filePath: filePath,
              name: 'files',
              header: {
                'X-Customer-Id': uni.getStorageSync('customerId') || '',
              },
              success: (uploadRes) => {
                if (uploadRes.statusCode === 200) {
                  try {
                    const data = JSON.parse(uploadRes.data);
                    if (data.code === 0) {
                      resolve(data);
                    } else {
                      reject(new Error(data.message || '上传失败'));
                    }
                  } catch (e) {
                    reject(new Error('解析响应失败'));
                  }
                } else {
                  reject(new Error(`上传失败: ${uploadRes.statusCode}`));
                }
              },
              fail: (err) => {
                reject(err);
              }
            });
          });
        });

        const results = await Promise.all(uploadPromises);

        // 所有照片上传成功
        uni.hideLoading();

        // 显示成功信息
        uni.showToast({
          title: `成功上传${results.length}张照片`,
          icon: 'success'
        });

        // 刷新任务列表
        // TODO: 实际应用中应该调用API标记订单为急冻状态
        // await markOrderAsFreezing(task.orderId);

        // 2秒后刷新列表
        setTimeout(() => {
          loadTasks();
        }, 2000);

      } catch (error: any) {
        uni.hideLoading();
        console.error('Upload production photos error:', error);
        uni.showToast({
          title: error.message || '上传失败',
          icon: 'none'
        });
      }
    }
  });
};

const completeProduction = (task: any) => {
  uni.showToast({ title: '完成制作功能开发中', icon: 'none' });
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
  font-size: 28rpx;
  color: #666;
  border-radius: 12rpx;
  transition: all 0.3s;

  &.active {
    background-color: #56ab91;
    color: #fff;
    font-weight: 500;
  }
}

.task-list {
  padding: 0 32rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0;

  .empty-icon {
    font-size: 120rpx;
    margin-bottom: 24rpx;
  }

  .empty-text {
    font-size: 28rpx;
    color: #666;
  }
}

.task-card {
  background-color: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
  padding-bottom: 24rpx;
  border-bottom: 1rpx solid #f0f0f0;
}

.order-id {
  font-size: 32rpx;
  font-weight: bold;
  color: #333;
}

.task-status {
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;

  &.pending {
    background-color: #fff7e6;
    color: #fa8c16;
  }

  &.in-progress {
    background-color: #e6f7ff;
    color: #1890ff;
  }

  &.completed {
    background-color: #f6ffed;
    color: #52c41a;
  }
}

.task-info {
  margin-bottom: 24rpx;
}

.info-row {
  display: flex;
  padding: 12rpx 0;

  .label {
    font-size: 28rpx;
    color: #666;
    width: 160rpx;
    flex-shrink: 0;
  }

  .value {
    font-size: 28rpx;
    color: #333;
    flex: 1;

    &.highlight {
      color: #56ab91;
      font-weight: 500;
    }
  }
}

.task-actions {
  display: flex;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 8rpx;
  font-size: 28rpx;
  border: none;

  &.outline {
    background-color: #fff;
    border: 2rpx solid #d9d9d9;
    color: #666;
  }

  &.primary {
    background-color: #56ab91;
    color: #fff;
  }

  &.warning {
    background-color: #fa8c16;
    color: #fff;
  }

  &.success {
    background-color: #52c41a;
    color: #fff;
  }

  &:active {
    opacity: 0.8;
  }
}
</style>
