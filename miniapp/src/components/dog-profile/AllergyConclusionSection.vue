<template>
  <!-- 「不能吃的」——过敏板块的结论区（2026-10-04，过敏重构第二期）。
       老板确认：过敏页改成「结论 / 依据」两段式。

       为什么结论要置顶：
         改造前这个页面是一堆原始记录，顾客要自己读完十几条才能回答
         "我的狗到底不能吃什么"。而"不能吃什么"才是他每次来真正要的那一个答案。

       做法对齐同一个页面里的「饮食偏好」板块（DietPreferenceSection）——
       那套交互是这个仓库里已经被验证过的样式：条目化、点一下就能改、
       状态一眼看得出、空态给一句轻引导。 -->
  <view class="health-section allergy-conclusion">
    <view class="health-section__header">
      <view class="health-section__heading">
        <text class="health-section__title">不能吃的</text>
        <text class="health-section__desc">
          {{ summaryText }}
        </text>
      </view>
      <text class="health-section__count">{{ items.length }} 项</text>
    </view>

    <!-- 空态：说清楚"记了有什么用"，而不是干巴巴一句"暂无" -->
    <view v-if="items.length === 0" class="allergy-conclusion__empty">
      <text class="allergy-conclusion__empty-title">还没有记过过敏</text>
      <text class="allergy-conclusion__empty-desc">
        记下它不能吃什么，推荐食谱与配方会自动避开。有检测报告的话，
        在下面拍张照就能自动识别。
      </text>
    </view>

    <view v-else class="allergy-conclusion__list">
      <view
        v-for="item in items"
        :key="`${item.allergen}-${item.certainty}`"
        class="allergy-item"
        :class="`allergy-item--${item.levelKey}`"
      >
        <view class="allergy-item__main">
          <text class="allergy-item__name">{{ item.allergen }}</text>
          <text class="allergy-item__badge" :class="`allergy-item__badge--${item.levelKey}`">
            {{ item.levelLabel }}
          </text>
        </view>
        <text class="allergy-item__source">{{ item.sourceText }}</text>

        <!-- 顾客随时能改可信度：报告的解读会变、排查会有结论 -->
        <view class="allergy-item__actions">
          <text
            v-for="option in CERTAINTY_OPTIONS"
            :key="option.value"
            class="allergy-item__action"
            :class="{ 'allergy-item__action--active': option.value === item.certainty }"
            @tap="changeCertainty(item, option.value)"
          >{{ option.label }}</text>
        </view>
      </view>
    </view>

    <!-- 避到没有可选时给出口，而不是让顾客自己纳闷 -->
    <view v-if="items.length > 0" class="allergy-conclusion__note">
      <text class="allergy-conclusion__note-text">
        食谱与配方会自动避开「确诊」与「可疑」的过敏原。点上面的按钮可以随时改。
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 过敏结论区（2026-10-04，过敏重构第二期）
 *
 * 四档可信度（老板已确认的口径）：
 *   确诊 CONFIRMED  —— 报告明确阳性，或排查计划已确认 → **含它的食谱彻底不进推荐**
 *   可疑 SUSPECTED  —— 报告写弱阳性/疑似，或排查进行中 → 保留但重罚并标注
 *   待排查 TO_VERIFY —— 主人自己怀疑，还没验证       → 同上
 *   已排除 RULED_OUT —— 排查计划验证过，不过敏       → 不再避开
 */

const props = defineProps<{
  dogId: string
  /** 过敏记录（来自父页面的结构化列表） */
  records?: Array<Record<string, any>>
}>()

const emit = defineEmits<{
  (event: 'changed'): void
}>()

const CERTAINTY_OPTIONS = [
  { value: 'CONFIRMED', label: '确诊' },
  { value: 'SUSPECTED', label: '可疑' },
  { value: 'TO_VERIFY', label: '待排查' },
  { value: 'RULED_OUT', label: '不过敏' },
] as const

const LEVEL_META: Record<string, { label: string; key: string }> = {
  CONFIRMED: { label: '确诊', key: 'confirmed' },
  SUSPECTED: { label: '可疑', key: 'suspected' },
  TO_VERIFY: { label: '待排查', key: 'verify' },
  RULED_OUT: { label: '已排除', key: 'ruled-out' },
}

const items = computed(() => {
  const records = Array.isArray(props.records) ? props.records : []
  return records
    .map((record) => {
      const allergen = String(record?.allergen || '').trim()
      if (!allergen) return null

      const certainty = String(record?.certainty || 'SUSPECTED').toUpperCase()
      const meta = LEVEL_META[certainty] ?? LEVEL_META.SUSPECTED
      const reportDate = String(record?.reportTestDate || '').trim()
      const observedAt = String(record?.observedAt || '').trim()
      const sourceKey = String(record?.source || 'OWNER').toUpperCase()

      let sourceText = ''
      if (sourceKey === 'REPORT') {
        sourceText = reportDate ? `来自 ${reportDate} 的检测报告` : '来自检测报告'
      } else if (sourceKey === 'PLAN') {
        sourceText = '排查计划的结论'
      } else if (sourceKey === 'STAFF') {
        sourceText = '营养师记录'
      } else if (observedAt) {
        sourceText = `你自己记录的（${observedAt}）`
      } else {
        sourceText = '你自己记录的'
      }

      return {
        id: String(record?.id || allergen),
        allergen,
        certainty,
        levelKey: meta.key,
        levelLabel: meta.label,
        sourceText,
      }
    })
    .filter(Boolean) as Array<{
      id: string
      allergen: string
      certainty: string
      levelKey: string
      levelLabel: string
      sourceText: string
    }>
})

/** 已排除的不算"不能吃"，所以统计里分开说 */
const summaryText = computed(() => {
  if (items.value.length === 0) {
    return '记下它不能吃什么，推荐食谱会自动避开。'
  }
  const confirmed = items.value.filter((item) => item.certainty === 'CONFIRMED').length
  const ruledOut = items.value.filter((item) => item.certainty === 'RULED_OUT').length
  const rest = items.value.length - confirmed - ruledOut
  const parts: string[] = []
  if (confirmed > 0) parts.push(`确诊 ${confirmed} 项`)
  if (rest > 0) parts.push(`可疑/待排查 ${rest} 项`)
  if (ruledOut > 0) parts.push(`已排除 ${ruledOut} 项`)
  return parts.join(' · ')
})

async function changeCertainty(
  item: { id: string; certainty: string; allergen: string },
  certainty: string,
) {
  if (certainty === item.certainty) return

  try {
    const res: any = await dogApi.healthRecords.allergy.update(
      props.dogId,
      item.id,
      { certainty } as any,
    )
    if (res?.code !== 0) {
      throw new Error(res?.message || '修改失败')
    }
    uni.showToast({
      title: certainty === 'CONFIRMED' ? '已标为确诊，食谱会彻底避开' : '已更新',
      icon: 'none',
    })
    emit('changed')
  } catch (error: any) {
    uni.showToast({ title: error?.message || '修改失败，请重试', icon: 'none' })
  }
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.allergy-conclusion__empty {
  padding: 32rpx 8rpx;
  text-align: center;
}

.allergy-conclusion__empty-title {
  display: block;
  font-size: 28rpx;
  color: #6b6653;
  margin-bottom: 12rpx;
}

.allergy-conclusion__empty-desc {
  display: block;
  font-size: 24rpx;
  color: #968f6d;
  line-height: 1.6;
}

.allergy-conclusion__list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.allergy-item {
  padding: 20rpx 24rpx;
  border-radius: 16rpx;
  background: #fbfcf7;
  border-left: 8rpx solid #d8d5c8;
}

.allergy-item--confirmed {
  background: #fdf1ec;
  border-left-color: #b4553f;
}

.allergy-item--suspected {
  background: #fdf7ec;
  border-left-color: #c08a2e;
}

.allergy-item--verify {
  background: #f3f5fb;
  border-left-color: #6f7fb0;
}

.allergy-item--ruled-out {
  background: #f4f6f2;
  border-left-color: #9aa88f;
}

.allergy-item__main {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}

.allergy-item__name {
  font-size: 32rpx;
  font-weight: 600;
  color: #26261f;
}

.allergy-item__badge {
  font-size: 20rpx;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  color: #ffffff;
  background: #8a8570;
}

.allergy-item__badge--confirmed {
  background: #b4553f;
}

.allergy-item__badge--suspected {
  background: #c08a2e;
}

.allergy-item__badge--verify {
  background: #6f7fb0;
}

.allergy-item__badge--ruled-out {
  background: #9aa88f;
}

.allergy-item__source {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  margin-bottom: 14rpx;
}

.allergy-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.allergy-item__action {
  font-size: 22rpx;
  padding: 6rpx 20rpx;
  border-radius: 999rpx;
  color: #6b6653;
  background: rgba(255, 255, 255, 0.8);
  border: 2rpx solid #e3e6d4;
}

.allergy-item__action--active {
  color: #ffffff;
  background: #ad5b2a;
  border-color: #ad5b2a;
}

.allergy-conclusion__note {
  margin-top: 20rpx;
}

.allergy-conclusion__note-text {
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.6;
}
</style>
