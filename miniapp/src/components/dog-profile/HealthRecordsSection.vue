<template>
  <view class="records-section" :class="activeTypeMeta.accentClass">
    <view class="records-section__header">
      <view>
        <text class="records-section__title">健康记录</text>
        <text class="records-section__description">
          按类别整理每一条记录，附件可在展开后上传和预览。
        </text>
      </view>
      <text class="records-section__count">{{ savedRecordCount }} 条</text>
    </view>

    <view class="record-type-tabs">
      <button
        v-for="type in HEALTH_RECORD_TYPES"
        :key="type"
        class="record-type-tabs__item"
        :class="[
          getHealthRecordTypeMeta(type).accentClass,
          { 'record-type-tabs__item--active': type === currentType },
        ]"
        :disabled="loading || hasUploadingRecords || hasSavingRecord"
        @tap="requestTypeChange(type)"
      >
        {{ getHealthRecordTypeMeta(type).label }}
      </button>
    </view>

    <view v-if="draftRecords.length === 0" class="records-section__empty">
      <text class="records-section__empty-title">
        {{ loading ? '记录加载中' : activeTypeMeta.emptyTitle }}
      </text>
      <text class="records-section__empty-desc">先补充一条基础记录，之后可以继续添加。</text>
    </view>

    <view
      v-for="(record, index) in draftRecords"
      :key="recordKey(record, index)"
      :id="recordAnchorId(record, index)"
      class="record-card"
      :class="{ 'record-card--dirty': isRecordDirty(record, index) }"
    >
      <view class="record-card__header">
        <view class="record-card__header-main" @tap="toggleRecordExpanded(index)">
          <view class="record-card__meta">
            <text class="record-card__index">{{ index + 1 }}</text>
            <text
              class="record-card__status"
              :class="{
                'record-card__status--saved': isSavedRecord(record, index) && !isRecordDirty(record, index),
                'record-card__status--dirty': isRecordDirty(record, index),
              }"
            >
              {{ recordStatusText(record, index) }}
            </text>
          </view>

          <view class="record-card__summary">
            <text class="record-card__summary-title">
              {{ recordSummary(record, index).title }}
            </text>
            <text
              v-if="recordSummary(record, index).detail"
              class="record-card__summary-detail"
            >
              {{ recordSummary(record, index).detail }}
            </text>
          </view>
        </view>

        <view class="record-card__header-actions">
          <button
            class="record-card__delete"
            :disabled="loading || hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"
            @tap.stop="removeRecord(index)"
          >
            删除
          </button>
          <text class="record-card__toggle" @tap.stop="toggleRecordExpanded(index)">
            {{ isRecordExpanded(record, index) ? '收起' : '展开' }}
          </text>
        </view>
      </view>

      <view v-if="isRecordExpanded(record, index)" class="record-card__body">
        <view class="field-group">
          <text class="field-label">{{ fieldConfig.primary.label }}</text>
          <input
            class="field-input"
            type="text"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${fieldConfig.primary.label}`"
            :value="readField(record, fieldConfig.primary.key)"
            @input="updateTextField(index, fieldConfig.primary.key, $event.detail.value)"
          />
        </view>

        <view v-if="fieldConfig.date" class="field-group">
          <text class="field-label">{{ fieldConfig.date.label }}</text>
          <picker
            mode="date"
            :disabled="hasSavingRecord"
            :value="readField(record, fieldConfig.date.key)"
            @change="updateTextField(index, fieldConfig.date.key, $event.detail.value)"
          >
            <view class="field-picker">
              {{ readField(record, fieldConfig.date.key) || `请选择${fieldConfig.date.label}` }}
            </view>
          </picker>
        </view>

        <view v-if="fieldConfig.secondary" class="field-group">
          <text class="field-label">{{ fieldConfig.secondary.label }}</text>
          <input
            class="field-input"
            type="text"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${fieldConfig.secondary.label}`"
            :value="readField(record, fieldConfig.secondary.key)"
            @input="updateTextField(index, fieldConfig.secondary.key, $event.detail.value)"
          />
        </view>

        <view class="field-group">
          <text class="field-label">{{ fieldConfig.notes.label }}</text>
          <textarea
            class="field-textarea"
            :disabled="hasSavingRecord"
            :placeholder="`请输入${fieldConfig.notes.label}`"
            :value="readField(record, fieldConfig.notes.key)"
            @input="updateTextField(index, fieldConfig.notes.key, $event.detail.value)"
          />
        </view>

        <view class="field-group">
          <view class="field-label field-label--row">
            <text>附件（点击预览）</text>
            <text class="field-label__hint">{{ attachmentHintText }}</text>
          </view>

          <view v-if="attachmentList(record).length > 0" class="attachment-list">
            <view
              v-for="(attachment, attachmentIndex) in attachmentList(record)"
              :key="`${recordKey(record, index)}-${attachment}-${attachmentIndex}`"
              class="attachment-item"
            >
              <view class="attachment-item__preview" @tap="previewAttachment(attachment)">
                <view class="attachment-item__content">
                  <text class="attachment-item__title">
                    {{ attachmentDisplay(attachment, attachmentIndex).title }}
                  </text>
                  <text class="attachment-item__hint">
                    {{ attachmentDisplay(attachment, attachmentIndex).detail }}
                  </text>
                </view>
                <text class="attachment-item__action">预览</text>
              </view>
              <button
                class="attachment-item__remove"
                :disabled="hasSavingRecord || isRecordSaving(record, index)"
                @tap="removeAttachment(index, attachmentIndex)"
              >
                删除
              </button>
            </view>
          </view>

          <button
            class="attachment-button"
            :loading="isUploading(record, index)"
            :disabled="loading || hasSavingRecord || isUploading(record, index) || isRecordSaving(record, index)"
            @tap="chooseAttachment(index)"
          >
            上传附件
          </button>
        </view>

        <view class="record-card__actions">
          <button
            v-if="secondaryActionText(record, index)"
            class="record-card__action record-card__action--ghost"
            :disabled="hasUploadingRecords || hasSavingRecord || isRecordSaving(record, index)"
            @tap="cancelRecord(index)"
          >
            {{ secondaryActionText(record, index) }}
          </button>
          <button
            class="record-card__action record-card__action--primary"
            :class="{
              'record-card__action--primary-only': !secondaryActionText(record, index),
              'record-card__action--disabled': saveButtonDisabled(record, index),
            }"
            :loading="isRecordSaving(record, index)"
            :disabled="saveButtonDisabled(record, index)"
            @tap="saveRecord(index)"
          >
            {{ saveButtonText(record, index) }}
          </button>
        </view>
      </view>
    </view>

    <button class="records-section__add" :disabled="loading || hasUploadingRecords || hasSavingRecord" @tap="addRecord">
      {{ activeTypeMeta.addLabel }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'
import {
  HEALTH_RECORD_TYPES,
  type HealthRecordType,
  buildHealthAttachmentDisplayMeta,
  buildHealthAttachmentFieldHint,
  buildHealthRecordFocusIdentity,
  buildHealthRecordSummary,
  createHealthRecordDraft,
  doHealthRecordsMatchPersistedPayload,
  extractHealthAttachmentKey,
  findHealthRecordFocusIndex,
  getHealthRecordTypeMeta,
  getHealthRecordValidationError,
  readHealthAttachmentFileSize,
  resolveHealthAttachmentFileSizeError,
  resolveHealthAttachmentPreviewType,
  resolveHealthAttachmentSelectionError,
  resolveHealthAttachmentUploadErrorMessage,
  resolveHealthRecordSecondaryActionText,
} from '../../utils/health-records'

type FieldConfig = {
  primary: { key: string, label: string }
  date: { key: string, label: string } | null
  secondary: { key: string, label: string } | null
  notes: { key: string, label: string }
}

const props = withDefaults(defineProps<{
  dogId: string
  activeType?: HealthRecordType
  records?: Record<string, any>[]
  loading?: boolean
  savingRecordKey?: string
  preferredExpandedRecordIdentity?: string
  modelValue?: Record<string, any>[]
  recordType?: HealthRecordType
}>(), {
  activeType: undefined,
  records: () => [],
  loading: false,
  savingRecordKey: '',
  preferredExpandedRecordIdentity: '',
  modelValue: () => [],
  recordType: undefined,
})

const emit = defineEmits<{
  (event: 'change-type', value: HealthRecordType): void
  (event: 'save-record', value: {
    type: HealthRecordType
    record: Record<string, any>
    recordKey: string
  }): void
  (event: 'delete-record', value: { type: HealthRecordType, record: Record<string, any> }): void
  (event: 'dirty-change', value: boolean): void
  (event: 'record-saved', identity: string): void
}>()

const draftRecords = ref<Record<string, any>[]>([])
const savedSnapshots = ref<Record<string, Record<string, any>>>({})
const uploadingKeys = ref<Record<string, boolean>>({})
const expandedRecordKey = ref<string | null>(null)
const lastSyncedType = ref<HealthRecordType | null>(null)
const recentSavingRecordKey = ref('')
const attachmentHintText = buildHealthAttachmentFieldHint()

const currentType = computed<HealthRecordType>(() => props.activeType || props.recordType || 'medical')
const activeTypeMeta = computed(() => getHealthRecordTypeMeta(currentType.value))
const sourceRecords = computed(() => (
  props.records.length > 0 || !props.modelValue.length ? props.records : props.modelValue
))
const savedRecordCount = computed(() => sourceRecords.value.length)
const fieldConfig = computed<FieldConfig>(() => getFieldConfig(currentType.value))
const hasDirtyRecords = computed(() =>
  draftRecords.value.some((record, index) => isRecordDirty(record, index)),
)
const hasUploadingRecords = computed(() => Object.values(uploadingKeys.value).some(Boolean))
const hasSavingRecord = computed(() => Boolean(props.savingRecordKey))

watch(
  () => props.savingRecordKey,
  (nextKey, previousKey) => {
    if (nextKey) {
      recentSavingRecordKey.value = nextKey
      return
    }

    if (previousKey) {
      nextTick(() => {
        if (recentSavingRecordKey.value === previousKey && !props.savingRecordKey) {
          recentSavingRecordKey.value = ''
        }
      })
    }
  },
  { immediate: true },
)

watch(
  () => [currentType.value, sourceRecords.value] as const,
  () => {
    syncDraftRecords(sourceRecords.value)
  },
  { immediate: true, deep: true },
)

watch(
  () => props.preferredExpandedRecordIdentity,
  (nextIdentity) => {
    if (!nextIdentity) {
      return
    }

    focusRecordByIdentity(nextIdentity)
  },
)

watch(
  hasDirtyRecords,
  (nextValue) => {
    emit('dirty-change', nextValue)
  },
  { immediate: true },
)

function getFieldConfig(type: HealthRecordType): FieldConfig {
  if (type === 'medical') {
    return {
      primary: { key: 'chiefComplaint', label: '症状或疾病' },
      date: { key: 'visitDate', label: '发病日期' },
      secondary: { key: 'diagnosis', label: '诊断结果' },
      notes: { key: 'notes', label: '补充说明' },
    }
  }

  if (type === 'checkup') {
    return {
      primary: { key: 'checkupType', label: '体检类型' },
      date: { key: 'checkupDate', label: '体检日期' },
      secondary: null,
      notes: { key: 'notes', label: '体检说明' },
    }
  }

  return {
    primary: { key: 'allergen', label: '过敏原' },
    date: null,
    secondary: null,
    notes: { key: 'notes', label: '过敏反应/说明' },
  }
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function stripLocalFields(record: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(cloneRecord(record)).filter(([key]) => !key.startsWith('__')),
  )
}

function createLocalKey(record: Record<string, any>, index: number) {
  if (typeof record.__localId === 'string' && record.__localId) {
    return record.__localId
  }

  if (typeof record.id === 'string' && record.id) {
    return record.id
  }

  return `${currentType.value}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeDraftRecord(record: Record<string, any>, localId: string) {
  return {
    ...cloneRecord(record),
    __localId: localId,
    attachments: attachmentList(record),
  }
}

function hasMatchingIncomingRecord(
  record: Record<string, any>,
  recordIndex: number,
  incomingRecords: Record<string, any>[],
  usedIncomingIndexes: Set<number>,
) {
  const matchingIndex = incomingRecords.findIndex((incomingRecord, index) =>
    !usedIncomingIndexes.has(index) &&
    doHealthRecordsMatchPersistedPayload(currentType.value, record, incomingRecord),
  )

  if (matchingIndex < 0) {
    return false
  }

  usedIncomingIndexes.add(matchingIndex)
  consumeRecentSavingRecordKey(record, recordIndex)
  return true
}

function preserveUnsavedDrafts(
  incomingRecords: Record<string, any>[],
  nextSnapshots: Record<string, Record<string, any>>,
) {
  const usedIncomingIndexes = new Set<number>()
  const preservedDrafts: Record<string, any>[] = []

  draftRecords.value.forEach((record, index) => {
    const key = recordKey(record, index)
    if (!isRecordDirty(record, index)) {
      return
    }

    if (replaceIncomingRecordWithDirtyDraft(record, index, key, incomingRecords, nextSnapshots)) {
      return
    }

    if (hasMatchingIncomingRecord(record, index, incomingRecords, usedIncomingIndexes)) {
      return
    }

    if (shouldSkipPreservingSavingRecord(record, index)) {
      consumeRecentSavingRecordKey(record, index)
      return
    }

    const snapshot = savedSnapshot(record, index)
    if (snapshot) {
      nextSnapshots[key] = snapshot
    }

    preservedDrafts.push(normalizeDraftRecord(record, key))
  })

  return [...incomingRecords, ...preservedDrafts]
}

function shouldSkipPreservingSavingRecord(record: Record<string, any>, index: number) {
  return recordMatchesSavingKey(record, index, props.savingRecordKey || recentSavingRecordKey.value)
}

function replaceIncomingRecordWithDirtyDraft(
  record: Record<string, any>,
  index: number,
  key: string,
  incomingRecords: Record<string, any>[],
  nextSnapshots: Record<string, Record<string, any>>,
) {
  const incomingIndex = incomingRecords.findIndex((incomingRecord, currentIndex) =>
    recordKey(incomingRecord, currentIndex) === key,
  )

  if (incomingIndex < 0) {
    return false
  }

  if (shouldUseIncomingSavingRecord(record, index, incomingRecords[incomingIndex])) {
    return true
  }

  const snapshot = savedSnapshot(record, index)
  if (snapshot) {
    nextSnapshots[key] = snapshot
  }

  incomingRecords[incomingIndex] = normalizeDraftRecord(record, key)
  return true
}

function shouldUseIncomingSavingRecord(
  record: Record<string, any>,
  index: number,
  incomingRecord: Record<string, any>,
) {
  if (!incomingRecord || !recordMatchesSavingKey(record, index, props.savingRecordKey || recentSavingRecordKey.value)) {
    return false
  }

  consumeRecentSavingRecordKey(record, index)
  return true
}

function consumeRecentSavingRecordKey(record: Record<string, any>, index: number) {
  if (recordMatchesSavingKey(record, index, recentSavingRecordKey.value)) {
    recentSavingRecordKey.value = ''
  }
}

function syncDraftRecords(records: Record<string, any>[]) {
  const nextSnapshots: Record<string, Record<string, any>> = {}
  const nextDraftRecords = records.map((record, index) => {
    const localId = createLocalKey(record, index)
    const draftRecord = normalizeDraftRecord(record, localId)
    nextSnapshots[localId] = stripLocalFields(draftRecord)
    return draftRecord
  })
  const shouldPreserveDrafts = lastSyncedType.value === currentType.value
  const recordsWithPreservedDrafts = shouldPreserveDrafts
    ? preserveUnsavedDrafts(nextDraftRecords, nextSnapshots)
    : nextDraftRecords

  draftRecords.value = recordsWithPreservedDrafts
  savedSnapshots.value = nextSnapshots
  lastSyncedType.value = currentType.value

  if (focusRecordByIdentity(props.preferredExpandedRecordIdentity, recordsWithPreservedDrafts)) {
    return
  }

  const nextKeys = recordsWithPreservedDrafts.map((record, index) => recordKey(record, index))
  expandedRecordKey.value = nextKeys.includes(expandedRecordKey.value || '')
    ? expandedRecordKey.value
    : null
}

function recordKey(record: Record<string, any>, index: number) {
  return record.__localId || record.id || `${currentType.value}-${index}`
}

function findRecordIndexByKey(key: string) {
  return draftRecords.value.findIndex((record, currentIndex) =>
    recordKey(record, currentIndex) === key,
  )
}

function recordAnchorId(record: Record<string, any>, index: number) {
  const safeKey = String(recordKey(record, index)).replace(/[^A-Za-z0-9_-]/g, '-')
  return `health-record-${currentType.value}-${safeKey}`
}

function savedSnapshot(record: Record<string, any>, index: number) {
  return savedSnapshots.value[recordKey(record, index)] || null
}

function isSavedRecord(record: Record<string, any>, index: number) {
  return Boolean(savedSnapshot(record, index))
}

function readField(record: Record<string, any>, key: string) {
  const value = key ? record?.[key] : ''
  return typeof value === 'string' ? value : (value ?? '')
}

function attachmentList(record: Record<string, any>) {
  const attachments = record?.attachments
  return Array.isArray(attachments)
    ? attachments
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }

        if (item && typeof item === 'object' && typeof item.url === 'string') {
          return item.url.trim()
        }

        return ''
      })
      .filter(Boolean)
    : []
}

function attachmentDisplay(url: string, index: number) {
  return buildHealthAttachmentDisplayMeta(url, index)
}

function scrollToRecord(index: number) {
  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const selector = `#${recordAnchorId(record, index)}`
  nextTick(() => {
    uni
      .createSelectorQuery()
      .select(selector)
      .boundingClientRect((node) => {
        if (!node) {
          return
        }

        uni.pageScrollTo({
          selector,
          duration: 240,
        })
      })
      .exec()
  })
}

function focusRecordByIdentity(
  identity: string | null | undefined,
  records: Record<string, any>[] = draftRecords.value,
) {
  const index = findHealthRecordFocusIndex(currentType.value, records, identity)
  if (index < 0) {
    return false
  }

  expandedRecordKey.value = recordKey(records[index], index)
  scrollToRecord(index)
  return true
}

async function requestTypeChange(type: HealthRecordType) {
  if (type === currentType.value) {
    return
  }

  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  if (hasDirtyRecords.value) {
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '切换分类',
        content: '当前分类有未保存的记录，切换后将放弃这些修改，确认继续吗？',
        success: (res) => resolve(Boolean(res.confirm)),
        fail: () => resolve(false),
      })
    })

    if (!confirmed) {
      return
    }
  }

  emit('change-type', type)
}

function updateTextField(index: number, key: string, value: string) {
  if (hasSavingRecord.value) {
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  draftRecords.value[index] = {
    ...record,
    [key]: value,
  }
}

function addRecord() {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const nextRecord = createHealthRecordDraft(currentType.value)
  draftRecords.value.push(nextRecord)
  expandedRecordKey.value = nextRecord.__localId || null
}

function isRecordExpanded(record: Record<string, any>, index: number) {
  return expandedRecordKey.value === recordKey(record, index)
}

function toggleRecordExpanded(index: number) {
  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  expandedRecordKey.value = expandedRecordKey.value === key ? null : key
}

function recordSummary(record: Record<string, any>, index: number) {
  const summary = buildHealthRecordSummary(currentType.value, record)
  if (!isSavedRecord(record, index) && summary.title.startsWith('未填写')) {
    return {
      title: '新记录',
      detail: '点击展开后补充本条记录内容',
    }
  }

  return summary
}

function saveButtonText(record: Record<string, any>, index: number) {
  return isSavedRecord(record, index) && !isRecordDirty(record, index)
    ? '已保存'
    : '保存这一条'
}

function saveButtonDisabled(record: Record<string, any>, index: number) {
  return props.loading ||
    hasSavingRecord.value ||
    hasUploadingRecords.value ||
    isUploading(record, index) ||
    isRecordSaving(record, index) ||
    (isSavedRecord(record, index) && !isRecordDirty(record, index))
}

function secondaryActionText(record: Record<string, any>, index: number) {
  return resolveHealthRecordSecondaryActionText(
    isSavedRecord(record, index),
    isRecordDirty(record, index),
  )
}

function recordStatusText(record: Record<string, any>, index: number) {
  if (!isSavedRecord(record, index)) {
    return '未保存'
  }

  return isRecordDirty(record, index) ? '待保存' : '已保存'
}

function isRecordDirty(record: Record<string, any>, index: number) {
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    return true
  }

  return JSON.stringify(stripLocalFields(record)) !== JSON.stringify(snapshot)
}

function isRecordSaving(record: Record<string, any>, index: number) {
  return recordMatchesSavingKey(record, index, props.savingRecordKey)
}

function recordMatchesSavingKey(record: Record<string, any>, index: number, savingKey: string) {
  if (!savingKey) {
    return false
  }

  return [
    recordKey(record, index),
    record.id,
    buildHealthRecordFocusIdentity(currentType.value, record),
  ].some((value) => value === savingKey)
}

function saveRecord(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const validationError = getHealthRecordValidationError(currentType.value, record)
  if (validationError) {
    uni.showToast({ title: validationError, icon: 'none' })
    return
  }

  const key = recordKey(record, index)
  emit('save-record', { type: currentType.value, record: stripLocalFields(record), recordKey: key })
}

function cancelRecord(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === key) {
      expandedRecordKey.value = null
    }
    return
  }

  draftRecords.value[index] = normalizeDraftRecord(snapshot, key)
  expandedRecordKey.value = null
}

async function removeRecord(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  if (hasUploadingRecords.value) {
    uni.showToast({ title: '附件上传中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  if (!isSavedRecord(record, index)) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === key) {
      expandedRecordKey.value = null
    }
    return
  }

  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '删除记录',
      content: '删除后将无法恢复，确认继续吗？',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })

  if (!confirmed) {
    return
  }

  emit('delete-record', { type: currentType.value, record: stripLocalFields(record) })
}

function isUploading(record: Record<string, any>, index: number) {
  return Boolean(uploadingKeys.value[recordKey(record, index)])
}

async function chooseAttachment(index: number) {
  if (hasSavingRecord.value) {
    uni.showToast({ title: '记录保存中，请稍候', icon: 'none' })
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const key = recordKey(record, index)
  const uploadType = currentType.value
  const uploadKey = key
  if (uploadingKeys.value[uploadKey]) {
    return
  }

  const tapIndex = await new Promise<number | null>((resolve) => {
    uni.showActionSheet({
      itemList: ['上传图片', '上传 PDF'],
      success: (res) => resolve(res.tapIndex),
      fail: () => resolve(null),
    })
  })

  if (tapIndex == null) {
    return
  }

  const selectedFile = tapIndex === 0 ? await chooseImageFile() : await choosePdfFile()
  if (!selectedFile) {
    return
  }

  const selectionError = resolveHealthAttachmentSelectionError(
    tapIndex === 0 ? 'image' : 'pdf',
    selectedFile.name,
  )
  if (selectionError) {
    uni.showToast({ title: selectionError, icon: 'none' })
    return
  }

  const fileSizeError = resolveHealthAttachmentFileSizeError(selectedFile.size)
  if (fileSizeError) {
    uni.showToast({ title: fileSizeError, icon: 'none' })
    return
  }

  uploadingKeys.value[uploadKey] = true

  try {
    uni.showLoading({ title: '上传中...' })
    const uploaded = await dogApi.uploadHealthAttachment(uploadType, selectedFile.path)
    if (currentType.value !== uploadType) {
      uni.hideLoading()
      return
    }

    const targetIndex = findRecordIndexByKey(uploadKey)
    if (targetIndex < 0) {
      uni.hideLoading()
      return
    }

    const targetRecord = draftRecords.value[targetIndex]
    const attachments = attachmentList(targetRecord)
    draftRecords.value[targetIndex] = {
      ...targetRecord,
      attachments: [...attachments, uploaded.url],
    }
    uni.hideLoading()
    uni.showToast({ title: '附件已添加，请保存记录', icon: 'none' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: resolveHealthAttachmentUploadErrorMessage(error), icon: 'none' })
  } finally {
    delete uploadingKeys.value[uploadKey]
  }
}

function chooseImageFile() {
  return new Promise<{ path: string, name: string, size: number | null } | null>((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res: any) => {
        const filePath = res.tempFilePaths?.[0]
        if (!filePath) {
          resolve(null)
          return
        }

        const reportedFileSize =
          typeof res.tempFiles?.[0]?.size === 'number' ? res.tempFiles[0].size : null
        const fileSize = reportedFileSize ?? await readHealthAttachmentFileSize(filePath)

        resolve({
          path: filePath,
          name: filePath.split('/').pop() || 'image.jpg',
          size: fileSize,
        })
      },
      fail: () => resolve(null),
    })
  })
}

function choosePdfFile() {
  return new Promise<{ path: string, name: string, size: number | null } | null>((resolve) => {
    uni.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: async (res: any) => {
        const file = res.tempFiles?.[0]
        if (!file?.path) {
          resolve(null)
          return
        }

        const reportedFileSize = typeof file.size === 'number' ? file.size : null
        const fileSize = reportedFileSize ?? await readHealthAttachmentFileSize(file.path)

        resolve({
          path: file.path,
          name: file.name || file.path.split('/').pop() || 'document.pdf',
          size: fileSize,
        })
      },
      fail: () => resolve(null),
    })
  })
}

async function previewAttachment(url: string) {
  const previewType = resolveHealthAttachmentPreviewType(url)

  if (previewType === 'image') {
    uni.previewImage({
      urls: [url],
      current: url,
    })
    return
  }

  if (previewType === 'pdf') {
    try {
      uni.showLoading({ title: '打开中...' })
      const downloadRes: any = await new Promise((resolve, reject) => {
        uni.downloadFile({
          url,
          success: resolve,
          fail: reject,
        })
      })

      if (downloadRes.statusCode !== 200 || !downloadRes.tempFilePath) {
        throw new Error('文件下载失败')
      }

      await new Promise((resolve, reject) => {
        uni.openDocument({
          filePath: downloadRes.tempFilePath,
          showMenu: true,
          success: resolve,
          fail: reject,
        })
      })
      uni.hideLoading()
    } catch (error: any) {
      uni.hideLoading()
      uni.showToast({ title: error?.message || '暂时无法预览该附件', icon: 'none' })
    }
    return
  }

  uni.showToast({ title: '暂时无法预览该附件', icon: 'none' })
}

function removeAttachment(index: number, attachmentIndex: number) {
  if (hasSavingRecord.value) {
    return
  }

  const record = draftRecords.value[index]
  if (!record) {
    return
  }

  const attachments = attachmentList(record)
  if (attachments.length <= attachmentIndex) {
    return
  }

  const removedUrl = attachments[attachmentIndex]
  const nextAttachments = attachments.filter((_, currentIndex) => currentIndex !== attachmentIndex)
  draftRecords.value[index] = {
    ...record,
    attachments: nextAttachments,
  }

  const savedAttachments = new Set(attachmentList(savedSnapshot(record, index) || {}))
  const removedKey = extractHealthAttachmentKey(removedUrl)
  if (removedKey && !savedAttachments.has(removedUrl)) {
    void dogApi.deleteHealthAttachment(currentType.value, removedKey).catch(() => {})
  }
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
  line-height: 1.7;
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

.record-type-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 24rpx;
  padding: 8rpx;
  border-radius: 24rpx;
  background: rgba(32, 52, 63, 0.06);
}

.record-type-tabs__item {
  margin: 0;
  height: 68rpx;
  line-height: 68rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #526872;
  background: transparent;
}

.record-type-tabs__item::after,
.record-card__delete::after,
.attachment-item__remove::after,
.record-card__action::after,
.attachment-button::after,
.records-section__add::after {
  border: none;
}

.record-type-tabs__item--active {
  color: #fff;
}

.record-type-tabs__item--active.health-records--medical {
  background: #0f7b49;
}

.record-type-tabs__item--active.health-records--checkup {
  background: #216d9b;
}

.record-type-tabs__item--active.health-records--allergy {
  background: #ad5b2a;
}

.records-section__empty {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: rgba(7, 193, 96, 0.06);
}

.health-records--checkup .records-section__empty {
  background: rgba(33, 109, 155, 0.08);
}

.health-records--allergy .records-section__empty {
  background: rgba(173, 91, 42, 0.08);
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
  line-height: 1.7;
  color: #6a7d86;
}

.record-card {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: #f8fbf9;
  border: 1rpx solid rgba(15, 107, 67, 0.08);
}

.health-records--checkup .record-card {
  background: #f7fbfd;
  border-color: rgba(33, 109, 155, 0.1);
}

.health-records--allergy .record-card {
  background: #fffaf6;
  border-color: rgba(173, 91, 42, 0.1);
}

.record-card--dirty {
  border-color: rgba(15, 107, 67, 0.22);
  box-shadow: inset 0 0 0 1rpx rgba(15, 107, 67, 0.05);
}

.record-card__header,
.field-label--row,
.record-card__actions,
.attachment-item {
  display: flex;
}

.field-label--row,
.record-card__actions,
.attachment-item {
  justify-content: space-between;
}

.record-card__header {
  align-items: flex-start;
  gap: 18rpx;
}

.record-card__header-main {
  flex: 1;
  min-width: 0;
}

.record-card__header-actions,
.record-card__meta {
  display: flex;
  align-items: center;
}

.record-card__header-actions {
  flex-shrink: 0;
  gap: 12rpx;
  flex-direction: column;
  align-items: flex-end;
}

.record-card__meta {
  gap: 12rpx;
}

.record-card__summary {
  margin-top: 14rpx;
}

.record-card__summary-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #17313f;
}

.record-card__summary-detail {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6d808a;
}

.record-card__toggle {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #5d767f;
  background: rgba(76, 100, 109, 0.08);
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

.health-records--checkup .record-card__index {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.12);
}

.health-records--allergy .record-card__index {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.12);
}

.record-card__status {
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #a66d1d;
  background: rgba(224, 162, 63, 0.12);
}

.record-card__status--saved {
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.record-card__status--dirty {
  color: #a66d1d;
  background: rgba(224, 162, 63, 0.12);
}

.record-card__delete,
.attachment-item__remove,
.record-card__action,
.attachment-button,
.records-section__add {
  margin: 0;
}

.record-card__delete,
.attachment-item__remove {
  padding: 0 18rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 18rpx;
  font-size: 24rpx;
  color: #a63f3f;
  background: rgba(218, 82, 82, 0.08);
}

.field-group {
  margin-top: 18rpx;
}

.record-card__body {
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid rgba(15, 107, 67, 0.08);
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #415a65;
}

.field-label__hint {
  display: block;
  max-width: 420rpx;
  text-align: right;
  font-size: 22rpx;
  font-weight: 500;
  line-height: 1.6;
  color: #6c7d86;
}

.field-input,
.field-picker,
.field-textarea {
  display: block;
  margin-top: 10rpx;
  width: 100%;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  font-size: 26rpx;
  color: #17313f;
  background: #fff;
  border: 1rpx solid rgba(28, 48, 59, 0.08);
}

.field-input {
  height: 92rpx;
  line-height: 92rpx;
  padding: 0 24rpx;
}

.field-picker {
  min-height: 92rpx;
  display: flex;
  align-items: center;
  padding: 18rpx 24rpx;
  line-height: 1.6;
  color: #4e6771;
}

.field-textarea {
  min-height: 180rpx;
  padding: 20rpx 24rpx;
  line-height: 1.7;
}

.attachment-list {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.attachment-item {
  gap: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(15, 107, 67, 0.06);
}

.health-records--checkup .attachment-item {
  background: rgba(33, 109, 155, 0.07);
}

.health-records--allergy .attachment-item {
  background: rgba(173, 91, 42, 0.07);
}

.attachment-item__preview {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.attachment-item__content {
  min-width: 0;
  flex: 1;
}

.attachment-item__title,
.attachment-item__hint {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-item__title {
  font-size: 25rpx;
  font-weight: 700;
  color: #17313f;
}

.attachment-item__hint {
  margin-top: 4rpx;
  font-size: 22rpx;
  line-height: 1.4;
  color: #6d808a;
}

.attachment-item__action {
  flex-shrink: 0;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.12);
}

.health-records--checkup .attachment-item__action {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.12);
}

.health-records--allergy .attachment-item__action {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.12);
}

.attachment-button {
  margin-top: 14rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  font-weight: 600;
  color: #0f6b43;
  background: rgba(7, 193, 96, 0.1);
}

.record-card__actions {
  gap: 18rpx;
  margin-top: 24rpx;
}

.record-card__action {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 22rpx;
  font-size: 26rpx;
  font-weight: 700;
}

.record-card__action--ghost {
  color: #4c646d;
  background: rgba(76, 100, 109, 0.1);
}

.record-card__action--primary {
  color: #fff;
  background: linear-gradient(135deg, #15aa67 0%, #0f7b49 100%);
}

.health-records--checkup .record-card__action--primary {
  background: linear-gradient(135deg, #2a87bd 0%, #216d9b 100%);
}

.health-records--allergy .record-card__action--primary {
  background: linear-gradient(135deg, #c87439 0%, #ad5b2a 100%);
}

.record-card__action--primary-only {
  width: 100%;
}

.record-card__action--disabled {
  color: #7c9188;
  background: rgba(15, 107, 67, 0.12);
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

.health-records--checkup .records-section__add,
.health-records--checkup .attachment-button {
  color: #216d9b;
  background: rgba(33, 109, 155, 0.1);
}

.health-records--allergy .records-section__add,
.health-records--allergy .attachment-button {
  color: #ad5b2a;
  background: rgba(173, 91, 42, 0.1);
}
</style>
