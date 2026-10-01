<template>
  <view class="page">
    <!-- ⚠️ 这一页**不需要登录**（老板第 6 条：医生点开链接不需要登录）。
         所以它不读本地登录态、不跳登录页，失败也只提示"链接可能已失效"。 -->

    <view v-if="isLoading" class="state">
      <text class="state__title">正在打开</text>
      <text class="state__desc">正在读取这份健康摘要，请稍候。</text>
    </view>

    <view v-else-if="isStopped" class="state">
      <text class="state__title">这份分享已停止</text>
      <text class="state__desc">
        主人已经停止了这次分享。如果你需要这些信息，请让主人重新分享一次。
      </text>
    </view>

    <view v-else-if="loadError" class="state">
      <text class="state__title">打不开这个链接</text>
      <text class="state__desc">{{ loadError }}</text>
    </view>

    <template v-else>
      <view class="hero">
        <text class="hero__eyebrow">健康摘要</text>
        <text class="hero__title">{{ snapshot.dogName || '爱犬' }}</text>
        <text v-if="snapshot.dogLine" class="hero__subtitle">{{ snapshot.dogLine }}</text>
        <text class="hero__time">生成于 {{ generatedAtText }}</text>
      </view>

      <!-- 摘要部分：只渲染主人勾选过的分区 -->
      <view v-if="hasSummary" class="block health-card">
        <view v-if="summary.allergies" class="section">
          <text class="section__title">过敏</text>
          <view v-if="summary.allergies.length === 0" class="section__empty">没有已记录的过敏原</view>
          <view v-else class="chips">
            <text v-for="item in summary.allergies" :key="item.allergen" class="chip">
              {{ item.allergen }}
            </text>
          </view>
        </view>

        <view v-if="summary.ongoingConditions" class="section">
          <text class="section__title">还没结束的问题</text>
          <view v-if="summary.ongoingConditions.length === 0" class="section__empty">没有进行中的病史</view>
          <view v-for="item in summary.ongoingConditions" :key="item.id" class="row">
            <text class="row__head">{{ item.date }} · {{ item.status }}</text>
            <text class="row__title">{{ item.diagnosis }}</text>
            <text v-if="item.treatment" class="row__detail">处理：{{ item.treatment }}</text>
            <text v-if="item.followUpDate" class="row__detail">复查日期：{{ item.followUpDate }}</text>
          </view>
        </view>

        <view v-if="summary.recentVisits" class="section">
          <text class="section__title">最近就诊</text>
          <view v-if="summary.recentVisits.length === 0" class="section__empty">没有就诊记录</view>
          <view v-for="item in summary.recentVisits" :key="item.id" class="row">
            <text class="row__head">{{ item.date }}</text>
            <text class="row__title">{{ item.diagnosis }}</text>
            <text v-if="item.treatment" class="row__detail">处理：{{ item.treatment }}</text>
            <text v-if="item.veterinarian" class="row__detail">兽医：{{ item.veterinarian }}</text>
          </view>
        </view>

        <view v-if="summary.recentCheckups" class="section">
          <text class="section__title">最近体检</text>
          <view v-if="summary.recentCheckups.length === 0" class="section__empty">没有体检记录</view>
          <view v-for="item in summary.recentCheckups" :key="item.id" class="row">
            <text class="row__head">{{ item.date }} · {{ item.checkupType }}</text>
            <text class="row__title">{{ item.findings || '未填写检查结论' }}</text>
            <text v-if="item.recommendations" class="row__detail">建议：{{ item.recommendations }}</text>
          </view>
        </view>

        <view v-if="summary.vaccines" class="section">
          <text class="section__title">疫苗</text>
          <view
            v-for="item in summary.vaccines.upcoming"
            :key="`up-${item.id}`"
            class="notice"
            :class="{ 'notice--danger': item.overdue }"
          >
            {{ item.name }} · {{ item.overdue ? '已逾期' : '即将到期' }} {{ item.nextDueDate }}
          </view>
          <view v-if="summary.vaccines.latest.length === 0" class="section__empty">没有疫苗记录</view>
          <view v-for="item in summary.vaccines.latest" :key="item.id" class="row">
            <text class="row__head">{{ item.date }}<template v-if="item.nextDueDate"> · 下次 {{ item.nextDueDate }}</template></text>
            <text class="row__title">{{ item.name }}</text>
          </view>
        </view>

        <view v-if="summary.weight" class="section">
          <text class="section__title">体重</text>
          <view class="weight">
            <text class="weight__value">{{ summary.weight.current }} kg</text>
            <text v-if="summary.weight.recentChangeKg !== null && summary.weight.recentChangeKg !== undefined" class="weight__change">
              较上次 {{ summary.weight.recentChangeKg > 0 ? '+' : '' }}{{ summary.weight.recentChangeKg }} kg
            </text>
          </view>
        </view>

        <view v-if="summary.diet" class="section">
          <text class="section__title">饮食偏好</text>
          <text v-if="summary.diet.preferredFoods" class="row__detail">爱吃：{{ summary.diet.preferredFoods }}</text>
          <text v-if="summary.diet.pickyFoods" class="row__detail">不吃：{{ summary.diet.pickyFoods }}</text>
          <text
            v-if="!summary.diet.preferredFoods && !summary.diet.pickyFoods"
            class="section__empty"
          >没有填写饮食偏好</text>
        </view>

        <view v-if="summary.medicalHistory" class="section">
          <text class="section__title">档案里的病史描述</text>
          <text class="row__detail">{{ summary.medicalHistory }}</text>
        </view>
      </view>

      <!-- 报告原件：走令牌校验的转发地址，停止分享后一起失效 -->
      <view v-if="attachments.length > 0" class="block health-card">
        <text class="block__title">报告原件（{{ attachments.length }}）</text>
        <view class="files">
          <view
            v-for="(item, index) in attachments"
            :key="`${item.name}-${index}`"
            class="file"
            @tap="previewAttachment(index)"
          >
            <text class="file__label">{{ item.label }}</text>
            <text class="file__name">{{ item.name }}</text>
            <text class="file__action">查看</text>
          </view>
        </view>
      </view>

      <view class="footer">
        <text class="footer__text">{{ snapshot.note || '本摘要仅供参考，不构成诊断。' }}</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getBaseUrl } from '../../utils/config'

/**
 * 分享出去的只读页（2026-10-01，第三期）。
 *
 * ⚠️ **不需要登录**（老板第 6 条）：医生不是我们的用户。
 *    安全性靠令牌本身 —— 32 位随机十六进制 + 内容在生成时已定稿，
 *    主人一按"停止分享"这里立刻变成"已停止"。
 *
 * 这一页不走 dogApi：dogApi 的拦截器会在 401 时把用户往登录页带，
 * 而医生根本没有账号，那样只会转圈。
 */
interface SharedAttachment {
  label: string
  name: string
  url: string
}

const token = ref('')
const isLoading = ref(true)
const isStopped = ref(false)
const loadError = ref('')
const snapshot = ref<Record<string, any>>({})
const attachments = ref<SharedAttachment[]>([])

const summary = computed<Record<string, any>>(() => snapshot.value.summary || {})
const hasSummary = computed(() => Object.keys(summary.value).length > 0)

const generatedAtText = computed(() => {
  const value = String(snapshot.value.generatedAt || '')
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
})

onLoad((options: any) => {
  const value = Array.isArray(options?.token) ? options.token[0] : options?.token
  token.value = typeof value === 'string' ? value : ''
  uni.setNavigationBarTitle({ title: '健康摘要' })
  void load()
})

async function load() {
  if (!token.value) {
    loadError.value = '链接不完整，请让主人重新分享一次。'
    isLoading.value = false
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    const url = `${getBaseUrl().replace(/\/+$/, '')}/shared-health/${encodeURIComponent(token.value)}`
    const response = await new Promise<any>((resolve, reject) => {
      uni.request({
        url,
        method: 'GET',
        // 不建登录态：这是给医生的公开页
        header: { 'Content-Type': 'application/json' },
        success: resolve,
        fail: reject,
      })
    })

    if (response?.statusCode === 410) {
      isStopped.value = true
      return
    }

    const body = response?.data
    if (response?.statusCode !== 200 || !body || body.code !== 0 || !body.data) {
      throw new Error(body?.message || '链接可能已失效')
    }

    snapshot.value = body.data
    attachments.value = Array.isArray(body.data.attachments)
      ? body.data.attachments
      : []
    uni.setNavigationBarTitle({
      title: body.data.dogName ? `${body.data.dogName} · 健康摘要` : '健康摘要',
    })
  } catch (error: any) {
    loadError.value = error?.message || '链接可能已失效'
  } finally {
    isLoading.value = false
  }
}

function previewAttachment(index: number) {
  const item = attachments.value[index]
  if (!item) {
    return
  }

  const url = `${getBaseUrl().replace(/\/+$/, '')}${item.url.replace(/^\/api\/v1/, '')}`
  const lower = String(item.name || '').toLowerCase()
  const isPdf = lower.endsWith('.pdf')

  if (isPdf) {
    uni.showToast({ title: 'PDF 请用浏览器打开', icon: 'none' })
    return
  }

  uni.previewImage({ urls: [url], current: url })
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.page {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #f0f3e9 0%, #f2f4ea 100%);
}

.state {
  margin-top: 80rpx;
  padding: 48rpx 32rpx;
  text-align: center;
  background: #fbfcf7;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(30, 46, 36, 0.06);
}

.state__title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #26261f;
}

.state__desc {
  display: block;
  margin-top: 14rpx;
  font-size: 25rpx;
  line-height: 1.7;
  color: #6b6653;
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

.hero__time {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: rgba(243, 237, 221, 0.5);
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

.section {
  margin-top: 24rpx;
}

.section:first-child {
  margin-top: 0;
}

.section__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.section__empty {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #8a968a;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.chip {
  font-size: 26rpx;
  line-height: 1;
  padding: 14rpx 20rpx;
  border-radius: 999rpx;
  background: #fbe9e5;
  color: #a5311f;
  font-weight: 600;
}

.row {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #eef1e8;
}

.row__head {
  display: block;
  font-size: 23rpx;
  color: #6b6653;
}

.row__title {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  line-height: 1.4;
}

.row__detail {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #6b6653;
}

.notice {
  margin-top: 14rpx;
  padding: 16rpx 20rpx;
  border-radius: 14rpx;
  font-size: 24rpx;
  color: #8a6f3d;
  background: #f6efe0;
  border: 1rpx solid #e6d7b8;
}

.notice--danger {
  color: #a5311f;
  background: #fbe9e5;
  border-color: #f0c4ba;
}

.weight {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 12rpx;
}

.weight__value {
  font-size: 44rpx;
  font-weight: 800;
  color: #0e6f78;
}

.weight__change {
  font-size: 24rpx;
  color: #6b6653;
}

.files {
  margin-top: 16rpx;
}

.file {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 16rpx;
  padding: 20rpx;
  border-radius: 16rpx;
  background: #f7f9f1;
  border: 1rpx solid #e3e6d4;
}

.file__label {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: #26261f;
}

.file__name {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #8a968a;
}

.file__action {
  flex-shrink: 0;
  font-size: 26rpx;
  color: var(--health-accent, #1e3a2f);
}

.footer {
  margin-top: 32rpx;
  padding: 0 8rpx;
}

.footer__text {
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a968a;
}
</style>
