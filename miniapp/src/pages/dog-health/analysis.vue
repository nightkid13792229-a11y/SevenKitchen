<template>
  <view class="page">
    <view class="hero">
      <text class="hero__eyebrow">健康分析与建议</text>
      <text class="hero__title">{{ dogName || '爱犬' }}</text>
      <text class="hero__subtitle">基于你自己记录的内容与公开兽医指南整理</text>
    </view>

    <!-- 未开放：如实说明原因 -->
    <view v-if="unavailable" class="state">
      <text class="state__title">健康分析待开放</text>
      <text class="state__desc">{{ unavailable.message }}</text>
    </view>

    <view v-else-if="loadError" class="state">
      <text class="state__title">没能生成分析</text>
      <text class="state__desc">{{ loadError }}</text>
      <view class="state__actions">
        <text class="state__button" @tap="load">重试</text>
      </view>
    </view>

    <view v-else-if="isLoading" class="state">
      <text class="state__title">正在整理</text>
      <text class="state__desc">把记录与权威指南对照一遍，需要半分钟左右，请不要退出本页。</text>
    </view>

    <template v-else>
      <view v-for="item in items" :key="item.section" class="block health-card">
        <text class="block__title">{{ item.label }}</text>
        <text class="block__content">{{ item.content }}</text>

        <!-- 出处：每句话都能倒查到知识库条目 -->
        <view v-if="item.citations.length > 0" class="cites">
          <text class="cites__label">依据</text>
          <text v-for="cite in item.citations" :key="cite" class="cites__item">{{ cite }}</text>
        </view>
      </view>

      <!-- ⚠️ 免责声明写死在界面里，不经过 AI —— AI 不该有机会改写它 -->
      <view class="disclaimer">
        <text class="disclaimer__text">
          本页内容基于你自己记录的健康信息与公开的兽医指南整理，仅供健康参考，不构成诊断。
          如有异常请咨询执业兽医。
        </text>
        <text class="disclaimer__meta">
          生成时间：{{ generatedAtText }}
          <template v-if="insufficientCount > 0">　·　{{ insufficientCount }} 项因记录不足未给结论</template>
        </text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { dogApi } from '../../api/dogs'

/**
 * AI 健康分析与建议（2026-10-01，第七期）。
 *
 * 老板第 19–21 条：七项产出；严格不做诊断，只做初步分析；
 * 顾客与营养师都能看，顾客侧要有免责声明。
 *
 * 界面这一侧的两个职责：
 *   ① 把"依据"露出来 —— 每一项都显示它引用了哪些知识条目，
 *      顾客能看到结论是从哪来的，而不是一段没有出处的漂亮话。
 *   ② 把免责声明写死 —— 它不来自接口，AI 改不了。
 */
interface AnalysisItem {
  section: string
  label: string
  content: string
  citations: string[]
}

const dogId = ref('')
const isLoading = ref(true)
const loadError = ref('')
const unavailable = ref<{ message: string } | null>(null)
const items = ref<AnalysisItem[]>([])
const generatedAt = ref('')
const insufficientCount = ref(0)

const dogName = computed(() => {
  // 从摘要里带不出来时就不显示名字，不要编
  return ''
})

const generatedAtText = computed(() => {
  const date = new Date(generatedAt.value)
  if (!generatedAt.value || Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  dogId.value = typeof value === 'string' ? value : ''
  uni.setNavigationBarTitle({ title: '健康分析与建议' })
  void load()
})

async function load() {
  if (!dogId.value) {
    loadError.value = '缺少狗狗信息，请从健康管理页进入。'
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = ''
  unavailable.value = null

  try {
    const res: any = await dogApi.healthAnalysis(dogId.value)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '生成分析失败')
    }

    if (res.data.available === false) {
      unavailable.value = { message: String(res.data.message || '') }
      return
    }

    items.value = Array.isArray(res.data.items) ? res.data.items : []
    generatedAt.value = String(res.data.generatedAt || '')
    insufficientCount.value = Array.isArray(res.data.insufficientSections)
      ? res.data.insufficientSections.length
      : 0
  } catch (error: any) {
    loadError.value = error?.message || '生成分析失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.hero {
  padding: 32rpx;
  border-radius: 28rpx;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  box-shadow: 0 18rpx 36rpx rgba(27, 92, 64, 0.18);
}

.hero__eyebrow {
  display: block;
  font-size: 22rpx;
  letter-spacing: 0.12em;
  color: #d8bc85;
}

.hero__title {
  display: block;
  margin-top: 14rpx;
  font-size: 40rpx;
  font-weight: 800;
}

.hero__subtitle {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: rgba(243, 237, 221, 0.72);
}

.state {
  margin-top: 24rpx;
  padding: 48rpx 32rpx;
  text-align: center;
  background: #fbfcf7;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.state__title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.state__desc {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.state__actions {
  margin-top: 28rpx;
}

.state__button {
  display: inline-block;
  padding: 18rpx 44rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #f3eddd;
  background: linear-gradient(150deg, #2b5040 0%, #1e3a2f 100%);
  border-radius: 20rpx;
}

.block {
  margin-top: 24rpx;
}

.block__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.block__content {
  display: block;
  margin-top: 14rpx;
  font-size: 26rpx;
  line-height: 1.75;
  color: #3a4a3a;
}

/* 出处 */
.cites {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10rpx;
  margin-top: 18rpx;
  padding-top: 16rpx;
  border-top: 1rpx solid #eef1e8;
}

.cites__label {
  font-size: 21rpx;
  color: #8a968a;
}

.cites__item {
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #4a5a4a;
  background: #f2f5ec;
}

/* 免责声明：写死的，不来自接口 */
.disclaimer {
  margin-top: 32rpx;
  padding: 0 8rpx;
}

.disclaimer__text {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: #8a968a;
}

.disclaimer__meta {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  color: #a8b2a8;
}
</style>
