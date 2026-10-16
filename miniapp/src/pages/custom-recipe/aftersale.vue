<template>
  <view class="aftersale-page">
    <!--
      售后页（2026-10-16，批次 2.5）
      「问个问题 / 调整食谱 / 其他意见」三类**来自选项字典**，不写死在前端。
      提交与撤回的规则全部由后端判定，页面只把后端说的原因如实显示出来。
    -->
    <view v-if="loading" class="state-block">
      <text class="state-text">加载中...</text>
    </view>

    <template v-else>
      <!-- 已经提过的：显示进度 -->
      <view v-for="item in list" :key="item.id" class="section aftersale-card">
        <view class="aftersale-head">
          <text class="aftersale-type">{{ item.typeLabel }}</text>
          <text class="aftersale-status" :class="`status--${item.status}`">
            {{ item.statusLabel }}
          </text>
        </view>
        <text class="aftersale-desc">{{ item.description }}</text>

        <!-- 进度时间轴：节点与文案由后端下发 -->
        <view class="progress-list">
          <view
            v-for="(step, index) in item.progress.timeline"
            :key="step.code"
            class="progress-item"
            :class="{
              'progress-item--done': step.done,
              'progress-item--active': step.active,
            }"
          >
            <view class="progress-marker">
              <text class="progress-dot">{{ step.done ? '✓' : '' }}</text>
              <view
                v-if="index < item.progress.timeline.length - 1"
                class="progress-line"
              />
            </view>
            <view class="progress-body">
              <text class="progress-label">{{ step.label }}</text>
              <text v-if="step.note" class="progress-note">{{ step.note }}</text>
            </view>
          </view>
        </view>

        <!-- 客服的处理说明 / 驳回原因，如实显示 -->
        <view v-if="item.handleNote" class="aftersale-note">
          <text class="aftersale-note-label">处理说明</text>
          <text class="aftersale-note-text">{{ item.handleNote }}</text>
        </view>
        <view v-if="item.rejectReason" class="aftersale-note">
          <text class="aftersale-note-label">说明</text>
          <text class="aftersale-note-text">{{ item.rejectReason }}</text>
        </view>

        <!-- 能不能撤回由后端算好 -->
        <button
          v-if="item.canCancel"
          class="btn-secondary"
          :loading="cancellingId === item.id"
          @tap="handleCancel(item)"
        >
          撤回这条
        </button>
      </view>

      <!-- 提交新的：已经有未处理完的就不显示表单（后端也会拦，这里省一次往返） -->
      <view v-if="canSubmitNew" class="section">
        <view class="section-title">遇到什么问题了？</view>

        <view class="type-list">
          <view
            v-for="option in typeOptions"
            :key="option.code"
            class="type-option"
            :class="{ 'type-option--picked': form.type === option.code }"
            @tap="form.type = option.code"
          >
            <text class="type-icon">{{ option.icon || '·' }}</text>
            <view class="type-text">
              <text class="type-label">{{ option.label }}</text>
              <text v-if="option.description" class="type-desc">
                {{ option.description }}
              </text>
            </view>
          </view>
        </view>

        <textarea
          v-model="form.description"
          class="desc-input"
          placeholder="说一下具体情况，比如「吃了三天有点软便」"
          :maxlength="1000"
          auto-height
        />
        <text class="word-count">{{ form.description.length }} / 1000</text>

        <button
          class="btn-primary"
          :loading="submitting"
          :disabled="submitting || !canSubmit"
          @tap="handleSubmit"
        >
          提交
        </button>
        <text v-if="!canSubmit && !submitting" class="hint">
          选个类型、写一句具体情况就能提交
        </text>
      </view>

      <view v-else-if="list.length" class="section done-note">
        <text>你已经提交过售后，我们正在处理。有新情况可以直接联系客服补充。</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import {
  cancelAftersale,
  fetchAftersales,
  fetchAftersaleTypes,
  submitAftersale,
  type AftersaleItem,
  type AftersaleTypeOption,
} from '@/api/custom-recipe';

/**
 * 售后页（2026-10-16，批次 2.5）
 *
 * ## 页面里**没有业务判断**
 *
 * · 类型选项来自**选项字典**（后台可加可改，不用发版）
 * · "能不能撤回"由后端算好（`item.canCancel`）
 * · 进度节点与文案由后端下发
 * · 提交失败时显示的**是后端给的原因**（"已超过售后受理期（交付后 30 天内）"），
 *   不是前端编的通用文案
 *
 * 页面自己只做一件事：判断"有没有未处理完的"来决定显不显示表单 ——
 * 而那也只是省一次往返，真正的拦截在后端。
 */

const orderId = ref('');
const loading = ref(true);
const list = ref<AftersaleItem[]>([]);
const typeOptions = ref<AftersaleTypeOption[]>([]);
const submitting = ref(false);
const cancellingId = ref('');

const form = reactive({ type: '', description: '' });

/** 有未处理完的就不再显示表单（后端也会拦，这里只是省一次往返） */
const canSubmitNew = computed(
  () => !list.value.some((item) => item.canCancel),
);

const canSubmit = computed(
  () => Boolean(form.type) && form.description.trim().length > 0,
);

const load = async () => {
  loading.value = true;
  try {
    const [items, types] = await Promise.all([
      fetchAftersales(orderId.value),
      fetchAftersaleTypes(),
    ]);
    list.value = items;
    typeOptions.value = types;
    // 默认选中字典里标了 isDefault 的那个，没有就选第一个
    if (!form.type && types.length) {
      form.type = types[0].code;
    }
  } finally {
    loading.value = false;
  }
};

const handleSubmit = async () => {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const result = await submitAftersale({
      orderId: orderId.value,
      type: form.type,
      description: form.description.trim(),
    });

    if (!result.ok) {
      // 后端的原因直接给顾客看 —— 它比前端编的通用文案有用得多
      uni.showModal({
        title: '没能提交',
        content: result.message || '请稍后重试，或直接联系客服',
        showCancel: false,
      });
      return;
    }

    uni.showToast({ title: '已提交，我们会尽快看', icon: 'none' });
    form.description = '';
    await load();
  } catch (error) {
    uni.showToast({
      title: (error as Error)?.message || '提交失败，请重试',
      icon: 'none',
    });
  } finally {
    submitting.value = false;
  }
};

const handleCancel = async (item: AftersaleItem) => {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '撤回这条？',
      content: '撤回后这条售后就不再处理了。如果只是想说点补充情况，直接联系客服更快。',
      confirmText: '撤回',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    });
  });
  if (!confirmed) return;

  cancellingId.value = item.id;
  try {
    const result = await cancelAftersale(item.id);
    if (!result.ok) {
      uni.showToast({ title: result.message || '撤回失败', icon: 'none' });
      return;
    }
    uni.showToast({ title: '已撤回', icon: 'none' });
    await load();
  } finally {
    cancellingId.value = '';
  }
};

onLoad((options) => {
  orderId.value = options?.orderId ? decodeURIComponent(options.orderId) : '';
  load();
});
</script>

<style scoped>
.aftersale-page {
  min-height: 100vh;
  padding: 24rpx;
  background: #16261f;
}

.state-block {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.state-text {
  font-size: 26rpx;
  color: rgba(244, 236, 216, 0.6);
}

.section {
  padding: 28rpx 32rpx;
  margin-bottom: 24rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(216, 188, 133, 0.22);
  border-radius: 28rpx;
}

.section-title {
  margin-bottom: 20rpx;
  font-size: 30rpx;
  font-weight: 600;
  color: #d8bc85;
}

.aftersale-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
}

.aftersale-type {
  font-size: 30rpx;
  font-weight: 600;
  color: #f4ecd8;
}

.aftersale-status {
  padding: 4rpx 16rpx;
  font-size: 22rpx;
  border-radius: 100rpx;
  background: rgba(216, 188, 133, 0.18);
  color: #d8bc85;
}

.status--RESOLVED {
  background: rgba(123, 196, 138, 0.2);
  color: #7bc48a;
}

.status--REJECTED {
  background: rgba(224, 139, 139, 0.2);
  color: #e08b8b;
}

.aftersale-desc {
  display: block;
  margin-bottom: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.85);
}

.progress-list {
  margin: 16rpx 0;
}

.progress-item {
  display: flex;
  gap: 16rpx;
  min-height: 72rpx;
}

.progress-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 32rpx;
  flex-shrink: 0;
}

.progress-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30rpx;
  height: 30rpx;
  font-size: 18rpx;
  color: #fff;
  background: rgba(216, 188, 133, 0.28);
  border-radius: 50%;
}

.progress-item--done .progress-dot {
  background: #6fb3a0;
}

.progress-item--active .progress-dot {
  background: #d8bc85;
  box-shadow: 0 0 0 6rpx rgba(216, 188, 133, 0.22);
}

.progress-line {
  flex: 1;
  width: 2rpx;
  margin: 6rpx 0;
  background: rgba(216, 188, 133, 0.22);
}

.progress-body {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  padding-bottom: 16rpx;
}

.progress-label {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.6);
}

.progress-item--done .progress-label,
.progress-item--active .progress-label {
  color: #f4ecd8;
}

.progress-note {
  font-size: 22rpx;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.5);
}

.aftersale-note {
  padding: 16rpx 20rpx;
  margin-top: 12rpx;
  background: rgba(216, 188, 133, 0.1);
  border-radius: 16rpx;
}

.aftersale-note-label {
  display: block;
  margin-bottom: 6rpx;
  font-size: 22rpx;
  color: #d8bc85;
}

.aftersale-note-text {
  font-size: 26rpx;
  line-height: 1.6;
  color: #f4ecd8;
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.type-option {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 22rpx 24rpx;
  background: rgba(255, 255, 255, 0.04);
  border: 1rpx solid rgba(216, 188, 133, 0.2);
  border-radius: 20rpx;
}

.type-option--picked {
  border-color: #d8bc85;
  background: rgba(216, 188, 133, 0.12);
}

.type-icon {
  font-size: 32rpx;
}

.type-text {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  flex: 1;
}

.type-label {
  font-size: 28rpx;
  color: #f4ecd8;
}

.type-desc {
  font-size: 22rpx;
  color: rgba(244, 236, 216, 0.55);
}

.desc-input {
  width: 100%;
  min-height: 180rpx;
  padding: 20rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #f4ecd8;
  background: rgba(255, 255, 255, 0.05);
  border: 1rpx solid rgba(216, 188, 133, 0.2);
  border-radius: 20rpx;
  box-sizing: border-box;
}

.word-count {
  display: block;
  margin: 8rpx 0 24rpx;
  font-size: 22rpx;
  text-align: right;
  color: rgba(244, 236, 216, 0.4);
}

.btn-primary {
  color: #1e3a2f;
  background: #d8bc85;
}

.btn-secondary {
  margin-top: 20rpx;
  color: #f4ecd8;
  background: transparent;
  border: 1rpx solid rgba(216, 188, 133, 0.5);
}

.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  text-align: center;
  color: rgba(244, 236, 216, 0.45);
}

.done-note {
  font-size: 26rpx;
  line-height: 1.6;
  color: rgba(244, 236, 216, 0.7);
}
</style>
