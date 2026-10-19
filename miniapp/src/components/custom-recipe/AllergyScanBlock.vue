<template>
  <!-- 过敏原检测报告 → AI 读出过敏原（2026-10-04 从健康管理搬来）。
       老板："将过敏源的记录放到定制食谱流程中。"

       为什么留一个"确认"步骤：AI 只负责把报告上的字读出来，
       记不记、记哪几项由家长定 —— 医疗信息不能让 AI 自己定（决策 5/9）。 -->
  <view class="allergy-scan">
    <!-- 2026-10-05 老板要求：删掉按钮上方的标题与说明（含"拍一下自动读"），
         并把按钮文案改成「上传报告照片」；照片**只从相册选**，
         不调相机、也不弹"拍照/相册"选择器。
         2026-10-19 增加：PDF / Word 文档（.doc / .docx）从微信聊天文件里选。
         同日再要求：这个按钮**改小** —— 它原先是占满一整行的大按钮，
         在一张表单里比"确认定制"还显眼；现在收成一个小圆角按钮靠左放。 -->
    <view class="allergy-scan__head">
      <button
        class="allergy-scan__button"
        :disabled="extracting"
        @tap="pickReportEntry"
      >{{ extracting ? '识别中…' : '上传过敏检测报告' }}</button>
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
import { computed, onUnmounted, ref } from 'vue'
import { dogApi } from '../../api/dogs'
import type { CustomRecipeReportDraft } from '../../utils/custom-recipe-draft'
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
 *   ② 把**报告原件 + 识别结果**作为“这一单的草稿” emit 给父页面
 *
 * 2026-10-19 老板确认：付款前所有输入都是草稿，不能提前写狗狗档案。
 * 所以组件不再调用 `allergyReports.create`；付款成功后由后端把草稿
 * 转成正式的狗狗报告。取消/失败时组件负责清理已上传的 COS 文件。
 */
const props = defineProps<{
  dogId: string
}>()

const emit = defineEmits<{
  (event: 'scanned', value: { allergens: string[] }): void
  /** 2026-10-19：报告先作为“这一单的草稿”交给父页面，不直接写狗狗档案 */
  (event: 'draft', value: CustomRecipeReportDraft): void
}>()

const extracting = ref(false)
const candidates = ref<ScannedAllergen[]>([])
const picked = ref<string[]>([])
const warnings = ref<string[]>([])
/** 这一份报告的原始图片地址（可能多页），确认时一起交给父页面存草稿 */
const imageUrls = ref<string[]>([])
/** 上传到 COS 的 key：取消/失败时用来清理文件；确认后交给父页面 */
const imageKeys = ref<string[]>([])
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

/** 把一页/一份文档的识别结果转成候选（图片与文档共用） */
function buildPageItems(data: any): ScannedAllergen[] {
  const drafts = Array.isArray(data?.drafts) ? data.drafts : []
  const items: ScannedAllergen[] = drafts
    .map((item: any) => ({
      name: String(item?.allergen || '').trim(),
      level: normalizeLevel(item?.level),
      group: normalizeGroup(item?.group),
    }))
    .filter((item: ScannedAllergen) => item.name)

  if (items.length === 0 && Array.isArray(data?.allergies)) {
    items.push(
      ...data.allergies
        .filter((item: unknown) => typeof item === 'string' && item.trim())
        .map((item: string) => ({
          name: item.trim(),
          level: 'UNKNOWN' as const,
          group: 'UNKNOWN' as const,
        })),
    )
  }

  return items
}

/**
 * 丢掉**被别的页推翻**的"整份都没有"式提醒（2026-10-05 老板实测）。
 *
 * 老板上传的是两页报告：判读区在第 2 页，第 1 页只有数值表格 ——
 * 第 1 页的模型忠实地说了一句"这张报告没有单独的结果判定或结论段落"，
 * 而这句话在**合并后的报告层面是错的**，家长看到就以为系统没读到判定区，
 * 甚至怀疑等级是瞎猜的。
 *
 * 口径（三类都按同一逻辑处理）：
 *   · 任何一页有判定区 / 任何一项读到等级 → 丢掉"没有判定区/等级"的提醒
 *   · 任何一页读到了日期              → 丢掉"没写日期"的提醒
 *   · 任何一页读到了检测方式            → 丢掉"没写检测方法"的提醒
 * 其余提醒（某一处被遮挡、某一行看不清）照旧保留 —— 那些是**局部**的，
 * 不会被别的页推翻。
 */
function filterPageWarnings(
  warnings: string[],
  pages: ScannedAllergenPage[],
  resolved: { hasDate: boolean; hasMethod: boolean },
): string[] {
  const unique = Array.from(
    new Set(warnings.map((item) => String(item || '').trim()).filter(Boolean)),
  )
  const hasVerdict =
    pages.some((page) => page.hasVerdict) ||
    pages.some((page) => page.items.some((item) => item.level !== 'UNKNOWN'))

  return unique.filter((warning) => {
    if (hasVerdict && /判定|判读|结论|等级/.test(warning)) return false
    if (resolved.hasDate && /日期|采样/.test(warning)) return false
    if (resolved.hasMethod && /检测方法|检测方式/.test(warning)) return false
    return true
  })
}

function normalizeMethod(value: unknown): typeof method.value {
  const text = String(value || '').toUpperCase()
  return (['SERUM', 'INTRADERMAL', 'ELIMINATION', 'OTHER'] as const).includes(text as any)
    ? (text as typeof method.value)
    : 'UNKNOWN'
}

/** 删掉已经上传到 COS 的草稿文件（取消/失败时用，失败只记日志） */
async function cleanupUploadedFiles(keys: string[]) {
  for (const key of keys) {
    const value = String(key || '').trim()
    if (!value) continue
    await dogApi.deleteHealthAttachment('allergy', value).catch((error) => {
      console.warn('[AllergyScan] 清理报告草稿文件失败:', value, error)
    })
  }
}

/** 清空当前这一轮扫描（不碰已确认交给父页面的草稿） */
function resetScanState() {
  candidates.value = []
  picked.value = []
  warnings.value = []
  imageUrls.value = []
  imageKeys.value = []
  testDate.value = ''
  method.value = 'UNKNOWN'
  ocrText.value = ''
}

/**
 * 一个入口，底部抽屉再让用户选来源（2026-10-19 老板要求）。
 *
 * 不并排两个按钮：整块录入区只有一个「上传过敏检测报告」，
 * 点开后用微信原生底部菜单选“照片 / PDF、Word 文档”。
 */
function pickReportEntry() {
  if (extracting.value) return
  if (candidates.value.length > 0 || imageUrls.value.length > 0) {
    uni.showToast({ title: '请先确认或取消当前报告', icon: 'none' })
    return
  }

  uni.showActionSheet({
    itemList: ['照片（从相册选）', 'PDF / Word 文档（从微信聊天选）'],
    success: (res) => {
      if (res.tapIndex === 0) {
        void pickReport()
      } else if (res.tapIndex === 1) {
        void pickReportDocument()
      }
    },
  })
}

async function pickReport() {
  if (extracting.value) return
  if (candidates.value.length > 0 || imageUrls.value.length > 0) {
    uni.showToast({ title: '请先确认或取消当前报告', icon: 'none' })
    return
  }

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

  /** 上传成功过的 key：中途失败时也要能清理（不能只靠 imageKeys，它要等循环结束才赋值） */
  const attemptedKeys: string[] = []

  try {
    const collectedWarnings: string[] = []
    const urls: string[] = []
    const keys: string[] = []
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
      const key = String(uploaded?.key || '').trim()
      // keys 与 attachments 一一对应；没有 key 也占位，删除某张时索引才不串
      keys.push(key)
      if (key) attemptedKeys.push(key)

      const res: any = await dogApi.extractHealthReport({ imageUrl })
      const data = res?.data || {}

      // 优先用 drafts（带每项结论等级与分组），退回旧的 allergies 数组
      const pageItems = buildPageItems(data)
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
    imageKeys.value = keys
    testDate.value = detectedDate
    method.value = detectedMethod
    ocrText.value = texts.join('\n\n').slice(0, 20000)
    candidates.value = mergeAllergyCandidates(pages)
    warnings.value = filterPageWarnings(collectedWarnings, pages, {
      hasDate: Boolean(detectedDate),
      hasMethod: detectedMethod !== 'UNKNOWN',
    })
    // 读到的食物过敏原**默认全部记上**（老板 2026-10-05 选定）：
    // 原先一个都不勾，家长看到「加入这一单（0）」是灰的，以为识别坏了
    picked.value = foodCandidates.value.map((item) => item.name)

    uni.hideLoading()

    if (foodCandidates.value.length === 0) {
      // 没有可确认的食物过敏原 = 这份报告不会进这一单，上传的文件要清掉
      await cleanupUploadedFiles(keys)
      resetScanState()
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
    // 上传到一半失败：已经传上去的文件要清掉，别留在 COS
    await cleanupUploadedFiles(attemptedKeys)
    resetScanState()
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

/**
 * 从微信聊天里选一份 PDF / Word（.doc / .docx）报告 → 上传 → 识别。
 *
 * 微信只能从聊天记录选文件（`chooseMessageFile`），所以提示要先发到微信；
 * 一份文档作为一个附件，不走图片的多页累加。识别结果与图片共用确认卡。
 */
function pickOneReportDocument(): Promise<{
  path: string
  name: string
  size: number
}> {
  return new Promise((resolve) => {
    const choose = (uni as unknown as {
      chooseMessageFile?: (options: any) => void
    }).chooseMessageFile
    if (typeof choose !== 'function') {
      uni.showToast({
        title: '请先把文件发到微信聊天（文件传输助手也行），再从聊天里选',
        icon: 'none',
        duration: 3000,
      })
      resolve({ path: '', name: '', size: 0 })
      return
    }

    choose({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res: any) => {
        const file = (res?.tempFiles || [])[0] || {}
        resolve({
          path: String(file.path || ''),
          name: String(file.name || '检测报告'),
          size: Number(file.size) || 0,
        })
      },
      fail: () => resolve({ path: '', name: '', size: 0 }),
    })
  })
}

async function pickReportDocument() {
  if (extracting.value) return
  if (candidates.value.length > 0 || imageUrls.value.length > 0) {
    uni.showToast({ title: '请先确认或取消当前报告', icon: 'none' })
    return
  }

  const picked = await pickOneReportDocument()
  if (!picked.path) return

  if (picked.size > 10 * 1024 * 1024) {
    uni.showToast({ title: '文件不能超过 10MB', icon: 'none' })
    return
  }

  extracting.value = true
  uni.showLoading({ title: '识别文档中…', mask: true })
  const attemptedKeys: string[] = []

  try {
    const uploaded = await dogApi.uploadHealthAttachment('allergy', picked.path)
    const fileUrl = String(uploaded?.url || '').trim()
    const key = String(uploaded?.key || '').trim()
    if (!fileUrl) {
      throw new Error('文件上传失败，请重试')
    }
    if (key) attemptedKeys.push(key)

    const res: any = await dogApi.extractHealthReport({
      imageUrl: fileUrl,
      originalFilename: picked.name,
    })
    const data = res?.data || {}
    const items = buildPageItems(data)
    const meta = data.reportMeta || {}
    const pageDate = String(meta.testDate || '').trim()
    const detectedDate = /^\d{4}-\d{2}-\d{2}$/.test(pageDate) ? pageDate : ''
    const detectedMethod = normalizeMethod(meta.testMethod)
    const pages: ScannedAllergenPage[] = [
      { items, hasVerdict: meta.hasVerdict === true },
    ]
    const collectedWarnings = Array.isArray(data.warnings)
      ? data.warnings.map((item: unknown) => String(item || '').trim())
      : []

    imageUrls.value = [fileUrl]
    imageKeys.value = [key]
    testDate.value = detectedDate
    method.value = detectedMethod
    ocrText.value = String(data.ocrText || '').trim().slice(0, 20000)
    candidates.value = mergeAllergyCandidates(pages)
    warnings.value = filterPageWarnings(collectedWarnings, pages, {
      hasDate: Boolean(detectedDate),
      hasMethod: detectedMethod !== 'UNKNOWN',
    })
    picked.value = foodCandidates.value.map((item) => item.name)

    uni.hideLoading()

    if (foodCandidates.value.length === 0) {
      await cleanupUploadedFiles([key])
      resetScanState()
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
    await cleanupUploadedFiles(attemptedKeys)
    resetScanState()
    uni.showToast({
      title:
        error?.message ||
        '这份文档没读出来，可以换 PDF/Word 或改用拍照上传',
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

async function discard() {
  // 取消 = 这一份报告不要了：把已经上传到 COS 的文件一起清掉
  await cleanupUploadedFiles(imageKeys.value)
  resetScanState()
}

function confirm() {
  if (picked.value.length === 0) return

  // 选中的这一批（带报告写的结论等级）
  const chosen = foodCandidates.value.filter((item) => isPicked(item.name))

  /**
   * 2026-10-19：报告**先作为这一单的草稿**交给父页面，不直接写狗狗档案。
   *
   * 原因：此刻顾客还没付款，报告可能被改、被删、整单被放弃；
   * 付款成功后才由后端把草稿转成正式的狗狗报告。
   * `imageKeys` 一起带过去 —— 未付款取消/超时时后端要靠它清理 COS 文件。
   */
  const draft: CustomRecipeReportDraft = {
    attachments: [...imageUrls.value],
    attachmentKeys: [...imageKeys.value],
    testDate: testDate.value || null,
    testMethod: method.value,
    ocrText: ocrText.value || null,
    // 环境项写进报告摘要：原件里有，但不记成"过敏"
    summary: skipped.value.length
      ? `报告另有环境类过敏原 ${skipped.value.length} 项（${skippedNames.value}），与食谱无关，未记入过敏信息。`
      : null,
    results: chosen.map((item) => ({
      allergen: item.name,
      level: item.level,
    })),
  }

  emit('draft', draft)
  // 名字交给父页面（进这一单的过敏信息）
  emit('scanned', { allergens: [...picked.value] })
  resetScanState()
}

onUnmounted(() => {
  // 没确认就离开页面：上传的文件不能留在 COS
  if (imageKeys.value.length > 0) {
    void cleanupUploadedFiles(imageKeys.value)
  }
})

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
  align-items: center;
  flex-wrap: wrap;
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
