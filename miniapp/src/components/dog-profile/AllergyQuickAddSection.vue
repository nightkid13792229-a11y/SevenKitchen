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
        v-for="item in commonAllergens"
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
import { computed, ref } from 'vue'
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
 * 常见过敏原：做成一点即选，避免顾客手打。
 *
 * 生产数据显示，让顾客"自由填写"的过敏记录只有 24 只狗填过（0.5%），
 * 而常见过敏原高度集中，标签化能显著降低填写成本。
 */
const commonAllergens = [
  '鸡肉', '牛肉', '羊肉', '猪肉', '鸭肉', '鱼肉',
  '鸡蛋', '牛奶', '小麦', '玉米', '大豆', '虾',
]

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
/** 本次识别用的报告原图（点选出来的过敏原落库时一起存成附件） */
const reportImageUrl = ref('')
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
  reportImageUrl.value = ''
}

function discardCandidates() {
  resetReportState()
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

    for (const [position, filePath] of filePaths.entries()) {
      if (filePaths.length > 1) {
        uni.showLoading({ title: `识别中 ${position + 1}/${filePaths.length}…`, mask: true })
      }

      const uploaded = await dogApi.uploadHealthAttachment('allergy', filePath)
      const imageUrl = String(uploaded?.url || '').trim()
      if (!imageUrl) {
        throw new Error('上传失败，请重试')
      }
      // 保留第一张作为"这份报告"的代表图（确认卡片上显示它）
      if (position === 0) {
        reportImageUrl.value = imageUrl
      }

      const res: any = await dogApi.extractHealthReport({ imageUrl })
      const data = res?.data || {}

      if (Array.isArray(data.allergies)) {
        collected.push(
          ...data.allergies.filter((item: unknown) => typeof item === 'string' && item.trim()),
        )
      }
      if (Array.isArray(data.warnings)) {
        collectedWarnings.push(...data.warnings)
      }
    }

    candidates.value = Array.from(new Set(collected.map((item) => String(item).trim()))).filter(Boolean)
    warnings.value = Array.from(new Set(collectedWarnings))
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

/** 顾客确认后的候选过敏原逐条落库 */
async function confirmCandidates() {
  if (saving.value || pickedCandidates.value.length === 0) return

  const targets = pickedCandidates.value.filter(item => !isRecorded(item))
  if (targets.length === 0) {
    resetReportState()
    uni.showToast({ title: '这些档案里都已经有了', icon: 'none' })
    return
  }

  saving.value = true
  const failed: string[] = []
  // 报告原图在 resetReportState() 里会被清掉，先取出来，循环里每条都用它当附件
  const sourceImageUrl = reportImageUrl.value

  try {
    for (const allergen of targets) {
      try {
        await createAllergyRecord(allergen, sourceImageUrl)
        emit('saved', allergen)
      } catch {
        failed.push(allergen)
      }
    }
  } finally {
    saving.value = false
  }

  if (failed.length > 0) {
    pickedCandidates.value = failed
    uni.showToast({ title: `${failed.join('、')} 记录失败，请重试`, icon: 'none' })
    return
  }

  resetReportState()
  uni.showToast({ title: '已记入档案', icon: 'none' })
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
