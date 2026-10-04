<template>
  <!-- 过敏原检测报告 → AI 读出过敏原（2026-10-04 从健康管理搬来）。
       老板："将过敏源的记录放到定制食谱流程中。"

       为什么留一个"确认"步骤：AI 只负责把报告上的字读出来，
       记不记、记哪几项由家长定 —— 医疗信息不能让 AI 自己定（决策 5/9）。 -->
  <view class="allergy-scan">
    <view class="allergy-scan__head">
      <text class="allergy-scan__title">有检测报告？拍一下自动读</text>
      <text class="allergy-scan__desc">
        过敏原检测报告即可。读出来先给你确认，确认后才加进这一单。
      </text>
    </view>

    <button
      class="allergy-scan__button"
      :disabled="extracting"
      @tap="pickReport"
    >{{ extracting ? '识别中…' : '上传/拍摄检测报告' }}</button>

    <!-- 候选确认卡：默认一个都不选，逐项由家长点 -->
    <view v-if="candidates.length > 0" class="allergy-scan__candidates">
      <text class="allergy-scan__candidates-title">读到这些，确认要记的：</text>
      <view class="allergy-scan__tags">
        <text
          v-for="item in candidates"
          :key="item"
          class="allergy-scan__tag"
          :class="{ 'allergy-scan__tag--picked': picked.includes(item) }"
          @tap="toggle(item)"
        >{{ item }}</text>
      </view>

      <text
        v-for="(warning, index) in warnings"
        :key="`w-${index}`"
        class="allergy-scan__warning"
      >· {{ warning }}</text>

      <view class="allergy-scan__actions">
        <text class="allergy-scan__discard" @tap="discard">都不是</text>
        <text
          class="allergy-scan__confirm"
          :class="{ 'allergy-scan__confirm--disabled': picked.length === 0 }"
          @tap="confirm"
        >加入这一单（{{ picked.length }}）</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { dogApi } from '../../api/dogs'
import {
  SCAN_IMAGE_SIZE_TYPE,
  confirmBlurryScanImages,
  findBlurryScanImages,
  prepareScanImages,
} from '../../utils/scan-image'

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
}>()

const emit = defineEmits<{
  (event: 'scanned', value: { allergens: string[] }): void
}>()

const extracting = ref(false)
const candidates = ref<string[]>([])
const picked = ref<string[]>([])
const warnings = ref<string[]>([])
/** 这一份报告的原始图片地址（可能多页），确认时一起存进报告 */
const imageUrls = ref<string[]>([])
const testDate = ref('')
const method = ref<'SERUM' | 'INTRADERMAL' | 'ELIMINATION' | 'OTHER' | 'UNKNOWN'>('UNKNOWN')
const ocrText = ref('')

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
        sourceType: ['album', 'camera'],
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
    const collected: string[] = []
    const collectedWarnings: string[] = []
    const urls: string[] = []
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

      // 优先用 drafts（带每项结论等级），退回旧的 allergies 数组 ——
      // 提示词换了不代表模型一定照做，两条路都得接住
      const drafts = Array.isArray(data.drafts) ? data.drafts : []
      const fromDrafts = drafts
        .map((item: any) => String(item?.allergen || '').trim())
        .filter(Boolean)

      if (fromDrafts.length > 0) {
        collected.push(...fromDrafts)
      } else if (Array.isArray(data.allergies)) {
        collected.push(
          ...data.allergies.filter((item: unknown) => typeof item === 'string' && item.trim()),
        )
      }

      if (Array.isArray(data.warnings)) {
        collectedWarnings.push(...data.warnings.map((item: unknown) => String(item || '').trim()))
      }

      const meta = data.reportMeta || {}
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
    candidates.value = Array.from(new Set(collected.filter(Boolean)))
    warnings.value = Array.from(new Set(collectedWarnings.filter(Boolean)))
    // 候选一律先不选中，逐项由家长点
    picked.value = []

    uni.hideLoading()

    if (candidates.value.length === 0) {
      uni.showToast({
        title: '没识别到过敏原，请在下面手工添加',
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

  // ① 报告原件存成一份检测报告实体（家长以后翻得出来）
  if (props.dogId && imageUrls.value.length > 0) {
    try {
      await dogApi.allergyReports.create(props.dogId, {
        testDate: testDate.value || null,
        testMethod: method.value,
        attachments: imageUrls.value,
        ocrText: ocrText.value || null,
        results: picked.value.map(allergen => ({ allergen, level: 'UNKNOWN' })),
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
  flex-direction: column;
  gap: 6rpx;
}

.allergy-scan__title {
  font-size: 26rpx;
  font-weight: 700;
  color: #5b4a33;
}

.allergy-scan__desc {
  font-size: 22rpx;
  line-height: 1.5;
  color: #8a7a63;
}

.allergy-scan__button {
  margin-top: 14rpx;
  height: 72rpx;
  line-height: 72rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: #fff;
  background: #8a6b3f;
}

.allergy-scan__button::after {
  border: none;
}

.allergy-scan__candidates {
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed rgba(120, 90, 50, 0.2);
}

.allergy-scan__candidates-title {
  font-size: 24rpx;
  color: #5b4a33;
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
