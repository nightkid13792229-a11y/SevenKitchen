<template>
  <view class="upload-page">
    <view v-if="loading" class="loading">加载中...</view>

    <template v-else>
      <view class="section card">
        <view class="card-head">
          <text class="card-title">订单截图</text>
          <text class="card-sub">每张图 = 一笔订单 · 最多 5 笔</text>
        </view>
        <view class="shots">
          <view v-for="(photo, index) in photos" :key="photo.tempPath" class="shot">
            <image :src="photo.tempPath" mode="aspectFill" class="shot-img" @tap="preview(index)" />
            <view v-if="photo.uploading" class="shot-mask"><text>上传中</text></view>
            <view v-else-if="photo.error" class="shot-mask error" @tap="retry(photo)"><text>重试</text></view>
            <view class="shot-remove" @tap.stop="remove(index)">×</view>
          </view>
          <view v-if="photos.length < 5" class="shot add" @tap="chooseImages">
            <text class="add-plus">＋</text>
            <text class="add-text">继续添加</text>
          </view>
        </view>
        <text class="hint">不同渠道的订单可以一起传，系统会分别识别。</text>
      </view>

      <view class="section tips">
        <text class="tips-title">这样截图，AI 才读得准</text>
        <view class="tip"><text class="tip-no">①</text><text>先点开「共 N 件」，把所有商品展开再截。</text></view>
        <view class="tip"><text class="tip-no">②</text><text>截图里要有商品金额、运费、包装费和实付。</text></view>
        <view class="tip"><text class="tip-no">③</text><text>长截图可以直接传，系统会自动分段读取。</text></view>
      </view>

      <text class="hint bottom-hint">渠道由 AI 识别，识别错了可以在结果页改；识别结果只是草稿。</text>

      <view class="footer">
        <button class="primary-btn" :loading="recognizing" :disabled="recognizing" @tap="startRecognize">
          {{ recognizing ? '识别中...' : `开始识别（${photos.length} 笔订单）` }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  getOrderImports,
  getPurchaseListDetail,
  importOrderScreenshots,
  startPurchase,
  uploadOrderScreenshot,
} from '../api/purchasing';

interface PhotoItem {
  tempPath: string;
  url?: string;
  key?: string;
  uploading: boolean;
  error: boolean;
}

const purchaseListId = ref('');
const loading = ref(true);
const recognizing = ref(false);
const photos = ref<PhotoItem[]>([]);

onLoad(async (options: Record<string, string>) => {
  purchaseListId.value = String(options?.id || '');
  if (!purchaseListId.value) {
    uni.showToast({ title: '缺少采购清单', icon: 'none' });
    loading.value = false;
    return;
  }

  try {
    const res: any = await getPurchaseListDetail(purchaseListId.value);
    if (res.code !== 0) {
      throw new Error(res.message || '加载失败');
    }
    const list = res.data;
    if (list.status !== 'PENDING') {
      uni.showToast({ title: '清单已完成，不能导入', icon: 'none' });
      setTimeout(() => uni.navigateBack(), 800);
      return;
    }
    if (!list.startedAt) {
      const confirmed = await confirmModal(
        '还没开始采购',
        '上传订单截图会生成采购记录，需要先点「开始采购」。现在开始吗？',
      );
      if (!confirmed) {
        uni.navigateBack();
        return;
      }
      await startPurchase(purchaseListId.value);
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

function confirmModal(title: string, content: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      confirmText: '开始采购',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
}

function chooseImages() {
  const remain = 5 - photos.value.length;
  uni.chooseImage({
    count: remain,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const paths = res.tempFilePaths || [];
      for (const path of paths) {
        const photo: PhotoItem = {
          tempPath: path,
          uploading: true,
          error: false,
        };
        photos.value.push(photo);
        // 必须拿数组里的响应式代理再上传：直接改原始对象不会触发页面刷新，
        // 会出现“图片已经传完但一直显示上传中”的假象。
        const stored = photos.value[photos.value.length - 1];
        void uploadOne(stored);
      }
    },
  });
}

async function uploadOne(photo: PhotoItem) {
  photo.uploading = true;
  photo.error = false;
  try {
    const uploaded = await uploadOrderScreenshot(photo.tempPath);
    photo.url = uploaded.url;
    photo.key = uploaded.key;
  } catch (error: any) {
    photo.error = true;
    uni.showToast({ title: error?.message || '上传失败', icon: 'none' });
  } finally {
    photo.uploading = false;
  }
}

function retry(photo: PhotoItem) {
  void uploadOne(photo);
}

function remove(index: number) {
  photos.value.splice(index, 1);
}

async function loadDraftCount(): Promise<number> {
  try {
    const res: any = await getOrderImports(purchaseListId.value);
    return res.code === 0
      ? (res.data || []).filter((item: any) => item.status === 'DRAFT').length
      : 0;
  } catch {
    return 0;
  }
}

function preview(index: number) {
  uni.previewImage({
    urls: photos.value.map((photo) => photo.tempPath),
    current: photos.value[index]?.tempPath,
  });
}

async function startRecognize() {
  if (recognizing.value) return;
  if (photos.value.length === 0) {
    uni.showToast({ title: '请先选择订单截图', icon: 'none' });
    return;
  }
  if (photos.value.some((photo) => photo.uploading)) {
    uni.showToast({ title: '还有图片在上传', icon: 'none' });
    return;
  }
  const failed = photos.value.filter((photo) => !photo.url || !photo.key);
  if (failed.length > 0) {
    uni.showToast({ title: '有图片上传失败，请重试', icon: 'none' });
    return;
  }

  recognizing.value = true;
  uni.showLoading({ title: '识别中...', mask: true });
  try {
    const res: any = await importOrderScreenshots(
      purchaseListId.value,
      photos.value.map((photo) => photo.url as string),
      photos.value.map((photo) => photo.key as string),
    );
    if (res.code !== 0) {
      throw new Error(res.message || '识别失败');
    }
    uni.hideLoading();
    uni.redirectTo({
      url: `/pages/staff-purchasing/order-import/review?id=${purchaseListId.value}`,
    });
  } catch (error: any) {
    uni.hideLoading();
    const message = error?.message || '请稍后重试，或手动录入';
    const isDuplicate = message.includes('已经导入过');
    uni.showModal({
      title: isDuplicate ? '已经有这笔识别' : '识别失败',
      content: isDuplicate
        ? '这张截图之前已经导入过，草稿还在。去核对页继续处理，不要重复上传。'
        : message,
      confirmText: isDuplicate ? '去核对' : '知道了',
      showCancel: false,
      success: async (res) => {
        if (!isDuplicate || !res.confirm) return;
        // 已经生成过的图再传也会被判重复；先看还有没有草稿，没有就别把人送进空页面。
        const drafts = await loadDraftCount();
        if (drafts > 0) {
          uni.redirectTo({
            url: `/pages/staff-purchasing/order-import/review?id=${purchaseListId.value}`,
          });
        } else {
          uni.showToast({
            title: '这张图已经生成过记录了',
            icon: 'none',
          });
        }
      },
    });
  } finally {
    recognizing.value = false;
  }
}
</script>

<style scoped lang="scss">
.upload-page {
  min-height: 100vh;
  background: #f3eddd;
  padding: 24rpx 24rpx 220rpx;
  box-sizing: border-box;
}

.loading {
  text-align: center;
  color: #6b6653;
  padding-top: 120rpx;
}

.section {
  background: #fbfcf7;
  border: 1rpx solid #e2dcc9;
  border-radius: 24rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 18rpx;
}

.card-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.card-sub {
  font-size: 20rpx;
  color: #6b6653;
}

.shots {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.shot {
  position: relative;
  width: 180rpx;
  height: 180rpx;
  border-radius: 20rpx;
  overflow: hidden;
  background: #f7f2e4;
}

.shot-img {
  width: 100%;
  height: 100%;
}

.shot-mask {
  position: absolute;
  inset: 0;
  background: rgba(23, 48, 38, 0.55);
  color: #fff;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shot-mask.error {
  background: rgba(180, 69, 58, 0.7);
}

.shot-remove {
  position: absolute;
  top: 4rpx;
  right: 8rpx;
  color: #fff;
  font-size: 32rpx;
  line-height: 1;
  text-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.5);
}

.shot.add {
  border: 2rpx dashed #cfc7ae;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8a8574;
}

.add-plus {
  font-size: 44rpx;
  line-height: 1;
}

.add-text {
  font-size: 20rpx;
  margin-top: 6rpx;
}

.hint {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #6b6653;
  line-height: 1.5;
}

.bottom-hint {
  padding: 0 8rpx;
}

.tips {
  background: #fbf7ea;
  border-color: #eadfc2;
}

.tips-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #7a5c28;
  margin-bottom: 12rpx;
}

.tip {
  display: flex;
  gap: 10rpx;
  font-size: 23rpx;
  color: #6b6653;
  line-height: 1.6;
}

.tip-no {
  color: #7a5c28;
  font-weight: 600;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx 24rpx calc(20rpx + env(safe-area-inset-bottom));
  background: linear-gradient(to top, #f3eddd 70%, rgba(243, 237, 221, 0));
}

.primary-btn {
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 24rpx;
  background: #7a5c28;
  color: #fdf8ea;
  font-size: 30rpx;
  font-weight: 600;
}

.primary-btn[disabled] {
  background: #d9d4c4;
  color: #8d8877;
}
</style>
