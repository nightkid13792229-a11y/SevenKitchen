<template>
  <!-- 疫苗计划（2026-10-01，第四期）。
       老板第 15–18 条：按免疫程序提醒还需要打哪些、什么时候打；
       引导顾客自己决策；顾客计划与我们不一致时提醒；提醒只在小程序内。

       2026-10-04 老板定：**计划没开的时候整块不出现**。
       原来会显示一张写着"待开放"的卡片 —— 顾客看到的是一个还不存在、
       也没说什么时候会有的功能，只会以为是坏的。开了才出现，才讲得通。 -->
  <view v-if="!sectionHidden" class="health-section vaccine-plan">
    <template v-if="loaded">
      <!-- 一条接种记录都没有时：**这一块整个不渲染**（2026-10-04 老板第二次提问后改）。

           前一轮我在计划板块里放了一张"还没有接种记录"的说明卡，
           结果下面记录板块的空态又写了一遍"还没有疫苗记录"——
           老板："为什么会提醒了一次，没有接种记录。在下方又进行了一次
           没有疫苗记录的提醒呢。" 同一件事说了两遍。
           （另外，零记录时显示"下一步：狂犬疫苗 第 3 次 / 建议时间 2025-11-16"
             也不成立：那个"第 3 次"是程序表里的序号，顾客会读成"我家狗打过两次"，
             而我们一条记录都没有；窗口还是过去的。
             计划是"接下来怎么打"，没有记录就没有"接下来"可言。）

           所以这句提醒交给**记录板块的空态**去说 —— 它就长在记录列表该在的地方，
           而且计划开关关掉时也照样说得到（那边不依赖计划接口）。 -->
      <template v-if="!noRecordAtAll">
      <!-- ① 下一针：整个板块最重要的一行 -->
      <view v-if="plan.nextStep" class="health-card next-step" :class="`next-step--${plan.nextStep.status}`">
        <text class="next-step__eyebrow">下一步</text>
        <text class="next-step__label">{{ plan.nextStep.label }}</text>
        <text class="next-step__window">
          建议时间：{{ plan.nextStep.windowStart }} ~ {{ plan.nextStep.windowEnd }}
        </text>
        <text class="next-step__reminder">{{ plan.nextStep.reminder }}</text>
        <!-- 错开接种的提醒（2026-10-05）：紧跟在提醒语下面 ——
             家长最容易犯的错就是"两针一起去打"。 -->
        <view v-if="plan.nextStep.spacingNote" class="spacing-note">
          <text class="spacing-note__text">{{ plan.nextStep.spacingNote }}</text>
        </view>
        <text
          v-if="(plan.nextStep.commonProducts || []).length > 0"
          class="next-step__products"
        >
          常见的有：{{ (plan.nextStep.commonProducts || []).join('、') }}
        </text>
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

      <!-- ③ 完整计划：**一行标题，点开才铺开**（2026-10-04 老板定）。
           顾客来这一页是看"下一针什么时候打"，不是来读免疫程序表的。
           一屏里直接铺 9 项，反而把上面那行"下一步"淹掉了 ——
           重点被自己的细节盖住。 -->
      <view class="health-card plan-list">
        <view class="plan-list__head" @tap="planListExpanded = !planListExpanded">
          <view class="plan-list__copy">
            <text class="health-section__title">接种计划</text>
            <text class="plan-list__hint">{{ planListHint }}</text>
          </view>
          <text class="plan-list__toggle">
            {{ planListExpanded ? '收起' : `展开 ${plan.steps.length} 项` }}
          </text>
        </view>

        <template v-if="planListExpanded">
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
            <text v-if="step.spacingNote" class="step__spacing">
              {{ step.spacingNote }}
            </text>
            <text
              v-if="(step.commonProducts || []).length > 0"
              class="step__products"
            >
              常见的有：{{ (step.commonProducts || []).join('、') }}
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
        </template>
      </view>

      <text class="plan-note">
        {{ plan.reviewed
          ? '本计划依据 WSAVA 2024 疫苗指南与国内规定起草，已经专业审核。是否接种、何时接种，请以执业兽医的意见为准。'
          : '本计划仍在做专业审核，暂不对顾客开放。是否接种、何时接种，请以执业兽医的意见为准。' }}
      </text>
      </template>
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
  /**
   * 这一步常见的产品（2026-10-04 兽医审核通过）。
   *
   * ⚠️ 只列进口苗（老板审核意见第 5 条："所有国产疫苗都不推荐"），
   *    每个种类最多 3 个（第 6 条）。
   * ⚠️ 措辞是「常见的有」，**不是「建议打」** ——
   *    各医院进的货不一样，推荐了顾客也未必买得到；
   *    而且"打哪个商品"已经挨着诊疗，不是我们该拍板的。
   */
  commonProducts?: string[]
  /**
   * 「这一针别和别的针同一天打」（2026-10-05 老板的规则二）。
   *
   * 不同分类的疫苗不可以同一天接种，前后错开 2~3 天。
   * 空字符串 = 这段时间没有别的针要打。
   */
  spacingNote?: string
}

interface PlanConflict {
  recordId: string
  recordDate: string
  vaccineName: string
  reason: string
  suggestion: string
}

const props = defineProps<{
  dogId: string
  /**
   * 已保存记录变化时由页面递增（2026-10-05）。
   *
   * 计划板块原来只在"换狗"时加载一次，顾客在原地录完几条它也不知道，
   * 于是停在"还没有记录"的状态、整块不显示。
   */
  dataVersion?: number
}>()

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
/**
 * 上一次加载的是哪条狗（2026-10-06）。
 *
 * 用来区分"同一条狗刷新"和"换了一条狗"：前者不要抹掉 loaded（会闪一下），
 * 后者必须抹掉（否则新狗会顶着上一条狗的计划）。
 */
const loadedDogId = ref('')
const loadError = ref('')
const unavailable = ref<{ message: string } | null>(null)

/** 计划没开（接口说 available:false）→ 整块不出现，不是显示一张"待开放"的卡 */
const planHidden = computed(() => unavailable.value !== null)

/**
 * 整块要不要渲染（2026-10-05）。
 *
 * ⚠️ 零记录时**连根节点都不能留**。上一轮我只把里面的内容藏了，
 * 根 `<view class="health-section vaccine-plan">` 还在 ——
 * 它带着 `.vaccine-plan { margin-bottom: 24rpx }`，于是在书签和
 * 记录板块那张空态卡之间留了一条 24rpx 的紫色空白。
 * 老板看出来了："疫苗板块为什么还是有紫色的空白区域呢？"
 */
const sectionHidden = computed(
  () => planHidden.value || (loaded.value && noRecordAtAll.value),
)
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
  /**
   * 一条接种记录都没有（后端下发）。
   *
   * ⚠️ 2026-10-04 修正口径：它现在**真的**表示"一条记录都没有"
   * （`records.length === 0`）。原来后端算的是"没有任何一步被匹配上"，
   * 于是只录了一条"钩端螺旋体"（非核心苗，程序表里没有对应步骤）的人，
   * 会被误判成"一条记录都没有"。
   */
  noRecordAtAll?: boolean
  /**
   * 有没有任何一条能对上号的证据（后端下发）。
   *
   * **只用来决定措辞软硬** —— 为假时不出现"已过期""尽快安排"这种口气。
   * 不用它决定显不显示计划，那件事归 noRecordAtAll。
   */
  noEvidence?: boolean
}>({ nextStep: null, steps: [], conflicts: [], decisions: {} })

/**
 * 一条接种记录都没有（后端下发，优先用）。
 *
 * 决定：**整块藏掉计划与"下一步"**（零记录时计划本来也无从谈起）。
 * 那句空态提醒由记录板块去说，这里不重复。
 *
 * ⚠️ 2026-10-04 口径修正：它以前兼着"没有任何一步对上号"的意思，
 * 现在两个概念分开了 —— 见 noEvidence。
 */
const noRecordAtAll = computed(() => {
  if (typeof plan.value.noRecordAtAll === 'boolean') {
    return plan.value.noRecordAtAll
  }
  // 兜底（后端没下发时）：没有已完成、也没有任何一步被匹配上
  const done = Number(plan.value.summary?.done ?? 0)
  const hasMatched = plan.value.steps.some((step) => step.matchedRecordId)
  return done === 0 && !hasMatched
})

/**
 * 有没有任何一条能对上号的证据（2026-10-02 的原始意图）。
 *
 * 为什么需要这个：顾客侧开放当天实测一只 8 个月、没记过疫苗的狗，
 * 页面直接顶着 5 个「已逾期」—— 家长明明打过、只是没记，会以为系统算错了。
 * 一条都对不上时，措辞要软：不说"已逾期"，改说"还没记录"—— 这是陈述事实，不是指责。
 */
const noEvidence = computed(() => {
  if (typeof plan.value.noEvidence === 'boolean') {
    return plan.value.noEvidence
  }
  return noRecordAtAll.value
})

/**
 * 状态标签（2026-10-04 老板定）。
 *
 * **没有任何证据**时不出现"已逾期" —— 我们没有任何证据说他没打，
 * 家长明明年年带狗去打、只是没在小程序里记，看到"已逾期"会以为系统算错了。
 * 改成"还没记录"，这是一个事实陈述，不是指责。
 *
 * 注意判据是 noEvidence 而不是 noRecordAtAll：只录了一条钩端螺旋体
 * （非核心苗）的人，也属于"一条都没对上号"，措辞一样要软。
 */
function statusLabel(status: PlanStep['status']) {
  if (noEvidence.value && (status === 'OVERDUE' || status === 'DUE')) {
    return '还没记录'
  }
  return STATUS_LABELS[status] || status
}

/**
 * 完整计划默认收起（2026-10-04）。
 * 冲突提醒不折叠 —— 那是"你的记录跟建议打架了"，是要紧事，藏在折叠里等于没说。
 */
const planListExpanded = ref(false)

/**
 * 收起那行写什么。
 *
 * 不写"按 WSAVA 2024 与国内法规推算"这种来源说明 —— 那句话在展开后的
 * 每一项下面都有（"依据：…"），收起来时更需要的是"进行到哪了"。
 * 一条记录都没有时不报"已完成 N 项"：那是假进度。
 */
const planListHint = computed(() => {
  const total = plan.value.steps.length
  if (noEvidence.value) {
    return `共 ${total} 项，按免疫程序推算`
  }
  const done = plan.value.steps.filter((step) => step.status === 'DONE').length
  return `已完成 ${done} / ${total} 项`
})

function decisionLabel(value: string) {
  return DECISION_OPTIONS.find((item) => item.value === value)?.label || value
}

async function load() {
  if (!props.dogId) {
    return
  }

  /*
   * ⚠️ 刷新时**不要**先把 loaded 抹掉（2026-10-06）。
   *
   * `sectionHidden` 是靠 `loaded && noRecordAtAll` 算出来的 ——
   * 刷新一开始 loaded=false，整块会先消失、数据回来再出现，闪一下。
   * 但**换狗**时必须重置：否则会拿上一条狗的计划顶上几秒，
   * 那比闪一下更糟（顾客以为新狗已经有计划了）。
   */
  if (loadedDogId.value !== props.dogId) {
    loaded.value = false
  }
  loadedDogId.value = props.dogId
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
      // 后端已经把 commonProducts 放在每一步里了，整条透传
      nextStep: res.data.nextStep || null,
      steps: Array.isArray(res.data.steps) ? res.data.steps : [],
      conflicts: Array.isArray(res.data.conflicts) ? res.data.conflicts : [],
      decisions: res.data.decisions || {},
      summary: res.data.summary || {},
      reviewed: res.data.reviewed === true,
      noRecordAtAll: res.data.noRecordAtAll === true,
      noEvidence: res.data.noEvidence === true,
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

// 换狗 or 记录变了都要重新算 —— 计划的每一步都依赖"有没有对上号的记录"
watch(() => [props.dogId, props.dataVersion], load, { immediate: true })

/**
 * 让页面**直接调这里**重算计划（2026-10-06）。
 *
 * ⚠️ 原来只靠上面那条 watch（页面把记录变化折成 data-version 传下来）。
 * 用微信官方自动化驱动模拟器实测，删光记录之后：
 *   · 书签红点**灭掉了** → 说明"记录变了"确实通知到了页面；
 *   · 计划板块**原地不动**，还挂着删掉的那条记录算出来的计划。
 * 也就是通知到了页面，却没让这个组件重算 —— 老板看到的
 * "删空了还显示计划和提醒，切走再切回才空"就是这个。
 *
 * 页面调组件方法这条路在本项目里是**已经验证过的**（疫苗板块的
 * countUnsaveableDrafts / startScan / addRecord 都靠它），所以加这一条。
 * watch 保留：换狗时它仍然管用，两条路不冲突（同一次加载幂等）。
 */
defineExpose({ reload: () => load() })
</script>

<style scoped lang="scss">
@import '../../styles/health-section.scss';

.vaccine-plan {
  margin-bottom: 24rpx;
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

/*
 * 「别同一天打」的提醒（2026-10-05）。
 * 用浅琥珀底 + 左边一道色条 —— 比正文显眼，但不是报错的红。
 * 这属于"容易做错但不紧急"的提示。
 */
.spacing-note {
  margin-top: 14rpx;
  padding: 14rpx 18rpx;
  border-radius: 12rpx;
  background: #fdf8ec;
  border-left: 6rpx solid #d8c98a;
}

.spacing-note__text {
  font-size: 23rpx;
  line-height: 1.6;
  color: #7a6a2f;
}

.step__spacing {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #7a6a2f;
}

/* 常见产品（2026-10-04）：比"依据"显眼一点，比正文轻一点 */
.next-step__products {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.6;
  color: #4a5a4a;
}

.step__products {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  line-height: 1.5;
  color: #4a5a4a;
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

/* 完整计划：收起时只占一行（2026-10-04） */
.plan-list__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.plan-list__copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.plan-list__hint {
  font-size: 23rpx;
  color: #6b6653;
}

.plan-list__toggle {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: #1e3a2f;
  background: #eef2e6;
  border-radius: 999rpx;
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
