<template>
  <view class="records-section">
    <view class="records-section__header">
      <view>
        <text class="records-section__title">{{ title }}</text>
        <text v-if="description" class="records-section__description">{{ description }}</text>
      </view>
      <text class="records-section__count">{{ savedRecordCount }} 条</text>
    </view>

    <view v-if="draftRecords.length === 0" class="records-section__empty">
      <text class="records-section__empty-title">{{ emptyTitle }}</text>
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
          <button class="record-card__delete" @tap.stop="removeRecord(index)">删除</button>
          <text class="record-card__toggle" @tap.stop="toggleRecordExpanded(index)">
            {{ isRecordExpanded(record, index) ? '收起' : '展开' }}
          </text>
        </view>
      </view>

      <view v-if="isRecordExpanded(record, index)" class="record-card__body">
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
              <button class="attachment-item__preview" @tap="previewAttachment(attachment)">
                {{ attachmentName(attachment) }}
              </button>
              <button
                class="attachment-item__remove"
                @tap="removeAttachment(index, attachmentIndex)"
              >
                删除
              </button>
            </view>
          </view>

          <button
            class="attachment-button"
            :loading="isUploading(record, index)"
            :disabled="isUploading(record, index) || savingKeys[recordKey(record, index)]"
            @tap="chooseAttachment(index)"
          >
            上传附件
          </button>
        </view>

        <view class="record-card__actions">
          <button
            v-if="secondaryActionText(record, index)"
            class="record-card__action record-card__action--ghost"
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
            :loading="savingKeys[recordKey(record, index)]"
            :disabled="saveButtonDisabled(record, index)"
            @tap="saveRecord(index)"
          >
            {{ saveButtonText(record, index) }}
          </button>
        </view>
      </view>
    </view>

    <button class="records-section__add" @tap="addRecord">新增记录</button>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'
import {
  type HealthRecordType,
  buildHealthRecordFocusIdentity,
  buildHealthRecordSummary,
  createHealthRecordDraft,
  extractHealthAttachmentKey,
  findHealthRecordFocusIndex,
  buildHealthAttachmentFieldHint,
  resolveHealthAttachmentFileSizeError,
  resolveHealthAttachmentPreviewType,
  resolveHealthAttachmentSelectionError,
  getHealthRecordValidationError,
  readHealthAttachmentFileSize,
  resolveHealthAttachmentUploadErrorMessage,
  resolveHealthRecordSecondaryActionText,
  shouldUseRemoteHealthRecordSync,
} from '../../utils/health-records'

const props = withDefaults(defineProps<{
  modelValue?: Record<string, any>[]
  dogId: string
  recordType: HealthRecordType
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
  preferredExpandedRecordIdentity?: string
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
  preferredExpandedRecordIdentity: '',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: Record<string, any>[]): void
  (event: 'record-saved', identity: string): void
}>()

const draftRecords = ref<Record<string, any>[]>([])
const savedSnapshots = ref<Record<string, Record<string, any>>>({})
const savingKeys = ref<Record<string, boolean>>({})
const uploadingKeys = ref<Record<string, boolean>>({})
const skipNextSync = ref(false)
const expandedRecordKey = ref<string | null>(null)
const attachmentHintText = buildHealthAttachmentFieldHint()

const savedRecordCount = computed(() =>
  draftRecords.value.filter((record, index) => isSavedRecord(record, index)).length,
)

watch(
  () => props.modelValue,
  (nextValue) => {
    if (skipNextSync.value) {
      skipNextSync.value = false
      return
    }

    syncDraftRecords(Array.isArray(nextValue) ? nextValue : [])
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

  return `${props.recordType}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
}

function syncDraftRecords(records: Record<string, any>[]) {
  const nextSnapshots: Record<string, Record<string, any>> = {}
  const nextDraftRecords = records.map((record, index) => {
    const localId = createLocalKey(record, index)
    const draftRecord = {
      ...cloneRecord(record),
      __localId: localId,
      [props.attachmentsFieldKey]: attachmentList(record),
    }
    nextSnapshots[localId] = stripLocalFields(draftRecord)
    return draftRecord
  })
  draftRecords.value = nextDraftRecords
  savedSnapshots.value = nextSnapshots

  if (focusRecordByIdentity(props.preferredExpandedRecordIdentity, nextDraftRecords)) {
    return
  }

  const nextKeys = nextDraftRecords.map((record, index) => recordKey(record, index))
  expandedRecordKey.value = nextKeys.includes(expandedRecordKey.value || '')
    ? expandedRecordKey.value
    : null
}

function recordKey(record: Record<string, any>, index: number) {
  return record.__localId || record.id || `${props.title}-${index}`
}

function recordAnchorId(record: Record<string, any>, index: number) {
  const safeKey = recordKey(record, index).replace(/[^A-Za-z0-9_-]/g, '-')
  return `health-record-${props.recordType}-${safeKey}`
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
  const attachments = record?.[props.attachmentsFieldKey]
  return Array.isArray(attachments)
    ? attachments.filter((item) => typeof item === 'string' && item.trim())
    : []
}

function attachmentName(url: string) {
  try {
    const { pathname } = new URL(url)
    return decodeURIComponent(pathname.split('/').filter(Boolean).pop() || '附件')
  } catch {
    return '附件'
  }
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

function focusRecordAtIndex(index: number) {
  if (index < 0 || index >= draftRecords.value.length) {
    return false
  }

  const record = draftRecords.value[index]
  expandedRecordKey.value = recordKey(record, index)
  scrollToRecord(index)
  return true
}

function collapseRecordAtIndex(index: number) {
  if (index < 0 || index >= draftRecords.value.length) {
    return false
  }

  expandedRecordKey.value = null
  nextTick(() => {
    scrollToRecord(index)
  })
  return true
}

function focusRecordByIdentity(
  identity: string | null | undefined,
  records: Record<string, any>[] = draftRecords.value,
) {
  const index = findHealthRecordFocusIndex(props.recordType, records, identity)
  if (index < 0) {
    return false
  }

  expandedRecordKey.value = recordKey(records[index], index)
  scrollToRecord(index)
  return true
}

function updateTextField(index: number, key: string, value: string) {
  draftRecords.value[index] = {
    ...draftRecords.value[index],
    [key]: value,
  }
}

function addRecord() {
  const nextRecord = createHealthRecordDraft(props.recordType)
  draftRecords.value.push(nextRecord)
  expandedRecordKey.value = nextRecord.__localId || null
}

function isRecordExpanded(record: Record<string, any>, index: number) {
  return expandedRecordKey.value === recordKey(record, index)
}

function toggleRecordExpanded(index: number) {
  const key = recordKey(draftRecords.value[index], index)
  expandedRecordKey.value = expandedRecordKey.value === key ? null : key
}

function recordSummary(record: Record<string, any>, index: number) {
  const summary = buildHealthRecordSummary(props.recordType, record)
  if (!isSavedRecord(record, index) && summary.title.startsWith('未填写')) {
    return {
      title: '新记录',
      detail: '点击展开后补充本条记录内容',
    }
  }

  return summary
}

function saveButtonText(record: Record<string, any>, index: number) {
  if (!isSavedRecord(record, index)) {
    return '保存记录'
  }

  return isRecordDirty(record, index) ? '更新记录' : '已保存'
}

function saveButtonDisabled(record: Record<string, any>, index: number) {
  if (savingKeys.value[recordKey(record, index)]) {
    return true
  }

  return isSavedRecord(record, index) && !isRecordDirty(record, index)
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

  return isRecordDirty(record, index) ? '待更新' : '已保存'
}

function isRecordDirty(record: Record<string, any>, index: number) {
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    return true
  }

  return JSON.stringify(stripLocalFields(record)) !== JSON.stringify(snapshot)
}

function buildPersistedRecordsForSave(targetIndex: number) {
  return draftRecords.value.flatMap((record, index) => {
    if (index === targetIndex) {
      return [stripLocalFields(record)]
    }

    const snapshot = savedSnapshot(record, index)
    return snapshot ? [cloneRecord(snapshot)] : []
  })
}

function buildPersistedRecordsAfterDelete(targetIndex: number) {
  return draftRecords.value.flatMap((record, index) => {
    if (index === targetIndex) {
      return []
    }

    const snapshot = savedSnapshot(record, index)
    return snapshot ? [cloneRecord(snapshot)] : []
  })
}

function emitPersistedRecords() {
  skipNextSync.value = true
  emit(
    'update:modelValue',
    draftRecords.value.flatMap((record, index) => {
      const snapshot = savedSnapshot(record, index)
      return snapshot ? [cloneRecord(snapshot)] : []
    }),
  )
}

function resolveProfileRecords(profile: Record<string, any> | undefined) {
  if (!profile) {
    return []
  }

  if (props.recordType === 'medical') {
    return Array.isArray(profile.medicalRecords) ? profile.medicalRecords : []
  }

  if (props.recordType === 'checkup') {
    return Array.isArray(profile.checkupRecords) ? profile.checkupRecords : []
  }

  return Array.isArray(profile.allergyRecords) ? profile.allergyRecords : []
}

function normalizeServerRecord(record: Record<string, any>, localId: string) {
  return {
    ...cloneRecord(record),
    __localId: localId,
    [props.attachmentsFieldKey]: attachmentList(record),
  }
}

function findSavedRecordFromProfile(
  profileRecords: Record<string, any>[],
  record: Record<string, any>,
  index: number,
) {
  if (record.id) {
    return profileRecords.find((item) => item.id === record.id) || null
  }

  const target = JSON.stringify(stripLocalFields(record))
  const knownIds = new Set(
    draftRecords.value
      .filter((item, currentIndex) => currentIndex !== index && item.id)
      .map((item) => item.id),
  )

  return (
    profileRecords.find(
      (item) =>
        !knownIds.has(item.id) && JSON.stringify(stripLocalFields(item)) === target,
    ) || null
  )
}

async function saveRecord(index: number) {
  const record = draftRecords.value[index]
  const wasSaved = isSavedRecord(record, index)
  const validationError = getHealthRecordValidationError(props.recordType, record)
  if (validationError) {
    uni.showToast({ title: validationError, icon: 'none' })
    return
  }

  const key = recordKey(record, index)
  savingKeys.value[key] = true

  try {
    const isRemoteSave = shouldUseRemoteHealthRecordSync(props.dogId)
    if (isRemoteSave) {
      uni.showLoading({ title: '保存中...' })
      const res: any = await dogApi.updateHealthRecords(
        props.dogId,
        props.recordType,
        buildPersistedRecordsForSave(index),
      )

      if (res.code !== 0 || !res.data?.profile) {
        throw new Error(res.message || '保存失败')
      }

      const nextRecord =
        findSavedRecordFromProfile(resolveProfileRecords(res.data.profile), record, index) ||
        stripLocalFields(record)

      const normalizedRecord = normalizeServerRecord(nextRecord, key)
      draftRecords.value[index] = normalizedRecord
      savedSnapshots.value[key] = stripLocalFields(normalizedRecord)
      const focusIdentity = buildHealthRecordFocusIdentity(props.recordType, normalizedRecord)
      emit('record-saved', focusIdentity)
      emitPersistedRecords()
      collapseRecordAtIndex(index)
      uni.hideLoading()
      uni.showToast({ title: wasSaved ? '已更新' : '已保存', icon: 'success' })
      return
    }

    const normalizedRecord = normalizeServerRecord(stripLocalFields(record), key)
    draftRecords.value[index] = normalizedRecord
    savedSnapshots.value[key] = stripLocalFields(normalizedRecord)
    const focusIdentity = buildHealthRecordFocusIdentity(props.recordType, normalizedRecord)
    emit('record-saved', focusIdentity)
    emitPersistedRecords()
    collapseRecordAtIndex(index)
    uni.showToast({ title: wasSaved ? '已更新' : '已保存', icon: 'success' })
  } catch (error: any) {
    if (props.dogId) {
      uni.hideLoading()
    }
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    delete savingKeys.value[key]
  }
}

function cancelRecord(index: number) {
  const record = draftRecords.value[index]
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === recordKey(record, index)) {
      expandedRecordKey.value = null
    }
    return
  }

  draftRecords.value[index] = normalizeServerRecord(snapshot, recordKey(record, index))
  expandedRecordKey.value = null
}

async function removeRecord(index: number) {
  const record = draftRecords.value[index]
  const snapshot = savedSnapshot(record, index)
  if (!snapshot) {
    draftRecords.value.splice(index, 1)
    if (expandedRecordKey.value === recordKey(record, index)) {
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

  const key = recordKey(record, index)
  savingKeys.value[key] = true

  try {
    const isRemoteSave = shouldUseRemoteHealthRecordSync(props.dogId)
    if (isRemoteSave) {
      uni.showLoading({ title: '删除中...' })
      const res: any = await dogApi.updateHealthRecords(
        props.dogId,
        props.recordType,
        buildPersistedRecordsAfterDelete(index),
      )

      if (res.code !== 0 || !res.data?.profile) {
        throw new Error(res.message || '删除失败')
      }
    }

    draftRecords.value.splice(index, 1)
    delete savedSnapshots.value[key]
    if (expandedRecordKey.value === key) {
      expandedRecordKey.value = null
    }
    emitPersistedRecords()
    if (isRemoteSave) {
      uni.hideLoading()
    }
    uni.showToast({ title: '已删除', icon: 'success' })
  } catch (error: any) {
    if (shouldUseRemoteHealthRecordSync(props.dogId)) {
      uni.hideLoading()
    }
    uni.showToast({ title: error?.message || '删除失败', icon: 'none' })
  } finally {
    delete savingKeys.value[key]
  }
}

function isUploading(record: Record<string, any>, index: number) {
  return Boolean(uploadingKeys.value[recordKey(record, index)])
}

async function chooseAttachment(index: number) {
  const record = draftRecords.value[index]
  const key = recordKey(record, index)
  if (uploadingKeys.value[key]) {
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

  uploadingKeys.value[key] = true

  try {
    uni.showLoading({ title: '上传中...' })
    const uploaded = await dogApi.uploadHealthAttachment(props.recordType, selectedFile.path)
    const attachments = attachmentList(record)
    draftRecords.value[index] = {
      ...record,
      [props.attachmentsFieldKey]: [...attachments, uploaded.url],
    }
    uni.hideLoading()
    uni.showToast({ title: '附件已添加，请保存记录', icon: 'none' })
  } catch (error: any) {
    uni.hideLoading()
    uni.showToast({ title: resolveHealthAttachmentUploadErrorMessage(error), icon: 'none' })
  } finally {
    delete uploadingKeys.value[key]
  }
}

function chooseImageFile() {
  return new Promise<{ path: string; name: string; size: number | null } | null>((resolve) => {
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
  return new Promise<{ path: string; name: string; size: number | null } | null>((resolve) => {
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
  const record = draftRecords.value[index]
  const attachments = attachmentList(record)
  if (attachments.length <= attachmentIndex) {
    return
  }

  const nextAttachments = attachments.filter((_, currentIndex) => currentIndex !== attachmentIndex)
  draftRecords.value[index] = {
    ...record,
    [props.attachmentsFieldKey]: nextAttachments,
  }

  const removedUrl = attachments[attachmentIndex]
  const removedKey = extractHealthAttachmentKey(removedUrl)
  if (removedKey && !isSavedRecord(record, index)) {
    void dogApi.deleteHealthAttachment(props.recordType, removedKey).catch(() => {})
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

.record-card--dirty {
  border-color: rgba(15, 107, 67, 0.18);
  box-shadow: inset 0 0 0 1rpx rgba(15, 107, 67, 0.04);
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

.record-card__delete::after,
.attachment-item__remove::after,
.record-card__action::after,
.attachment-button::after,
.records-section__add::after {
  border: none;
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

.attachment-item__preview {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 0;
  text-align: left;
  font-size: 24rpx;
  line-height: 1.5;
  color: #415a65;
  background: transparent;
}

.attachment-item__preview::after {
  border: none;
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
</style>
