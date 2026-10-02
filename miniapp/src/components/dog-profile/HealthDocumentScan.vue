<template>
  <!-- 拍照录入（2026-10-01，第六期）。
       老板第 4 条：拍照识别从过敏报告扩到体检报告、疫苗本、病历。
       老板第 5 条：识别之后**不需要顾客一条一条确认** ——
                   确认一次，就把识别出来的内容自动填进表单。
       老板第 6 条：愿意手填的顾客不受影响，这条路是可选的。 -->
  <view class="scan">
    <!-- 触发按钮（2026-10-01）：病历/检查板块把入口并进了底部那一个「新增记录」，
         所以它这里只保留"识别结果确认"这一块，按钮由上层调 startScan() 触发的。
         其它板块（疫苗本、过敏报告）仍用自带按钮。 -->
    <view v-if="!hideTrigger" class="scan__row">
      <text class="scan__button" :class="{ 'scan__button--busy': isBusy }" @tap="pickAndScan">
        {{ isBusy ? '识别中…' : buttonText }}
      </text>
      <text class="scan__hint">{{ hintText }}</text>
    </view>

    <!-- 没识别到内容 / 根本不是宠物医疗资料（2026-10-02 老板提的）：
         原来只弹一句 toast，顾客很容易觉得"点了没反应"。
         现在留一块看得见的提示，并把这次传上去、又没用的图片从 COS 删掉。 -->
    <view v-if="failureNotice" class="failure">
      <text class="failure__title">这次没有识别到内容</text>
      <text class="failure__message">{{ failureNotice }}</text>
      <view class="failure__actions">
        <text class="confirm__discard" @tap="discard">重新上传</text>
        <text class="confirm__accept" @tap="dismissFailure">知道了</text>
      </view>
    </view>

    <!-- 识别结果：一次性确认，确认完就填表 -->
    <view v-if="showConfirm" class="confirm">
      <text class="confirm__title">识别到以下内容，确认后自动填入表单</text>
      <text v-if="resolvedTypeLabel" class="confirm__type">识别为：{{ resolvedTypeLabel }}</text>
      <text v-if="scanCountSummary" class="confirm__type">{{ scanCountSummary }}</text>

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
        <text class="confirm__discard" @tap="discard">重新上传</text>
        <text class="confirm__accept" @tap="accept">确认，填入表单</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dogApi } from '../../api/dogs'
import {
  extractHealthAttachmentKey,
  mergeScannedReportDrafts,
  resolveHealthScanErrorMessage,
  resolveScannedDocumentType,
} from '../../utils/health-records'

/**
 * 拍照 → 上传 → 识别 → **确认一次** → 把内容交给上层填表。
 *
 * 设计取舍：
 *   · 识别结果**不直接保存**，而是填进表单 —— 顾客还能改，也还能不存。
 *     （老板第 5 条说的是"自动的录入表单"，不是"自动保存"）
 *   · 任何一步失败都降级为手工填写，绝不挡住顾客。
 *   · 只把 OCR 读到的内容搬进表单，不做任何医学判断。
 */
type ExplicitDocumentType = 'ALLERGY_REPORT' | 'CHECKUP_REPORT' | 'VACCINE_BOOK' | 'MEDICAL_RECORD'
/**
 * `AUTO`（2026-10-01）：由后端判断这是哪一类文档。
 * 病历/检查板块两个入口合并成一个"从相册选择"就是靠它 ——
 * 顾客不用先回答"这是病历还是体检报告"，识别结果里会带上判定的类型。
 */
type DocumentType = ExplicitDocumentType | 'AUTO'

const props = withDefaults(defineProps<{
  dogId: string
  documentType: DocumentType
  buttonText?: string
  /** 隐藏自带按钮（由上层调用 startScan() 触发）—— 病历/检查板块合并入口后用它 */
  hideTrigger?: boolean
  hintText?: string
  /** 上传时后端需要的记录类别（medical / checkup / vaccine / allergy） */
  uploadType: 'medical' | 'checkup' | 'vaccine' | 'allergy'
}>(), {
  buttonText: '拍照录入',
  hintText: '拍报告或疫苗本，自动填表；也可以直接手填',
  hideTrigger: false,
})

const emit = defineEmits<{
  (event: 'scanned', payload: { drafts: Record<string, any>[]; documentType: DocumentType }): void
}>()

/**
 * 供上层外部触发（病历/检查板块把它并进了底部那个「新增记录」）。
 * 自带按钮隐藏时，就靠这个方法打开相机/相册。
 */
defineExpose({ startScan: pickAndScan })

const isBusy = ref(false)
const showConfirm = ref(false)
const drafts = ref<Record<string, any>[]>([])
const warnings = ref<string[]>([])
const confidence = ref('LOW')
/**
 * 后端最终判定的文档类型。
 *
 * 传 AUTO 时它会与 props.documentType 不同 —— 确认卡片按它显示字段标签，
 * 填表时也按它决定这条记录进"病历"还是"体检"。
 */
const resolvedDocumentType = ref<DocumentType>('MEDICAL_RECORD')
/** 本次识别成功了几张原图（用于在确认卡片上说明"几张 → 几条记录"） */
const scannedImageCount = ref(0)
/**
 * 识别失败的提示语（空 = 没失败）。
 * 用一块看得见的卡片而不是一句 toast —— 2026-10-02 老板传了张不相关的图，
 * 因为只弹了一句很快就消失的提示，他的感受是"点了根本没有任何反应"。
 */
const failureNotice = ref('')
/**
 * 这一轮传上去、还没被确认使用的图片地址。
 * 失败或"重新上传"时把它们从 COS 删掉，别白占空间（老板专门问过这件事）。
 */
const uploadedUrls = ref<string[]>([])
/** 顾客这次一共选了几张（含没识别成功的，用于如实说明"本次共 N 张"） */
const requestedImageCount = ref(0)

const TYPE_LABELS: Record<ExplicitDocumentType, string> = {
  MEDICAL_RECORD: '病历',
  CHECKUP_REPORT: '体检报告',
  VACCINE_BOOK: '疫苗本',
  ALLERGY_REPORT: '过敏原检测报告',
}

const resolvedTypeLabel = computed(() => (
  TYPE_LABELS[resolvedDocumentType.value as ExplicitDocumentType] || ''
))

const confidenceLabel = computed(() => {
  if (confidence.value === 'HIGH') return '高'
  if (confidence.value === 'MEDIUM') return '中'
  return '低'
})

/**
 * 确认卡片上那句"几张图 → 几条记录"。
 *
 * 多页合成一条之后，必须如实说明：顾客选了 3 张、只看到 1 条记录，
 * 若卡片上不说清楚，他会以为两张没识别成功。
 */
const scanCountSummary = computed(() => {
  const images = requestedImageCount.value
  if (images <= 1) {
    return ''
  }

  const records = drafts.value.length
  if (records <= 1) {
    return `本次共 ${images} 张图片，合成 1 条记录，${scannedImageCount.value} 张原图都存为附件`
  }

  return `本次共 ${images} 张图片，读出 ${records} 条记录，原图一并存为附件`
})

/** 当前应当按哪一类渲染/填表：优先用后端判定出来的类型 */
const activeDocumentType = computed<DocumentType>(() => (
  resolvedDocumentType.value || props.documentType
))

/** 把一条草稿翻译成"标签 + 值"给顾客核对 */
function describeDraft(draft: Record<string, any>): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const push = (label: string, value: unknown) => {
    const text = String(value ?? '').trim()
    if (text) {
      rows.push({ label, value: text })
    }
  }

  if (activeDocumentType.value === 'VACCINE_BOOK') {
    push('疫苗', draft.vaccineName)
    push('接种日期', draft.vaccinationDate)
    push('下次到期', draft.nextDueDate)
    push('其它想说的', draft.notes)
    return rows
  }

  // 这一块**必须和表单里那套字段、那套叫法一一对应**（2026-10-02 老板提的）：
  // 顾客核对时看到的，就是他接下来在表单里能改的那些 ——
  // 表单里已经删掉的字段（兽医）不该再出现在这里，
  // 表单里叫「医生怎么说」的，这里也不能写成「诊断结果」。
  if (activeDocumentType.value === 'CHECKUP_REPORT') {
    push('体检日期', draft.checkupDate)
    push('检查结论', draft.findings)
    push('医生建议', draft.recommendations)
    push('其它想说的', draft.notes)
    return rows
  }

  if (activeDocumentType.value === 'MEDICAL_RECORD') {
    push('就诊日期', draft.visitDate)
    push('症状', draft.chiefComplaint)
    push('医生怎么说', draft.diagnosis)
    push('处理与提醒', draft.treatment)
    push('用药', Array.isArray(draft.medications) ? draft.medications.join('、') : draft.medications)
    push('其它想说的', draft.notes)
    return rows
  }

  push('过敏原', draft.allergen)
  push('备注', draft.notes)
  return rows
}

/**
 * 从相册选图（2026-10-01 按老板要求简化）。
 *
 *   · **只开相册**：不再写"呼出相机"那条路 —— 少一次微信自己的
 *     「拍照 / 从相册选择」弹窗（相册里本来就有拍摄入口）。
 *   · **支持多选**：一次最多 9 张（微信上限）。一本病历或一份体检报告常有好几页，
 *     逐张识别后**合成一条记录**（2026-10-01 第九期老板定的），原图都留作附件；
 *     疫苗本不合并 —— 一张本子读出的是多条各自的接种记录。
 */
function pickAndScan() {
  if (isBusy.value) {
    return
  }

  uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
    sourceType: ['album'],
    success: (res: any) => {
      const paths: string[] = Array.isArray(res?.tempFilePaths) ? res.tempFilePaths : []
      // 同一张图选两次没必要识别两次
      const unique = [...new Set(paths.filter(Boolean))]
      if (unique.length > 0) {
        void scanAll(unique)
      }
    },
  })
}

const CONFIDENCE_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 }

/** 多张一起识别：逐张上传 + 识别，最后合并成一份待确认结果 */
async function scanAll(filePaths: string[]) {
  isBusy.value = true
  showConfirm.value = false
  confidence.value = ''
  scannedImageCount.value = 0
  requestedImageCount.value = filePaths.length
  failureNotice.value = ''
  uploadedUrls.value = []

  const collectedDrafts: Record<string, any>[] = []
  const collectedWarnings: string[] = []
  // 每一张图各自判出来的类型（多张时按"多数页"定这份资料属于哪一类）
  const detectedTypes: string[] = []
  let worstConfidence = 'HIGH'
  let failed = 0

  try {
    for (let index = 0; index < filePaths.length; index += 1) {
      uni.showLoading({
        title: filePaths.length > 1
          ? `识别中 ${index + 1}/${filePaths.length}…`
          : '识别中…',
        mask: true,
      })

      // 这一张传上去的地址：失败时要把它删掉（见下面的 catch）
      let uploadedUrl = ''

      try {
        // ① 先传到 COS（与手工上传附件同一条路）
        const uploaded = await dogApi.uploadHealthAttachment(props.uploadType, filePaths[index])
        if (!uploaded?.url) {
          throw new Error('图片上传失败')
        }
        uploadedUrl = String(uploaded.url)
        uploadedUrls.value.push(uploadedUrl)

        // ② 再交给 AI 识别（传 AUTO 时由后端判定这是哪一类文档）
        const res: any = await dogApi.extractHealthReport({
          imageUrl: uploaded.url,
          documentType: props.documentType,
        })
        if (res.code !== 0 || !res.data) {
          throw new Error(res.message || '识别失败')
        }

        const list = Array.isArray(res.data.drafts) ? res.data.drafts : []
        if (list.length > 0) {
          // 2026-10-01：把顾客拍的这张原图挂到"这张图识别出来的草稿"上。
          // 识别结果只是从报告上抄下来的字，报告原件才是凭证（顾客要回看、医生要看原件）。
          // 后端返回的 drafts 里 attachments 是空数组，图片地址只有这里知道。
          collectedDrafts.push(
            ...list.map((draft: Record<string, any>) => ({
              ...draft,
              attachments: [uploaded.url],
            })),
          )
          scannedImageCount.value += 1
        } else {
          // 这张啥也没读出来 → 传上去的图没用了，立刻删掉，别占 COS 空间
          await dropUploadedFile(uploadedUrl)
          failed += 1
        }

        if (Array.isArray(res.data.warnings)) {
          collectedWarnings.push(...res.data.warnings)
        }

        const type = String(res.data.documentType || '').toUpperCase()
        // NOT_MEDICAL = 后端判定"这根本不是宠物的医疗资料"，
        // 它不属于任何一种表单类型，不参与票选（草稿为空，最后会走到提示那条路）
        if (type && type !== 'AUTO' && type !== 'NOT_MEDICAL') {
          detectedTypes.push(type)
        }

        const itemConfidence = String(res.data.confidence || 'LOW').toUpperCase()
        if ((CONFIDENCE_RANK[itemConfidence] || 0) < (CONFIDENCE_RANK[worstConfidence] || 0)) {
          worstConfidence = itemConfidence
        }
      } catch (error: any) {
        // 多张里有一张失败不推翻其它的：先记下来，最后一起告诉顾客
        await dropUploadedFile(uploadedUrl)
        failed += 1
        collectedWarnings.push(error?.message || '有一张没能识别')
      }
    }

    if (collectedDrafts.length === 0) {
      throw new Error(
        collectedWarnings[0] || '没识别到内容，请换一张更清晰的图片',
      )
    }

    if (failed > 0) {
      collectedWarnings.push(`有 ${failed} 张没能识别，可以单独再试或手工补充`)
    }

    // 类型按"多数页"定：一页被误判不该把整份资料带偏
    const resolvedType = resolveScannedDocumentType(
      detectedTypes,
      props.documentType,
    ) as DocumentType

    // 多张图算一份资料（2026-10-01 第九期，老板定的）：
    // 3 页体检报告 = 1 条记录 + 3 张原图，而不是 3 条各说一半的记录。
    // **疫苗本例外** —— 一张本子读出的是多条各自的接种记录，合并会把几针并成一针。
    drafts.value = resolvedType === 'VACCINE_BOOK'
      ? collectedDrafts
      : mergeScannedReportDrafts(collectedDrafts)
    warnings.value = collectedWarnings
    confidence.value = worstConfidence
    resolvedDocumentType.value = resolvedType
    showConfirm.value = true
  } catch (error: any) {
    // 一块看得见的提示，而不是一闪而过的 toast；
    // 基础设施类报错（腾讯云"服务未开通"之类）也不直接甩给顾客，换成能懂的话
    failureNotice.value = resolveHealthScanErrorMessage(error?.message)
  } finally {
    isBusy.value = false
    uni.hideLoading()
  }
}

function accept() {
  emit('scanned', {
    drafts: drafts.value,
    documentType: resolvedDocumentType.value || props.documentType,
  })
  showConfirm.value = false
  drafts.value = []
  warnings.value = []
  failureNotice.value = ''
  // 图片交给上层了（跟着记录一起保存），这里不再算"没用上"
  uploadedUrls.value = []
}

/**
 * 把一张没用上的图片从 COS 删掉（失败就算了，服务端还有定期清理兜底）。
 *
 * 老板问过"识别了但没保存的附件会不会白占 COS 空间" —— 会，所以这里主动删：
 *   · 这张图没读出来 / 读挂了
 *   · 顾客点了「重新上传」把整轮结果丢掉
 */
async function dropUploadedFile(url: string) {
  const key = extractHealthAttachmentKey(String(url || ''))
  if (!key) {
    return
  }

  uploadedUrls.value = uploadedUrls.value.filter((item) => item !== url)

  try {
    await dogApi.deleteHealthAttachment(props.uploadType, key)
  } catch {
    // 静默：删不掉不该影响顾客继续操作
  }
}

/** 顾客看清提示后收起这块面板（图已经删了） */
function dismissFailure() {
  failureNotice.value = ''
}

/** 「重新上传」：直接再开一次相册（原来文案叫"重新拍"，但走的是相册，2026-10-02 改） */
function discard() {
  showConfirm.value = false
  drafts.value = []
  warnings.value = []
  failureNotice.value = ''

  // 「重新上传」＝这一轮的结果都不要了：把传上去的图一起删掉，别留在 COS 里
  const leftovers = [...uploadedUrls.value]
  uploadedUrls.value = []
  leftovers.forEach((url) => {
    void dropUploadedFile(url)
  })

  pickAndScan()
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

/* 没识别到内容时的提示块（2026-10-02）：要看得见，不能一闪而过 */
.failure {
  margin-bottom: 20rpx;
  padding: 26rpx 24rpx;
  border-radius: 20rpx;
  background: #fdf6ec;
  border: 1rpx solid #f0d9b5;
}

.failure__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #8a5a1b;
}

.failure__message {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  line-height: 1.6;
  color: #6b5a3e;
}

.failure__actions {
  margin-top: 22rpx;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
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
