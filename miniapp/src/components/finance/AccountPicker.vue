<template>
  <view class="account-picker">
    <view
      v-for="option in options"
      :key="option.code || 'ALL'"
      class="chip"
      :class="{ 'chip--on': option.code === modelValue }"
      @tap="select(option.code)"
    >
      {{ option.label }}
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  FINANCE_ACCOUNTS,
  setLastAccount,
  type FinanceAccountCode,
} from '../../utils/finance-account'

/**
 * 财务账户选择器（2026-11-19 账户化，设计文档 §1.1）。
 *
 * 五个账户横向 chips，选中态深绿底米白字（员工端 UI 规范 §5「分段筛选」）。
 * 默认会「记住上次用的账户」（storage `finance:lastAccount`）：五处用到账户
 * 的地方共用同一个 key，老板在记一笔里选了「我的支付宝」，
 * 下次代客下单、登记退款都会带出来。
 *
 * `allowAll` 只给「收支明细」的筛选加一个「全部」：表单里不允许空账户。
 * `remember` 给筛选关掉记忆，避免筛一下明细就把记账默认账户改了。
 */
const props = withDefaults(
  defineProps<{
    /** 选中的账户 code；allowAll 时 '' 表示全部账户 */
    modelValue: string
    /** 是否在首位加「全部」（仅筛选场景） */
    allowAll?: boolean
    /** 选择后是否记住为「上次用的账户」，筛选场景传 false */
    remember?: boolean
  }>(),
  {
    allowAll: false,
    remember: true,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const options = computed<Array<{ code: string; label: string }>>(() =>
  props.allowAll
    ? [{ code: '', label: '全部账户' }, ...FINANCE_ACCOUNTS]
    : [...FINANCE_ACCOUNTS],
)

function select(code: string) {
  if (code === props.modelValue) return
  emit('update:modelValue', code)
  if (props.remember && code) {
    setLastAccount(code as FinanceAccountCode)
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

/* 横向 chips：放不下就换行，不横向滚动（老板在手机上不用左右拖） */
.account-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 24rpx;
  font-size: $staff-font-sub;
  color: $staff-ink;
  background: $staff-bg;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-pill;
}

.chip--on {
  font-weight: 600;
  color: $staff-cream;
  background: $staff-brand;
  border-color: $staff-brand;
}
</style>
