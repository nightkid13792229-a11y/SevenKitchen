<template>
  <view class="records-section">
    <view class="records-section__header">
      <view>
        <text class="records-section__title">{{ title }}</text>
        <text v-if="description" class="records-section__description">{{ description }}</text>
      </view>
      <text class="records-section__count">{{ records.length }} 条</text>
    </view>

    <view v-if="records.length === 0" class="records-section__empty">
      <text class="records-section__empty-title">{{ emptyTitle }}</text>
      <text class="records-section__empty-desc">先补充一条基础记录，之后可以继续添加。</text>
    </view>

    <view
      v-for="(record, index) in records"
      :key="recordKey(record, index)"
      class="record-card"
    >
      <view class="record-card__header">
        <text class="record-card__index">{{ index + 1 }}</text>
        <button class="record-card__delete" @tap="removeRecord(index)">删除</button>
      </view>

      <view class="field-group">
        <text class="field-label">{{ primaryLabel }}</text>
        <input
          class="field-input"
          type="text"
          :placeholder="`请输入${primaryLabel}`"
          :value="readField(record, primaryFieldKey)"
          @input="updateTextField(index, primaryFieldKey, $event.detail.value)"
        />
      </view>

      <view v-if="dateFieldKey" class="field-group">
        <text class="field-label">{{ dateLabel }}</text>
        <picker
          mode="date"
          :value="readField(record, dateFieldKey)"
          @change="updateTextField(index, dateFieldKey, $event.detail.value)"
        >
          <view class="field-picker">
            {{ readField(record, dateFieldKey) || `请选择${dateLabel}` }}
          </view>
        </picker>
      </view>

      <view v-if="secondaryFieldKey" class="field-group">
        <text class="field-label">{{ secondaryLabel }}</text>
        <input
          class="field-input"
          type="text"
          :placeholder="`请输入${secondaryLabel}`"
          :value="readField(record, secondaryFieldKey)"
          @input="updateTextField(index, secondaryFieldKey, $event.detail.value)"
        />
      </view>

      <view class="field-group">
        <text class="field-label">{{ notesLabel }}</text>
        <textarea
          class="field-textarea"
          :placeholder="`请输入${notesLabel}`"
          :value="readField(record, notesFieldKey)"
          @input="updateTextField(index, notesFieldKey, $event.detail.value)"
        />
      </view>

      <view v-if="attachmentCount(record) > 0" class="record-card__attachments">
        已保留 {{ attachmentCount(record) }} 个附件，当前页面不会修改附件内容。
      </view>
    </view>

    <button class="records-section__add" @tap="addRecord">新增记录</button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: Record<string, any>[]
  title: string
  description?: string
  emptyTitle?: string
  primaryFieldKey: string
  primaryLabel: string
  dateFieldKey?: string
  dateLabel?: string
  secondaryFieldKey?: string
  secondaryLabel?: string
  notesFieldKey?: string
  notesLabel?: string
  attachmentsFieldKey?: string
}>(), {
  modelValue: () => [],
  description: '',
  emptyTitle: '还没有记录',
  dateFieldKey: '',
  dateLabel: '日期',
  secondaryFieldKey: '',
  secondaryLabel: '',
  notesFieldKey: 'notes',
  notesLabel: '备注',
  attachmentsFieldKey: 'attachments',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, any>[]): void
}>()

const records = computed(() => Array.isArray(props.modelValue) ? props.modelValue : [])

function cloneRecord(record: Record<string, any>) {
  return JSON.parse(JSON.stringify(record))
}

function emitRecords(nextRecords: Record<string, any>[]) {
  emit('update:modelValue', nextRecords)
}

function readField(record: Record<string, any>, key: string) {
  const value = key ? record?.[key] : ''
  return typeof value === 'string' ? value : (value ?? '')
}

function recordKey(record: Record<string, any>, index: number) {
  return record.id || `${props.title}-${index}`
}

function attachmentCount(record: Record<string, any>) {
  const attachments = record?.[props.attachmentsFieldKey]
  return Array.isArray(attachments) ? attachments.length : 0
}

function createBlankRecord() {
  const record: Record<string, any> = {
    [props.primaryFieldKey]: '',
    [props.notesFieldKey]: '',
    [props.attachmentsFieldKey]: [],
  }

  if (props.dateFieldKey) {
    record[props.dateFieldKey] = ''
  }

  if (props.secondaryFieldKey) {
    record[props.secondaryFieldKey] = ''
  }

  return record
}

function addRecord() {
  emitRecords([...records.value.map(cloneRecord), createBlankRecord()])
}

function removeRecord(index: number) {
  emitRecords(records.value.filter((_, currentIndex) => currentIndex !== index).map(cloneRecord))
}

function updateTextField(index: number, key: string, value: string) {
  const nextRecords = records.value.map((record, currentIndex) => {
    if (currentIndex !== index) {
      return cloneRecord(record)
    }

    return {
      ...cloneRecord(record),
      [key]: value,
    }
  })

  emitRecords(nextRecords)
}
</script>

<style scoped>
.records-section {
  padding: 28rpx;
  border-radius: 32rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12rpx 34rpx rgba(24, 40, 60, 0.08);
}

.records-section__header {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
}

.records-section__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #17313f;
}

.records-section__description {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6c7d86;
}

.records-section__count {
  align-self: flex-start;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.records-section__empty {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(7, 193, 96, 0.06);
}

.records-section__empty-title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #17313f;
}

.records-section__empty-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6a7d86;
}

.record-card {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(15, 107, 67, 0.08);
}

.record-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.record-card__index {
  width: 40rpx;
  height: 40rpx;
  border-radius: 999rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  font-weight: 700;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.record-card__delete {
  margin: 0;
  padding: 0 18rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  color: #a63f3f;
  background: rgba(218, 82, 82, 0.08);
}

.record-card__delete::after {
  border: none;
}

.field-group {
  margin-top: 18rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415a65;
}

.field-input,
.field-picker,
.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 20rpx 22rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  color: #17313f;
  background: #fff;
  border: 1rpx solid rgba(28, 48, 59, 0.08);
}

.field-picker {
  min-height: 88rpx;
  display: flex;
  align-items: center;
  color: #4e6771;
}

.field-textarea {
  min-height: 160rpx;
}

.record-card__attachments {
  margin-top: 18rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #5e7480;
  background: rgba(15, 107, 67, 0.06);
}

.records-section__add {
  margin-top: 24rpx;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 22rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.records-section__add::after {
  border: none;
}
</style>
