<template>
  <!-- 新增块关闭、也没有待确认的候选时不渲染根容器 ——
       否则会留一个空壳占掉卡片间距（2026-10-03 与体重同一类问题）。 -->
  <view v-if="showAddEntry || candidates.length > 0" class="quick-add">
    <!-- 新增入口（一点即选 / 手输 / 上传报告）只在引导入口选到过敏时显示；
         候选确认卡不受影响（那是确认环节）。老板 2026-10-02：入口收敛。 -->
    <template v-if="showAddEntry">
    <view class="quick-add__header">
      <text class="quick-add__title">添加过敏原</text>
      <text class="quick-add__count">已记 {{ recordedAllergens.length }} 项</text>
    </view>

    <!-- 文案按家长视角重写（2026-10-04）：先说"确定的怎么加"，
         再说"不确定的去哪找答案"，最后才是"为什么要记"。
         从前的"点一下就记进档案，不用逐条手打"只在解释交互，
         没告诉家长"我要是不知道它过敏怎么办"。 -->
    <text class="quick-add__hint">
      已经知道的，点下面一下就记下；不确定的，翻出检测报告拍一张，我们读出来给你确认。
    </text>

    <view class="quick-add__tags">
      <text
        v-for="item in allergenTags"
        :key="item"
        class="quick-tag"
        :class="{
          'quick-tag--recorded': isRecorded(item),
          'quick-tag--busy': savingAllergen === item,
        }"
        @tap="addAllergen(item)"
      >{{ item }}{{ isRecorded(item) ? ' ✓' : '' }}</text>
    </view>

    <view class="quick-add__custom">
      <input
        class="quick-add__input"
        placeholder="其它过敏原（多个用、分隔）"
        :value="customInput"
        :disabled="isBusy"
        @input="onCustomInput"
        @confirm="commitCustomAllergens"
      />
      <text
        class="quick-add__custom-action"
        :class="{ 'quick-add__custom-action--disabled': isBusy || !customInput.trim() }"
        @tap="commitCustomAllergens"
      >添加</text>
    </view>

    <!-- 上传报告，AI 自动识别。老板批准「先只做过敏原检测报告这一个」。
         识别结果**必须顾客确认后才写入档案** —— 医疗信息不能让 AI 自己定。 -->
    <view class="quick-add__upload">
      <view class="quick-add__upload-text">
        <text class="quick-add__upload-title">有检测报告？可以拍照自动识别</text>
        <text class="quick-add__upload-desc">过敏原检测报告即可。识别结果会先让你确认，再记进档案。</text>
      </view>
      <button
        class="quick-add__upload-btn"
        :class="{ 'quick-add__upload-btn--disabled': extracting }"
        :disabled="extracting"
        @tap="pickHealthReport"
      >{{ extracting ? '识别中…' : '上传报告' }}</button>
    </view>

    </template>

    <view v-if="candidates.length > 0" class="candidate-card">
      <text class="candidate-card__title">识别到以下过敏原，请确认</text>
      <text class="candidate-card__hint">我们只是把报告里的字读出来，最终以你确认为准。</text>

      <view class="quick-add__tags">
        <text
          v-for="item in candidates"
          :key="item"
          class="quick-tag"
          :class="{
            'quick-tag--picked': pickedCandidates.includes(item),
            'quick-tag--recorded': isRecorded(item),
          }"
          @tap="toggleCandidate(item)"
        >{{ item }}</text>
      </view>

      <view v-if="warnings.length > 0" class="candidate-card__warnings">
        <text
          v-for="(warning, index) in warnings"
          :key="index"
          class="candidate-card__warning"
        >· {{ warning }}</text>
      </view>

      <!-- 报告写的是什么（2026-10-04 第二期）。
           由看得见报告的顾客来选，不让 AI 判断 ——
           知识库规则明令 AI 不得判断严重程度与过敏类型。
           选"阳性"的会被标成「确诊」，含它的食谱**彻底不进推荐**。 -->
      <view class="report-meta">
        <view class="report-meta__row">
          <text class="report-meta__label">报告上写的是</text>
          <view class="report-meta__options">
            <text
              v-for="option in REPORT_LEVEL_OPTIONS"
              :key="option.value"
              class="report-meta__option"
              :class="{ 'report-meta__option--active': reportLevel === option.value }"
              @tap="reportLevel = option.value"
            >{{ option.label }}</text>
          </view>
        </view>

        <view class="report-meta__row">
          <text class="report-meta__label">检测方式</text>
          <view class="report-meta__options">
            <text
              v-for="option in REPORT_METHOD_OPTIONS"
              :key="option.value"
              class="report-meta__option"
              :class="{ 'report-meta__option--active': reportTestMethod === option.value }"
              @tap="reportTestMethod = option.value"
            >{{ option.label }}</text>
          </view>
        </view>

        <view class="report-meta__row">
          <text class="report-meta__label">检测日期</text>
          <picker
            mode="date"
            :value="reportTestDate"
            @change="onReportDateChange"
          >
            <text class="report-meta__date">
              {{ reportTestDate || '选填，点这里选' }}
            </text>
          </picker>
        </view>

        <text class="report-meta__hint">
          报告原件会保存在下面的「检测报告与记录」里，之后随时能翻出来给医生看。
        </text>
      </view>

      <view class="candidate-card__actions">
        <button class="candidate-card__discard" :disabled="saving" @tap="discardCandidates">
          都不是
        </button>
        <button
          class="candidate-card__confirm"
          :class="{ 'candidate-card__confirm--disabled': saving || pickedCandidates.length === 0 }"
        :disabled="saving || pickedCandidates.length === 0"
          @tap="confirmCandidates"
        >{{ saving ? '记录中…' : `确认记入档案（${pickedCandidates.length}）` }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dogApi } from '../../api/dogs'
import {
  SCAN_IMAGE_SIZE_TYPE,
  confirmBlurryScanImages,
  findBlurryScanImages,
  prepareScanImages,
} from '../../utils/scan-image'

const props = defineProps<{
  /**
   * 是否显示"新增"这部分（一点即选 / 手输 / 上传报告）。
   *
   * 2026-10-02 老板要求收敛新增入口：标签页只做结果呈现与手动编辑，
   * 2026-10-03 起常开：底部「新增记录」直接调起 AI 识别，这张卡就是手填入口。
   * 识别结果的候选卡不受这个开关影响（那是确认环节，不是入口）。
   */
  showAddEntry?: boolean
  dogId: string
  /** 档案里已经记过的过敏原，用于去重与「已记」标记 */
  recordedAllergens?: string[]
}>()

const emit = defineEmits<{
  (event: 'saved', allergen: string): void
}>()

/**
 * 常见过敏原的**离线兜底**清单。
 *
 * 正常情况下标签从后端词表读（见下面 fetchedCommonAllergens）——
 * 那样营养师能在后台维护，顺序也按证据排。
 * 这一份只在接口不可用时顶上，保证顾客永远不会面对一片空白。
 *
 * 保留这几个具体的词（鸡肉 / 牛肉 / 鸡蛋 / 牛奶）是有意的：
 * 它们是顾客口语里最常用的说法，也是词表里的标准名或别名。
 */
const commonAllergens = [
  '鸡肉', '牛肉', '羊肉', '猪肉', '鸭肉', '鱼肉',
  '鸡蛋', '牛奶', '小麦', '玉米', '大豆', '虾',
]

/**
 * 从后端词表读到的标签（2026-10-04，过敏重构第一期）。
 *
 * 改造前这 12 个标签是**写死在小程序里**的，后台改不了，
 * 而且实测有 8 个匹配不到任何真实食材（"鸡肉"对不上"鸡胸"）——
 * 匹配问题已经在后端修好了，这里顺带把清单本身也交给后端，
 * 顺序按知识库 skin-005 的循证常见度排（牛肉 → 乳制品 → 小麦 → …）。
 */
const fetchedCommonAllergens = ref<string[]>([])

const allergenTags = computed(() =>
  fetchedCommonAllergens.value.length > 0
    ? fetchedCommonAllergens.value
    : commonAllergens,
)

onMounted(async () => {
  try {
    const res: any = await dogApi.commonAllergens()
    if (res?.code !== 0) return
    const list = Array.isArray(res?.data?.allergens) ? res.data.allergens : []
    const names = list
      .map((item: any) => String(item?.name || '').trim())
      .filter(Boolean)
    // 接口返回空（词表还没初始化）时保留兜底清单，不要给顾客一个空标签区
    if (names.length > 0) {
      fetchedCommonAllergens.value = names
    }
  } catch {
    // 读不到词表不是错误 —— 用兜底清单继续
  }
})

const recordedAllergens = computed(() => {
  const raw = Array.isArray(props.recordedAllergens) ? props.recordedAllergens : []
  return raw
    .map(item => String(item || '').trim())
    .filter(Boolean)
})

const savingAllergen = ref('')
const saving = ref(false)
const extracting = ref(false)
const customInput = ref('')
const candidates = ref<string[]>([])
const pickedCandidates = ref<string[]>([])
const warnings = ref<string[]>([])

/**
 * 报告上下文（2026-10-04 第二期 + 第五期）。
 *
 * 改造前这几样东西**一样都没留**：图片上传完只取 url 去识别，
 * 识别完连 url 都丢掉，记录里 attachments 填空数组 ——
 * 顾客拍的报告再也找不回来。
 *
 * 现在：上传的原图全部留住（一份报告常常不止一页），
 * 确认时落成一份 AllergyReport；识别出的检测方式 / 日期 / 各项等级
 * 作为这份报告的属性一起存下来。
 */
const reportImageUrl = ref('')
/**
 * 这份报告的**全部原图**（2026-10-04 多页支持）。
 *
 * main 在 2026-10-03 把识别扩到了 9 张，但只保留第一张当附件 ——
 * 一份三页的报告，第二三页传完就丢。这里改成全部留住。
 */
const reportImageUrls = ref<string[]>([])
const reportOcrText = ref('')
const reportTestDate = ref('')
const reportTestMethod = ref<'SERUM' | 'INTRADERMAL' | 'ELIMINATION' | 'OTHER' | 'UNKNOWN'>('UNKNOWN')

/**
 * 报告上写的结论等级，顾客选一次、整批套用。
 *
 * 为什么让顾客选、而不是让 AI 判断：
 *   COMMON_RULES 明令 AI **不得判断疾病名称、严重程度、
 *   过敏类型或是否需要治疗**。AI 只负责"把纸上的字搬进表单"。
 *   "这些是不是阳性"是报告上的事实，由看得见报告的顾客来确认。
 */
const reportLevel = ref<'POSITIVE' | 'WEAK_POSITIVE' | 'UNKNOWN'>('UNKNOWN')

/**
 * 每一项候选各自的结论等级（2026-10-04 第五期）。
 *
 * 报告上不同食物常常等级不同（鸡肉阳性、小麦弱阳性），
 * AI 读出来就存在这里；整批等级一致时选择器会预选上，
 * 顾客改过之后以顾客的选择为准 —— 他手上拿着报告，比 AI 更可信。
 */
const candidateLevels = ref<Record<string, string>>({})

const REPORT_LEVEL_VALUES = ['POSITIVE', 'WEAK_POSITIVE', 'UNKNOWN']

/** 把接口返回的检测方式收敛到选择器支持的三个值 */
function normalizeTestMethod(value: unknown): 'SERUM' | 'INTRADERMAL' | 'UNKNOWN' {
  const key = String(value || '').trim().toUpperCase()
  if (key === 'SERUM' || key === 'INTRADERMAL') return key
  return 'UNKNOWN'
}

const REPORT_LEVEL_OPTIONS = [
  { value: 'POSITIVE', label: '都是阳性' },
  { value: 'WEAK_POSITIVE', label: '弱阳性 / 疑似' },
  { value: 'UNKNOWN', label: '报告没写 / 看不清' },
] as const

const REPORT_METHOD_OPTIONS = [
  { value: 'SERUM', label: '血清检测' },
  { value: 'INTRADERMAL', label: '皮内试验' },
  { value: 'UNKNOWN', label: '没写 / 不清楚' },
] as const
const isBusy = computed(() => Boolean(savingAllergen.value) || saving.value || extracting.value)

function isRecorded(allergen: string) {
  return recordedAllergens.value.includes(allergen)
}

function onCustomInput(event: any) {
  customInput.value = String(event?.detail?.value ?? '')
}

function splitAllergenText(raw: string) {
  return raw
    .split(/[,，、;；\n\r]/)
    .map(item => item.trim())
    .filter(Boolean)
}

async function createAllergyRecord(allergen: string, attachmentUrl = '') {
  const res: any = await dogApi.healthRecords.allergy.create(props.dogId, {
    allergen,
    notes: null,
    // 2026-10-01：从检测报告点选来的过敏原，把报告原图一并留档 ——
    // 识别只是抄字，报告原件才是凭证（顾客要回看、医生要看原件）。
    attachments: attachmentUrl ? [attachmentUrl] : [],
  })

  if (res?.code !== 0) {
    throw new Error(res?.message || `「${allergen}」记录失败`)
  }
}

/**
 * 一点即选：直接写一条过敏记录。
 *
 * 与建档时期的做法不同 —— 那时先攒在表单里、随建档一起提交；
 * 现在顾客在「健康管理」里是随时可来随时可走的，所以点了就落库，
 * 立刻在上面的过敏记录列表里看到，不会因为中途离开而丢。
 */
async function addAllergen(allergen: string) {
  if (isBusy.value) return

  if (isRecorded(allergen)) {
    uni.showToast({ title: '档案里已经有这一条了', icon: 'none' })
    return
  }

  savingAllergen.value = allergen
  try {
    await createAllergyRecord(allergen)
    uni.showToast({ title: `已记下「${allergen}」`, icon: 'none' })
    emit('saved', allergen)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '记录失败，请重试', icon: 'none' })
  } finally {
    savingAllergen.value = ''
  }
}

/** 顾客手打的其它过敏原（逗号/顿号分隔），逐条落库 */
async function commitCustomAllergens() {
  if (isBusy.value) return

  const items = splitAllergenText(customInput.value)
  if (items.length === 0) {
    return
  }

  saving.value = true
  const failed: string[] = []
  let created = 0

  try {
    for (const allergen of items) {
      // 档案里已有的直接跳过，不制造重复记录
      if (isRecorded(allergen)) continue
      try {
        await createAllergyRecord(allergen)
        created += 1
        emit('saved', allergen)
      } catch {
        failed.push(allergen)
      }
    }
  } finally {
    saving.value = false
  }

  // 部分失败时把失败的留在输入框里，顾客不用重新打一遍
  customInput.value = failed.join('、')

  if (failed.length > 0) {
    uni.showToast({ title: `${failed.join('、')} 记录失败，请重试`, icon: 'none' })
    return
  }

  uni.showToast({
    title: created > 0 ? '已记入档案' : '这些档案里都已经有了',
    icon: 'none',
  })
}

function toggleCandidate(allergen: string) {
  if (isRecorded(allergen)) return

  if (pickedCandidates.value.includes(allergen)) {
    pickedCandidates.value = pickedCandidates.value.filter(item => item !== allergen)
    return
  }

  pickedCandidates.value = [...pickedCandidates.value, allergen]
}

function resetReportState() {
  candidates.value = []
  pickedCandidates.value = []
  warnings.value = []
  candidateLevels.value = {}
  // 报告上下文一并清掉（原件地址留着会误挂到下一批候选上）
  reportImageUrl.value = ''
  reportImageUrls.value = []
  reportOcrText.value = ''
  reportTestDate.value = ''
  reportTestMethod.value = 'UNKNOWN'
  reportLevel.value = 'UNKNOWN'
}

function discardCandidates() {
  resetReportState()
}

function onReportDateChange(event: any) {
  reportTestDate.value = String(event?.detail?.value || '')
}

/**
 * 上传检测报告并让 AI 提取过敏原。
 *
 * 三步：选图 → 上传到 COS → 调识别接口。
 * 任何一步失败都**降级为手工填写**：只提示，不阻断顾客做别的事。
 * 识别结果只放进"候选"区，顾客确认后才落库 —— AI 不得直接写进档案。
 */
async function pickHealthReport() {
  if (extracting.value) return

  // 2026-10-03：一次可选多张（一份报告常常不止一页）。
  // 每页各自识别，过敏原**并起来去重**给顾客确认；页面报错互不牵连。
  let filePaths: string[] = []
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 9,
        // 拿原图：识别准不准取决于给模型多少像素（见 utils/scan-image.ts）
        sizeType: SCAN_IMAGE_SIZE_TYPE,
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject,
      })
    })
    filePaths = (Array.isArray(chosen?.tempFilePaths) ? chosen.tempFilePaths : []).filter(Boolean)
  } catch {
    // 顾客取消选图：静默返回，不算失败
    return
  }

  if (filePaths.length === 0) return

  // 原图太大，先压到"识别用"的尺寸再上传（2026-10-03）
  uni.showLoading({ title: '处理中…', mask: true })
  try {
    filePaths = await prepareScanImages(filePaths)
  } finally {
    uni.hideLoading()
  }
  if (filePaths.length === 0) return

  // 图太小就先拦一下：图糊的时候模型会编一个"看起来合理"的数字（见 utils/scan-image.ts）
  const blurry = await findBlurryScanImages(filePaths)
  if (blurry.length > 0) {
    const goOn = await confirmBlurryScanImages(blurry)
    if (!goOn) return
  }

  extracting.value = true
  uni.showLoading({ title: '识别中…' })

  try {
    const collected: string[] = []
    const collectedWarnings: string[] = []
    // 2026-10-04：跨页合并的额外信息 —— 等级 / 检测方式 / 日期 / 识别原文
    const collectedLevels: Record<string, string> = {}
    const collectedOcr: string[] = []
    const collectedImageUrls: string[] = []
    let collectedMethod: 'SERUM' | 'INTRADERMAL' | 'ELIMINATION' | 'OTHER' | 'UNKNOWN' = 'UNKNOWN'
    let collectedTestDate = ''

    for (const [position, filePath] of filePaths.entries()) {
      if (filePaths.length > 1) {
        uni.showLoading({ title: `识别中 ${position + 1}/${filePaths.length}…`, mask: true })
      }

      const uploaded = await dogApi.uploadHealthAttachment('allergy', filePath)
      const imageUrl = String(uploaded?.url || '').trim()
      if (!imageUrl) {
        throw new Error('上传失败，请重试')
      }

      // 每一页原图都留住（一份报告常常不止一页）。
      // main 在 2026-10-03 扩到 9 张时只保留了第一张当附件，
      // 第二页之后传完就丢 —— 这里改成全部留下。
      collectedImageUrls.push(imageUrl)
      if (position === 0) {
        reportImageUrl.value = imageUrl
      }

      const res: any = await dogApi.extractHealthReport({ imageUrl })
      const data = res?.data || {}

      // 优先用 drafts（带每项结论等级）；退回旧的 allergies 数组。
      // 提示词换了不代表模型一定照做，两条路都得接住 —— 丢数据的代价太大。
      const drafts = Array.isArray(data.drafts) ? data.drafts : []
      const fromDrafts = drafts
        .map((item: any) => ({
          allergen: String(item?.allergen || '').trim(),
          level: String(item?.level || '').toUpperCase(),
        }))
        .filter((item: any) => Boolean(item.allergen))

      if (fromDrafts.length > 0) {
        for (const item of fromDrafts) {
          collected.push(item.allergen)
          // 跨页同名时保留"更明确"的那个等级（UNKNOWN 不覆盖已知等级）
          const existing = collectedLevels[item.allergen]
          if (!existing || (existing === 'UNKNOWN' && item.level !== 'UNKNOWN')) {
            collectedLevels[item.allergen] = item.level
          }
        }
      } else if (Array.isArray(data.allergies)) {
        collected.push(
          ...data.allergies.filter((item: unknown) => typeof item === 'string' && item.trim()),
        )
      }

      if (Array.isArray(data.warnings)) {
        collectedWarnings.push(...data.warnings)
      }

      // 检测方式 / 日期：照抄报告上写的，取第一个"读出来的"值
      const meta = data.reportMeta || {}
      const method = normalizeTestMethod(meta.testMethod)
      if (collectedMethod === 'UNKNOWN' && method !== 'UNKNOWN') {
        collectedMethod = method
      }
      const detectedDate = String(meta.testDate || '').trim()
      if (!collectedTestDate && /^\d{4}-\d{2}-\d{2}$/.test(detectedDate)) {
        collectedTestDate = detectedDate
      }

      const ocrText = String(data.ocrText || '').trim()
      if (ocrText) {
        collectedOcr.push(ocrText)
      }
    }

    // 把跨页收集到的东西写回报告上下文
    reportImageUrls.value = collectedImageUrls
    reportTestMethod.value = collectedMethod
    reportTestDate.value = collectedTestDate
    reportOcrText.value = collectedOcr.join('\n\n').slice(0, 20000)

    candidates.value = Array.from(new Set(collected.map((item) => String(item).trim()))).filter(Boolean)
    warnings.value = Array.from(new Set(collectedWarnings))
    candidateLevels.value = collectedLevels

    // 整批等级一致时把选择器预选上，顾客少点一次；
    // 等级不齐就留 UNKNOWN，让顾客对着报告自己选 —— 不替他猜。
    const levels = Array.from(
      new Set(candidates.value.map((name) => collectedLevels[name] || 'UNKNOWN')),
    )
    reportLevel.value =
      levels.length === 1 && REPORT_LEVEL_VALUES.includes(levels[0])
        ? (levels[0] as typeof reportLevel.value)
        : 'UNKNOWN'

    // 候选一律先不选中，逐项由顾客点
    pickedCandidates.value = []

    uni.hideLoading()

    if (candidates.value.length === 0) {
      // 没读出过敏原：明确告知 + 引导手工填写，而不是静默无反应
      uni.showToast({
        title: '没识别到过敏原，请用上面的选项手工补充',
        icon: 'none',
        duration: 3000,
      })
      return
    }

    uni.showToast({ title: '识别完成，请确认', icon: 'none' })
  } catch (error: any) {
    uni.hideLoading()
    // 降级为手工填写：识别不可用不能挡住顾客维护健康记录
    uni.showToast({
      title: error?.message || '识别失败，请改用上面的选项手工填写',
      icon: 'none',
      duration: 3000,
    })
  } finally {
    extracting.value = false
  }
}

/**
 * 顾客确认后的候选过敏原落库（2026-10-04 第二期改造）。
 *
 * ── 改造前 ──────────────────────────────────────────────────
 *   逐条调 `allergy.create`，而且 `attachments: []` ——
 *   顾客刚上传的那张报告照片**传完就被丢掉了**，
 *   之后再也没法回看。识别报告这件事等于"读完就扔"。
 *
 * ── 现在 ────────────────────────────────────────────────────
 *   改成建一份**检测报告**：原件挂在报告上，
 *   识别出的过敏原作为这份报告的结论（带上顾客选的阳性等级）。
 *   这样"记录过敏检查报告"才真的成立 —— 报告留得住、查得到。
 *
 * 任一步失败都退回逐条落库，**不让顾客白拍一张照**。
 */
async function confirmCandidates() {
  if (saving.value || pickedCandidates.value.length === 0) return

  const targets = pickedCandidates.value.filter(item => !isRecorded(item))
  if (targets.length === 0) {
    resetReportState()
    uni.showToast({ title: '这些档案里都已经有了', icon: 'none' })
    return
  }

  saving.value = true
  let savedAsReport = false
  // 原图在 resetReportState() 里会被清掉，先取出来 —— 报告实体要用全部页面
  const sourceImageUrls = [...reportImageUrls.value]

  try {
    // 有原件才建报告；没有原件（理论上不会）就走下面的逐条兜底
    if (reportImageUrl.value) {
      try {
        const res: any = await dogApi.allergyReports.create(props.dogId, {
          testDate: reportTestDate.value || null,
          testMethod: reportTestMethod.value,
          // 一份报告常常不止一页，**全部原图**都留住
          attachments: sourceImageUrls.length > 0 ? sourceImageUrls : undefined,
          ocrText: reportOcrText.value || null,
          results: targets.map(allergen => ({
            allergen,
            // 顾客在确认卡片上选的等级优先；
            // 他没改的话用 AI 从报告里读出来的那一项
            level: reportLevel.value !== 'UNKNOWN'
              ? reportLevel.value
              : (candidateLevels.value[allergen] || 'UNKNOWN'),
          })),
        })
        if (res?.code === 0) {
          savedAsReport = true
          targets.forEach(allergen => emit('saved', allergen))
        }
      } catch {
        savedAsReport = false
      }
    }

    if (!savedAsReport) {
      // 兜底：报告没存成也要把过敏原记下来，不能让顾客白忙一场
      const failed: string[] = []
      for (const allergen of targets) {
        try {
          await createAllergyRecord(allergen)
          emit('saved', allergen)
        } catch {
          failed.push(allergen)
        }
      }
      if (failed.length > 0) {
        saving.value = false
        pickedCandidates.value = failed
        uni.showToast({ title: `${failed.join('、')} 记录失败，请重试`, icon: 'none' })
        return
      }
    }
  } finally {
    saving.value = false
  }

  const isPositive = reportLevel.value === 'POSITIVE'
  resetReportState()
  uni.showToast({
    title: isPositive
      ? '已记为「确诊」，食谱会彻底避开'
      : '已记入档案，可在上面改成「确诊」',
    icon: 'none',
    duration: 2500,
  })
}
/**
 * 对外入口（2026-10-02 引导流程要用）：直接调起"上传检测报告 + AI 识别"，
 * 底部「新增记录」在过敏标签下会直接调起它，不用顾客自己找按钮。
 */
defineExpose({ pickHealthReport })

</script>

<style scoped>
.quick-add {
  margin-top: 24rpx;
  padding: 26rpx;
  border-radius: 24rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.quick-add__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.quick-add__title {
  font-size: 28rpx;
  font-weight: 700;
  color: #26261f;
}

.quick-add__count {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #968f6d;
}

.quick-add__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #6b6653;
}

.quick-add__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 18rpx;
}

.quick-tag {
  padding: 14rpx 28rpx;
  font-size: 26rpx;
  color: #4a4638;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.quick-tag--picked {
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-color: #d8bc85;
}

/* 已经记过的过敏原：不再可点，弱化显示并给出勾（勾写在模板里 —— 小程序 text 不认伪元素） */
.quick-tag--recorded {
  color: #968f6d;
  background: #eef2e4;
  border-color: #dde3cd;
  text-decoration: line-through;
}

.quick-tag--busy {
  opacity: 0.55;
}

.quick-add__custom {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 20rpx;
}

.quick-add__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 76rpx;
  padding: 0 24rpx;
  font-size: 26rpx;
  color: #26261f;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 18rpx;
}

.quick-add__custom-action {
  flex: 0 0 auto;
  font-size: 26rpx;
  font-weight: 600;
  color: #b08d4f;
}

.quick-add__custom-action--disabled {
  color: #c9c3ad;
}

.quick-add__upload {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #fbfcf7;
  border: 1rpx dashed #cddbbe;
  border-radius: 18rpx;
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.quick-add__upload-title {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.quick-add__upload-desc {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

.quick-add__upload-btn {
  height: 76rpx;
  line-height: 76rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #f6efe0;
  background: var(--health-accent, #1e3a2f);
  border-radius: 999rpx;
}

.quick-add__upload-btn::after {
  border: none;
}

.quick-add__upload-btn--disabled {
  opacity: 0.6;
}

.candidate-card {
  margin-top: 24rpx;
  padding: 24rpx;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
  border-radius: 18rpx;
}

.candidate-card__title {
  display: block;
  font-size: 27rpx;
  font-weight: 600;
  color: #26261f;
}

.candidate-card__hint {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

.candidate-card__warnings {
  margin-top: 16rpx;
}

/* 报告写的是什么（2026-10-04 第二期） */
.report-meta {
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 2rpx dashed #e3e6d4;
}

.report-meta__row {
  margin-bottom: 18rpx;
}

.report-meta__label {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  margin-bottom: 12rpx;
}

.report-meta__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.report-meta__option {
  font-size: 24rpx;
  padding: 10rpx 24rpx;
  border-radius: 999rpx;
  color: #6b6653;
  background: #f4f6f2;
  border: 2rpx solid #e3e6d4;
}

.report-meta__option--active {
  color: #ffffff;
  background: #ad5b2a;
  border-color: #ad5b2a;
}

.report-meta__date {
  font-size: 26rpx;
  color: #26261f;
  padding: 12rpx 24rpx;
  border-radius: 12rpx;
  background: #f4f6f2;
  display: inline-block;
}

.report-meta__hint {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.6;
}

.candidate-card__warning {
  display: block;
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

.candidate-card__actions {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 24rpx;
}

.candidate-card__discard {
  flex: 0 0 auto;
  margin: 0;
  padding: 0 32rpx;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 26rpx;
  color: #6b6653;
  background: #fbfcf7;
  border: 1rpx solid #e3e6d4;
  border-radius: 999rpx;
}

.candidate-card__discard::after {
  border: none;
}

.candidate-card__confirm {
  flex: 1 1 auto;
  margin: 0;
  height: 76rpx;
  line-height: 76rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #f6efe0;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
  border-radius: 999rpx;
}

.candidate-card__confirm::after {
  border: none;
}

.candidate-card__confirm--disabled {
  opacity: 0.5;
}
</style>
