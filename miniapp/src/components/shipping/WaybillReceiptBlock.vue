<template>
  <!-- 发货表单上方的「上传快递存根」块（2026-11-10）。
       鲜食发货弹窗、补剂发货弹窗、合并/拆包发货页三处共用这一个，
       免得三个地方长成三种样子、说成三句话。

       文案一律由 `utils/waybill-receipt-view.ts` 的 buildReceiptView 给，
       组件只负责画和收点击，不自己拼句子。 -->
  <view class="receipt" :class="`receipt--${view.tone}`">
    <view class="receipt__row" @tap="onRowTap">
      <text class="receipt__icon">{{ icon }}</text>
      <view class="receipt__text">
        <text class="receipt__title">{{ view.title }}</text>
        <text v-if="view.desc" class="receipt__desc">{{ view.desc }}</text>
      </view>
      <text v-if="canPick" class="receipt__action">{{ actionLabel }}</text>
    </view>

    <view v-if="view.canManual || canRepick" class="receipt__extra">
      <text v-if="canRepick" class="receipt__link" @tap.stop="emit('pick')">
        {{ hasImage ? '换一张' : '上传存根' }}
      </text>
      <text
        v-if="view.canManual"
        class="receipt__link receipt__link--warn"
        @tap.stop="emit('manual')"
      >手动填写单号</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ReceiptView } from '../../utils/waybill-receipt-view';

const props = defineProps<{
  view: ReceiptView;
  /** 正在上传/识别：整块不可点 */
  busy?: boolean;
  /** 已经传过一张（决定"换一张"还是"上传存根"） */
  hasImage?: boolean;
}>();

const emit = defineEmits<{
  (e: 'pick'): void;
  (e: 'manual'): void;
}>();

const icon = computed(() => {
  if (props.view.tone === 'ok') return '✓';
  if (props.view.tone === 'warn') return '!';
  if (props.view.tone === 'error') return '!';
  return '📷';
});

const canPick = computed(() => !props.busy && !!props.hasImage);
const canRepick = computed(() => !props.busy && !props.view.canManual && !props.hasImage);

const actionLabel = computed(() => (props.busy ? '识别中…' : '预览'));

function onRowTap() {
  if (props.busy) return;
  emit('pick');
}
</script>

<style scoped>
.receipt {
  margin-bottom: 20rpx;
  padding: 18rpx 20rpx;
  border-radius: 14rpx;
  background: #f7f8f7;
  border: 1rpx solid #e8ebe9;
}
.receipt--ok { background: #eef7f0; border-color: #c9e3cf; }
.receipt--warn { background: #fdf6ec; border-color: #f0d9b5; }
.receipt--error { background: #fdf0ef; border-color: #f2cfcb; }

.receipt__row { display: flex; align-items: flex-start; }
.receipt__icon { flex: none; width: 44rpx; font-size: 30rpx; line-height: 1.5; }
.receipt__text { flex: 1; min-width: 0; }
.receipt__title { display: block; font-size: 26rpx; color: #1f2d27; font-weight: 600; }
.receipt__desc { display: block; margin-top: 6rpx; font-size: 22rpx; color: #7c8580; line-height: 1.5; }
.receipt--warn .receipt__desc { color: #a97b33; }
.receipt--error .receipt__desc { color: #b4463c; }
.receipt__action { flex: none; margin-left: 12rpx; font-size: 22rpx; color: #2b5040; }

.receipt__extra { display: flex; justify-content: flex-end; gap: 28rpx; margin-top: 12rpx; }
.receipt__link { font-size: 23rpx; color: #2b5040; }
.receipt__link--warn { color: #a97b33; }
</style>
