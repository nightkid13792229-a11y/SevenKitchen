<template>
  <!-- 拍照录入（2026-10-01，第六期）。
       老板第 4 条：拍照识别从过敏报告扩到体检报告、疫苗本、病历。
       老板第 5 条：识别之后**不需要顾客一条一条确认** ——
                   确认一次，就把识别出来的内容自动填进表单。
       老板第 6 条：愿意手填的顾客不受影响，这条路是可选的。 -->
  <view class="scan">
    <view class="scan__row">
      <text class="scan__button" :class="{ 'scan__button--busy': isBusy }" @tap="pickAndScan">
        {{ isBusy ? '识别中…' : buttonText }}
      </text>
      <text class="scan__hint">{{ hintText }}</text>
    </view>

    <!-- 识别结果：一次性确认，确认完就填表 -->
    <view v-if="showConfirm" class="confirm">
      <text class="confirm__title">识别到以下内容，确认后自动填入表单</text>

      <view v-for="(draft, index) in drafts" :key="`draft-${index}`" class="confirm__card">
        <text v-for="row in describeDraft(draft)" :key="row.label" class="confirm__row">
          <text class="confirm__label">{{ row.label }}</text>
          <text class="confirm__value">{{ row.value }}</text>
        </text>
      </view>

      <view v-if="warnings.length > 0" class="confirm__warnings">
        <text v-for="warning in warnings" :key="warning" class="confirm__warning">· {{ warning }}</text>
      </view>

      <text class="confirm__confidence">
        识别把握：{{ confidenceLabel }}。填入后你还可以逐项修改。
      </text>

      <view class="confirm__actions">
        <text class="confirm__discard" @tap="discard">重新拍</text>
        <text class="confirm__accept" @tap="accept">确认，填入表单</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 拍照 → 上传 → 识别 → **确认一次** → 把内容交给上层填表。
 *
 * 设计取舍：
 *   · 识别结果**不直接保存**，而是填进表单 —— 顾客还能改，也还能不存。
 *     （老板第 5 条说的是"自动的录入表单"，不是"自动保存"）
 *   · 任何一步失败都降级为手工填写，绝不挡住顾客。
 *   · 只把 OCR 读到的内容搬进表单，不做任何医学判断。
 */
type DocumentType = 'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'

const props = withDefaults(defineProps<{
  dogId: string
  documentType: DocumentType
  buttonText?: string
  hintText?: string
  /** 上传时后端需要的记录类别（medical / checkup / vaccine / allergy） */
  uploadType: 'medical' | 'checkup' | 'vaccine' | 'allergy'
}>(), {
  buttonText: '拍照录入',
  hintText: '拍报告或疫苗本，自动填表；也可以直接手填',
})

const emit = defineEmits<{
  (event: 'scanned', payload: { drafts: Record<string, any>[]; documentType: DocumentType }): void
}>()

const isBusy = ref(false)
const showConfirm = ref(false)
const drafts = ref<Record<string, any>[]>([])
const warnings = ref<string[]>([])
const confidence = ref('LOW')

const confidenceLabel = computed(() => {
  if (confidence.value === 'HIGH') return '高'
  if (confidence.value === 'MEDIUM') return '中'
  return '低'
})

/** 把一条草稿翻译成"标签 + 值"给顾客核对 */
function describeDraft(draft: Record<string, any>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: unknown) => {
    const text = String(value ?? '').trim()
    if (text) {
      rows.push({ label, value: text })
    }
  }

  if (props.documentType === 'VACCINE_BOOK') {
    push('疫苗', draft.vaccineName)
    push('接种日期', draft.vaccinationDate)
    push('下次到期', draft.nextDueDate)
    push('备注', draft.notes)
    return rows
  }

  if (props.documentType === 'CHECKUP_REPORT') {
    push('体检日期', draft.checkupDate)
    push('检查结论', draft.findings)
    push('医生建议', draft.recommendations)
    push('兽医', draft.veterinarian)
    push('备注', draft.notes)
    return rows
  }

  if (props.documentType === 'MEDICAL_RECORD') {
    push('就诊日期', draft.visitDate)
    push('症状', draft.chiefComplaint)
    push('诊断结果', draft.diagnosis)
    push('处理方式', draft.treatment)
    push('用药', Array.isArray(draft.medications) ? draft.medications.join('、') : draft.medications)
    push('兽医', draft.veterinarian)
    return rows
  }

  push('过敏原', draft.allergen)
  push('备注', draft.notes)
  return rows
}

function pickAndScan() {
  if (isBusy.value) {
    return
  }

  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['camera', 'album'],
    success: (res: any) => {
      const filePath = res?.tempFilePaths?.[0]
      if (filePath) {
        void scan(filePath)
      }
    },
  })
}

async function scan(filePath: string) {
  isBusy.value = true
  showConfirm.value = false
  confidence.value = ''
  uni.showLoading({ title: '识别中…', mask: true })

  try {
    // ① 先传到 COS（与手工上传附件同一条路）
    const uploaded = await dogApi.uploadHealthAttachment(props.uploadType, filePath)
    if (!uploaded?.url) {
      throw new Error('图片上传失败')
    }

    // ② 再交给 AI 识别
    const res: any = await dogApi.extractHealthReport({
      imageUrl: uploaded.url,
      documentType: props.documentType,
    })
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '识别失败')
    }

    const list = Array.isArray(res.data.drafts) ? res.data.drafts : []
    if (list.length === 0) {
      throw new Error(
        (res.data.warnings || [])[0] || '没识别到内容，请换一张更清晰的图片',
      )
    }

    drafts.value = list
    warnings.value = Array.isArray(res.data.warnings) ? res.data.warnings : []
    confidence.value = String(res.data.confidence || 'LOW')
    showConfirm.value = true
  } catch (error: any) {
    uni.showToast({
      title: error?.message || '识别失败，可以手工填写',
      icon: 'none',
      duration: 2500,
    })
  } finally {
    isBusy.value = false
    uni.hideLoading()
  }
}

function accept() {
  emit('scanned', { drafts: drafts.value, documentType: props.documentType })
  showConfirm.value = false
  drafts.value = []
  warnings.value = []
}

function discard() {
  showConfirm.value = false
  drafts.value = []
  warnings.value = []
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.scan {
  margin-bottom: 20rpx;
}

.scan__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.scan__button {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  padding: 16rpx 26rpx;
  border-radius: 999rpx;
}

.scan__button--busy {
  opacity: 0.6;
}

.scan__hint {
  flex: 1;
  min-width: 0;
  font-size: 21rpx;
  line-height: 1.5;
  color: #8a968a;
}

/* 一次性确认 */
.confirm {
  margin-top: 20rpx;
  padding: 24rpx;
  border-radius: 16rpx;
  background: var(--health-accent-soft, #eef2e4);
  border: 2rpx solid var(--health-accent, #1e3a2f);
}

.confirm__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.confirm__card {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.75);
}

.confirm__row {
  display: block;
  margin-top: 8rpx;
  font-size: 25rpx;
  line-height: 1.5;
}

.confirm__row:first-child {
  margin-top: 0;
}

.confirm__label {
  color: #6b6653;
}

.confirm__value {
  color: #26261f;
  font-weight: 500;
}

.confirm__warnings {
  margin-top: 16rpx;
}

.confirm__warning {
  display: block;
  font-size: 21rpx;
  line-height: 1.6;
  color: #a5311f;
}

.confirm__confidence {
  display: block;
  margin-top: 14rpx;
  font-size: 21rpx;
  color: #8a968a;
}

.confirm__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 22rpx;
}

.confirm__discard {
  font-size: 26rpx;
  color: #6b6653;
  padding: 14rpx 22rpx;
}

.confirm__accept {
  font-size: 26rpx;
  font-weight: 600;
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  padding: 16rpx 30rpx;
  border-radius: 999rpx;
}
</style>
