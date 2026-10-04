<template>
  <!-- 疫苗计划（2026-10-01，第四期）。
       老板第 15–18 条：按免疫程序提醒还需要打哪些、什么时候打；
       引导顾客自己决策；顾客计划与我们不一致时提醒；提醒只在小程序内。 -->
  <view class="health-section vaccine-plan">
    <!-- 未开放：如实说明原因，不假装没这个功能 -->
    <view v-if="unavailable" class="health-card plan-locked">
      <text class="plan-locked__title">疫苗计划待开放</text>
      <text class="plan-locked__desc">{{ unavailable.message }}</text>
    </view>

    <template v-else-if="loaded">
      <!-- 档案里一条接种记录都没有时先说明白，否则"已逾期"会被读成"你的狗没打疫苗"。
           2026-10-02 顾客侧开放当天补：家长明明打过、只是没记，看到逾期会以为系统算错了。 -->
      <view v-if="noRecordAtAll" class="health-card plan-empty-note">
        <text class="plan-empty-note__title">档案里还没有接种记录</text>
        <text class="plan-empty-note__desc">
          下面是按免疫程序推算的进度。如果其实打过疫苗，把接种记录补上，这里会自动对齐；
          已经打过的那几针不会再提示。
        </text>
      </view>

      <!-- ① 下一针：整个板块最重要的一行 -->
      <view v-if="plan.nextStep" class="health-card next-step" :class="`next-step--${plan.nextStep.status}`">
        <text class="next-step__eyebrow">下一步</text>
        <text class="next-step__label">{{ plan.nextStep.label }}</text>
        <text class="next-step__window">
          建议时间：{{ plan.nextStep.windowStart }} ~ {{ plan.nextStep.windowEnd }}
        </text>
        <text class="next-step__reminder">{{ plan.nextStep.reminder }}</text>
        <text class="next-step__basis">依据：{{ plan.nextStep.basis }}</text>

        <view class="decisions">
          <text
            v-for="option in DECISION_OPTIONS"
            :key="option.value"
            class="decisions__item"
            :class="{ 'decisions__item--active': plan.decisions[plan.nextStep.key] === option.value }"
            @tap="decide(plan.nextStep.key, option.value)"
          >{{ option.label }}</text>
        </view>
        <text v-if="plan.decisions[plan.nextStep.key]" class="decisions__hint">
          已记录你的选择：{{ decisionLabel(plan.decisions[plan.nextStep.key]) }}（随时可以改）
        </text>
      </view>

      <view v-else class="health-card next-step next-step--DONE">
        <text class="next-step__label">当前没有待接种的针</text>
        <text class="next-step__reminder">
          按现有记录，免疫程序里的项目都已完成。有新的接种记录后这里会自动更新。
        </text>
      </view>

      <!-- ② 不一致提醒：老板第 17 条 -->
      <view v-if="plan.conflicts.length > 0" class="health-card conflicts">
        <text class="conflicts__title">你的记录与建议不一致（{{ plan.conflicts.length }} 处）</text>
        <view v-for="item in plan.conflicts" :key="`${item.recordId}-${item.reason}`" class="conflict">
          <text class="conflict__head">{{ item.recordDate }} · {{ item.vaccineName }}</text>
          <text class="conflict__reason">{{ item.reason }}</text>
          <text class="conflict__suggestion">{{ item.suggestion }}</text>
        </view>
        <text class="conflicts__note">
          这只是提醒，不是结论。以你手上兽医给出的方案为准。
        </text>
      </view>

      <!-- ③ 完整计划 -->
      <view class="health-card">
        <view class="health-section__header">
          <view class="health-section__heading">
            <text class="health-section__title">接种计划</text>
            <text class="health-section__desc">
              按 WSAVA 2024 与国内法规推算，可在每一项上标明你的决定。
            </text>
          </view>
          <text class="health-section__count">{{ plan.steps.length }} 项</text>
        </view>

        <view
          v-for="step in plan.steps"
          :key="step.key"
          class="step"
          :class="`step--${step.status}`"
        >
          <view class="step__head">
            <text class="step__status">{{ statusLabel(step.status) }}</text>
            <text class="step__label">{{ step.label }}</text>
          </view>
          <text class="step__window">{{ step.windowStart }} ~ {{ step.windowEnd }}</text>
          <text v-if="step.matchedRecordDate" class="step__matched">
            已记录：{{ step.matchedRecordDate }}
          </text>
          <text class="step__basis">依据：{{ step.basis }}</text>

          <view class="decisions decisions--compact">
            <text
              v-for="option in DECISION_OPTIONS"
              :key="`${step.key}-${option.value}`"
              class="decisions__item"
              :class="{ 'decisions__item--active': plan.decisions[step.key] === option.value }"
              @tap="decide(step.key, option.value)"
            >{{ option.label }}</text>
          </view>
        </view>
      </view>

      <text class="plan-note">
        {{ plan.reviewed
          ? '本计划依据 WSAVA 2024 疫苗指南与国内规定起草，已经专业审核。是否接种、何时接种，请以执业兽医的意见为准。'
          : '本计划仍在做专业审核，暂不对顾客开放。是否接种、何时接种，请以执业兽医的意见为准。' }}
      </text>
    </template>

    <view v-else-if="loadError" class="health-card">
      <text class="plan-locked__title">疫苗计划加载失败</text>
      <text class="plan-locked__desc">{{ loadError }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dogApi } from '../../api/dogs'

/**
 * 疫苗计划板块。
 *
 * 挂在「疫苗」书签下、紧挨着疫苗记录上方 —— 记录是"打过什么"，
 * 计划是"接下来怎么打"，两者放一起才读得通。
 *
 * ✅ 顾客侧已开放（2026-10-02 老板指示）：生产环境开了 VACCINE_PLAN=customer，
 *    免疫程序来自 WSAVA 2024，与已审核的免疫类知识条目同源。
 *    接口返回 available: false 时这一块显示原因，而不是空白（开关关掉就回到那个状态）。
 */
interface PlanStep {
  key: string
  kind: 'core' | 'rabies'
  label: string
  windowStart: string
  windowEnd: string
  status: 'DONE' | 'DUE' | 'UPCOMING' | 'OVERDUE' | 'SKIPPED'
  matchedRecordId: string | null
  matchedRecordDate: string | null
  basis: string
  reminder: string
}

interface PlanConflict {
  recordId: string
  recordDate: string
  vaccineName: string
  reason: string
  suggestion: string
}

const props = defineProps<{ dogId: string }>()

const DECISION_OPTIONS = [
  { value: 'ACCEPT', label: '按建议' },
  { value: 'DEFER', label: '推迟' },
  { value: 'SKIP', label: '不做' },
]

const STATUS_LABELS: Record<PlanStep['status'], string> = {
  DONE: '已完成',
  DUE: '该打了',
  UPCOMING: '待安排',
  OVERDUE: '已逾期',
  SKIPPED: '不做',
}

const loaded = ref(false)
const loadError = ref('')
const unavailable = ref<{ message: string } | null>(null)
const plan = ref<{
  nextStep: PlanStep | null
  steps: PlanStep[]
  conflicts: PlanConflict[]
  decisions: Record<string, string>
  summary?: { done?: number }
  /**
   * 这套免疫程序表是否已经过专业审核（2026-10-04）。
   *
   * 后端一直在传这个字段，注释也写着"顾客侧即便开放，也要如实标记"，
   * 但界面**从来没有读过它** —— 于是卡片底部永远写着
   * "本计划仍在做专业审核，暂不对顾客开放"，
   * 而线上开关是开着的：文案在说反话。
   *
   * 现在按它决定底部那句话。等兽医审完、后端把 reviewed 打开，
   * 文案会自己跟着变，不用再改一次前端。
   */
  reviewed?: boolean
  /** 一条接种记录都没有（后端下发，2026-10-04） */
  noRecordAtAll?: boolean
}>({ nextStep: null, steps: [], conflicts: [], decisions: {} })

/**
 * 一条接种记录都还没对上（2026-10-02）。
 *
 * 为什么需要这个：顾客侧开放当天实测一只 8 个月、没记过疫苗的狗，
 * 页面直接顶着 5 个「已逾期」—— 家长明明打过、只是没记，会以为系统算错了。
 * 先说明"档案里还没有记录"，逾期才有上下文。
 */
const noRecordAtAll = computed(() => {
  // 后端已经判好了（2026-10-04），优先用它 —— 前后端两套口径迟早会不一致
  if (typeof plan.value.noRecordAtAll === 'boolean') {
    return plan.value.noRecordAtAll
  }
  const done = Number(plan.value.summary?.done ?? 0)
  const hasMatched = plan.value.steps.some((step) => step.matchedRecordId)
  return done === 0 && !hasMatched
})

/**
 * 状态标签（2026-10-04 老板定）。
 *
 * 一条接种记录都没有时，**不说"已逾期"** —— 我们没有任何证据说他没打，
 * 家长明明年年带狗去打、只是没在小程序里记，看到"已逾期"会以为系统算错了。
 * 改成"还没记录"，这是一个事实陈述，不是指责。
 */
function statusLabel(status: PlanStep['status']) {
  if (noRecordAtAll.value && (status === 'OVERDUE' || status === 'DUE')) {
    return '还没记录'
  }
  return STATUS_LABELS[status] || status
}

function decisionLabel(value: string) {
  return DECISION_OPTIONS.find((item) => item.value === value)?.label || value
}

async function load() {
  if (!props.dogId) {
    return
  }

  loaded.value = false
  loadError.value = ''
  unavailable.value = null

  try {
    const res: any = await dogApi.vaccinePlan(props.dogId)
    if (res.code !== 0 || !res.data) {
      throw new Error(res.message || '加载疫苗计划失败')
    }

    if (res.data.available === false) {
      unavailable.value = { message: String(res.data.message || '') }
      loaded.value = false
      return
    }

    plan.value = {
      nextStep: res.data.nextStep || null,
      steps: Array.isArray(res.data.steps) ? res.data.steps : [],
      conflicts: Array.isArray(res.data.conflicts) ? res.data.conflicts : [],
      decisions: res.data.decisions || {},
      summary: res.data.summary || {},
      reviewed: res.data.reviewed === true,
      noRecordAtAll: res.data.noRecordAtAll === true,
    }
    loaded.value = true
  } catch (error: any) {
    loadError.value = error?.message || '加载疫苗计划失败'
  }
}

/**
 * 记录顾客的决定（老板第 16 条：引导顾客自己做决策）。
 *
 * 点同一个选项两次 = 取消这个决定，回到"按建议"。
 */
async function decide(stepKey: string, decision: string) {
  const current = plan.value.decisions[stepKey]
  const isCancel = current === decision

  // 先动界面，失败再回滚 —— 点一下要立刻有反应
  const previous = { ...plan.value.decisions }
  if (isCancel) {
    delete plan.value.decisions[stepKey]
  } else {
    plan.value.decisions[stepKey] = decision
  }

  try {
    const res: any = isCancel
      ? await dogApi.clearVaccineDecision(props.dogId, stepKey)
      : await dogApi.setVaccineDecision(props.dogId, stepKey, decision)

    if (res.code !== 0) {
      throw new Error(res.message || '保存失败')
    }
    plan.value.decisions = res.data?.decisions || plan.value.decisions
  } catch (error: any) {
    plan.value.decisions = previous
    uni.showToast({ title: error?.message || '保存失败', icon: 'none' })
  }
}

watch(() => props.dogId, load, { immediate: true })
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.vaccine-plan {
  margin-bottom: 24rpx;
}

.plan-locked {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.plan-locked__title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1e3a2f;
}

.plan-locked__desc {
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* 一条接种记录都没有时的说明（2026-10-02）：先给"逾期"一个上下文 */
.plan-empty-note {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  border-left: 8rpx solid #d8c98a;
  background: #fdfbf2;
}

.plan-empty-note__title {
  font-size: 26rpx;
  font-weight: 600;
  color: #7a6a2f;
}

.plan-empty-note__desc {
  font-size: 23rpx;
  line-height: 1.6;
  color: #6b6653;
}

/* 下一针：整个板块最醒目的一行 */
.next-step {
  border-left: 8rpx solid #8a968a;
}

.next-step--DUE {
  border-left-color: #0f7b49;
}

.next-step--OVERDUE {
  border-left-color: #c0392b;
}

.next-step--UPCOMING {
  border-left-color: #216d9b;
}

.next-step--DONE {
  border-left-color: #8a968a;
}

.next-step__eyebrow {
  font-size: 22rpx;
  letter-spacing: 0.1em;
  color: #8a968a;
}

.next-step__label {
  display: block;
  margin-top: 8rpx;
  font-size: 34rpx;
  font-weight: 700;
  color: #1e3a2f;
}

.next-step__window {
  display: block;
  margin-top: 10rpx;
  font-size: 26rpx;
  color: #4a5a4a;
}

.next-step__reminder {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.next-step__basis {
  display: block;
  margin-top: 10rpx;
  font-size: 21rpx;
  line-height: 1.5;
  color: #a8b2a8;
}

/* 顾客的决定：三个选项 */
.decisions {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
}

.decisions--compact {
  margin-top: 14rpx;
}

.decisions__item {
  flex: 1;
  text-align: center;
  padding: 14rpx 0;
  font-size: 24rpx;
  color: #4a5a4a;
  background: #f2f5ec;
  border: 2rpx solid transparent;
  border-radius: 12rpx;
}

.decisions__item--active {
  color: #ffffff;
  background: var(--health-accent, #1e3a2f);
  border-color: var(--health-accent, #1e3a2f);
  font-weight: 600;
}

.decisions__hint {
  display: block;
  margin-top: 12rpx;
  font-size: 21rpx;
  color: #8a968a;
}

/* 不一致提醒 */
.conflicts {
  border-left: 8rpx solid #c0392b;
}

.conflicts__title {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
  color: #a5311f;
}

.conflict {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1rpx solid #f0e2de;
}

.conflict__head {
  display: block;
  font-size: 23rpx;
  color: #6b6653;
}

.conflict__reason {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  font-weight: 600;
  color: #26261f;
}

.conflict__suggestion {
  display: block;
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #6b6653;
}

.conflicts__note {
  display: block;
  margin-top: 18rpx;
  font-size: 21rpx;
  color: #8a968a;
}

/* 计划列表 */
.step {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1rpx solid #eef1e8;
}

.step__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.step__status {
  flex-shrink: 0;
  font-size: 20rpx;
  line-height: 1;
  padding: 8rpx 12rpx;
  border-radius: 8rpx;
  color: #ffffff;
  background: #8a968a;
}

.step--DONE .step__status { background: #0f7b49; }
.step--DUE .step__status { background: #0f7b49; }
.step--OVERDUE .step__status { background: #c0392b; }
.step--UPCOMING .step__status { background: #216d9b; }
.step--SKIPPED .step__status { background: #a8b2a8; }

.step__label {
  font-size: 28rpx;
  font-weight: 600;
  color: #26261f;
}

.step--SKIPPED .step__label {
  color: #8a968a;
  text-decoration: line-through;
}

.step__window {
  display: block;
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #6b6653;
}

.step__matched {
  display: block;
  margin-top: 6rpx;
  font-size: 23rpx;
  color: #0f7b49;
}

.step__basis {
  display: block;
  margin-top: 8rpx;
  font-size: 20rpx;
  line-height: 1.5;
  color: #a8b2a8;
}

.plan-note {
  display: block;
  margin-top: 20rpx;
  padding: 0 8rpx;
  font-size: 21rpx;
  line-height: 1.6;
  color: #8a968a;
}
</style>
