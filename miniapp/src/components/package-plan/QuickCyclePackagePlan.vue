<template>
  <!--
    快速选备餐天数 + 自定义分装 · 两页共用（2026-11-01 抽出）

    ## 为什么抽它

    这一块在**成品订购页**和 **DIY 配置页**里各写了一遍：模板约 70 行、
    样式约 150 行（还已经漂移了：删除按钮一个红一个灰、加行按钮一个宽一个窄）。
    选项页里甚至还留着 130 行被后一份同名样式盖掉的死代码。

    ## 它不做什么

    · 不管状态 —— 状态在 `usePackagePlan`（页面持有），这里只接收、只发事件
    · 不算价格 —— 价格由后端算（项目硬规矩）
    · 不弹确认框 —— "取消自定义"会丢顾客填的内容，二次确认在 composable 里
    · 不决定"进入自定义要不要清天数" —— 已在 composable 里统一

    ## 输入框为什么用"草稿值"

    输入框的值不能一边打字一边被归一化：
      · 袋数被 clamp 到 ≥1 时，清空后立刻变 1，顾客永远打不出个位数
      · 克数每次 input 都取整，打小数点会被吃掉，接着的 5 就变成 1005
    所以聚焦时**显示**以输入框里的原文为准（draft）；同时把原文发给页面归一化，
    让价格和摘要跟着走（否则改完数字立刻点"确认订单"，价格还是旧的、按钮会点了没反应）。
    失焦/点完成时再提交一次，做最终的取整与下限兜底。
    页面在提交订单前可以调 `commitAll()`，保证没失焦的值也算进去。
  -->
  <view class="package-plan">
    <view class="cycle-options">
      <view
        v-for="days in cycleOptions"
        :key="days"
        class="cycle-option"
        :class="{ active: !isCustom && cycleDays === days, disabled: isCustom }"
        @tap="selectCycle(days)"
      >
        <text class="cycle-text">{{ days }}天</text>
      </view>
    </view>

    <view v-if="isCustom" class="package-plan-mode-hint">
      <text class="package-plan-mode-hint-text">已启用自定义分装，上方天数选择暂不生效</text>
    </view>

    <view class="package-plan-toolbar">
      <text class="package-plan-inline-summary">{{ summaryText }}</text>
      <button class="package-edit-button" @tap="toggleCustom">
        {{ editorOpen ? '取消自定义' : '自定义分装' }}
      </button>
    </view>

    <!--
      校验与提示合并成一块（2026-11-01）：
      以前"每袋不足 30g"和"总重不足 1000g"是二选一渲染，
      改完一个又冒一个。现在当前有几条问题就列几条，改一个少一条。
    -->
    <view v-if="warnings.length > 0" class="package-warning">
      <text
        v-for="warning in warnings"
        :key="warning"
        class="package-warning-text"
      >{{ warning }}</text>
    </view>

    <view v-if="editorOpen" class="package-plan-list">
      <view
        v-for="(row, index) in packagePlan"
        :key="index"
        class="package-plan-row"
      >
        <view class="package-input-group">
          <text class="package-input-label">每袋</text>
          <input
            class="package-input"
            type="number"
            :value="inputValue(index, 'packageSpecG', row)"
            @input="onFieldInput(index, 'packageSpecG', $event)"
            @blur="commitField(index, 'packageSpecG')"
            @confirm="commitField(index, 'packageSpecG')"
          />
          <text class="package-input-unit">g</text>
        </view>
        <view class="package-input-group">
          <text class="package-input-label">袋数</text>
          <input
            class="package-input"
            type="number"
            :value="inputValue(index, 'packageCount', row)"
            @input="onFieldInput(index, 'packageCount', $event)"
            @blur="commitField(index, 'packageCount')"
            @confirm="commitField(index, 'packageCount')"
          />
          <text class="package-input-unit">袋</text>
        </view>
        <!-- 只有一行时不显示删除：点了也没用（至少留一行），干脆不出现 -->
        <button
          v-if="packagePlan.length > 1"
          class="btn-remove-row"
          @tap="removeRow(index)"
        >
          删除
        </button>
      </view>
      <button class="btn-add-row" @tap="addRow">再加一种分装</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import {
  ORDER_CYCLE_OPTIONS,
  type PackagePlanItem,
} from '@/utils/order-package-plan'

type PackagePlanField = keyof PackagePlanItem

const props = withDefaults(
  defineProps<{
    /** 当前选中的天数；自定义模式下为 null */
    cycleDays?: number | null
    /** 可选天数，默认 7 / 15 / 30 */
    cycleOptions?: readonly number[]
    /** 分装行（页面传入，组件不持有） */
    packagePlan?: PackagePlanItem[]
    /** 是否处于"顾客自己定"模式 */
    isCustom?: boolean
    /** 编辑器是否展开 */
    editorOpen?: boolean
    /** 摘要文案（由 composable 统一算，避免两页各写一份） */
    summaryText?: string
    /** 当前的问题列表（每袋不足、未达起订量…），有几条列几条 */
    warnings?: string[]
  }>(),
  {
    cycleDays: null,
    cycleOptions: () => [...ORDER_CYCLE_OPTIONS],
    packagePlan: () => [],
    isCustom: false,
    editorOpen: false,
    summaryText: '',
    warnings: () => [],
  },
)

const emit = defineEmits<{
  (event: 'select-cycle', days: number): void
  (event: 'toggle-custom'): void
  (event: 'add-row'): void
  (event: 'update-row', index: number, field: PackagePlanField, value: string): void
  (event: 'remove-row', index: number): void
}>()

/**
 * 输入框草稿：只在聚焦期间存在。
 *
 * key = `行号:字段`；提交后立即删除，之后显示回到页面传进来的值。
 */
const drafts = reactive<Record<string, string>>({})

function draftKey(index: number, field: PackagePlanField): string {
  return `${index}:${field}`
}

/** 显示值：有草稿用草稿（保留顾客正在打的原文），否则用模型值 */
function inputValue(
  index: number,
  field: PackagePlanField,
  row: PackagePlanItem,
): string {
  const key = draftKey(index, field)
  if (key in drafts) return drafts[key]
  return String(row[field] ?? '')
}

function onFieldInput(
  index: number,
  field: PackagePlanField,
  event: { detail?: { value?: string | number } } | undefined,
): void {
  const value = event?.detail?.value
  const raw = value === undefined || value === null ? '' : String(value)
  // 草稿只管"显示"，保证光标不跳；模型也要跟上，价格与摘要不是滞后的
  drafts[draftKey(index, field)] = raw
  emit('update-row', index, field, raw)
}

/** 失焦/点完成：把原文交给页面归一化（取整、下限校验都在 composable 里） */
function commitField(index: number, field: PackagePlanField): void {
  const key = draftKey(index, field)
  if (!(key in drafts)) return
  const raw = drafts[key]
  delete drafts[key]
  emit('update-row', index, field, raw)
}

/**
 * 把还没失焦的值全部提交。
 *
 * 页面在"提交订单 / 生成制作单"前调用，避免顾客打完数字直接点按钮时丢了这次输入。
 */
function commitAll(): void {
  for (const key of Object.keys(drafts)) {
    const [indexPart, fieldPart] = key.split(':')
    const raw = drafts[key]
    delete drafts[key]
    emit('update-row', Number(indexPart), fieldPart as PackagePlanField, raw)
  }
}

function selectCycle(days: number): void {
  commitAll()
  emit('select-cycle', days)
}

function toggleCustom(): void {
  commitAll()
  emit('toggle-custom')
}

function addRow(): void {
  commitAll()
  emit('add-row')
}

function removeRow(index: number): void {
  // 先把别的行还在编辑的内容提交，再删行 —— 否则行号会错位
  commitAll()
  emit('remove-row', index)
}

// 收起编辑器 / 行数变化时，草稿里的旧行号就没有意义了
watch(
  () => props.editorOpen,
  (open) => {
    if (!open) commitAll()
  },
)
watch(
  () => props.packagePlan.length,
  () => {
    // 行数变了，行号会错位；静默丢弃草稿，显示回到模型值
    for (const key of Object.keys(drafts)) delete drafts[key]
  },
)

defineExpose({ commitAll })
</script>

<style scoped>
.package-plan {
  display: block;
}

/* 天数：三个等宽选项 */
.cycle-options {
  display: flex;
  gap: 12rpx;
}

.cycle-option {
  flex: 1;
  padding: 18rpx 12rpx;
  border: 2rpx solid #e5e8d4;
  border-radius: 8rpx;
  text-align: center;
  background-color: #fbfcf7;
}

.cycle-option.active {
  border-color: #1e3a2f;
  background-color: #eef2e4;
}

.cycle-option.disabled {
  opacity: 0.5;
}

.cycle-text {
  font-size: 28rpx;
  color: #26261f;
  font-weight: 700;
}

/* 自定义模式下的常驻说明：不再靠点灰按钮的 toast 解释 */
.package-plan-mode-hint {
  margin-top: 14rpx;
  padding: 12rpx 18rpx;
  background-color: #f6efe0;
  border: 1rpx solid rgba(176, 141, 79, 0.35);
  border-radius: 12rpx;
}

.package-plan-mode-hint-text {
  font-size: 22rpx;
  color: #8a6b33;
}

.package-plan-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-top: 24rpx;
}

.package-plan-inline-summary {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  font-weight: 700;
  color: #26261f;
  line-height: 1.45;
}

.package-edit-button {
  flex: 0 0 auto;
  height: 64rpx;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 26rpx;
  margin: 0;
  border: 1rpx solid rgba(216, 188, 133, 0.6);
  border-radius: 999rpx;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  color: #d8bc85;
  font-size: 24rpx;
  font-weight: 600;
}

.package-warning {
  margin-top: 16rpx;
  padding: 16rpx 18rpx;
  background-color: var(--sk-danger-soft, #f7e9e3);
  border: 1rpx solid var(--sk-danger, #b4553f);
  border-radius: 8rpx;
}

.package-warning-text {
  display: block;
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--sk-danger, #b4553f);
}

.package-plan-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 18rpx;
}

.package-plan-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx;
  border-radius: 8rpx;
  background-color: #fbfcf7;
}

.package-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8rpx;
  min-width: 0;
}

.package-input-label,
.package-input-unit {
  font-size: 24rpx;
  color: #6b6653;
  flex-shrink: 0;
}

.package-input {
  flex: 1;
  min-width: 0;
  height: 58rpx;
  text-align: center;
  border: 1rpx solid #e5e8d4;
  border-radius: 8rpx;
  font-size: 28rpx;
  color: #26261f;
  background-color: #fbfcf7;
}

.btn-add-row,
.btn-remove-row {
  min-width: 118rpx;
  height: 60rpx;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}

.btn-add-row {
  width: 100%;
  margin-top: 4rpx;
  border: 1rpx dashed #1e3a2f;
  color: #1e3a2f;
  background-color: #fbfcf7;
}

/* 删除：统一成红色描边（两页原来一个红一个灰） */
.btn-remove-row {
  flex: 0 0 auto;
  color: #b4553f;
  background-color: #fbfcf7;
  border: 1rpx solid rgba(180, 85, 63, 0.45);
}
</style>
