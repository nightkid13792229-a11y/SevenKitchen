<template>
  <view class="category-picker">
    <!-- 已选：只显示类别名，点开才出现输入框和候选，表单不一直占高度 -->
    <view class="selected" @tap="toggle">
      <text
        class="selected-text"
        :class="{ 'selected-text--empty': !selectedName }"
      >
        {{ selectedName || placeholder }}
      </text>
      <text class="selected-action">{{ open ? '收起' : '选择' }}</text>
    </view>

    <view v-if="open" class="panel">
      <input
        class="search"
        :value="keyword"
        maxlength="60"
        placeholder="输入类别名，没有就新建"
        placeholder-class="search-placeholder"
        @input="onKeywordInput"
      />

      <view v-if="loading" class="panel-hint">正在加载类别…</view>
      <view v-else-if="loadError" class="panel-hint">
        <text class="panel-error">{{ loadError }}</text>
        <text class="panel-retry" @tap="loadOptions">重试</text>
      </view>
      <view v-else class="options">
        <view
          v-for="option in filteredOptions"
          :key="option.id"
          class="option"
          :class="{ 'option--on': option.id === modelValue }"
          @tap="selectOption(option)"
        >
          <text class="option-name">{{ option.name }}</text>
          <text v-if="option.isSystem" class="option-system">系统</text>
        </view>
        <text v-if="filteredOptions.length === 0" class="panel-hint">
          没有匹配的类别
        </text>
      </view>

      <!-- 输入即建：名字不在已有列表里才出现，避免建出「设备/设备工具」 -->
      <view v-if="canCreate" class="create" @tap="createAndSelect">
        ＋ 新建「{{ trimmedKeyword }}」
      </view>

      <text v-if="createError" class="panel-error">{{ createError }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  staffFinanceApi,
  type FinanceCategoryOption,
} from '../../api/staff-finance'

/**
 * 支出类别选择器（2026-11-19 类别字典，设计文档 §2.1）。
 *
 * 交互：已选只显示类别名；点开出现输入框 + 候选列表（按输入过滤），
 * 候选里没有这个名字时底部出现「＋ 新建『xxx』」，点了就创建并选中 ——
 * 老板不用先去管理页建类别，记账时顺手就把新类别建出来。
 *
 * 只列启用且允许选择的类别（后端 `selectable !== false`）；系统类别
 * （食材/补剂/包材/快递/支付手续费）带「系统」小标，提示它不能停用，但可以改名（管理页做）。
 * 「其它」是历史兜底类别（`selectable === false`），不出现在候选里，
 * 但历史记录已经选中它时仍要能显示名字。
 *
 * 类别列表由组件自己加载：记账页和固定费用页各放一个实例，
 * 各自拉一份比让页面透传 props 更不容易漏更新。
 */
const props = withDefaults(
  defineProps<{
    /** 选中的类别 id；空串 = 还没选 */
    modelValue: string
    placeholder?: string
  }>(),
  {
    placeholder: '选择类别',
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  /** 新建成功后通知页面刷新自己的类别映射（模板列表要显示名字） */
  (event: 'created'): void
}>()

const options = ref<FinanceCategoryOption[]>([])
const loading = ref(false)
const loadError = ref('')
const open = ref(false)
const keyword = ref('')
const creating = ref(false)
const createError = ref('')

const trimmedKeyword = computed(() => keyword.value.trim())

/**
 * 候选类别：后端用 `selectable === false` 标记「其它」这类只供历史数据
 * 使用的类别，记账时不该让老板再选到它；老后端没有这个字段时视为可选。
 */
const selectableOptions = computed(() =>
  options.value.filter((option) => option.selectable !== false),
)

/**
 * 已选类别名：按 id 在**全部**类别里找（不是候选）——
 * 历史记录选过「其它」时，候选里不展示它，但输入框仍要显示名字。
 */
const selectedName = computed(() => {
  const id = String(props.modelValue || '')
  if (!id) return ''
  return options.value.find((option) => option.id === id)?.name || ''
})

/**
 * 候选列表：输入为空给全部；有输入时按名字包含过滤（忽略大小写），
 * 以输入开头的排前面，老板打「维」时「维修」比「运维设备」更靠前。
 */
const filteredOptions = computed(() => {
  const keywordLower = trimmedKeyword.value.toLowerCase()
  const matched = keywordLower
    ? selectableOptions.value.filter((option) =>
        option.name.toLowerCase().includes(keywordLower),
      )
    : [...selectableOptions.value]
  return matched.sort((left, right) => {
    const leftStarts = left.name.toLowerCase().startsWith(keywordLower) ? 0 : 1
    const rightStarts = right.name
      .toLowerCase()
      .startsWith(keywordLower)
      ? 0
      : 1
    if (leftStarts !== rightStarts) return leftStarts - rightStarts
    return left.name.localeCompare(right.name, 'zh-CN')
  })
})

/**
 * 输入的名字不在已有类别里：才给「新建」入口（同名忽略大小写与首尾空格）。
 * 这里查**全部**类别（含「其它」），避免输入一个已有但不可选的名字时
 * 给出「新建」，点下去后端直接 400 重名。
 */
const canCreate = computed(() => {
  const name = trimmedKeyword.value
  if (!name) return false
  return !options.value.some(
    (option) => option.name.trim().toLowerCase() === name.toLowerCase(),
  )
})

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  const errMsg = (error as { errMsg?: string } | null)?.errMsg
  return typeof errMsg === 'string' && errMsg ? errMsg : '请稍后重试'
}

async function loadOptions() {
  loading.value = true
  loadError.value = ''
  try {
    const rows = await staffFinanceApi.listCategories()
    options.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

function toggle() {
  open.value = !open.value
  createError.value = ''
  if (!open.value) return
  keyword.value = ''
  // 每次展开重新拉一遍：别的页面刚新建/停用的类别立刻能看到
  void loadOptions()
}

function onKeywordInput(event: any) {
  keyword.value = String(event?.detail?.value ?? '').slice(0, 60)
  createError.value = ''
}

function selectOption(option: FinanceCategoryOption) {
  if (option.id !== props.modelValue) {
    emit('update:modelValue', option.id)
  }
  keyword.value = ''
  open.value = false
}

/** 输入即建：创建成功立刻选中，不用再点一次列表 */
async function createAndSelect() {
  const name = trimmedKeyword.value
  if (!name || creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const created = await staffFinanceApi.createCategory(name)
    const id = String(created?.id || '')
    const savedName = String(created?.name || name)
    if (!id) {
      createError.value = '新建失败，请重试'
      return
    }
    options.value = [
      ...options.value,
      {
        id,
        name: savedName,
        isSystem: false,
        selectable: true,
        isActive: true,
        usageCount: 0,
      },
    ]
    emit('update:modelValue', id)
    emit('created')
    keyword.value = ''
    open.value = false
  } catch (error) {
    // 后端重名/超长会 400：原样显示，别自己编一句
    createError.value = errorMessage(error)
  } finally {
    creating.value = false
  }
}

onMounted(() => {
  void loadOptions()
})
</script>

<style scoped lang="scss">
@import '../../styles/staff-tokens.scss';

.selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  padding: 0 20rpx;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.selected-text {
  flex: 1;
  min-width: 0;
  font-size: $staff-font-body;
  color: $staff-ink;
  @include staff-ellipsis;
}

.selected-text--empty {
  color: $staff-ink-3;
}

.selected-action {
  flex: none;
  margin-left: 16rpx;
  font-size: $staff-font-caption;
  color: $staff-brand;
}

.panel {
  margin-top: 12rpx;
  padding: 16rpx;
  background: $staff-bg;
  border: 1rpx solid $staff-line;
  border-radius: $staff-radius-card;
}

.search {
  box-sizing: border-box;
  height: 88rpx;
  padding: 0 20rpx;
  font-size: $staff-font-body;
  color: $staff-ink;
  background: $staff-surface;
  border: 1rpx solid $staff-line-strong;
  border-radius: $staff-radius-control;
}

.search-placeholder {
  color: $staff-ink-3;
}

.options {
  max-height: 440rpx;
  margin-top: 12rpx;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
  padding: 0 16rpx;
  border-bottom: 1rpx solid $staff-line;
}

.option:last-child {
  border-bottom: none;
}

.option--on {
  background: $staff-brand-soft;
  border-radius: $staff-radius-control;
}

.option-name {
  flex: 1;
  min-width: 0;
  font-size: $staff-font-body;
  color: $staff-ink;
  @include staff-ellipsis;
}

.option--on .option-name {
  font-weight: 600;
  color: $staff-brand;
}

/* 系统类别：浅绿小标，说明它不能停用（但能改名） */
.option-system {
  flex: none;
  margin-left: 12rpx;
  padding: 2rpx 12rpx;
  font-size: $staff-font-caption;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-pill;
}

.create {
  min-height: 88rpx;
  margin-top: 12rpx;
  padding: 0 16rpx;
  font-size: $staff-font-body;
  font-weight: 600;
  line-height: 88rpx;
  color: $staff-brand;
  background: $staff-brand-soft;
  border-radius: $staff-radius-control;
  @include staff-ellipsis;
}

.panel-hint {
  display: block;
  padding: 16rpx 8rpx;
  font-size: $staff-font-caption;
  color: $staff-ink-2;
}

.panel-error {
  display: block;
  padding: 8rpx;
  font-size: $staff-font-caption;
  line-height: 1.5;
  color: $staff-danger;
}

.panel-retry {
  display: inline-block;
  min-height: 88rpx;
  margin-left: 16rpx;
  font-size: $staff-font-caption;
  line-height: 88rpx;
  color: $staff-brand;
  text-decoration: underline;
}
</style>
