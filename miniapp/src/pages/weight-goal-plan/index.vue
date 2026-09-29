<template>
  <view class="plan-page">
    <!-- ==================== 新建计划（B2-1 / B2-2） ==================== -->
    <template v-if="mode === 'create'">
      <!-- 增重前的站内排查：前 3 项任一为「是」→ 提示就医，不进入方案 -->
      <view v-if="showScreening" class="card">
        <text class="card__title">先确认几件事</text>
        <text class="card__desc">
          体重偏轻有时是身体原因引起的，先回答几个问题，确认没问题再制定增重方案。
        </text>

        <view v-for="q in screeningQuestions" :key="q.key" class="screen-row">
          <text class="screen-row__title">{{ q.title }}</text>
          <view class="screen-row__options">
            <view
              v-for="opt in [{ label: '是', value: true }, { label: '否', value: false }]"
              :key="opt.label"
              class="screen-option"
              :class="{ active: screeningAnswers[q.key] === opt.value }"
              @tap="screeningAnswers[q.key] = opt.value"
            >{{ opt.label }}</view>
          </view>
        </view>

        <view v-if="screeningResult.needsVet" class="alert alert--danger">
          <text class="alert__title">建议先带狗狗去兽医看看</text>
          <text class="alert__text">
            你选的「{{ screeningResult.dangerReasons.join('、') }}」可能提示身体有问题，
            这种情况不适合直接增重，先排查原因更安全。
          </text>
        </view>

        <button
          class="btn btn--primary"
          :disabled="!screeningComplete"
          @tap="submitScreening"
        >{{ screeningComplete ? '下一步' : '请回答完 5 个问题' }}</button>
      </view>

      <!-- 系统建议（第 1 步）→ 顾客调整（第 2 步）→ 确认（第 3 步） -->
      <template v-else-if="suggestion">
        <view class="card">
          <text class="card__title">
            建议：{{ suggestion.direction === 'LOSS' ? '减重' : '增重' }}
          </text>
          <text class="card__desc">这是按当前体重和体况算出来的，你可以改成自己想要的目标。</text>

          <view class="fact-grid">
            <view class="fact">
              <text class="fact__label">当前体重</text>
              <text class="fact__value">{{ suggestion.currentWeightKg }} kg</text>
            </view>
            <view class="fact">
              <text class="fact__label">建议目标</text>
              <text class="fact__value">{{ suggestion.targetWeightKg }} kg</text>
            </view>
            <view class="fact">
              <text class="fact__label">起步每天能量</text>
              <text class="fact__value">{{ suggestion.currentKcal }} kcal</text>
            </view>
            <view class="fact">
              <text class="fact__label">预计达标</text>
              <text class="fact__value">{{ estimatedText }}</text>
            </view>
          </view>

          <view v-for="(note, i) in suggestion.notes" :key="i" class="note-line">
            <text class="note-line__text">· {{ note }}</text>
          </view>
        </view>

        <!-- 第 2 步：顾客调整。目标体重完全自由；力度只能更温和 -->
        <view class="card">
          <text class="card__title">我要调整</text>

          <view class="field">
            <text class="field__label">目标体重（{{ unitLabel }}）</text>
            <view class="field__row">
              <input
                class="field__input"
                type="digit"
                :value="targetInputText"
                placeholder="填写目标体重"
                @input="onTargetInput"
              />
              <view class="unit-toggle">
                <view
                  v-for="opt in unitOptions"
                  :key="opt.value"
                  class="unit-option"
                  :class="{ active: unit === opt.value }"
                  @tap="switchUnit(opt.value)"
                >{{ opt.label }}</view>
              </view>
            </view>
            <text v-if="targetEcho" class="field__echo">{{ targetEcho }}</text>
            <text v-if="targetHint" class="field__hint">{{ targetHint }}</text>
          </view>

          <view class="field">
            <text class="field__label">力度</text>
            <view class="intensity-options">
              <view
                v-for="level in suggestionIntensities"
                :key="level.key"
                class="intensity-option"
                :class="{ active: intensity === level.key }"
                @tap="intensity = level.key as any"
              >
                <text class="intensity-option__label">{{ level.label }}</text>
                <text class="intensity-option__kcal">{{ level.kcal }} kcal</text>
              </view>
            </view>
            <text class="field__hint">越温和，掉秤越慢但越不容易掉肌肉。起步就是最温和的档位。</text>
          </view>
        </view>

        <button class="btn btn--primary" :disabled="submitting" @tap="submitCreate">
          {{ submitting ? '建立中…' : '就用这个方案' }}
        </button>
      </template>

      <view v-else-if="!loading" class="card">
        <text class="card__title">暂时不需要制定计划</text>
        <text class="card__desc">{{ emptyReason }}</text>
      </view>
    </template>

    <!-- ==================== 调整计划（B2-4 / B2-5 / B2-6） ==================== -->
    <template v-else>
      <template v-if="plan">
        <view class="card">
          <view class="card__head">
            <text class="card__title">{{ plan.direction === 'LOSS' ? '减重计划' : '增重计划' }}</text>
            <text class="badge">{{ statusLabel }}</text>
          </view>

          <view class="fact-grid">
            <view class="fact">
              <text class="fact__label">起始</text>
              <text class="fact__value">{{ plan.startWeightKg }} kg</text>
            </view>
            <view class="fact">
              <text class="fact__label">当前</text>
              <text class="fact__value">{{ plan.currentWeightKg }} kg</text>
            </view>
            <view class="fact">
              <text class="fact__label">目标</text>
              <text class="fact__value">{{ plan.targetWeightKg }} kg</text>
            </view>
            <view class="fact">
              <text class="fact__label">每天能量</text>
              <text class="fact__value">{{ plan.currentKcal }} kcal</text>
            </view>
          </view>

          <view class="progress">
            <view class="progress__bar">
              <view class="progress__fill" :style="{ width: `${plan.progressPercent}%` }"></view>
            </view>
            <text class="progress__hint">
              已完成 {{ plan.progressPercent }}%<template v-if="plan.remainingKg > 0">，还差 {{ plan.remainingKg }} kg</template>
            </text>
          </view>
        </view>

        <view v-if="plan.status !== 'MAINTENANCE'" class="card">
          <text class="card__title">改目标体重</text>
          <text class="card__desc">可以随时改，不受限制 —— 系统算出的目标也只是建议。</text>

          <view class="field">
            <view class="field__row">
              <input
                class="field__input"
                type="digit"
                :value="targetInputText"
                @input="onTargetInput"
              />
              <view class="unit-toggle">
                <view
                  v-for="opt in unitOptions"
                  :key="opt.value"
                  class="unit-option"
                  :class="{ active: unit === opt.value }"
                  @tap="switchUnit(opt.value)"
                >{{ opt.label }}</view>
              </view>
            </view>
            <text v-if="targetEcho" class="field__echo">{{ targetEcho }}</text>
            <text v-if="targetHint" class="field__hint">{{ targetHint }}</text>
          </view>

          <button
            class="btn btn--primary"
            :disabled="submitting || !targetChanged"
            @tap="submitTarget"
          >{{ targetChanged ? '保存目标体重' : '目标体重没有变化' }}</button>
        </view>

        <view class="card">
          <text class="card__title">力度</text>
          <text class="card__desc">只能往更温和方向调。想更激进的话，等系统按实际减重速度自动调整。</text>

          <view class="intensity-options">
            <view
              v-for="level in plan.availableIntensities"
              :key="level.key"
              class="intensity-option"
              :class="{
                active: plan.intensity.key === level.key,
                disabled: !level.allowed,
              }"
              @tap="selectAdjustIntensity(level)"
            >
              <text class="intensity-option__label">{{ level.label }}</text>
              <text class="intensity-option__kcal">{{ level.kcal }} kcal</text>
              <text v-if="!level.allowed" class="intensity-option__lock">不可选</text>
            </view>
          </view>
        </view>

        <view v-if="adjustments.length > 0" class="card">
          <text class="card__title">调整记录</text>
          <view v-for="item in adjustments" :key="item.id" class="adjust-row">
            <view class="adjust-row__main">
              <text class="adjust-row__reason">{{ reasonLabel(item.reason) }}</text>
              <text class="adjust-row__date">{{ formatDate(item.createdAt) }}</text>
            </view>
            <text class="adjust-row__energy">
              {{ item.energyBefore }} → {{ item.energyAfter }} kcal
            </text>
            <text v-if="item.note" class="adjust-row__note">{{ item.note }}</text>
          </view>
        </view>

        <view class="danger-zone">
          <button class="btn btn--danger" @tap="confirmCancel">取消计划</button>
          <text class="danger-zone__hint">取消后可以重新制定；如果只是想暂时停下，可以在计划卡片上暂停。</text>
        </view>
      </template>

      <view v-else-if="!loading" class="card">
        <text class="card__title">没有进行中的计划</text>
        <text class="card__desc">可以回到体重管理区重新制定。</text>
      </view>
    </template>

    <view v-if="loading" class="loading">
      <text class="loading__text">加载中…</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  weightGoalPlanApi,
  getPlanStatusLabel,
  type WeightGoalPlanView,
  type WeightGoalSuggestionView,
  type WeightGoalAdjustmentView,
  type WeightGoalIntensityKey,
  type WeightGoalScreeningQuestion,
} from '../../api/weight-goal-plan'
import {
  formatWeightForInput,
  formatWeightEcho,
  getWeightUnitLabel,
  parseWeightInputToKg,
  type WeightUnit,
} from '../../utils/weight-unit'

/**
 * 体重管理计划 · 新建与调整（阶段 B2-1 ~ B2-7）
 *
 * 一个页面两种模式，由 `mode` 参数决定：
 *   create —— 系统建议 → 顾客调整 → 确认（增重方向前面多一道站内排查）
 *   adjust —— 改目标体重 / 改力度 / 看调整记录 / 取消
 *
 * ⚠️ 本页**不含任何算法**：所有能量、速率、安全边界都由后端算好下发。
 * 页面只负责展示与把顾客的选择回传 —— 否则迟早两边算出不一样的数字。
 */

const dogId = ref('')
const mode = ref<'create' | 'adjust'>('create')
const loading = ref(false)
const submitting = ref(false)

const suggestion = ref<WeightGoalSuggestionView | null>(null)
const plan = ref<WeightGoalPlanView | null>(null)
const adjustments = ref<WeightGoalAdjustmentView[]>([])

// ---- 顾客的调整 ----
const targetInputText = ref('')
const unit = ref<WeightUnit>('KG')
const unitOptions: Array<{ value: WeightUnit; label: string }> = [
  { value: 'KG', label: '公斤' },
  { value: 'JIN', label: '斤' },
]
const intensity = ref<WeightGoalIntensityKey>('STANDARD')
const targetWeightKg = ref<number | null>(null)

// ---- 增重排查 ----
const showScreening = ref(false)
const screeningQuestions = ref<WeightGoalScreeningQuestion[]>([])
const screeningAnswers = ref<Record<string, boolean>>({})

const unitLabel = computed(() => getWeightUnitLabel(unit.value))

const statusLabel = computed(() =>
  plan.value ? getPlanStatusLabel(plan.value.status) : '',
)

const targetEcho = computed(() =>
  targetWeightKg.value ? formatWeightEcho(targetWeightKg.value) : '',
)

const targetHint = computed(() => {
  const base = mode.value === 'create' ? suggestion.value : plan.value
  if (!base || !targetWeightKg.value) return ''
  const current = base.currentWeightKg
  const diff = Math.abs(targetWeightKg.value - current) / current
  if (diff > 0.3) {
    return '这个目标与当前体重相差超过 30%，偏离较大，建议确认后再继续。'
  }
  if (diff < 0.05) {
    return '这个目标与当前体重只差不到 5%，变化太小、难以有效监测。'
  }
  return ''
})

const estimatedText = computed(() => {
  const date = suggestion.value?.estimatedGoalDate
  if (!date) return '—'
  return formatDate(date)
})

/** 新建时可选的力度档位（起步档 + 更温和的两档） */
const suggestionIntensities = computed(() => {
  if (!suggestion.value) return []
  const isLoss = suggestion.value.direction === 'LOSS'
  const base = suggestion.value.targetWeightKg
  // ⚠️ 这里只是把后端会用到的**档位名**列出来给顾客选，
  //     kcal 是按后端同一套口径粗算的展示值，最终以后端返回为准
  return isLoss
    ? [
        { key: 'STANDARD', label: '标准', kcal: suggestion.value.currentKcal },
        { key: 'GENTLE', label: '温和', kcal: Math.round(suggestion.value.currentKcal * 1.1) },
        { key: 'GENTLER', label: '更温和', kcal: Math.round(suggestion.value.currentKcal * 1.2) },
      ]
    : [
        { key: 'STANDARD', label: '标准', kcal: suggestion.value.currentKcal },
        { key: 'GENTLE', label: '温和', kcal: Math.round(suggestion.value.currentKcal * 1.09) },
        { key: 'GENTLER', label: '更温和', kcal: Math.round(suggestion.value.currentKcal * 1.18) },
      ]
})

const screeningComplete = computed(() =>
  screeningQuestions.value.every((q) => screeningAnswers.value[q.key] !== undefined),
)

const screeningResult = computed(() => {
  const dangerKeys = ['losing_weight', 'poor_appetite', 'vomiting_diarrhea']
  const hit = screeningQuestions.value.filter(
    (q) => dangerKeys.includes(q.key) && screeningAnswers.value[q.key] === true,
  )
  return {
    needsVet: hit.length > 0,
    dangerReasons: hit.map((q) => q.title),
  }
})

const targetChanged = computed(() => {
  if (!plan.value || !targetWeightKg.value) return false
  return Math.abs(targetWeightKg.value - plan.value.targetWeightKg) > 0.01
})

const emptyReason = ref('当前体况属于理想区间，不需要增减重计划。')

// ==================== 生命周期 ====================

onLoad(async (options: any) => {
  dogId.value = options?.dogId || ''
  mode.value = options?.mode === 'adjust' ? 'adjust' : 'create'
  if (!dogId.value) {
    uni.showToast({ title: '缺少狗狗信息', icon: 'none' })
    return
  }

  loading.value = true
  try {
    if (mode.value === 'create') {
      await loadSuggestion()
    } else {
      await loadPlan()
      await loadAdjustments()
    }
  } finally {
    loading.value = false
  }
})

async function loadSuggestion() {
  const res = await weightGoalPlanApi.suggestion(dogId.value)
  if (res.code !== 0) {
    uni.showToast({ title: res.message || '读取失败', icon: 'none' })
    return
  }
  suggestion.value = res.data?.suggestion ?? null
  screeningQuestions.value = res.data?.screeningQuestions ?? []

  if (!suggestion.value) {
    emptyReason.value = '当前体况属于理想区间，不需要增减重计划。'
    return
  }

  // 目标体重默认用系统建议
  targetWeightKg.value = suggestion.value.targetWeightKg
  targetInputText.value = formatWeightForInput(
    suggestion.value.targetWeightKg,
    unit.value,
  )
  intensity.value = 'STANDARD'

  // 增重方向：先过排查
  if (suggestion.value.requiresScreening) {
    showScreening.value = true
  }
}

async function loadPlan() {
  const res = await weightGoalPlanApi.current(dogId.value)
  plan.value = res.code === 0 ? (res.data ?? null) : null
  if (plan.value) {
    targetWeightKg.value = plan.value.targetWeightKg
    targetInputText.value = formatWeightForInput(
      plan.value.targetWeightKg,
      unit.value,
    )
  }
}

async function loadAdjustments() {
  const res = await weightGoalPlanApi.adjustments(dogId.value)
  adjustments.value = res.code === 0 ? (res.data ?? []) : []
}

// ==================== 输入处理 ====================

function onTargetInput(event: any) {
  const raw = String(event?.detail?.value ?? '')
  targetInputText.value = raw
  targetWeightKg.value = parseWeightInputToKg(raw, unit.value)
}

function switchUnit(next: WeightUnit) {
  if (next === unit.value) return
  // 先把当前输入按旧单位固化成公斤，再按新单位重新展示
  const kg = parseWeightInputToKg(targetInputText.value, unit.value)
  unit.value = next
  targetWeightKg.value = kg
  targetInputText.value = kg ? formatWeightForInput(kg, next) : ''
}

function selectAdjustIntensity(level: { key: string; allowed: boolean }) {
  if (!level.allowed) {
    uni.showToast({
      title: '只能往更温和方向调，想更激进请等系统自动调整',
      icon: 'none',
    })
    return
  }
  void submitIntensity(level.key as WeightGoalIntensityKey)
}

// ==================== 提交 ====================

function submitScreening() {
  if (screeningResult.value.needsVet) {
    uni.showModal({
      title: '建议先就医',
      content:
        '你选的情况可能提示身体有问题。这种情况不适合直接增重，' +
        '建议先带狗狗去兽医排查原因。如果兽医确认健康，可以回来重新制定。',
      showCancel: false,
      confirmText: '我知道了',
    })
    return
  }
  showScreening.value = false
}

async function submitCreate() {
  if (submitting.value) return
  if (!targetWeightKg.value || targetWeightKg.value <= 0) {
    uni.showToast({ title: '请填写有效的目标体重', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    const res = await weightGoalPlanApi.create(dogId.value, {
      targetWeightKg: targetWeightKg.value,
      intensity: intensity.value,
      screening: screeningAnswers.value,
    })
    if (res.code === 0) {
      uni.showToast({ title: '计划已建立', icon: 'none' })
      setTimeout(() => uni.navigateBack(), 800)
    } else {
      uni.showToast({ title: res.message || '建立失败', icon: 'none' })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '建立失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function submitTarget() {
  if (submitting.value || !targetWeightKg.value) return
  submitting.value = true
  try {
    const res = await weightGoalPlanApi.updateTarget(
      dogId.value,
      targetWeightKg.value,
    )
    if (res.code === 0) {
      plan.value = res.data ?? null
      uni.showToast({ title: '目标体重已更新', icon: 'none' })
      await loadAdjustments()
    } else {
      uni.showToast({ title: res.message || '保存失败', icon: 'none' })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  } finally {
    submitting.value = false
  }
}

async function submitIntensity(key: WeightGoalIntensityKey) {
  try {
    const res = await weightGoalPlanApi.updateIntensity(dogId.value, key)
    if (res.code === 0) {
      plan.value = res.data ?? null
      uni.showToast({ title: '力度已调整', icon: 'none' })
      await loadAdjustments()
    } else {
      uni.showToast({ title: res.message || '调整失败', icon: 'none' })
    }
  } catch (error: any) {
    uni.showToast({ title: error?.message || '调整失败', icon: 'none' })
  }
}

function confirmCancel() {
  uni.showModal({
    title: '取消计划',
    content: '取消后每日能量会恢复成正常维持量，之后可以重新制定。确定取消吗？',
    confirmText: '取消计划',
    confirmColor: '#c0392b',
    success: async (res) => {
      if (!res.confirm) return
      const result = await weightGoalPlanApi.cancel(dogId.value)
      if (result.code === 0) {
        uni.showToast({ title: '计划已取消', icon: 'none' })
        setTimeout(() => uni.navigateBack(), 800)
      } else {
        uni.showToast({ title: result.message || '操作失败', icon: 'none' })
      }
    },
  })
}

// ==================== 展示辅助 ====================

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    RATE_TOO_SLOW: '减得偏慢，系统加大力度',
    RATE_TOO_FAST: '减得偏快，系统放缓力度',
    MANUAL: '你手动调整',
    GOAL_REACHED: '达标，转入维持期',
    MAINTENANCE_UNDERSHOOT: '维持期仍在掉重，热量上调',
    FLOOR_REACHED: '已到安全边界，不再调整',
  }
  return map[reason] || reason
}
</script>

<style scoped>
.plan-page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx;
  padding-bottom: 60rpx;
  background: #f6f7f2;
  min-height: 100vh;
}

.card {
  padding: 28rpx;
  border-radius: 24rpx;
  background: #ffffff;
  border: 1rpx solid rgba(30, 58, 47, 0.08);
}

.card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.card__title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #26261f;
}

.card__desc {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b7a70;
}

.badge {
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  background: #eef4ea;
  color: #1e3a2f;
}

.fact-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.fact {
  flex: 1 1 40%;
  min-width: 220rpx;
  padding: 16rpx 18rpx;
  border-radius: 14rpx;
  background: #f8faf5;
}

.fact__label {
  display: block;
  font-size: 22rpx;
  color: #8a8375;
}

.fact__value {
  display: block;
  margin-top: 6rpx;
  font-size: 28rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.note-line {
  margin-top: 12rpx;
}

.note-line__text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a6f3d;
}

.progress {
  margin-top: 20rpx;
}

.progress__bar {
  height: 14rpx;
  border-radius: 999rpx;
  background: #edf0e8;
  overflow: hidden;
}

.progress__fill {
  height: 100%;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #1e3a2f 0%, #3d7a5f 100%);
}

.progress__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  color: #6b7a70;
}

.field {
  margin-top: 22rpx;
}

.field__label {
  display: block;
  font-size: 25rpx;
  font-weight: 600;
  color: #26261f;
}

.field__row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 12rpx;
}

.field__input {
  flex: 1;
  height: 80rpx;
  padding: 0 22rpx;
  border: 1rpx solid #dfe4d6;
  border-radius: 14rpx;
  font-size: 28rpx;
  background: #fbfcf8;
}

.unit-toggle {
  display: flex;
  border: 1rpx solid #dfe4d6;
  border-radius: 14rpx;
  overflow: hidden;
}

.unit-option {
  padding: 16rpx 22rpx;
  font-size: 25rpx;
  color: #6b7a70;
  background: #ffffff;
}

.unit-option.active {
  background: #1e3a2f;
  color: #ffffff;
}

.field__echo {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  color: #6b7a70;
}

.field__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a8375;
}

.intensity-options {
  display: flex;
  gap: 12rpx;
  margin-top: 14rpx;
}

.intensity-option {
  flex: 1;
  padding: 20rpx 12rpx;
  border: 1rpx solid #dfe4d6;
  border-radius: 16rpx;
  text-align: center;
  background: #ffffff;
}

.intensity-option.active {
  border-color: #1e3a2f;
  background: #eef4ea;
}

.intensity-option.disabled {
  opacity: 0.45;
}

.intensity-option__label {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.intensity-option__kcal {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a8375;
}

.intensity-option__lock {
  display: block;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #c0392b;
}

.screen-row {
  margin-top: 22rpx;
}

.screen-row__title {
  display: block;
  font-size: 26rpx;
  color: #26261f;
}

.screen-row__options {
  display: flex;
  gap: 12rpx;
  margin-top: 12rpx;
}

.screen-option {
  padding: 14rpx 40rpx;
  border: 1rpx solid #dfe4d6;
  border-radius: 999rpx;
  font-size: 26rpx;
  color: #46564d;
}

.screen-option.active {
  border-color: #1e3a2f;
  background: #eef4ea;
  color: #1e3a2f;
  font-weight: 700;
}

.alert {
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: 14rpx;
}

.alert--danger {
  background: #fdeceb;
}

.alert__title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #c0392b;
}

.alert__text {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  line-height: 1.6;
  color: #8a3d33;
}

.adjust-row {
  margin-top: 18rpx;
  padding-bottom: 18rpx;
  border-bottom: 1rpx solid #f0f2ea;
}

.adjust-row__main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16rpx;
}

.adjust-row__reason {
  font-size: 25rpx;
  color: #26261f;
}

.adjust-row__date {
  font-size: 22rpx;
  color: #9a958a;
}

.adjust-row__energy {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  color: #1e3a2f;
  font-weight: 600;
}

.adjust-row__note {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #8a8375;
}

.danger-zone {
  margin-top: 20rpx;
}

.danger-zone__hint {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  line-height: 1.6;
  color: #9a958a;
}

.btn {
  margin: 0;
  height: 88rpx;
  line-height: 88rpx;
  font-size: 29rpx;
  font-weight: 600;
  border-radius: 999rpx;
  color: #1e3a2f;
  background: #f2f5ee;
}

.btn::after {
  border: none;
}

.btn--primary {
  margin-top: 24rpx;
  color: #ffffff;
  background: linear-gradient(135deg, #1e3a2f 0%, #24493a 100%);
}

.btn--primary[disabled] {
  opacity: 0.5;
}

.btn--danger {
  color: #c0392b;
  background: #fdeceb;
}

.loading {
  padding: 60rpx 0;
  text-align: center;
}

.loading__text {
  font-size: 26rpx;
  color: #9a958a;
}
</style>
