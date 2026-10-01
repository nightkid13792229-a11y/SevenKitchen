<template>
  <view class="page">
    <view class="hero">
      <text class="hero__eyebrow">分享健康信息</text>
      <text class="hero__title">{{ dogName || '健康摘要' }}</text>
      <text class="hero__subtitle">给换新医生看，也可以给家人朋友</text>
    </view>

    <!-- ① 分享什么：三选一 -->
    <view class="block health-card">
      <text class="block__title">分享什么</text>
      <view class="modes">
        <view
          v-for="mode in CONTENT_MODES"
          :key="mode.value"
          class="mode"
          :class="{ 'mode--active': contentMode === mode.value }"
          @tap="contentMode = mode.value"
        >
          <text class="mode__label">{{ mode.label }}</text>
          <text class="mode__desc">{{ mode.desc }}</text>
        </view>
      </view>
    </view>

    <!-- ② 给哪些内容：默认全给，顾客自己取消（老板第 14 条） -->
    <view class="block health-card">
      <view class="block__head">
        <text class="block__title">给哪些内容</text>
        <text class="block__hint" @tap="toggleAll">
          {{ allSelected ? '全部取消' : '全选' }}
        </text>
      </view>
      <text class="block__note">
        默认全部给出去。不想给的那一项，点一下取消即可 —— 取消的内容**不会**出现在分享里。
      </text>

      <view
        v-for="section in SECTIONS"
        :key="section.key"
        class="check-row"
        @tap="toggleSection(section.key)"
      >
        <view class="check-box" :class="{ 'check-box--on': isSelected(section.key) }">
          <text v-if="isSelected(section.key)" class="check-box__tick">✓</text>
        </view>
        <view class="check-row__text">
          <text class="check-row__label">{{ section.label }}</text>
          <text class="check-row__desc">{{ section.desc }}</text>
        </view>
      </view>
    </view>

    <!-- ③ 生成 -->
    <view class="block">
      <button
        class="health-section__action"
        :class="{ 'health-section__action--disabled': isBusy }"
        :disabled="isBusy"
        @tap="generateShare"
      >
        {{ isBusy ? '生成中…' : '生成分享' }}
      </button>
      <text class="tip">
        生成后点右上角「···」发给医生。不需要有效期，随时可以在这里停止分享。
      </text>
    </view>

    <!-- ④ 已经分享出去的 -->
    <view v-if="shares.length > 0" class="block health-card">
      <text class="block__title">已分享出去（{{ shares.length }}）</text>
      <text class="block__note">
        这些链接现在还能打开。不想再让人看，点「停止分享」。
      </text>
      <view v-for="item in shares" :key="item.token" class="share-row">
        <view class="share-row__text">
          <text class="share-row__label">{{ modeLabel(item.contentMode) }}</text>
          <text class="share-row__desc">
            {{ formatTime(item.createdAt) }}<template v-if="item.attachmentCount > 0"> · 含 {{ item.attachmentCount }} 个报告原件</template>
          </text>
        </view>
        <text class="share-row__action" @tap="stopShare(item)">停止分享</text>
      </view>
    </view>

    <view class="footer">
      <text class="footer__text">
        分享出去的是一份**快照**：之后你新记录的内容不会自动出现在里面，要重新分享一次。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app'
import { dogApi } from '../../api/dogs'

/**
 * 健康信息分享（2026-10-01，第三期）。
 *
 * 老板定的六条都在这里落地：
 *   1. 主要给换新医生，兼顾家人朋友
 *   2. 内容三选一：摘要 / 报告原件 / 合并
 *   3. 形式只要小程序分享卡片（onShareAppMessage）
 *   4. 不设有效期 —— 所以要有「停止分享」
 *   5. 医疗信息默认全给，顾客可逐项取消
 *   6. 医生点开不需要登录
 */
type ContentMode = 'SUMMARY' | 'FILES' | 'BOTH'
type SectionKey =
  | 'allergies' | 'ongoing' | 'visits' | 'checkups'
  | 'vaccines' | 'weight' | 'diet' | 'history'

const CONTENT_MODES: { value: ContentMode; label: string; desc: string }[] = [
  { value: 'SUMMARY', label: '只要摘要', desc: '整理好的一页纸，医生扫一眼就懂' },
  { value: 'FILES', label: '只要报告原件', desc: '化验单、B 超单的照片' },
  { value: 'BOTH', label: '合并（推荐）', desc: '摘要 + 报告原件一起给' },
]

const SECTIONS: { key: SectionKey; label: string; desc: string }[] = [
  { key: 'allergies', label: '过敏', desc: '过敏原，安全底线' },
  { key: 'ongoing', label: '还没结束的问题', desc: '待确认 / 治疗中 / 慢性的病史' },
  { key: 'visits', label: '最近就诊', desc: '诊断与处理方式' },
  { key: 'checkups', label: '最近体检', desc: '检查结论与医生建议' },
  { key: 'vaccines', label: '疫苗', desc: '接种记录与下次到期日' },
  { key: 'weight', label: '体重', desc: '当前体重与最近变化' },
  { key: 'diet', label: '饮食偏好', desc: '爱吃什么、不吃什么' },
  { key: 'history', label: '档案里的病史描述', desc: '你在爱犬档案里填过的病史' },
]

const dogId = ref('')
const dogName = ref('')
const contentMode = ref<ContentMode>('BOTH')
/** 默认全给（老板第 14 条：医疗信息默认全给，顾客可以选择） */
const selectedSections = ref<SectionKey[]>(SECTIONS.map((item) => item.key))
const shares = ref<{ token: string; contentMode: string; createdAt: string; attachmentCount: number }[]>([])
const isBusy = ref(false)
/** 刚生成的那一条 —— 用来拼分享卡片路径 */
const latestToken = ref('')

const allSelected = computed(() => selectedSections.value.length === SECTIONS.length)

onLoad((options: any) => {
  const value = Array.isArray(options?.dogId) ? options.dogId[0] : options?.dogId
  const name = Array.isArray(options?.name) ? options.name[0] : options?.name
  dogId.value = typeof value === 'string' ? value : ''
  dogName.value = typeof name === 'string' ? decodeURIComponent(name) : ''
  uni.setNavigationBarTitle({ title: '分享健康信息' })
  void loadShares()
})

/**
 * 分享卡片（老板第 3 条：形式只要小程序分享卡片）。
 *
 * 路径指向**免登录**的公开页 —— 医生不是我们的用户，点开就能看。
 */
onShareAppMessage(() => {
  const token = latestToken.value || shares.value[0]?.token || ''
  return {
    title: `${dogName.value || '爱犬'}的健康摘要`,
    path: token
      ? `/pages/shared-health/index?token=${encodeURIComponent(token)}`
      : '/pages/home/index',
  }
})

function isSelected(key: SectionKey) {
  return selectedSections.value.includes(key)
}

function toggleSection(key: SectionKey) {
  selectedSections.value = isSelected(key)
    ? selectedSections.value.filter((item) => item !== key)
    : [...selectedSections.value, key]
}

function toggleAll() {
  selectedSections.value = allSelected.value ? [] : SECTIONS.map((item) => item.key)
}

function modeLabel(mode: string) {
  return CONTENT_MODES.find((item) => item.value === mode)?.label || mode
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (input: number) => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatError(error: any) {
  return error?.message || '操作失败，请稍后重试'
}

async function loadShares() {
  if (!dogId.value) {
    return
  }
  try {
    const res: any = await dogApi.listHealthShares(dogId.value)
    if (res.code !== 0) {
      throw new Error(res.message || '加载已分享列表失败')
    }
    shares.value = Array.isArray(res.data?.shares) ? res.data.shares : []
  } catch (error: any) {
    // 列表读不到不影响生成，安静失败即可
    shares.value = []
  }
}

async function generateShare() {
  if (!dogId.value || isBusy.value) {
    return
  }

  if (selectedSections.value.length === 0) {
    uni.showToast({ title: '至少要给一项内容', icon: 'none' })
    return
  }

  isBusy.value = true
  try {
    const res: any = await dogApi.createHealthShare(dogId.value, {
      contentMode: contentMode.value,
      sections: selectedSections.value,
    })
    if (res.code !== 0 || !res.data?.token) {
      throw new Error(res.message || '生成分享失败')
    }

    latestToken.value = String(res.data.token)
    await loadShares()
    uni.showToast({ title: '已生成，点右上角发给医生', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: formatError(error), icon: 'none' })
  } finally {
    isBusy.value = false
  }
}

async function stopShare(item: { token: string; contentMode: string }) {
  const confirmed = await new Promise<boolean>((resolve) => {
    uni.showModal({
      title: '停止分享',
      content: '停止后这个链接就打不开了，已经发出去的也一并失效。确认继续吗？',
      confirmText: '停止分享',
      cancelText: '再想想',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false),
    })
  })

  if (!confirmed) {
    return
  }

  try {
    const res: any = await dogApi.revokeHealthShare(dogId.value, item.token)
    if (res.code !== 0) {
      throw new Error(res.message || '停止分享失败')
    }
    if (latestToken.value === item.token) {
      latestToken.value = ''
    }
    await loadShares()
    uni.showToast({ title: '已停止分享', icon: 'success' })
  } catch (error: any) {
    uni.showToast({ title: formatError(error), icon: 'none' })
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

.block {
  margin-top: 24rpx;
}

.block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.block__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.block__hint {
  font-size: 24rpx;
  color: var(--health-accent, #1e3a2f);
}

.block__note {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a968a;
}

.modes {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 16rpx;
}

.mode {
  padding: 22rpx 24rpx;
  border-radius: 18rpx;
  background: #f7f9f1;
  border: 2rpx solid #e3e6d4;
}

.mode--active {
  border-color: var(--health-accent, #1e3a2f);
  background: var(--health-accent-soft, #eef2e4);
}

.mode__label {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.mode__desc {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6b6653;
}

.check-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-top: 20rpx;
}

.check-box {
  flex-shrink: 0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 10rpx;
  border: 2rpx solid #cdd6c7;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.check-box--on {
  background: var(--health-accent, #1e3a2f);
  border-color: var(--health-accent, #1e3a2f);
}

.check-box__tick {
  font-size: 26rpx;
  color: #ffffff;
  line-height: 1;
}

.check-row__text {
  flex: 1;
  min-width: 0;
}

.check-row__label {
  display: block;
  font-size: 27rpx;
  color: #26261f;
}

.check-row__desc {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #8a968a;
}

.tip {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a968a;
  text-align: center;
}

.share-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #eef1e8;
}

.share-row__text {
  flex: 1;
  min-width: 0;
}

.share-row__label {
  display: block;
  font-size: 27rpx;
  color: #26261f;
}

.share-row__desc {
  display: block;
  margin-top: 4rpx;
  font-size: 22rpx;
  color: #8a968a;
}

.share-row__action {
  flex-shrink: 0;
  font-size: 26rpx;
  color: #a5311f;
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  background: #fbe9e5;
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
