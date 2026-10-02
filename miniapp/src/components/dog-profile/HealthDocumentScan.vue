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
      <text v-if="entryRecordSummary" class="confirm__type">{{ entryRecordSummary }}</text>
      <text v-if="resolvedTypeSummary" class="confirm__type">{{ resolvedTypeSummary }}</text>
      <text v-if="scanCountSummary" class="confirm__type">{{ scanCountSummary }}</text>
      <text v-if="attachmentSummary" class="confirm__type">{{ attachmentSummary }}</text>

      <!-- 从「就诊」进来、但这几张里一张病历都没有（例如只拍了一张化验单）：
           如实说明记到哪儿了，别让家长以为记错地方 -->
      <view v-if="entryTypeMismatch" class="confirm__note">
        <text class="confirm__note-text">{{ entryTypeMismatchText }}</text>
      </view>
      <view v-if="ignoredPagesNote" class="confirm__note">
        <text class="confirm__note-text">{{ ignoredPagesNote }}</text>
      </view>

      <text v-if="reportedPatientNames.length > 0" class="confirm__type">
        报告上的动物名：{{ reportedPatientNames.join('、') }}
      </text>
      <view v-if="patientNameMismatch" class="confirm__name-warning">
        <text class="confirm__name-warning-title">⚠️ 名字对不上</text>
        <text class="confirm__name-warning-text">{{ patientNameMismatch }}</text>
      </view>

      <view v-for="(draft, index) in drafts" :key="`draft-${index}`" class="confirm__card">
        <!-- 一次传了化验单 + 门诊病历时，每条前面标出它是什么，别让顾客以为混了 -->
        <text v-if="drafts.length > 1" class="confirm__card-kind">
          {{ draftSourceLabel(draft) }}
        </text>
        <view v-for="row in describeDraft(draft)" :key="row.label" class="confirm__row">
          <text class="confirm__label">{{ row.label }}</text>
          <text class="confirm__value">{{ row.value }}</text>
        </view>
      </view>

      <view v-if="warnings.length > 0" class="confirm__warnings">
        <text v-for="warning in warnings" :key="warning" class="confirm__warning">· {{ warning }}</text>
      </view>

      <!-- 识别把握不再给顾客看（2026-10-02 老板定）：模型自评分，顾客据此做不了任何事，
           显示一个"中"只会让人整份都不敢信。只有"低"时才给一句能行动的话。 -->
      <text v-if="lowConfidenceHint" class="confirm__confidence">{{ lowConfidenceHint }}</text>

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
  buildSingleScannedRecord,
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
  /** 当前这只狗的名字：只用来提醒"报告上的动物名对不上"，不做拦截（2026-10-02） */
  dogName?: string
  /**
   * 顾客是从哪个入口点进来的（2026-10-02 老板定稿）。
   *
   * 传 AUTO 时**记录类型由它决定**：从「就诊」进 = 这一批合成一条就诊记录，
   * 从「体检」进 = 合成一条体检记录。AI 判出来的文档类型只决定"字往哪个字段填"，
   * 不再决定记录落在哪张表 —— 原来化验单会被判成体检类，于是家长从就诊进去
   * 却凭空多出一条体检记录（老板实测提的）。
   */
  entryKind?: 'medical' | 'checkup'
}>(), {
  buttonText: '拍照录入',
  hintText: '拍报告或疫苗本，自动填表；也可以直接手填',
  hideTrigger: false,
  entryKind: 'medical',
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
/** 这一批里没有"入口那一类"的内容（从就诊进、但一张病历都没有）→ 卡片上说明一句 */
const entryTypeMismatch = ref(false)
/** 被排除在外的页（疫苗本/过敏报告）—— 各自板块有更合适的表单 */
const ignoredPagesNote = ref('')
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
    return `本次共 ${images} 张图片，合成 1 条记录`
  }

  return `本次共 ${images} 张图片，读出 ${records} 条记录`
})

/**
 * 这一批纸记到哪个标签下（2026-10-02 老板定稿：入口决定记录类型）。
 *
 * 原来卡片只写"识别为：病历 + 体检报告"，家长看到的是"我走的就诊，
 * 怎么冒出个体检报告？"—— 现在直接说清记到哪儿。
 */
const entryRecordSummary = computed(() => {
  if (drafts.value.length === 0) return ''
  const label = props.entryKind === 'checkup' ? '体检记录' : '就诊记录'
  return `记到：${label}${drafts.value.length > 1 ? `（${drafts.value.length} 条）` : ''}`
})

/** 原图去哪了：写清"几张、挂在谁名下"，别让家长以为只存了一张 */
const attachmentSummary = computed(() => {
  const total = drafts.value.reduce(
    (sum, draft) => sum + (Array.isArray(draft?.attachments) ? draft.attachments.length : 0),
    0,
  )
  if (total === 0) return ''

  if (drafts.value.length <= 1) {
    return `${total} 张原图会一起存进这条记录`
  }

  return `原图会按页分到上面各条记录里（共 ${total} 张）`
})

/** 识别把握"低"时才说话，而且要说人能做的那件事 */
const lowConfidenceHint = computed(() => (
  confidence.value === 'LOW' ? '有几处没读准，填完请对着原件核一遍。' : ''
))

const entryTypeMismatchText = computed(() => {
  const entryLabel = props.entryKind === 'checkup' ? '体检' : '就诊'
  const contentLabel = props.entryKind === 'checkup' ? '病历' : '化验/检查报告'
  return `这几张里没有${contentLabel}的内容，所以只填了能填的部分 —— ` +
    `你从「${entryLabel}」进来，就记在${entryLabel}记录下。`
})

/** 当前应当按哪一类渲染/填表：优先用后端判定出来的类型 */
const activeDocumentType = computed<DocumentType>(() => (
  resolvedDocumentType.value || props.documentType
))

/**
 * 这一条草稿属于哪一类（一次传多张时可能混着化验单和门诊病历，
 * 每条草稿都贴了自己的类型，见 scanAll 里的 __documentType）。
 */
function draftDocumentType(draft: Record<string, any>): DocumentType {
  const own = String(draft?.__documentType || '').toUpperCase()
  if (own === 'IMAGING') {
    // 影像片按体检那套字段渲染（日期 + 原件），只是名字不同
    return 'CHECKUP_REPORT'
  }

  if (own && own !== 'AUTO' && own !== 'NOT_MEDICAL') {
    return own as DocumentType
  }

  return (resolvedDocumentType.value || props.documentType) as DocumentType
}

/** 这一条草稿"原本被判成什么"（影像片要单独标出来） */
function draftSourceLabel(draft: Record<string, any>) {
  if (String(draft?.__documentType || '').toUpperCase() === 'IMAGING') {
    return '影像片'
  }

  return TYPE_LABELS[draftDocumentType(draft) as ExplicitDocumentType] || '资料'
}

/**
 * 报告上写的动物名（可能有好几个：一次传了不同狗的报告）。
 * 只用于核对，不参与保存 —— 报告原件里本来就有，存进字段反而多余。
 */
const reportedPatientNames = computed(() => {
  const names = drafts.value
    .map((draft) => String(draft?.patientName || '').trim())
    .filter(Boolean)

  return [...new Set(names)]
})

/**
 * 报告上的动物名和当前记录的狗狗对不上 → 提醒一句。
 *
 * 老板 2026-10-02 定的口径：**只提醒，不拦截** ——
 * 要不要把这份报告存进这只狗的档案，由家长自己决定。
 * （实测踩过：报告上写的是「熊海苔」「葡萄」，而家长存进了「面包」的档案。）
 */
const patientNameMismatch = computed(() => {
  const current = String(props.dogName || '').trim()
  if (!current || reportedPatientNames.value.length === 0) {
    return ''
  }

  // 2026-10-02 老板实测：报告写「seven」、档案里叫「Seven」也会被提醒 —— 太严了。
  // 比较前把大小写、空格、中英文标点都抹掉，只剩真正的名字差异才提醒。
  const normalize = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s·.。,，、'"“”‘’()（）\-—_]/g, '')

  const normalizedCurrent = normalize(current)
  const others = reportedPatientNames.value.filter(
    (name) => normalize(name) !== normalizedCurrent,
  )
  if (others.length === 0) {
    return ''
  }

  return `报告上写的动物名是「${others.join('」「')}」，和你正在记录的「${current}」不一样。确认没传错再保存；存不存进这份档案由你决定。`
})

/** 这一条草稿的中文类型名（一次传多类时每条前面标一下） */
function draftTypeLabel(draft: Record<string, any>) {
  return TYPE_LABELS[draftDocumentType(draft) as ExplicitDocumentType] || '资料'
}

/** 确认卡片顶部那句话：只有一类就说"识别为 X"，混着就都列出来 */
const resolvedTypeSummary = computed(() => {
  const labels = [...new Set(drafts.value.map((draft) => draftSourceLabel(draft)))]
    .filter((label) => label && label !== '资料')

  if (labels.length === 0) return ''
  return `识别为：${labels.join(' + ')}`
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

  const documentType = draftDocumentType(draft)

  if (documentType === 'VACCINE_BOOK') {
    push('疫苗', draft.vaccineName)
    push('接种日期', draft.vaccinationDate)
    push('下次到期', draft.nextDueDate)
    push('补充说明', draft.notes)
    return rows
  }

  // 这一块**必须和表单里那套字段、那套叫法一一对应**（2026-10-02 老板提的）：
  // 顾客核对时看到的，就是他接下来在表单里能改的那些 ——
  // 表单里已经删掉的字段（兽医 / 处理与提醒）不该再出现在这里，
  // 表单里叫「医生诊断」的，这里也不能写成「诊断结果」。
  if (documentType === 'CHECKUP_REPORT') {
    push('体检日期', draft.checkupDate)
    push('检查结论', draft.findings)
    push('医生建议', draft.recommendations)
    push('化验数据', draft.labValues)
    push('补充说明', draft.notes)
    return rows
  }

  if (documentType === 'MEDICAL_RECORD') {
    push('就诊日期', draft.visitDate)
    push('症状', draft.chiefComplaint)
    push('医生诊断', draft.diagnosis)
    push('医嘱（回家注意）', draft.treatment)
    push('用药', Array.isArray(draft.medications) ? draft.medications.join('、') : draft.medications)
    push('这次做的检查', draft.exams)
    push('化验数据', draft.labValues)
    push('体征', draft.vitals)
    push('补充说明', draft.notes)
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
  entryTypeMismatch.value = false
  ignoredPagesNote.value = ''

  const collectedWarnings: string[] = []
  /**
   * 按"这张图被判成什么"分组收草稿（2026-10-02 修的一个**数据丢失** bug）。
   *
   * 原来所有页的草稿都堆在一起、按多数票算成一种类型再合并成一条：
   * 顾客一次传了「化验单 ×4 + 门诊病历 ×2」，多数票算成体检 →
   * 保存时只提交体检字段，**病历里的诊断、医嘱、用药被整段丢掉**
   * （实测：面包那次的"膀胱结石、膀胱炎 + 泌尿系统处方粮"就是这么丢的）。
   * 现在按类型分组、各组各自合并 → 化验单成一条体检记录，
   * 门诊病历成一条病历记录，谁也不吃掉谁。
   */
  const draftsByType = new Map<string, Record<string, any>[]>()
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
        const type = String(res.data.documentType || '').toUpperCase()
        // NOT_MEDICAL / AUTO 都不算一种表单类型
        const imageType = type && type !== 'AUTO' && type !== 'NOT_MEDICAL'
          ? type
          : String(props.documentType || 'MEDICAL_RECORD').toUpperCase()

        if (list.length > 0) {
          // 2026-10-01：把顾客拍的这张原图挂到"这张图识别出来的草稿"上。
          // 识别结果只是从报告上抄下来的字，报告原件才是凭证（顾客要回看、医生要看原件）。
          // 后端返回的 drafts 里 attachments 是空数组，图片地址只有这里知道。
          const bucket = draftsByType.get(imageType) || []
          bucket.push(
            ...list.map((draft: Record<string, any>) => ({
              ...draft,
              attachments: [uploaded.url],
            })),
          )
          draftsByType.set(imageType, bucket)
          scannedImageCount.value += 1
        } else {
          // 这张啥也没读出来 → 传上去的图没用了，立刻删掉，别占 COS 空间
          await dropUploadedFile(uploadedUrl)
          failed += 1
        }

        if (Array.isArray(res.data.warnings)) {
          collectedWarnings.push(...res.data.warnings)
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

    const collectedCount = [...draftsByType.values()]
      .reduce((sum, list) => sum + list.length, 0)
    if (collectedCount === 0) {
      throw new Error(
        collectedWarnings[0] || '没识别到内容，请换一张更清晰的图片',
      )
    }

    if (failed > 0) {
      collectedWarnings.push(`有 ${failed} 张没能识别，可以单独再试或手工补充`)
    }

    // 类型按"多数页"定（只用于文案与兜底：真正的类型贴在每条草稿上）
    const resolvedType = resolveScannedDocumentType(
      [...draftsByType.keys()],
      props.documentType,
    ) as DocumentType

    let merged: Record<string, any>[] = []

    if (props.documentType === 'AUTO') {
      // 就诊 / 体检入口（2026-10-02 老板定稿）：**入口决定记录类型**，
      // 这一批纸合成一条记录 —— 化验页的数字进「化验数据」、影像页进「检查/附件」，
      // 不再因为"化验单被判成体检类"而凭空多出一条体检记录。
      const targetType = props.entryKind === 'checkup' ? 'CHECKUP_REPORT' : 'MEDICAL_RECORD'
      const groups = [...draftsByType.entries()].map(([type, list]) => ({ type, drafts: list }))
      const single = buildSingleScannedRecord(groups, targetType)

      if (single.draft) {
        merged = [single.draft]
      }
      entryTypeMismatch.value = Boolean(single.draft) && !single.matchedEntryType
      ignoredPagesNote.value = single.ignored.length
        ? `有 ${single.ignored.reduce((sum, item) => sum + item.count, 0)} 张看起来是` +
          `${single.ignored.some((item) => item.type === 'VACCINE_BOOK') ? '疫苗本' : ''}` +
          `${single.ignored.some((item) => item.type === 'VACCINE_BOOK') && single.ignored.some((item) => item.type === 'ALLERGY_REPORT') ? '、' : ''}` +
          `${single.ignored.some((item) => item.type === 'ALLERGY_REPORT') ? '过敏原检测报告' : ''}` +
          `，那些请到对应的板块上传`
        : ''
    } else {
      // 疫苗 / 过敏入口：保持原样 ——
      // 同类型的页合并成一条，**疫苗本不合并**（一张本子读出的是多条各自的接种记录）。
      for (const [type, list] of draftsByType.entries()) {
        const groupDrafts = type === 'VACCINE_BOOK' ? list : mergeScannedReportDrafts(list)
        for (const draft of groupDrafts) {
          merged.push({ ...draft, __documentType: type })
        }
      }
      entryTypeMismatch.value = false
      ignoredPagesNote.value = ''
    }

    drafts.value = merged
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

/* 这几行都是 <text>（inline），不加 block 会全部挤在一行里 ——
   2026-10-02 老板截图里"识别为：病历 + 体检报告本次共 8 张图片…"就是这么来的 */
.confirm__type {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #4e6b52;
}

.confirm__title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

/* 名字对不上时的提醒（只提醒不拦截）*/
.confirm__name-warning {
  margin-top: 12rpx;
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  background: #fef3f2;
  border: 1rpx solid #f5c6c2;
}

.confirm__name-warning-title {
  display: block;
  font-size: 25rpx;
  font-weight: 700;
  color: #b42318;
}

.confirm__name-warning-text {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #7a3b36;
}

.confirm__card-kind {
  display: block;
  margin-bottom: 8rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #6b7a52;
}

.confirm__card {
  margin-top: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 12rpx;
  background: rgba(255, 255, 255, 0.75);
}

/* 每条：标签独占一行（小号灰字）+ 内容另起一段（深色正文）+ 细分隔线。
   2026-10-02 老板提的：原来标签和内容是同一行紧挨着的两段文字，
   值一长就糊成一片，分不清哪个是标题、哪个是内容。 */
.confirm__row {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  padding: 16rpx 0;
  border-top: 1rpx solid #eef1e8;
}

.confirm__row:first-child {
  padding-top: 0;
  border-top: none;
}

.confirm__label {
  font-size: 22rpx;
  line-height: 1.4;
  color: #8a968a;
}

.confirm__value {
  font-size: 26rpx;
  line-height: 1.65;
  color: #26261f;
  font-weight: 500;
  /* 长文本（医嘱、化验数据）保留换行，别挤成一坨 */
  white-space: pre-wrap;
  word-break: break-all;
}

/* 类型/记录说明（"记到：就诊记录"这类） */
.confirm__note {
  margin-top: 10rpx;
  padding: 16rpx 18rpx;
  border-radius: 14rpx;
  background: #f4f7ef;
  border: 1rpx solid #dde6d4;
}

.confirm__note-text {
  display: block;
  font-size: 23rpx;
  line-height: 1.6;
  color: #4e6b52;
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
