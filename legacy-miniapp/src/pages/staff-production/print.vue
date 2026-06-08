<template>
  <view
    class="print-page"
    :style="{ '--status-bar-height': statusBarHeight + 'px' }"
  >
    <!-- 隐藏的Canvas元素用于绘制 -->
    <canvas
      canvas-id="printCanvas"
      :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px', position: 'fixed', left: '-9999px' }"
    ></canvas>

    <!-- 加载状态 -->
    <view v-if="loading" class="loading-state">
      <view class="loading-spinner"></view>
      <text class="loading-text">生成打印预览中...</text>
    </view>

    <!-- 预览内容 -->
    <view v-else-if="printImage" class="preview-content">
      <!-- 状态栏占位 -->
      <view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>

      <!-- 顶部导航 -->
      <view class="nav-bar" :style="{ top: statusBarHeight + 'px' }">
        <view class="back-btn" @tap="goBack">
          <text>←</text>
        </view>
        <text class="nav-title">打印预览</text>
        <view class="placeholder"></view>
      </view>

      <!-- 打印图片预览 -->
      <view class="image-container">
        <image
          :src="printImage"
          mode="widthFix"
          class="print-image"
          @tap="previewImage"
        />
      </view>

      <!-- 操作按钮 -->
      <view class="action-buttons">
        <button class="action-btn secondary" @tap="goBack">
          返回
        </button>
        <button class="action-btn primary" @tap="saveToAlbum">
          💾 保存到相册
        </button>
      </view>

      <!-- 使用说明 -->
      <view class="instructions">
        <view class="instruction-title">📄 打印说明</view>
        <view class="instruction-steps">
          <text class="step">1. 点击"保存到相册"按钮</text>
          <text class="step">2. 打开手机相册，找到保存的图片</text>
          <text class="step">3. 点击分享 → 打印</text>
          <text class="step">4. 选择您的WiFi打印机进行打印</text>
        </view>
        <view class="instruction-note">
          <text>💡 提示：iOS用户可使用AirPrint，Android用户可使用系统打印服务</text>
        </view>
      </view>
    </view>

    <!-- 错误状态 -->
    <view v-else class="error-state">
      <text class="error-icon">⚠️</text>
      <text class="error-text">生成打印预览失败</text>
      <button class="retry-btn" @tap="goBack">返回</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { drawProductionTaskPrint, type TaskDetail } from './utils/canvas-printer';

// Canvas尺寸（A4 @150 DPI）
const canvasWidth = 1240;
const canvasHeight = 1754;

// 状态栏高度
const statusBarHeight = ref(0);

// 状态
const loading = ref(true);
const printImage = ref('');

// 任务详情（从路由参数获取）
const taskDetailData = ref<TaskDetail | null>(null);

// 页面加载
onMounted(() => {
  // 获取状态栏高度
  const systemInfo = uni.getSystemInfoSync();
  statusBarHeight.value = systemInfo.statusBarHeight || 0;

  // 获取页面参数
  const pages = getCurrentPages();
  const currentPage = pages[pages.length - 1];
  const options = (currentPage as any).options;

  if (options.taskData) {
    try {
      taskDetailData.value = JSON.parse(decodeURIComponent(options.taskData));
      generatePrint();
    } catch (error) {
      console.error('解析任务数据失败', error);
      loading.value = false;
    }
  } else {
    console.error('缺少任务数据');
    loading.value = false;
  }
});

// 生成打印预览
const generatePrint = async () => {
  if (!taskDetailData.value) {
    loading.value = false;
    return;
  }

  try {
    const imagePath = await drawProductionTaskPrint(taskDetailData.value);
    printImage.value = imagePath;
    loading.value = false;
  } catch (error) {
    console.error('生成打印预览失败', error);
    loading.value = false;
    uni.showToast({
      title: '生成失败',
      icon: 'none',
    });
  }
};

// 预览图片
const previewImage = () => {
  if (!printImage.value) return;

  uni.previewImage({
    urls: [printImage.value],
    current: printImage.value,
  });
};

// 保存到相册
const saveToAlbum = () => {
  if (!printImage.value) return;

  // 请求相册权限
  uni.getSetting({
    success: (res) => {
      if (!res.authSetting['scope.writePhotosAlbum']) {
        uni.authorize({
          scope: 'scope.writePhotosAlbum',
          success: () => {
            saveImage();
          },
          fail: () => {
            uni.showModal({
              title: '需要相册权限',
              content: '需要您授权保存图片到相册',
              showCancel: false,
            });
          },
        });
      } else {
        saveImage();
      }
    },
  });
};

// 保存图片逻辑
const saveImage = () => {
  uni.saveImageToPhotosAlbum({
    filePath: printImage.value,
    success: () => {
      uni.showToast({
        title: '已保存到相册',
        icon: 'success',
      });
    },
    fail: (error) => {
      console.error('保存图片失败', error);
      uni.showToast({
        title: '保存失败',
        icon: 'none',
      });
    },
  });
};

// 返回上一页
const goBack = () => {
  uni.navigateBack();
};
</script>

<style scoped lang="scss">
.print-page {
  min-height: 100vh;
  background-color: #f5f5f5;
  display: flex;
  flex-direction: column;
}

.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 32rpx;

  .loading-spinner {
    width: 80rpx;
    height: 80rpx;
    border: 6rpx solid #f0f0f0;
    border-top-color: #1890ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .loading-text {
    font-size: 28rpx;
    color: #666;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.preview-content {
  flex: 1;
  display: flex;
  flex-direction: column;
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
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx;
  background-color: #fff;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);
  z-index: 999;

  .back-btn {
    width: 64rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    color: #333;
  }

  .nav-title {
    font-size: 32rpx;
    font-weight: bold;
    color: #333;
  }

  .placeholder {
    width: 64rpx;
  }
}

.image-container {
  flex: 1;
  padding: 32rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #e5e5e5;
  overflow: hidden;

  .print-image {
    width: 100%;
    background-color: #fff;
    box-shadow: 0 8rpx 24rpx rgba(0, 0, 0, 0.1);
  }
}

.action-buttons {
  display: flex;
  gap: 24rpx;
  padding: 24rpx 32rpx;
  background-color: #fff;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.05);

  .action-btn {
    flex: 1;
    height: 88rpx;
    line-height: 88rpx;
    border-radius: 12rpx;
    font-size: 30rpx;
    font-weight: 500;
    border: none;

    &.secondary {
      background-color: #f5f5f5;
      color: #666;
    }

    &.primary {
      background-color: #1890ff;
      color: #fff;
    }

    &:active {
      opacity: 0.8;
    }
  }
}

.instructions {
  background-color: #fff;
  margin: 24rpx 32rpx;
  padding: 32rpx;
  border-radius: 16rpx;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.05);

  .instruction-title {
    font-size: 28rpx;
    font-weight: bold;
    color: #333;
    margin-bottom: 24rpx;
  }

  .instruction-steps {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-bottom: 24rpx;

    .step {
      font-size: 26rpx;
      color: #666;
      line-height: 1.6;
    }
  }

  .instruction-note {
    padding-top: 24rpx;
    border-top: 1rpx solid #f0f0f0;

    text {
      font-size: 24rpx;
      color: #999;
      line-height: 1.6;
    }
  }
}

.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 32rpx;

  .error-icon {
    font-size: 120rpx;
  }

  .error-text {
    font-size: 28rpx;
    color: #666;
  }

  .retry-btn {
    margin-top: 32rpx;
    padding: 20rpx 48rpx;
    background-color: #1890ff;
    color: #fff;
    border-radius: 8rpx;
    font-size: 28rpx;
    border: none;
  }
}
</style>
