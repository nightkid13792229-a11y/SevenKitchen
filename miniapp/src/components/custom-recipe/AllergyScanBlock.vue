<template>
  <!-- 过敏原检测报告 → AI 读出过敏原（2026-10-04 从健康管理搬来）。
       老板："将过敏源的记录放到定制食谱流程中。"

       为什么留一个"确认"步骤：AI 只负责把报告上的字读出来，
       记不记、记哪几项由家长定 —— 医疗信息不能让 AI 自己定（决策 5/9）。 -->
  <view class="allergy-scan">
    <!-- 2026-10-05 老板要求：删掉按钮上方的标题与说明（含"拍一下自动读"），
         并把按钮文案改成「上传过敏检测报告」；同时**只支持从相册选照片**，
         不调相机、也不弹"拍照/相册"选择器。
         同日再要求：这个按钮**改小** —— 它原先是占满一整行的大按钮，
         在一张表单里比"确认定制"还显眼；现在收成一个小圆角按钮靠左放。 -->
    <view class="allergy-scan__head">
      <button
        class="allergy-scan__button"
        :disabled="extracting"
        @tap="pickReport"
      >{{ extracting ? '识别中…' : '上传过敏检测报告' }}</button>
      <!-- 一键清空这一单的过敏原（2026-10-05 老板要求）：
           报告常常一次读出二三十项，想重来一遍时不该让家长逐个点掉。
           清的是**这一单的选择**，档案里的记录不动（后端也是只增不删）。 -->
      <text
        v-if="showClearAll"
        class="allergy-scan__clear"
        @tap="requestClearAll"
      >一键清除所有过敏原</text>
    </view>

    <!-- 候选确认卡（2026-10-05 改口径）：
         · 只列**食物类**过敏原 —— 报告里常同时有环境组（尘螨/花粉/霉菌），
           食谱只关心吃进去的东西（老板第 5 条）
         · 读到的食物过敏原**默认全部记上**（老板第 5 条选定）：
           原先一个都不勾，「加入这一单」是灰的，家长以为坏了；
           现在读完就是"已默认记上，不对的点掉"
         · 每项后面带上报告写的结论（阳性/弱阳性/…），报告上写的
           "阴性/阳性"不再被丢掉（老板第 4 条） -->
    <view v-if="foodCandidates.length > 0" class="allergy-scan__candidates">
      <text class="allergy-scan__candidates-title">读到这些食物过敏原，已默认记上，不对的点掉：</text>
      <view class="allergy-scan__tags">
        <text
          v-for="item in foodCandidates"
          :key="item.name"
          class="allergy-scan__tag"
          :class="{ 'allergy-scan__tag--picked': isPicked(item.name) }"
          @tap="toggle(item.name)"
        >{{ candidateLabel(item) }}</text>
      </view>

      <text v-if="skipped.length > 0" class="allergy-scan__skipped">
        · 报告里还有 {{ skipped.length }} 项环境类（{{ skippedNames }}），
        与吃的东西无关，没有记进过敏信息。
      </text>

      <text
        v-for="(warning, index) in warnings"
        :key="`w-${index}`"
        class="allergy-scan__warning"
      >· {{ warning }}</text>

      <!-- 按钮文案（2026-10-05 老板要求）：确认 / 取消 -->
      <view class="allergy-scan__actions">
        <text class="allergy-scan__discard" @tap="discard">取消</text>
        <text
          class="allergy-scan__confirm"
          :class="{ 'allergy-scan__confirm--disabled': picked.length === 0 }"
          @tap="confirm"
        >确认</text>
      </view>
    </view>

    <!-- 整份报告只读到环境类：也要说一句，否则家长以为识别失败了 -->
    <view v-else-if="skipped.length > 0" class="allergy-scan__candidates">
      <text class="allergy-scan__candidates-title">
        报告里读到的是环境类过敏原（{{ skippedNames }}），与吃的东西无关；
        食物过敏原可以在上面手工添加。
      </text>
      <view class="allergy-scan__actions">
        <text class="allergy-scan__discard" @tap="discard">取消</text>
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
import {
  candidateLabel,
  isFoodCandidate,
  mergeAllergyCandidates,
  normalizeGroup,
  normalizeLevel,
  type ScannedAllergen,
  type ScannedAllergenPage,
} from '../../utils/allergy-candidates'

/**
 * 扫一份过敏原检测报告，把读到的过敏原名字交给父页面。
 *
 * 两件事一起做：
 *   ① 把名字 emit 给父页面（进这一单的过敏信息）
 *   ② 把**报告原件**存成一份检测报告实体，家长以后翻得出来
 *      （旧版"读完就把照片丢了"，等于白拍一张）
 *
 * 报告实体存到狗狗档案下 —— 这是家长刚刚亲手拍、亲手确认的，
 * 属于他自己的操作，不受"下单是否写回档案"那个开关影响。
 */
const props = defineProps<{
  dogId: string
  /** 现在这一单有没有过敏原 —— 没有就不显示"一键清除"（清空按钮点了也没意义） */
  hasAllergens?: boolean
}>()

const emit = defineEmits<{
  (event: 'scanned', value: { allergens: string[] }): void
  /** 一键清除这一单的过敏原（由父页面清，它才是过敏原的主人） */
  (event: 'clearAll'): void
}>()

const showClearAll = computed(() => props.hasAllergens === true)

/** 清空是不可撤销的批量动作：先问一句再清 */
function requestClearAll() {
  uni.showModal({
    title: '清除所有过敏原？',
    content: '会清空这一单里已经选好的过敏原（档案里的记录不受影响）。',
    confirmText: '清除',
    success: (res) => {
      if (res.confirm) emit('clearAll')
    },
  })
}

const extracting = ref(false)
const candidates = ref<ScannedAllergen[]>([])
const picked = ref<string[]>([])
const warnings = ref<string[]>([])
/** 这一份报告的原始图片地址（可能多页），确认时一起存进报告 */
const imageUrls = ref<string[]>([])
const testDate = ref('')
const method = ref<'SERUM' | 'INTRADERMAL' | 'ELIMINATION' | 'OTHER' | 'UNKNOWN'>('UNKNOWN')
const ocrText = ref('')

/** 只列食物类（环境类与阴性项挡在外面）—— 规则在 utils/allergy-candidates.ts 里 */
const foodCandidates = computed(() => candidates.value.filter(isFoodCandidate))

/** 报告里的环境类：告诉家长"读到了但这些不影响食谱"，而不是默默吞掉 */
const skipped = computed(() =>
  candidates.value.filter((item) => !isFoodCandidate(item)),
)

const skippedNames = computed(() =>
  skipped.value
    .slice(0, 3)
    .map((item) => item.name)
    .join('、'),
)

const isPicked = (name: string) => picked.value.includes(name)

function normalizeMethod(value: unknown): typeof method.value {
  const text = String(value || '').toUpperCase()
  return (['SERUM', 'INTRADERMAL', 'ELIMINATION', 'OTHER'] as const).includes(text as any)
    ? (text as typeof method.value)
    : 'UNKNOWN'
}

async function pickReport() {
  if (extracting.value) return

  let filePaths: string[] = []
  try {
    const chosen: any = await new Promise((resolve, reject) => {
      uni.chooseImage({
        count: 9,
        // 拿原图：识别准不准取决于给模型多少像素（见 utils/scan-image.ts）
        sizeType: SCAN_IMAGE_SIZE_TYPE,
        /**
         * 只从相册选（2026-10-05 老板要求）。
         * 只给一个来源时微信不再弹"拍照 / 从相册选择"的选择器，
         * 直接进相册 —— 顾客不用多答一道选择题。
         */
        sourceType: ['album'],
        success: resolve,
        fail: reject,
      })
    })
    filePaths = (Array.isArray(chosen?.tempFilePaths) ? chosen.tempFilePaths : []).filter(Boolean)
  } catch {
    // 家长取消选图：静默返回，不算失败
    return
  }

  if (filePaths.length === 0) return

  uni.showLoading({ title: '处理中…', mask: true })
  try {
    filePaths = await prepareScanImages(filePaths)
  } finally {
    uni.hideLoading()
  }
  if (filePaths.length === 0) return

  // 图太小就先问一句：图糊的时候模型会编一个"看起来合理"的数值／名字
  const blurry = await findBlurryScanImages(filePaths)
  if (blurry.length > 0) {
    const goOn = await confirmBlurryScanImages(blurry)
    if (!goOn) return
  }

  extracting.value = true
  uni.showLoading({ title: '识别中…', mask: true })

  try {
    const collectedWarnings: string[] = []
    const urls: string[] = []
    /** 每一页的结果分开留：合并时要知道哪一页有判定区（见 allergy-candidates.ts） */
    const pages: ScannedAllergenPage[] = []
    let detectedDate = ''
    let detectedMethod: typeof method.value = 'UNKNOWN'
    const texts: string[] = []

    for (const [position, filePath] of filePaths.entries()) {
      if (filePaths.length > 1) {
        uni.showLoading({ title: `识别中 ${position + 1}/${filePaths.length}…`, mask: true })
      }

      const uploaded = await dogApi.uploadHealthAttachment('allergy', filePath)
      const imageUrl = String(uploaded?.url || '').trim()
      if (!imageUrl) {
        throw new Error('上传失败，请重试')
      }
      urls.push(imageUrl)

      const res: any = await dogApi.extractHealthReport({ imageUrl })
      const data = res?.data || {}

      // 优先用 drafts（带每项结论等级与分组），退回旧的 allergies 数组 ——
      // 提示词换了不代表模型一定照做，两条路都得接住
      const drafts = Array.isArray(data.drafts) ? data.drafts : []
      const pageItems: ScannedAllergen[] = drafts
        .map((item: any) => ({
          name: String(item?.allergen || '').trim(),
          level: normalizeLevel(item?.level),
          group: normalizeGroup(item?.group),
        }))
        .filter((item: ScannedAllergen) => item.name)

      if (pageItems.length === 0 && Array.isArray(data.allergies)) {
        pageItems.push(
          ...data.allergies
            .filter((item: unknown) => typeof item === 'string' && item.trim())
            .map((item: string) => ({ name: item.trim(), level: 'UNKNOWN', group: 'UNKNOWN' })),
        )
      }

      const meta = data.reportMeta || {}
      // 这一页有没有判定区：合并时判定页的等级说了算（见 allergy-candidates.ts）
      pages.push({ items: pageItems, hasVerdict: meta.hasVerdict === true })

      if (Array.isArray(data.warnings)) {
        collectedWarnings.push(...data.warnings.map((item: unknown) => String(item || '').trim()))
      }

      const pageMethod = normalizeMethod(meta.testMethod)
      if (detectedMethod === 'UNKNOWN' && pageMethod !== 'UNKNOWN') {
        detectedMethod = pageMethod
      }
      const pageDate = String(meta.testDate || '').trim()
      if (!detectedDate && /^\d{4}-\d{2}-\d{2}$/.test(pageDate)) {
        detectedDate = pageDate
      }
      const text = String(data.ocrText || '').trim()
      if (text) texts.push(text)
    }

    imageUrls.value = urls
    testDate.value = detectedDate
    method.value = detectedMethod
    ocrText.value = texts.join('\n\n').slice(0, 20000)
    candidates.value = mergeAllergyCandidates(pages)
    warnings.value = Array.from(new Set(collectedWarnings.filter(Boolean)))
    // 读到的食物过敏原**默认全部记上**（老板 2026-10-05 选定）：
    // 原先一个都不勾，家长看到「加入这一单（0）」是灰的，以为识别坏了
    picked.value = foodCandidates.value.map((item) => item.name)

    uni.hideLoading()

    if (foodCandidates.value.length === 0) {
      uni.showToast({
        title:
          skipped.value.length > 0
            ? '报告里只有环境类过敏原，请手工添加食物过敏原'
            : '没识别到过敏原，请在下面手工添加',
        icon: 'none',
        duration: 3000,
      })
      return
    }

    uni.showToast({ title: '识别完成，请确认', icon: 'none' })
  } catch (error: any) {
    uni.hideLoading()
    // 降级为手工填写：识别不可用不能挡住家长下单
    uni.showToast({
      title: error?.message || '识别失败，请手工添加过敏原',
      icon: 'none',
      duration: 3000,
    })
  } finally {
    extracting.value = false
  }
}

function toggle(name: string) {
  const index = picked.value.indexOf(name)
  if (index >= 0) {
    picked.value.splice(index, 1)
    return
  }
  picked.value.push(name)
}

function discard() {
  candidates.value = []
  picked.value = []
  warnings.value = []
}

async function confirm() {
  if (picked.value.length === 0) return

  // 选中的这一批（带报告写的结论等级）
  const chosen = foodCandidates.value.filter((item) => isPicked(item.name))

  // ① 报告原件存成一份检测报告实体（家长以后翻得出来）
  if (props.dogId && imageUrls.value.length > 0) {
    try {
      await dogApi.allergyReports.create(props.dogId, {
        testDate: testDate.value || null,
        testMethod: method.value,
        attachments: imageUrls.value,
        ocrText: ocrText.value || null,
        /**
         * level 必须**照抄报告上写的**（2026-10-05 修复）。
         *
         * 老版本这里写死 'UNKNOWN'，后果不是"少一个标签"：
         * 后端按 level 定可信度 —— 阳性 → 确诊（食谱彻底避开）、
         * 其余 → 可疑。写死 UNKNOWN 等于把报告上写着"阳性"的确诊过敏
         * 一律降级成"可疑"，食谱就不会严格避开它。老板第 4 条问的正是这个。
         */
        results: chosen.map((item) => ({ allergen: item.name, level: item.level })),
        // 环境项写进报告摘要：原件里有，但不记成"过敏"
        summary: skipped.value.length
          ? `报告另有环境类过敏原 ${skipped.value.length} 项（${skippedNames.value}），与食谱无关，未记入过敏信息。`
          : null,
      })
    } catch {
      // 报告存不下不影响这一单 —— 名字照样加进过敏信息
    }
  }

  // ② 名字交给父页面（进这一单的过敏信息）
  emit('scanned', { allergens: [...picked.value] })
  discard()
}
</script>

<style scoped lang="scss">
.allergy-scan {
  margin-top: 16rpx;
  padding: 22rpx;
  border-radius: 18rpx;
  background: #f7f4ef;
  border: 1rpx solid rgba(120, 90, 50, 0.1);
}

.allergy-scan__head {
  display: flex;
  /* 上传按钮靠左，右边跟"一键清除"（老板 2026-10-05 要求改小） */
  align-items: center;
  gap: 16rpx;
}

.allergy-scan__candidates-title {
  display: block;
  font-size: 24rpx;
  color: #5b4a33;
}

.allergy-scan__button {
  /* 小按钮（2026-10-05 老板要求改小）：不再占满整行，跟着文字宽度走 */
  display: inline-block;
  margin: 0;
  padding: 0 24rpx;
  height: 60rpx;
  line-height: 60rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #fff;
  background: #8a6b3f;
}

.allergy-scan__button::after {
  border: none;
}

/* 一键清除：跟上传按钮同一行的次要动作，做成小文字链 */
.allergy-scan__clear {
  flex: 0 0 auto;
  padding: 0 20rpx;
  height: 60rpx;
  line-height: 60rpx;
  font-size: 23rpx;
  color: #a8622a;
  border: 1rpx solid rgba(168, 98, 42, 0.45);
  border-radius: 999rpx;
}

.allergy-scan__skipped {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a7a63;
}

.allergy-scan__candidates {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed rgba(120, 90, 50, 0.2);
}

.allergy-scan__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.allergy-scan__tag {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: #5b4a33;
  background: #fff;
  border: 1rpx solid rgba(120, 90, 50, 0.2);
}

.allergy-scan__tag--picked {
  color: #fff;
  background: #8a6b3f;
  border-color: #8a6b3f;
}

.allergy-scan__warning {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #a8622a;
}

.allergy-scan__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 20rpx;
  margin-top: 18rpx;
}

.allergy-scan__discard {
  font-size: 25rpx;
  color: #8a7a63;
}

.allergy-scan__confirm {
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  font-size: 25rpx;
  color: #fff;
  background: #8a6b3f;
}

.allergy-scan__confirm--disabled {
  opacity: 0.45;
}
</style>
