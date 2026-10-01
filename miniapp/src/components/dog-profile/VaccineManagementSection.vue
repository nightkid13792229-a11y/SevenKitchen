<template>
  <view class="health-section">
    <!-- 内嵌到健康管理页时不显示（书签已经写着「疫苗」）—— 老板 2026-10-01 要求 -->
    <view v-if="!embedded" class="health-section__header">
      <view class="health-section__heading">
        <text class="health-section__title">疫苗管理</text>
        <text class="health-section__desc">
          记录每次接种与下次到期日，到期前这里会提醒你。
        </text>
      </view>
      <text class="health-section__count">{{ records.length }} 条</text>
    </view>

    <!-- 拍疫苗本（2026-10-01，第六期）。
         一本疫苗本通常有**多条**记录，识别后一起填进来，顾客确认一次即可。 -->
    <HealthDocumentScan
      v-if="dogId"
      :dog-id="dogId"
      document-type="VACCINE_BOOK"
      upload-type="vaccine"
      button-text="拍疫苗本"
      hint-text="一次能读出本子上的多条记录；也可以直接手填"
      @scanned="onVaccineBookScanned"
    />

    <view v-if="dueSummaryText" class="vaccine-due-banner">
      <text class="vaccine-due-text">{{ dueSummaryText }}</text>
    </view>

    <view v-if="loading" class="health-section__empty">
      <text class="health-section__empty-title">疫苗记录加载中</text>
    </view>

    <view v-else-if="records.length === 0" class="health-section__empty">
      <text class="health-section__empty-title">还没有疫苗记录</text>
      <text class="health-section__empty-desc">
        记下疫苗名和接种日期，到期日我们会替你算着。
      </text>
    </view>

    <view
      v-for="(record, index) in records"
      :key="record.id || `draft-${index}`"
      class="vaccine-card health-card"
    >
      <view class="vaccine-card__header" @tap="toggleExpanded(record, index)">
        <view class="vaccine-card__summary">
          <view class="vaccine-card__title-row">
            <text class="vaccine-card__name">{{ draftOf(record, index).vaccineName || '未填疫苗名' }}</text>
            <text class="vaccine-card__status" :class="statusClass(draftOf(record, index))">
              {{ statusLabel(draftOf(record, index).status) }}
            </text>
          </view>
          <text class="vaccine-card__detail">
            接种 {{ draftOf(record, index).vaccinationDate || '未填日期' }}
          </text>
          <text v-if="dueHint(draftOf(record, index))" class="vaccine-card__due" :class="dueClass(draftOf(record, index))">
            {{ dueHint(draftOf(record, index)) }}
          </text>
        </view>
        <text class="vaccine-card__toggle">
          {{ expandedIndex === index ? '收起' : '展开' }}
        </text>
      </view>

      <view v-if="expandedIndex === index" class="vaccine-card__body">
        <view class="field-group">
          <text class="field-label">疫苗名称</text>
          <input
            class="field-input"
            type="text"
            placeholder="例如：狂犬疫苗"
            :value="draftOf(record, index).vaccineName"
            @input="updateDraft(index, 'vaccineName', $event.detail.value)"
          />
          <view class="vaccine-name-tags">
            <text
              v-for="name in commonVaccineNames"
              :key="name"
              class="vaccine-name-tag"
              @tap="updateDraft(index, 'vaccineName', name)"
            >{{ name }}</text>
          </view>
        </view>

        <view class="field-group">
          <text class="field-label">接种日期</text>
          <picker
            mode="date"
            :value="draftOf(record, index).vaccinationDate"
            @change="updateDraft(index, 'vaccinationDate', $event.detail.value)"
          >
            <view class="field-picker">
              {{ draftOf(record, index).vaccinationDate || '请选择接种日期' }}
            </view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">下次到期日（可选）</text>
          <picker
            mode="date"
            :value="draftOf(record, index).nextDueDate || today"
            @change="updateDraft(index, 'nextDueDate', $event.detail.value)"
          >
            <view class="field-picker">
              {{ draftOf(record, index).nextDueDate || '不填则不提醒' }}
            </view>
          </picker>
          <text
            v-if="draftOf(record, index).nextDueDate"
            class="field-inline-action"
            @tap="updateDraft(index, 'nextDueDate', '')"
          >清除到期日</text>
        </view>

        <view class="field-group">
          <text class="field-label">状态</text>
          <picker
            mode="selector"
            :range="statusOptions"
            range-key="label"
            :value="statusIndex(draftOf(record, index).status)"
            @change="updateDraft(index, 'status', statusValueAt($event.detail.value))"
          >
            <view class="field-picker">{{ statusLabel(draftOf(record, index).status) }}</view>
          </picker>
        </view>

        <view class="field-group">
          <text class="field-label">备注（可选）</text>
          <textarea
            class="field-textarea"
            placeholder="例如：接种机构、批号、接种后反应"
            :value="draftOf(record, index).notes"
            @input="updateDraft(index, 'notes', $event.detail.value)"
          />
        </view>

        <!-- 报告原件（2026-10-01 第九期）：拍疫苗本留下的原图。
             没有原件的记录（手工填写）不显示这一块，不留空位。 -->
        <view v-if="attachmentList(record).length > 0" class="field-group">
          <text class="field-label">报告原件</text>
          <view class="vaccine-attachment-list">
            <view
              v-for="(attachment, attachmentIndex) in attachmentList(record)"
              :key="`${record.id || index}-attachment-${attachmentIndex}`"
              class="vaccine-attachment"
              @tap="previewAttachment(attachment)"
            >
              <text class="vaccine-attachment__title">
                {{ attachmentDisplay(attachment, attachmentIndex).title }}
              </text>
              <text class="vaccine-attachment__action">预览</text>
            </view>
          </view>
          <text class="vaccine-attachment__hint">
            这是当初拍疫苗本留下的原图，换医院、出行要用时可以打开给对方看。
          </text>
        </view>

        <view class="vaccine-card__actions">
          <button
            v-if="record.id"
            class="vaccine-card__action vaccine-card__action--ghost"
            :class="{ 'vaccine-card__action--disabled': isBusy }"
            :disabled="isBusy"
            @tap="removeRecord(record, index)"
          >删除</button>
          <!-- 内嵌到健康管理页时隐藏（改由底部按钮统一保存） -->
          <button
            v-if="!externalSave"
            class="vaccine-card__action vaccine-card__action--primary"
            :class="{ 'vaccine-card__action--disabled': isBusy }"
            :disabled="isBusy"
            @tap="saveRecord(record, index)"
          >{{ savingIndex === index ? '保存中…' : '保存' }}</button>
        </view>
      </view>
    </view>

    <button
      class="health-section__action"
      :class="{ 'health-section__action--disabled': loading || isBusy }"
      :disabled="loading || isBusy"
      @tap="addRecord"
    >
      新增疫苗记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { dogApi, type VaccineRecordCreatePayload } from '../../api/dogs'
import {
  buildHealthAttachmentDisplayMeta,
  normalizeHealthAttachmentList,
  previewHealthAttachment,
} from '../../utils/health-records'
import HealthDocumentScan from './HealthDocumentScan.vue'

interface VaccineRecord {
  id: string
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  /**
   * 报告原件（2026-10-01 第九期）。
   * 拍疫苗本识别出来的记录会把顾客拍的原图存在这里，是接种凭证；
   * 手工填写的记录是空数组。
   */
  attachments?: string[]
}

interface VaccineDraft {
  vaccineName: string
  vaccinationDate: string
  nextDueDate: string
  notes: string
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
}

const props = defineProps<{
  dogId: string
  /**
   * 内嵌到健康管理页：隐藏每行的「保存」，改由底部那个自适应按钮统一保存。
   * （顾客不必在每一行里找保存键。）
   */
  externalSave?: boolean
  /**
   * 内嵌到健康管理页：同时隐藏板块头（「疫苗管理」+ N 条）——
   * 上面书签已经写着「疫苗」，重复一遍只会把正文往下推。
   */
  embedded?: boolean
}>()

const emit = defineEmits<{
  (event: 'dirty-change', value: boolean): void
}>()

/**
 * 这一行的草稿是否与原值不同。
 *
 * ensureDrafts 会给**每一行**都建草稿，所以"脏"不能只看有没有草稿，
 * 要逐字段和原值比。
 */
function isDirty(record: VaccineRecord, index: number) {
  const draft = drafts[draftKey(record, index)]
  if (!draft) return false

  const base = toDraft(record)
  return (Object.keys(base) as (keyof VaccineDraft)[]).some(
    (field) => draft[field] !== base[field],
  )
}

/** 有没有填了但还没保存的行 —— 决定底部按钮是否可点 */
const hasPendingDraft = computed(() =>
  records.value.some((record, index) =>
    Boolean(String(draftOf(record, index).vaccineName || '').trim()) && isDirty(record, index),
  ),
)

watch(hasPendingDraft, (value) => emit('dirty-change', value), { immediate: true })

/**
 * 保存所有改过的行（供健康管理页的底部按钮调用）。
 * 顺序执行：并发写同一个列表会互相覆盖。
 */
async function saveAllDirty() {
  if (isBusy.value) {
    uni.showToast({ title: '保存中，请稍候', icon: 'none' })
    return
  }

  const dirtyIndexes = records.value
    .map((record, index) => (isDirty(record, index) ? index : -1))
    .filter((index) => index >= 0)

  if (dirtyIndexes.length === 0) {
    uni.showToast({ title: '没有需要保存的内容', icon: 'none' })
    return
  }

  for (const index of dirtyIndexes) {
    await saveRecord(records.value[index], index)
  }
}

defineExpose({ saveAllDirty })

/** 常见疫苗名：一点即选，避免顾客手打（与过敏原标签同一思路） */
const commonVaccineNames = [
  '狂犬疫苗',
  '犬瘟热',
  '犬细小病毒',
  '犬传染性肝炎',
  '犬副流感',
  '犬腺病毒',
  '犬窝咳',
  '钩端螺旋体',
]

const STATUS_OPTIONS = [
  { value: 'COMPLETED', label: '已接种' },
  { value: 'SCHEDULED', label: '已预约' },
  { value: 'OVERDUE', label: '已逾期' },
] as const

const statusOptions = STATUS_OPTIONS.map(option => ({ label: option.label }))

const records = ref<VaccineRecord[]>([])
const drafts = reactive<Record<string, VaccineDraft>>({})
const loading = ref(false)
const expandedIndex = ref(-1)
const savingIndex = ref(-1)
const deletingKey = ref('')
const isBusy = computed(() => savingIndex.value >= 0 || Boolean(deletingKey.value))

const today = getTodayDateString()

function getTodayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function toDraft(record: Partial<VaccineRecord>): VaccineDraft {
  const status = String(record.status || '')
  return {
    vaccineName: String(record.vaccineName || ''),
    vaccinationDate: String(record.vaccinationDate || '').slice(0, 10),
    nextDueDate: String(record.nextDueDate || '').slice(0, 10),
    notes: String(record.notes || ''),
    status: (STATUS_OPTIONS.some(option => option.value === status)
      ? status
      : 'COMPLETED') as VaccineDraft['status'],
  }
}

function draftKey(record: VaccineRecord, index: number) {
  return record.id || `draft-${index}`
}

/**
 * 记录变化后统一重建草稿（新增 / 载入 / 删除都走这里）。
 *
 * 草稿绝不能"边渲染边创建"：那等于在渲染期间改响应式状态，
 * 索引一旦错位（删了中间一条）就会把 A 的编辑内容写到 B 身上。
 */
function ensureDrafts() {
  for (const key of Object.keys(drafts)) {
    delete drafts[key]
  }

  records.value.forEach((record, index) => {
    drafts[draftKey(record, index)] = toDraft(record)
  })
}

function draftOf(record: VaccineRecord, index: number): VaccineDraft {
  return drafts[draftKey(record, index)] || toDraft(record)
}

function updateDraft(index: number, field: keyof VaccineDraft, value: string) {
  const record = records.value[index]
  if (!record) return
  const draft = draftOf(record, index)
  // status 是受限联合类型（下拉框保证取值合法），其余字段都是普通字符串
  if (field === 'status') {
    draft.status = value as VaccineDraft['status']
    return
  }
  draft[field] = value
}

function toggleExpanded(record: VaccineRecord, index: number) {
  expandedIndex.value = expandedIndex.value === index ? -1 : index
}

/**
 * 这条疫苗记录的报告原件（2026-10-01 第九期）。
 *
 * 拍疫苗本识别出来的记录带着原图；手工填写的没有 —— 空数组，
 * 卡片上就不显示「报告原件」这一块，不留空位。
 */
function attachmentList(record?: VaccineRecord | Record<string, any> | null): string[] {
  return normalizeHealthAttachmentList((record as any)?.attachments)
}

function attachmentDisplay(url: string, index: number) {
  return buildHealthAttachmentDisplayMeta(url, index)
}

async function previewAttachment(url: string) {
  await previewHealthAttachment(url)
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(option => option.value === status)?.label || '已接种'
}

function statusIndex(status: string) {
  const index = STATUS_OPTIONS.findIndex(option => option.value === status)
  return index >= 0 ? index : 0
}

function statusValueAt(index: string | number) {
  return STATUS_OPTIONS[Number(index)]?.value || 'COMPLETED'
}

function statusClass(draft: VaccineDraft) {
  return {
    'vaccine-card__status--done': draft.status === 'COMPLETED',
    'vaccine-card__status--scheduled': draft.status === 'SCHEDULED',
    'vaccine-card__status--overdue': draft.status === 'OVERDUE',
  }
}

/** 距下次到期还有几天（负数 = 已过期） */
function daysUntil(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null
  }

  const target = new Date(`${dateText}T00:00:00`)
  const base = new Date(`${getTodayDateString()}T00:00:00`)
  if (Number.isNaN(target.getTime())) {
    return null
  }

  return Math.round((target.getTime() - base.getTime()) / 86400000)
}

function dueHint(draft: VaccineDraft) {
  if (!draft.nextDueDate) {
    return ''
  }

  const days = daysUntil(draft.nextDueDate)
  if (days === null) {
    return ''
  }

  if (days < 0) {
    return `已过期 ${Math.abs(days)} 天（到期日 ${draft.nextDueDate}）`
  }

  if (days === 0) {
    return `今天到期（${draft.nextDueDate}）`
  }

  return `还有 ${days} 天到期（${draft.nextDueDate}）`
}

function dueClass(draft: VaccineDraft) {
  const days = draft.nextDueDate ? daysUntil(draft.nextDueDate) : null
  return {
    'vaccine-card__due--soon': days !== null && days >= 0 && days <= 30,
    'vaccine-card__due--overdue': days !== null && days < 0,
  }
}

/**
 * 顶部提醒条：只统计"未来 30 天内到期"和"已经过期"的，
 * 不做推送通知 —— 微信订阅消息需要顾客逐次授权，这里先给页面内的提醒。
 */
const dueSummaryText = computed(() => {
  const overdue: string[] = []
  const upcoming: string[] = []

  for (const record of records.value) {
    const draft = toDraft(record)
    if (!draft.nextDueDate) continue
    const days = daysUntil(draft.nextDueDate)
    if (days === null) continue

    if (days < 0) {
      overdue.push(draft.vaccineName || '未填疫苗名')
    } else if (days <= 30) {
      upcoming.push(draft.vaccineName || '未填疫苗名')
    }
  }

  const parts: string[] = []
  if (overdue.length > 0) {
    parts.push(`${overdue.join('、')} 已过期`)
  }
  if (upcoming.length > 0) {
    parts.push(`${upcoming.join('、')} 30 天内到期`)
  }

  return parts.join('；')
})

watch(
  () => props.dogId,
  (dogId) => {
    void loadRecords(dogId)
  },
  { immediate: true },
)

async function loadRecords(dogId = props.dogId) {
  if (!dogId) {
    records.value = []
    return
  }

  loading.value = true

  try {
    const res: any = await dogApi.healthRecords.vaccine.list(dogId)
    if (res?.code !== 0) {
      throw new Error(res?.message || '加载疫苗记录失败')
    }

    const list = res?.data?.records
    records.value = (Array.isArray(list) ? list : [])
      .map((item: any) => ({
        id: String(item?.id || ''),
        vaccineName: String(item?.vaccineName || ''),
        vaccinationDate: String(item?.vaccinationDate || '').slice(0, 10),
        nextDueDate: String(item?.nextDueDate || '').slice(0, 10),
        notes: String(item?.notes || ''),
        status: toDraft(item).status,
      }))
      // 最近接种的排在最前：接口按写入顺序返回，那个顺序对顾客没有意义
      .sort((a: VaccineRecord, b: VaccineRecord) =>
        b.vaccinationDate.localeCompare(a.vaccinationDate))

    // 记录刷新后重建草稿，避免留下已被删除记录的编辑态
    ensureDrafts()
    if (expandedIndex.value >= records.value.length) {
      expandedIndex.value = -1
    }
  } catch (error: any) {
    records.value = []
    ensureDrafts()
    uni.showToast({ title: error?.message || '加载疫苗记录失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

/**
 * 疫苗本识别结果 → 填进草稿列表（老板第 5 条：确认一次就自动填表）。
 *
 * 只填表、不保存 —— 顾客核对后自己按保存。
 */
function onVaccineBookScanned(payload: { drafts: Record<string, any>[] }) {
  for (const draft of payload.drafts) {
    records.value.push({
      id: '',
      __localId: `vaccine-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      vaccineName: String(draft.vaccineName || ''),
      vaccinationDate: String(draft.vaccinationDate || ''),
      nextDueDate: String(draft.nextDueDate || ''),
      notes: String(draft.notes || ''),
      status: 'COMPLETED',
      // 2026-10-01 第九期：顾客拍的疫苗本原图跟着草稿一起过来，存进这条记录 ——
      // 疫苗本是接种凭证，出行/寄养/换医院都可能要看原件。
      // 一张本子上的多条接种记录共用同一张原图（照片就是那一页）。
      attachments: attachmentList(draft),
    } as any)
  }
  uni.showToast({
    title: `已填入 ${payload.drafts.length} 条，核对后保存`,
    icon: 'none',
  })
}

function addRecord() {
  const draft: VaccineRecord = {
    id: '',
    vaccineName: '',
    vaccinationDate: today,
    nextDueDate: '',
    notes: '',
    status: 'COMPLETED',
  }

  records.value = [...records.value, draft]
  ensureDrafts()
  expandedIndex.value = records.value.length - 1
}

function buildPayload(
  draft: VaccineDraft,
  record?: VaccineRecord,
): VaccineRecordCreatePayload {
  const payload: VaccineRecordCreatePayload = {
    vaccineName: draft.vaccineName.trim(),
    vaccinationDate: draft.vaccinationDate,
    status: draft.status,
    notes: draft.notes.trim() || null,
    // 报告原件（2026-10-01 第九期）：拍疫苗本留下的原图跟着记录一起存；
    // 手工填写时是空数组，明确传空数组才算"这条没有原件"。
    attachments: attachmentList(record),
  }

  // 空到期日不能传空字符串（后端按日期校验），直接不带这个字段
  if (draft.nextDueDate) {
    payload.nextDueDate = draft.nextDueDate
  }

  return payload
}

async function saveRecord(record: VaccineRecord, index: number) {
  if (isBusy.value) return

  const draft = draftOf(record, index)
  if (!draft.vaccineName.trim()) {
    uni.showToast({ title: '请填写疫苗名称', icon: 'none' })
    return
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.vaccinationDate)) {
    uni.showToast({ title: '请选择接种日期', icon: 'none' })
    return
  }

  savingIndex.value = index

  try {
    const payload = buildPayload(draft, record)
    const res: any = record.id
      ? await dogApi.healthRecords.vaccine.update(props.dogId, record.id, payload)
      : await dogApi.healthRecords.vaccine.create(props.dogId, payload)

    if (res?.code !== 0) {
      throw new Error(res?.message || '保存失败')
    }

    uni.showToast({ title: '已保存', icon: 'success' })
    expandedIndex.value = -1
    await loadRecords()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败，请重试', icon: 'none' })
  } finally {
    savingIndex.value = -1
  }
}

function removeRecord(record: VaccineRecord, index: number) {
  if (isBusy.value) return

  const draft = draftOf(record, index)
  const name = draft.vaccineName || '这条疫苗记录'

  uni.showModal({
    title: '删除疫苗记录？',
    content: `删除后「${name}」的接种与到期信息都会消失，不能恢复。`,
    confirmText: '删除',
    cancelText: '保留',
    success: (result) => {
      if (result.confirm) {
        void doRemove(record)
      }
    },
  })
}

async function doRemove(record: VaccineRecord) {
  if (!record.id) {
    records.value = records.value.filter(item => item !== record)
    ensureDrafts()
    expandedIndex.value = -1
    return
  }

  deletingKey.value = record.id

  try {
    const res: any = await dogApi.healthRecords.vaccine.delete(props.dogId, record.id)
    if (res?.code !== 0) {
      throw new Error(res?.message || '删除失败')
    }

    uni.showToast({ title: '已删除', icon: 'success' })
    expandedIndex.value = -1
    await loadRecords()
  } catch (error: any) {
    uni.showToast({ title: error?.message || '删除失败，请重试', icon: 'none' })
  } finally {
    deletingKey.value = ''
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';






.vaccine-due-banner {
  margin-top: 18rpx;
  padding: 18rpx 22rpx;
  border-radius: 18rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.vaccine-due-text {
  font-size: 24rpx;
  line-height: 1.6;
  color: #8a6f3d;
}




.vaccine-card {
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 22rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.vaccine-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.vaccine-card__summary {
  flex: 1 1 auto;
  min-width: 0;
}

.vaccine-card__title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
}

.vaccine-card__name {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.vaccine-card__status {
  padding: 4rpx 16rpx;
  font-size: 21rpx;
  border-radius: 999rpx;
}

.vaccine-card__status--done {
  color: #1e3a2f;
  background: #e6efe1;
}

.vaccine-card__status--scheduled {
  color: #8a6f3d;
  background: #f6efe0;
}

.vaccine-card__status--overdue {
  color: #8c4a3a;
  background: #f7e6e0;
}

.vaccine-card__detail {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #6b6653;
}

.vaccine-card__due {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #6b6653;
}

.vaccine-card__due--soon {
  color: #8a6f3d;
  font-weight: 600;
}

.vaccine-card__due--overdue {
  color: #8c4a3a;
  font-weight: 600;
}

.vaccine-card__toggle {
  flex-shrink: 0;
  font-size: 24rpx;
  color: #b08d4f;
}

.vaccine-card__body {
  margin-top: 22rpx;
}

.field-group + .field-group {
  margin-top: 24rpx;
}

.field-label {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
  color: #6b6653;
}

.vaccine-attachment-list {
  margin-top: 12rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.vaccine-attachment {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: rgba(15, 107, 67, 0.06);
}

.vaccine-attachment__title {
  flex: 1;
  min-width: 0;
  font-size: 26rpx;
  color: #26261f;
}

.vaccine-attachment__action {
  margin-left: 16rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #0f6b43;
}

.vaccine-attachment__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8c8574;
}

.field-input {
  margin-top: 10rpx;
  width: 100%;
  height: 84rpx;
  box-sizing: border-box;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-picker {
  margin-top: 10rpx;
  min-height: 84rpx;
  line-height: 84rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-textarea {
  margin-top: 10rpx;
  width: 100%;
  min-height: 150rpx;
  box-sizing: border-box;
  padding: 20rpx 24rpx;
  font-size: 28rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 20rpx;
}

.field-inline-action {
  display: inline-block;
  margin-top: 12rpx;
  font-size: 23rpx;
  color: #b08d4f;
}

.vaccine-name-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.vaccine-name-tag {
  padding: 10rpx 22rpx;
  font-size: 23rpx;
  color: #4a4638;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.vaccine-card__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 26rpx;
}

.vaccine-card__action {
  margin: 0;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 26rpx;
  border-radius: 999rpx;
}

.vaccine-card__action::after {
  border: none;
}

.vaccine-card__action--ghost {
  flex: 0 0 auto;
  padding: 0 36rpx;
  color: #6b6653;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
}

.vaccine-card__action--primary {
  flex: 1 1 auto;
  font-weight: 600;
  color: #f6efe0;
  background: var(--health-accent, #1e3a2f);
}

.vaccine-card__action--disabled {
  opacity: 0.5;
}


</style>
