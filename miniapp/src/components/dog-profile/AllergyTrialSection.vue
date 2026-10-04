<template>
  <!-- 过敏原排查计划（2026-10-04，过敏重构第三期）。
       老板第 2 条："可以创建过敏原的排查计划。"

       「排除性饮食试验」是国内外指南唯一认可的食物过敏确诊路径。
       定位：**帮你执行、帮你记录、帮你把结果整理给兽医**，
       不替兽医开方案、不做诊断。 -->
  <view class="health-section allergy-trial">
    <!-- 载入中：不占位不闪 -->
    <view v-if="loading" class="health-card trial-loading">
      <text class="trial-loading__text">正在读取排查计划…</text>
    </view>

    <!-- ① 没有计划：给一个入口 + 说清楚它是干什么的 -->
    <view v-else-if="!trial" class="health-card trial-intro">
      <text class="trial-intro__title">做一次过敏原排查</text>
      <text class="trial-intro__desc">
        怀疑它对某样东西过敏，但检测报告说不清？
        「排除性饮食试验」是目前唯一能确认食物过敏的方法：
        严格忌口一段时间，再单独加回来看反应。
      </text>

      <view class="trial-intro__boundary">
        <text
          v-for="(note, index) in rules.vetBoundaryNotes"
          :key="index"
          class="trial-intro__boundary-text"
        >· {{ note }}</text>
      </view>

      <button class="health-section__action" @tap="openCreate">开始排查</button>
    </view>

    <template v-else>
      <!-- ② 进度：整个板块最重要的一行 -->
      <view class="health-card trial-progress">
        <view class="trial-progress__head">
          <text class="trial-progress__title">
            排查中：{{ trial.focusAllergens.join('、') || '未指定目标' }}
          </text>
          <text class="trial-progress__status">{{ statusLabel(trial.status) }}</text>
        </view>

        <view v-if="trial.dayIndex" class="trial-progress__bar">
          <view class="trial-progress__fill" :style="{ width: progressWidth }"></view>
        </view>
        <text v-if="trial.dayIndex" class="trial-progress__days">
          第 {{ trial.dayIndex }} 天 / {{ trial.plannedDays }} 天
        </text>

        <text class="trial-progress__advice">
          {{ trial.advice.label }} · 依据：{{ trial.advice.basis }}
        </text>
        <text class="trial-progress__expectation">{{ trial.advice.expectation }}</text>
      </view>

      <!-- ③ 今天打卡：三个动作，十几秒完成 -->
      <view v-if="trial.status === 'ELIMINATION' || trial.status === 'CHALLENGE'" class="health-card trial-checkin">
        <text class="trial-checkin__title">今天的情况</text>

        <view class="trial-checkin__row">
          <text class="trial-checkin__label">它痒不痒？</text>
          <view class="trial-checkin__options">
            <text
              v-for="option in rules.itchScale"
              :key="`itch-${option.value}`"
              class="trial-checkin__option"
              :class="{ 'trial-checkin__option--active': todayLog.itchScore === option.value }"
              @tap="todayLog.itchScore = option.value"
            >{{ option.label }}</text>
          </view>
        </view>

        <view class="trial-checkin__row">
          <text class="trial-checkin__label">大便怎么样？</text>
          <view class="trial-checkin__options">
            <text
              v-for="option in rules.stoolScale"
              :key="`stool-${option.value}`"
              class="trial-checkin__option"
              :class="{ 'trial-checkin__option--active': todayLog.stoolScore === option.value }"
              @tap="todayLog.stoolScore = option.value"
            >{{ option.label }}</text>
          </view>
        </view>

        <view class="trial-checkin__row">
          <text class="trial-checkin__label">今天有没有破戒？</text>
          <view class="trial-checkin__options">
            <text
              class="trial-checkin__option"
              :class="{ 'trial-checkin__option--active': todayLog.brokeStrict === false }"
              @tap="todayLog.brokeStrict = false"
            >没有</text>
            <text
              class="trial-checkin__option"
              :class="{ 'trial-checkin__option--warn': todayLog.brokeStrict === true }"
              @tap="todayLog.brokeStrict = true"
            >偷吃了</text>
          </view>
        </view>

        <button
          class="health-section__action"
          :disabled="saving"
          @tap="submitToday"
        >{{ saving ? '记录中…' : '记录今天' }}</button>
      </view>

      <!-- ④ 趋势：顾客最想知道"到底有没有好转" -->
      <view v-if="trial.loggedDays > 0" class="health-card trial-trend">
        <text class="trial-checkin__title">这 {{ trial.loggedDays }} 天的变化</text>

        <view v-if="trial.trend.itch" class="trial-trend__row">
          <text class="trial-trend__label">瘙痒</text>
          <text class="trial-trend__value">
            {{ trial.trend.itch.firstAverage }} → {{ trial.trend.itch.lastAverage }}
          </text>
          <text class="trial-trend__tag" :class="`trial-trend__tag--${trial.trend.itch.direction}`">
            {{ trendLabel(trial.trend.itch.direction) }}
          </text>
        </view>

        <view v-if="trial.trend.stool" class="trial-trend__row">
          <text class="trial-trend__label">大便</text>
          <text class="trial-trend__value">
            {{ trial.trend.stool.firstAverage }} → {{ trial.trend.stool.lastAverage }}
          </text>
          <text class="trial-trend__tag" :class="`trial-trend__tag--${trial.trend.stool.direction}`">
            {{ trendLabel(trial.trend.stool.direction) }}
          </text>
        </view>

        <!-- 样本不够时如实说，不拿两天的数据编结论 -->
        <text v-if="!trial.trend.itch && !trial.trend.stool" class="trial-trend__hint">
          再多记几天就能看出趋势了。指南建议连续数周记饮食日记 ——
          日记常常能发现和凭印象回忆不一样的规律。
        </text>

        <text v-if="trial.brokeStrictDays > 0" class="trial-trend__warn">
          有 {{ trial.brokeStrictDays }} 天破戒。排除期没守住的话，
          "没好转"就不能说明这种食物没问题。
        </text>
      </view>

      <!-- ⑤ 必守清单：勾选式，顾客是"照着做"不是"读一遍" -->
      <view class="health-card trial-rules">
        <view class="health-section__header">
          <view class="health-section__heading">
            <text class="health-section__title">必须守住的事</text>
            <text class="health-section__desc">来源：小动物临床营养学 第 31 章</text>
          </view>
          <text class="health-section__count">
            {{ trial.strictRulesChecked }}/{{ trial.strictRulesTotal }}
          </text>
        </view>

        <view
          v-for="rule in rules.strictRules"
          :key="rule.key"
          class="trial-rule"
          @tap="toggleRule(rule.key)"
        >
          <text class="trial-rule__check">{{ trial.strictRules[rule.key] ? '☑' : '☐' }}</text>
          <view class="trial-rule__body">
            <text class="trial-rule__label">{{ rule.label }}</text>
            <text class="trial-rule__detail">{{ rule.detail }}</text>
          </view>
        </view>
      </view>

      <!-- ⑥ 再挑战：结论的必要一步 -->
      <view class="health-card trial-challenge">
        <text class="trial-checkin__title">再挑战</text>
        <text class="trial-challenge__desc">
          {{ rules.challenge.label }}。{{ rules.challenge.expectation }}
        </text>
        <text class="trial-challenge__warn">{{ rules.challenge.warning }}</text>

        <template v-if="trial.challenges.length === 0">
          <button
            class="health-section__action"
            :disabled="saving"
            @tap="startChallenge"
          >开始再挑战</button>
        </template>

        <template v-else>
          <view
            v-for="challenge in trial.challenges"
            :key="challenge.allergen"
            class="challenge-item"
          >
            <text class="challenge-item__name">{{ challenge.allergen }}</text>
            <text class="challenge-item__outcome">{{ outcomeLabel(challenge.outcome) }}</text>

            <view v-if="challenge.outcome === 'PENDING'" class="challenge-item__actions">
              <text class="challenge-item__action challenge-item__action--danger" @tap="concludeChallenge(challenge.allergen, 'REACTED')">
                复发了
              </text>
              <text class="challenge-item__action" @tap="concludeChallenge(challenge.allergen, 'NO_REACTION')">
                没反应
              </text>
              <text class="challenge-item__action" @tap="concludeChallenge(challenge.allergen, 'UNCERTAIN')">
                还不确定
              </text>
            </view>
          </view>
        </template>
      </view>

      <view class="trial-footer">
        <text class="trial-footer__action" @tap="concludeTrial(false)">结束这次排查</text>
        <text class="trial-footer__action trial-footer__action--muted" @tap="concludeTrial(true)">
          中途放弃
        </text>
      </view>
    </template>

    <!-- 新建计划弹层 -->
    <view v-if="showCreate" class="trial-mask" @tap="showCreate = false">
      <view class="trial-sheet" @tap.stop>
        <text class="trial-sheet__title">新建排查计划</text>

        <text class="trial-sheet__label">要排查哪些？</text>
        <view class="trial-sheet__tags">
          <text
            v-for="name in candidateAllergens"
            :key="name"
            class="trial-sheet__tag"
            :class="{ 'trial-sheet__tag--active': draft.focusAllergens.includes(name) }"
            @tap="toggleFocus(name)"
          >{{ name }}</text>
        </view>
        <text v-if="candidateAllergens.length === 0" class="trial-sheet__hint">
          还没有记过过敏原。先在上面「不能吃的」里记一条，或者直接开始排查也可以。
        </text>

        <text class="trial-sheet__label">主要是哪方面的表现？</text>
        <view class="trial-sheet__tags">
          <text
            v-for="option in rules.directions"
            :key="option.value"
            class="trial-sheet__tag"
            :class="{ 'trial-sheet__tag--active': draft.direction === option.value }"
            @tap="selectDirection(option.value)"
          >{{ option.label }}</text>
        </view>
        <text class="trial-sheet__hint">{{ directionDescription }}</text>

        <text class="trial-sheet__label">从哪天开始？</text>
        <picker mode="date" :value="draft.startDate" @change="onStartDateChange">
          <text class="trial-sheet__date">{{ draft.startDate || '点这里选日期' }}</text>
        </picker>

        <view class="trial-sheet__actions">
          <text class="trial-sheet__cancel" @tap="showCreate = false">取消</text>
          <text class="trial-sheet__confirm" @tap="createTrial">
            {{ saving ? '创建中…' : '创建计划' }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 过敏原排查计划（2026-10-04，过敏重构第三期）
 *
 * 界面刻意保持克制：不做"系统建议你排查××"，只做
 * "按你/兽医定的计划，帮你执行、记录、把结果整理出来"。
 *
 * 规则表（建议时长 / 必守清单 / 再挑战窗口 / 兽医边界提示）
 * 全部由后端下发 —— 那些数字都带出处，不该散落在客户端。
 */

const props = defineProps<{
  dogId: string
  /** 已在「不能吃的」里记录的过敏原，作为排查目标的候选 */
  recordedAllergens?: string[]
}>()

const emit = defineEmits<{
  (event: 'changed'): void
}>()

const loading = ref(false)
const saving = ref(false)
const showCreate = ref(false)
const trial = ref<any>(null)

const rules = ref<{
  directions: Array<{ value: string; label: string; description: string }>
  strictRules: Array<{ key: string; label: string; detail: string }>
  challenge: { label: string; expectation: string; warning: string }
  itchScale: Array<{ value: number; label: string }>
  stoolScale: Array<{ value: number; label: string }>
  vetBoundaryNotes: string[]
}>({
  directions: [],
  strictRules: [],
  challenge: { label: '', expectation: '', warning: '' },
  itchScale: [],
  stoolScale: [],
  vetBoundaryNotes: [],
})

const draft = ref({
  focusAllergens: [] as string[],
  direction: 'SKIN',
  startDate: '',
})

const todayLog = ref<{ itchScore: number | null; stoolScore: number | null; brokeStrict: boolean }>({
  itchScore: null,
  stoolScore: null,
  brokeStrict: false,
})

const candidateAllergens = computed(() => {
  const raw = Array.isArray(props.recordedAllergens) ? props.recordedAllergens : []
  return raw.map(item => String(item || '').trim()).filter(Boolean)
})

const progressWidth = computed(() => {
  const day = Number(trial.value?.dayIndex || 0)
  const total = Number(trial.value?.plannedDays || 1)
  if (!day || total <= 0) return '0%'
  return `${Math.min(100, Math.round((day / total) * 100))}%`
})

const directionDescription = computed(() => {
  const found = rules.value.directions.find(item => item.value === draft.value.direction)
  return found?.description || ''
})

onMounted(load)

async function load() {
  if (!props.dogId) return
  loading.value = true
  try {
    const res: any = await dogApi.allergyTrial.getActive(props.dogId)
    if (res?.code !== 0) return
    trial.value = res?.data?.trial || null
    if (res?.data?.rules) {
      rules.value = res.data.rules
    }
    seedTodayLog()
  } catch {
    // 排查计划读不到不能挡住过敏板块的其它部分
    trial.value = null
  } finally {
    loading.value = false
  }
}

/** 今天已经打过卡就把值填回去，避免顾客重复记 */
function seedTodayLog() {
  const today = new Date().toISOString().slice(0, 10)
  const existing = (trial.value?.logs || []).find((log: any) => log.logDate === today)
  todayLog.value = {
    itchScore: existing?.itchScore ?? null,
    stoolScore: existing?.stoolScore ?? null,
    brokeStrict: existing?.brokeStrict === true,
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    DRAFT: '准备中',
    ELIMINATION: '排除期',
    CHALLENGE: '再挑战期',
  }
  return map[status] || status
}

function trendLabel(direction: string) {
  const map: Record<string, string> = {
    improving: '在好转',
    worsening: '变差了',
    stable: '基本稳定',
  }
  return map[direction] || ''
}

function outcomeLabel(outcome: string) {
  const map: Record<string, string> = {
    PENDING: '观察中',
    REACTED: '复发了 → 确诊过敏',
    NO_REACTION: '没反应 → 不过敏',
    UNCERTAIN: '还不确定',
  }
  return map[outcome] || outcome
}

function onStartDateChange(event: any) {
  draft.value.startDate = String(event?.detail?.value || '')
}

function openCreate() {
  draft.value = {
    focusAllergens: candidateAllergens.value.slice(0, 3),
    direction: 'SKIN',
    startDate: new Date().toISOString().slice(0, 10),
  }
  showCreate.value = true
}

function toggleFocus(name: string) {
  const list = draft.value.focusAllergens
  const index = list.indexOf(name)
  if (index >= 0) {
    list.splice(index, 1)
    return
  }
  // 一次最多查 3 个：同时加回多种就分不清是哪一个引起的
  if (list.length >= 3) {
    uni.showToast({ title: '一次最多排查 3 种', icon: 'none' })
    return
  }
  list.push(name)
}

function selectDirection(value: string) {
  draft.value.direction = value
}

async function createTrial() {
  if (saving.value) return
  saving.value = true
  try {
    const res: any = await dogApi.allergyTrial.create(props.dogId, {
      direction: draft.value.direction,
      focusAllergens: draft.value.focusAllergens,
      startDate: draft.value.startDate || null,
    })
    if (res?.code !== 0) {
      throw new Error(res?.message || '创建失败')
    }
    showCreate.value = false
    await load()
    emit('changed')
    uni.showToast({ title: '计划已创建', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '创建失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function toggleRule(key: string) {
  if (!trial.value) return
  const next = { ...(trial.value.strictRules || {}) }
  if (next[key]) {
    delete next[key]
  } else {
    next[key] = true
  }
  trial.value.strictRules = next
  trial.value.strictRulesChecked = Object.keys(next).length

  try {
    await dogApi.allergyTrial.update(props.dogId, trial.value.id, {
      strictRules: next,
    })
  } catch {
    // 勾选失败不回滚界面（顾客的意图还在），下次进入以服务端为准
  }
}

async function submitToday() {
  if (saving.value || !trial.value) return
  saving.value = true
  try {
    const res: any = await dogApi.allergyTrial.logDay(props.dogId, trial.value.id, {
      itchScore: todayLog.value.itchScore,
      stoolScore: todayLog.value.stoolScore,
      brokeStrict: todayLog.value.brokeStrict,
    })
    if (res?.code !== 0) {
      throw new Error(res?.message || '记录失败')
    }
    await load()
    uni.showToast({ title: '已记录今天', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '记录失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

async function startChallenge() {
  if (saving.value || !trial.value) return
  saving.value = true
  try {
    const res: any = await dogApi.allergyTrial.startChallenge(props.dogId, trial.value.id)
    if (res?.code !== 0) {
      throw new Error(res?.message || '操作失败')
    }
    await load()
    uni.showToast({ title: '进入再挑战期', icon: 'none' })
  } catch (error: any) {
    uni.showToast({ title: error?.message || '操作失败，请重试', icon: 'none' })
  } finally {
    saving.value = false
  }
}

function concludeChallenge(allergen: string, outcome: string) {
  uni.showModal({
    title: `记录「${allergen}」的结论`,
    content:
      outcome === 'REACTED'
        ? '会把它标为「确诊」，之后含它的食谱彻底不进推荐。'
        : outcome === 'NO_REACTION'
          ? '会把它标为「已排除」，之后不再避开它。'
          : '暂时保持「待排查」。',
    success: async (res) => {
      if (!res.confirm || !trial.value) return
      try {
        const response: any = await dogApi.allergyTrial.concludeChallenge(
          props.dogId,
          trial.value.id,
          allergen,
          { outcome },
        )
        if (response?.code !== 0) {
          throw new Error(response?.message || '操作失败')
        }
        await load()
        emit('changed')
        uni.showToast({ title: '已记录结论', icon: 'none' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '操作失败，请重试', icon: 'none' })
      }
    },
  })
}

function concludeTrial(abandoned: boolean) {
  uni.showModal({
    title: abandoned ? '中途放弃这次排查？' : '结束这次排查？',
    content: abandoned
      ? '会如实记成"中途放弃"。已经记下的打卡与结论都会保留。'
      : '结束后可以在上面的「不能吃的」里看到结论。',
    success: async (res) => {
      if (!res.confirm || !trial.value) return
      try {
        const response: any = await dogApi.allergyTrial.conclude(
          props.dogId,
          trial.value.id,
          { abandoned },
        )
        if (response?.code !== 0) {
          throw new Error(response?.message || '操作失败')
        }
        await load()
        emit('changed')
        uni.showToast({ title: '已结束', icon: 'none' })
      } catch (error: any) {
        uni.showToast({ title: error?.message || '操作失败，请重试', icon: 'none' })
      }
    },
  })
}
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.trial-loading {
  padding: 32rpx;
  text-align: center;
}

.trial-loading__text {
  font-size: 26rpx;
  color: #968f6d;
}

.trial-intro__title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 12rpx;
}

.trial-intro__desc {
  display: block;
  font-size: 25rpx;
  color: #6b6653;
  line-height: 1.7;
  margin-bottom: 20rpx;
}

.trial-intro__boundary {
  padding: 18rpx 22rpx;
  background: #f4f6f2;
  border-radius: 12rpx;
  margin-bottom: 24rpx;
}

.trial-intro__boundary-text {
  display: block;
  font-size: 22rpx;
  color: #6b6653;
  line-height: 1.7;
}

.trial-progress__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16rpx;
}

.trial-progress__title {
  font-size: 30rpx;
  font-weight: 600;
  color: #26261f;
}

.trial-progress__status {
  font-size: 22rpx;
  color: #ad5b2a;
  background: #f7e9e0;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
}

.trial-progress__bar {
  height: 16rpx;
  border-radius: 999rpx;
  background: #eef0e6;
  overflow: hidden;
  margin-bottom: 10rpx;
}

.trial-progress__fill {
  height: 100%;
  background: #ad5b2a;
  border-radius: 999rpx;
}

.trial-progress__days {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  margin-bottom: 16rpx;
}

.trial-progress__advice {
  display: block;
  font-size: 23rpx;
  color: #8a6f3d;
  line-height: 1.6;
}

.trial-progress__expectation {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.6;
  margin-top: 8rpx;
}

.trial-checkin__title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 20rpx;
}

.trial-checkin__row {
  margin-bottom: 22rpx;
}

.trial-checkin__label {
  display: block;
  font-size: 25rpx;
  color: #6b6653;
  margin-bottom: 12rpx;
}

.trial-checkin__options {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.trial-checkin__option {
  font-size: 24rpx;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  color: #6b6653;
  background: #f4f6f2;
  border: 2rpx solid #e3e6d4;
}

.trial-checkin__option--active {
  color: #ffffff;
  background: #ad5b2a;
  border-color: #ad5b2a;
}

.trial-checkin__option--warn {
  color: #ffffff;
  background: #b4553f;
  border-color: #b4553f;
}

.trial-trend__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 0;
}

.trial-trend__label {
  font-size: 26rpx;
  color: #26261f;
  width: 110rpx;
}

.trial-trend__value {
  font-size: 26rpx;
  color: #6b6653;
}

.trial-trend__tag {
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 999rpx;
  color: #ffffff;
  background: #9aa88f;
}

.trial-trend__tag--improving {
  background: #4a8a5c;
}

.trial-trend__tag--worsening {
  background: #b4553f;
}

.trial-trend__hint {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.6;
  margin-top: 8rpx;
}

.trial-trend__warn {
  display: block;
  font-size: 22rpx;
  color: #b4553f;
  line-height: 1.6;
  margin-top: 14rpx;
}

.trial-rule {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 14rpx 0;
}

.trial-rule__check {
  font-size: 32rpx;
  color: #ad5b2a;
  line-height: 1.2;
}

.trial-rule__body {
  flex: 1;
}

.trial-rule__label {
  display: block;
  font-size: 26rpx;
  color: #26261f;
  margin-bottom: 4rpx;
}

.trial-rule__detail {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.5;
}

.trial-challenge__desc {
  display: block;
  font-size: 24rpx;
  color: #6b6653;
  line-height: 1.6;
  margin-bottom: 12rpx;
}

.trial-challenge__warn {
  display: block;
  font-size: 22rpx;
  color: #8a6f3d;
  line-height: 1.6;
  padding: 14rpx 18rpx;
  background: #f6efe0;
  border-radius: 12rpx;
  margin-bottom: 20rpx;
}

.challenge-item {
  padding: 18rpx 0;
  border-top: 2rpx dashed #e3e6d4;
}

.challenge-item__name {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
  margin-right: 16rpx;
}

.challenge-item__outcome {
  font-size: 22rpx;
  color: #6b6653;
}

.challenge-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}

.challenge-item__action {
  font-size: 23rpx;
  padding: 8rpx 22rpx;
  border-radius: 999rpx;
  color: #ad5b2a;
  background: #f7e9e0;
}

.challenge-item__action--danger {
  color: #ffffff;
  background: #b4553f;
}

.trial-footer {
  display: flex;
  justify-content: space-between;
  padding: 20rpx 8rpx 8rpx;
}

.trial-footer__action {
  font-size: 24rpx;
  color: #ad5b2a;
}

.trial-footer__action--muted {
  color: #968f6d;
}

.trial-mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(20, 41, 31, 0.45);
  z-index: 900;
  display: flex;
  align-items: flex-end;
}

.trial-sheet {
  width: 100%;
  background: #fbfcf7;
  border-radius: 28rpx 28rpx 0 0;
  padding: 36rpx 32rpx 48rpx;
  box-sizing: border-box;
}

.trial-sheet__title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #26261f;
  margin-bottom: 24rpx;
}

.trial-sheet__label {
  display: block;
  font-size: 25rpx;
  color: #6b6653;
  margin: 20rpx 0 12rpx;
}

.trial-sheet__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.trial-sheet__tag {
  font-size: 24rpx;
  padding: 12rpx 26rpx;
  border-radius: 999rpx;
  color: #6b6653;
  background: #f4f6f2;
  border: 2rpx solid #e3e6d4;
}

.trial-sheet__tag--active {
  color: #ffffff;
  background: #ad5b2a;
  border-color: #ad5b2a;
}

.trial-sheet__hint {
  display: block;
  font-size: 22rpx;
  color: #968f6d;
  line-height: 1.6;
  margin-top: 10rpx;
}

.trial-sheet__date {
  font-size: 26rpx;
  color: #26261f;
  padding: 14rpx 24rpx;
  border-radius: 12rpx;
  background: #f4f6f2;
  display: inline-block;
}

.trial-sheet__actions {
  display: flex;
  justify-content: flex-end;
  gap: 32rpx;
  margin-top: 32rpx;
}

.trial-sheet__cancel {
  font-size: 28rpx;
  color: #968f6d;
  padding: 14rpx 12rpx;
}

.trial-sheet__confirm {
  font-size: 28rpx;
  color: #ffffff;
  background: #ad5b2a;
  padding: 14rpx 44rpx;
  border-radius: 999rpx;
}
</style>
